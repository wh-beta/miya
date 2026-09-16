const { listTasks, updateTaskStatus, urgeTask, deleteTask, uploadTaskCompletionImage } = require('../../utils/tasks.js');
const { listClasses, updateClassStatus, urgeClass, deleteClass, uploadClassCompletionImage } = require('../../utils/classes.js');
const { addTaskToPhoneCalendar, addSessionToPhoneCalendar } = require('../../utils/calendar.js');
const { getMyProfile, listLinkedStudents } = require('../../utils/auth.js');
const { shortDate, todayStr } = require('../../utils/dates.js');
const { STATUS_LABEL, NEXT_STATUS, normalizeTask, normalizeClass, filterByIdentity } = require('../../utils/taskItems.js');

Page({
  data: {
    role: 'student',
    items: [],
    linkedStudents: [],
  },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
    this._items = [];
  },
  onShow() {
    this.refreshAll();
  },
  refreshAll() {
    const proceed = () => this.loadItems();
    if (this.data.role === 'parent') {
      listLinkedStudents()
        .then((students) => this.setData({ linkedStudents: students }))
        .catch(() => {})
        .then(proceed);
    } else {
      getMyProfile()
        .then((p) => this.setData({ myId: p.id, myName: p.name }))
        .catch(() => {})
        .then(proceed);
    }
  },
  loadItems() {
    Promise.all([listTasks(), listClasses()])
      .then(([tasksRaw, classesRaw]) => {
        const merged = tasksRaw.map(normalizeTask).concat(classesRaw.map(normalizeClass));
        this._items = filterByIdentity(merged, this.data.role, this.data.myId, this.data.myName, this.data.linkedStudents);
        this.renderList();
      })
      .catch((err) => wx.showToast({ title: err.message || '加载失败', icon: 'none' }));
  },
  renderList() {
    const items = (this._items || [])
      .filter((it) => it.status !== 'done')
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((it) =>
        Object.assign({}, it, {
          key: `${it.kind}-${it.id}`,
          metaRight: shortDate(it.date) + (it.time ? ' ' + it.time : ''),
          statusLabel: STATUS_LABEL[it.status],
        }),
      );
    this.setData({ items });
  },
  _findItem(e) {
    const { kind, id } = e.currentTarget.dataset;
    return (this._items || []).find((it) => it.kind === kind && it.id === Number(id));
  },
  onToggleStatus(e) {
    const item = this._findItem(e);
    if (!item || item.status === 'done') return;
    const next = NEXT_STATUS[item.status];
    const update = item.kind === 'class' ? updateClassStatus : updateTaskStatus;
    update(item.id, next)
      .then(() => {
        item.status = next;
        item.urged = false;
        this.renderList();
        if (next === 'done' && this.data.role === 'student') this.promptCompletionPhoto(item);
        if (next === 'done' && item.date === todayStr()) this.maybeCelebrateToday();
      })
      .catch((err) => wx.showToast({ title: err.message || '更新失败', icon: 'none' }));
  },
  // Same trigger rule as task_calendar.js.
  maybeCelebrateToday() {
    const today = todayStr();
    const todays = (this._items || []).filter((it) => it.date === today);
    if (todays.length > 0 && todays.every((it) => it.status === 'done')) {
      const fw = this.selectComponent('#fireworks');
      if (fw) fw.play();
    }
  },
  // Same optional/skippable flow as task_calendar.js — the item disappears
  // from this list right after (done items aren't shown here), but the
  // prompt still fires at the moment of completion. See task_calendar.js's
  // _uploadCompletionPhotos for why uploads go one at a time.
  promptCompletionPhoto(item) {
    wx.showModal({
      title: '任务已完成',
      content: '要上传完成照片吗？（可选，可跳过，最多可选9张）',
      confirmText: '上传照片',
      cancelText: '跳过',
      success: (res) => {
        if (!res.confirm) return;
        wx.chooseMedia({
          count: 9,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          success: (mediaRes) => this._uploadCompletionPhotos(item, mediaRes.tempFiles.map((f) => f.tempFilePath)),
        });
      },
    });
  },
  _uploadCompletionPhotos(item, filePaths, uploaded = 0, failed = 0) {
    if (filePaths.length === 0) {
      if (uploaded > 0) {
        wx.showToast({ title: failed ? `已上传${uploaded}张，${failed}张失败` : `已上传${uploaded}张` });
      } else {
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
      return;
    }
    const [filePath, ...rest] = filePaths;
    const uploadFn = item.kind === 'class' ? uploadClassCompletionImage : uploadTaskCompletionImage;
    uploadFn(item.id, filePath)
      .then(() => this._uploadCompletionPhotos(item, rest, uploaded + 1, failed))
      .catch(() => this._uploadCompletionPhotos(item, rest, uploaded, failed + 1));
  },
  onAddToCalendar(e) {
    const item = this._findItem(e);
    if (!item) return;
    const calendarFn = item.kind === 'class' ? addSessionToPhoneCalendar : addTaskToPhoneCalendar;
    calendarFn(item.raw)
      .then(() => wx.showToast({ title: '已添加到日历' }))
      .catch((err) => {
        const msg = err.errMsg || err.message || '';
        // The user tapping "Cancel" on WeChat's own native add-to-calendar
        // confirmation surfaces as a rejection too — not a real failure.
        if (/cancel/i.test(msg)) return;
        wx.showModal({ title: '添加到日历失败', content: msg || '未知错误', showCancel: false });
      });
  },
  onUrge(e) {
    const item = this._findItem(e);
    if (!item || item.status === 'done') return;
    const urgeFn = item.kind === 'class' ? urgeClass : urgeTask;
    urgeFn(item.id)
      .then(() => {
        item.urged = true;
        this.renderList();
        wx.showToast({ title: '已催办' });
      })
      .catch((err) => wx.showToast({ title: err.message || '催办失败', icon: 'none' }));
  },
  onDelete(e) {
    const { kind, id } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除',
      content: '确定要删除这项吗？',
      success: (res) => {
        if (!res.confirm) return;
        const deleteFn = kind === 'class' ? deleteClass : deleteTask;
        deleteFn(Number(id))
          .then(() => {
            this._items = (this._items || []).filter((it) => !(it.kind === kind && it.id === Number(id)));
            this.renderList();
            wx.showToast({ title: '已删除' });
          })
          .catch((err) => wx.showToast({ title: err.message || '删除失败', icon: 'none' }));
      },
    });
  },
  onGoToAccountLink() {
    wx.navigateTo({ url: `/pages/account_link/account_link?role=${this.data.role}` });
  },
});

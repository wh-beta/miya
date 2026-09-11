const { listTasks, updateTaskStatus, urgeTask, deleteTask, uploadTaskCompletionImage } = require('../../utils/tasks.js');
const { listClasses, updateClassStatus, urgeClass, deleteClass, uploadClassCompletionImage } = require('../../utils/classes.js');
const { addTaskToPhoneCalendar, addSessionToPhoneCalendar } = require('../../utils/calendar.js');
const { getMyProfile, listLinkedStudents } = require('../../utils/auth.js');
const { API_BASE_URL } = require('../../utils/config.js');
const { shortDate } = require('../../utils/dates.js');
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
      .filter((it) => it.urged && it.status !== 'done')
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
      })
      .catch((err) => wx.showToast({ title: err.message || '更新失败', icon: 'none' }));
  },
  promptCompletionPhoto(item) {
    wx.showModal({
      title: '任务已完成',
      content: '要上传一张完成照片吗？（可选，可跳过）',
      confirmText: '上传照片',
      cancelText: '跳过',
      success: (res) => {
        if (!res.confirm) return;
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          success: (mediaRes) => {
            const filePath = mediaRes.tempFiles[0].tempFilePath;
            const uploadFn = item.kind === 'class' ? uploadClassCompletionImage : uploadTaskCompletionImage;
            uploadFn(item.id, filePath)
              .then(() => wx.showToast({ title: '已上传' }))
              .catch((err) => wx.showToast({ title: err.message || '上传失败', icon: 'none' }));
          },
        });
      },
    });
  },
  onCheckCompletionImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ urls: [`${API_BASE_URL}${url}`] });
  },
  onAddToCalendar(e) {
    const item = this._findItem(e);
    if (!item) return;
    const calendarFn = item.kind === 'class' ? addSessionToPhoneCalendar : addTaskToPhoneCalendar;
    calendarFn(item.raw)
      .then(() => wx.showToast({ title: '已添加到日历' }))
      .catch((err) => {
        const msg = err.errMsg || err.message || '';
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
});

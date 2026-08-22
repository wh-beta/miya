const { listClasses, createClass, deleteClass, uploadScheduleImage, listChildren } = require('../../utils/classes.js');
const { createTask, listTasks, uploadTaskListImage } = require('../../utils/tasks.js');
const { addSessionToPhoneCalendar, addTaskToPhoneCalendar } = require('../../utils/calendar.js');

// Pushes one already-saved item (a class session or a task) to the phone
// calendar. Kept separate from addOne/addAllSequentially above: saved items
// come straight from the server with no draft 'status' field, so this
// tracks calendar progress under a distinct 'calStatus' key ('idle' /
// 'adding' / 'added') instead of overloading 'status', which here only ever
// means "present in the DB".
function addSavedToCalendar({ page, listKey, idx, calendarFn }) {
  const item = page.data[listKey][idx];
  page.setData({ [`${listKey}[${idx}].calStatus`]: 'adding' });
  calendarFn(item)
    .then(() => page.setData({ [`${listKey}[${idx}].calStatus`]: 'added' }))
    .catch((err) => {
      page.setData({ [`${listKey}[${idx}].calStatus`]: 'idle' });
      // wx API failures carry the real reason in .errMsg, not .message —
      // toast also truncates long text, so use a modal to keep it readable.
      wx.showModal({ title: '添加到日历失败', content: err.errMsg || err.message || '未知错误', showCancel: false });
    });
}

// Bulk "add all" ONLY saves to the app's own list — it deliberately does
// NOT touch wx.addPhoneCalendar. Tried that first: iOS's native "New Event"
// dialog requires the user to manually tap its checkmark before a second
// one can be presented, and there's no JS-side signal for "the user
// dismissed it" — a real test showed the 2nd call just hangs forever
// waiting behind the still-open 1st dialog, not failing fast, so no delay
// value can fix it. Calendar additions stay on the individual 添加 buttons,
// where the user is already tapping through each dialog themselves anyway.
//
// A draft's status is one of: 'pending' (nothing done), 'adding' (in
// flight), 'saved' (in the app, not yet on the calendar — from a bulk run),
// 'added' (both done). This split matters so a bulk-saved item's button can
// still offer "添加到日历" afterward, instead of looking permanently done.
function addAllSequentially({ page, draftsKey, addingKey, saveFn, ownerRole, onDone }) {
  const drafts = page.data[draftsKey];
  const pending = drafts.map((item, idx) => ({ item, idx })).filter(({ item }) => item.status === 'pending');
  if (pending.length === 0) {
    wx.showToast({ title: '没有待添加项', icon: 'none' });
    return;
  }
  page.setData({ [addingKey]: true });
  let failed = 0;
  const runNext = (i) => {
    if (i >= pending.length) {
      page.setData({ [addingKey]: false });
      wx.showToast({
        title: failed ? `完成，成功${pending.length - failed}个，失败${failed}个` : '已全部保存',
        icon: 'none',
      });
      onDone();
      return;
    }
    const { item, idx } = pending[i];
    page.setData({ [`${draftsKey}[${idx}].status`]: 'adding' });
    saveFn(item, ownerRole)
      .then(() => page.setData({ [`${draftsKey}[${idx}].status`]: 'saved' }))
      .catch(() => {
        failed += 1;
        page.setData({ [`${draftsKey}[${idx}].status`]: 'pending' });
      })
      .then(() => runNext(i + 1));
  };
  runNext(0);
}

// Individual add: if the item is already 'saved' (from a bulk run), only
// push it to the calendar — don't re-save it to the backend.
function addOne({ page, draftsKey, idx, calendarFn, saveFn, ownerRole, onDone }) {
  const item = page.data[draftsKey][idx];
  const alreadySaved = item.status === 'saved';
  page.setData({ [`${draftsKey}[${idx}].status`]: 'adding' });
  Promise.all([calendarFn(item), alreadySaved ? Promise.resolve() : saveFn(item, ownerRole)])
    .then(() => {
      page.setData({ [`${draftsKey}[${idx}].status`]: 'added' });
      onDone();
    })
    .catch((err) => {
      page.setData({ [`${draftsKey}[${idx}].status`]: alreadySaved ? 'saved' : 'pending' });
      // Could be the calendar add or the backend save (Promise.all above) —
      // either way, wx API failures carry the real reason in .errMsg, not
      // .message, and toast truncates long text, so use a modal.
      wx.showModal({ title: '添加失败', content: err.errMsg || err.message || '未知错误', showCancel: false });
    });
}

Page({
  data: {
    role: 'student',
    scheduleDrafts: [],
    taskDrafts: [],
    saved: [],
    savedTasks: [],
    uploadingSchedule: false,
    uploadingTasks: false,
    addingAllSchedule: false,
    addingAllTasks: false,
    // Name-picker modal, shown once per photo pick, before OCR runs — its
    // answer (currentChildName) gets attached to every item parsed from
    // that photo, so a parent with multiple kids can tell whose it is.
    children: [],
    currentChildName: '',
    showNameModal: false,
    nameInput: '',
    pendingUploadType: null, // 'schedule' | 'task'
    pendingFilePath: null,
  },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
    this.loadSaved();
    listChildren()
      .then((children) => this.setData({ children }))
      .catch(() => {});
  },
  loadSaved() {
    listClasses()
      .then((classes) => {
        const sorted = classes
          .slice()
          .sort((a, b) => {
            if (a.session_date !== b.session_date) return a.session_date < b.session_date ? -1 : 1;
            return a.start_time < b.start_time ? -1 : 1;
          })
          .map((c) => Object.assign({ calStatus: 'idle' }, c));
        this.setData({ saved: sorted });
      })
      .catch((err) => wx.showToast({ title: err.message || 'Load failed', icon: 'none' }));
    listTasks()
      .then((tasks) => {
        const sorted = tasks
          .slice()
          .sort((a, b) => (a.due_at < b.due_at ? -1 : 1))
          .map((t) => Object.assign({ calStatus: 'idle' }, t));
        this.setData({ savedTasks: sorted });
      })
      .catch((err) => wx.showToast({ title: err.message || 'Load failed', icon: 'none' }));
  },
  onUploadSchedulePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          showNameModal: true,
          pendingUploadType: 'schedule',
          pendingFilePath: res.tempFiles[0].tempFilePath,
          nameInput: this.data.currentChildName,
        });
      },
      fail: () => {},
    });
  },
  onUploadTaskListPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({
          showNameModal: true,
          pendingUploadType: 'task',
          pendingFilePath: res.tempFiles[0].tempFilePath,
          nameInput: this.data.currentChildName,
        });
      },
      fail: () => {},
    });
  },
  onNameInput(e) {
    this.setData({ nameInput: e.detail.value });
  },
  onPickExistingName(e) {
    this.setData({ nameInput: e.currentTarget.dataset.name }, () => this.onConfirmName());
  },
  onCancelNameModal() {
    this.setData({ showNameModal: false, pendingFilePath: null, pendingUploadType: null });
  },
  onConfirmName() {
    const name = (this.data.nameInput || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入或选择姓名', icon: 'none' });
      return;
    }
    const { pendingUploadType, pendingFilePath } = this.data;
    this.setData({ showNameModal: false, currentChildName: name });
    if (pendingUploadType === 'schedule') {
      this._startScheduleUpload(pendingFilePath, name);
    } else if (pendingUploadType === 'task') {
      this._startTaskListUpload(pendingFilePath, name);
    }
  },
  _startScheduleUpload(filePath, childName) {
    this.setData({ uploadingSchedule: true });
    wx.showToast({ title: '识别中，可能需要一分钟左右', icon: 'none', duration: 3000 });
    uploadScheduleImage(filePath)
      .then((sessions) => {
        const scheduleDrafts = sessions.map((s) => Object.assign({ status: 'pending', child_name: childName }, s));
        this.setData({ scheduleDrafts, uploadingSchedule: false });
        if (scheduleDrafts.length === 0) {
          wx.showToast({ title: '未识别到课程信息', icon: 'none' });
        }
      })
      .catch((err) => {
        this.setData({ uploadingSchedule: false });
        wx.showToast({ title: err.message || '识别失败', icon: 'none' });
      });
  },
  _startTaskListUpload(filePath, childName) {
    this.setData({ uploadingTasks: true });
    wx.showToast({ title: '识别中，可能需要一分钟左右', icon: 'none', duration: 3000 });
    uploadTaskListImage(filePath)
      .then((tasks) => {
        const taskDrafts = tasks.map((t) => Object.assign({ status: 'pending', child_name: childName }, t));
        this.setData({ taskDrafts, uploadingTasks: false });
        if (taskDrafts.length === 0) {
          wx.showToast({ title: '未识别到作业信息', icon: 'none' });
        }
      })
      .catch((err) => {
        this.setData({ uploadingTasks: false });
        wx.showToast({ title: err.message || '识别失败', icon: 'none' });
      });
  },
  onAddSession(e) {
    const idx = e.currentTarget.dataset.idx;
    addOne({
      page: this,
      draftsKey: 'scheduleDrafts',
      idx,
      calendarFn: addSessionToPhoneCalendar,
      saveFn: createClass,
      ownerRole: this.data.role,
      onDone: () => this.loadSaved(),
    });
  },
  onAddAllSessions() {
    addAllSequentially({
      page: this,
      draftsKey: 'scheduleDrafts',
      addingKey: 'addingAllSchedule',
      saveFn: createClass,
      ownerRole: this.data.role,
      onDone: () => this.loadSaved(),
    });
  },
  onAddTask(e) {
    const idx = e.currentTarget.dataset.idx;
    addOne({
      page: this,
      draftsKey: 'taskDrafts',
      idx,
      calendarFn: addTaskToPhoneCalendar,
      saveFn: createTask,
      ownerRole: this.data.role,
      onDone: () => {},
    });
  },
  onAddAllTasks() {
    addAllSequentially({
      page: this,
      draftsKey: 'taskDrafts',
      addingKey: 'addingAllTasks',
      saveFn: createTask,
      ownerRole: this.data.role,
      onDone: () => {},
    });
  },
  onAddSavedSessionToCalendar(e) {
    addSavedToCalendar({ page: this, listKey: 'saved', idx: e.currentTarget.dataset.idx, calendarFn: addSessionToPhoneCalendar });
  },
  onAddSavedTaskToCalendar(e) {
    addSavedToCalendar({ page: this, listKey: 'savedTasks', idx: e.currentTarget.dataset.idx, calendarFn: addTaskToPhoneCalendar });
  },
  onDeleteSaved(e) {
    const id = e.currentTarget.dataset.id;
    deleteClass(id)
      .then(() => {
        wx.showToast({ title: '已删除' });
        this.loadSaved();
      })
      .catch((err) => wx.showToast({ title: err.message || '删除失败', icon: 'none' }));
  },
  onShareAppMessage() {
    return {
      title: '课程表',
      path: `/pages/timetable/timetable?role=${this.data.role}`,
    };
  },
  onShareTimeline() {
    return {
      title: '课程表',
      query: `role=${this.data.role}`,
    };
  },
});

const { createTask, uploadTaskListImage, uploadTaskListText } = require('../../utils/tasks.js');
const { createClass, uploadScheduleImage } = require('../../utils/classes.js');
const { startVoiceRecording, stopVoiceRecordingAndUpload } = require('../../utils/ingest.js');
const { getOpenid, getMyProfile, listLinkedStudents } = require('../../utils/auth.js');
const { dateOnly, todayStr, addDays } = require('../../utils/dates.js');

const SUBJECTS = ['数学', '语文', '英语', '科学', '艺术', '体育'];
const TIME_RANGES = ['09:00-10:00', '16:00-17:00', '17:00-18:00', '19:00-20:00'];

Page({
  data: {
    role: 'student',
    itemType: 'task', // 'task' | 'class'
    linkedStudents: [],
    selectedChildId: null,
    selectedChildName: '',
    subjects: SUBJECTS,
    selectedSubject: SUBJECTS[0],
    mainText: '',
    mainTextPlaceholder: '输入作业内容，可多行，每行一条，例如：\n数学 9.8：口算练习一张\n语文 9.8：预习第3课',
    isRecording: false,
    uploadingImage: false,
    uploadingSchedule: false,
    showManualForm: false,
    manualContent: '',
    manualDateOffset: 0,
    manualTimeRange: TIME_RANGES[1],
    timeRanges: TIME_RANGES,
    todayStr: todayStr(),
    drafts: [],
    saving: false,
    // Populated by pdf_upload_webview's onUnload calling this page's setData
    // directly via getCurrentPages() — see that page for why.
    draftTask: null,
    taskDrafts: null,
  },
  onLoad(options) {
    // Launched via WeChat's "打开方式" menu on an arbitrary chat image
    // (supportedMaterials in app.json, scene 1173): options.forwardMaterials
    // carries the actual file. Stash it in storage rather than acting on it
    // immediately — a cold launch this way may not have a session yet.
    if (options.forwardMaterials && options.forwardMaterials.length) {
      const material = options.forwardMaterials.find((m) => (m.type || '').indexOf('image') !== -1) || options.forwardMaterials[0];
      if (material && material.path) {
        wx.setStorageSync('pendingMaterialPath', material.path);
      }
    }

    if (!getOpenid()) {
      // No session yet — the image could belong to either role (unlike the
      // invite flow, there's no default here), so just send them through
      // the normal role picker. parent_home/student_home's onShow re-routes
      // back here once a role/session is established and picks the stashed
      // material back up via _consumePendingMaterial.
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }

    this._initRoleAndData(options.role);
  },
  _initRoleAndData(roleParam) {
    const afterRole = (role) => {
      this.setData({ role });
      if (role === 'parent') {
        listLinkedStudents()
          .then((students) => {
            const first = students[0];
            this.setData({
              linkedStudents: students,
              selectedChildId: first ? first.id : null,
              selectedChildName: first ? first.name : '',
            });
          })
          .catch(() => {});
      } else {
        getMyProfile()
          .then((p) => this.setData({ selectedChildId: p.id, selectedChildName: p.name || '' }))
          .catch(() => {});
      }
      this._consumePendingMaterial();
    };
    if (roleParam) {
      afterRole(roleParam);
    } else {
      // Reached without a ?role= (e.g. the material-open launch path, which
      // WeChat controls) — ask the backend which role this openid actually is.
      getMyProfile()
        .then((p) => afterRole(p.role))
        .catch(() => afterRole('student'));
    }
  },
  _consumePendingMaterial() {
    const path = wx.getStorageSync('pendingMaterialPath');
    if (!path) return;
    wx.removeStorageSync('pendingMaterialPath');
    this.setData({ itemType: 'task', uploadingImage: true });
    uploadTaskListImage(path)
      .then((tasks) => {
        this.appendDrafts(tasks.map((t) => ({ itemType: 'task', title: t.title, subject: t.subject || this.data.selectedSubject, date: dateOnly(t.due_at) })));
        if (tasks.length === 0) {
          wx.showModal({ title: '未识别到作业信息', content: '这张图片没有识别出任何作业内容，可以试试重新拍照或手动添加。', showCancel: false });
        }
      })
      // A toast here is easy to miss/expire before anyone looks — this
      // path came from outside the normal upload flow (a shared image),
      // so a modal that stays up until dismissed makes failures (and the
      // exact wx.uploadFile error, which matters for diagnosing whether
      // forwardMaterials' path is actually usable) visible.
      .catch((err) => wx.showModal({ title: '识别失败', content: err.errMsg || err.message || '未知错误', showCancel: false }))
      .then(() => this.setData({ uploadingImage: false }));
  },
  onShow() {
    if (this.data.taskDrafts && this.data.taskDrafts.length) {
      this.appendDrafts(
        this.data.taskDrafts.map((t) => ({ itemType: 'task', title: t.title, subject: t.subject || this.data.selectedSubject, date: dateOnly(t.due_at) })),
      );
      this.setData({ taskDrafts: null, draftTask: null });
    } else if (this.data.draftTask) {
      const t = this.data.draftTask;
      this.appendDrafts([{ itemType: 'task', title: t.title, subject: this.data.selectedSubject, date: dateOnly(t.due_at) }]);
      this.setData({ draftTask: null });
    }
  },
  appendDrafts(list) {
    const withKeys = list.filter(Boolean).map((d, i) => Object.assign({ key: `d${Date.now()}_${i}` }, d));
    this.setData({ drafts: this.data.drafts.concat(withKeys) });
  },
  onSwitchType(e) {
    this.setData({ itemType: e.currentTarget.dataset.type, showManualForm: false });
  },
  onSelectChild(e) {
    this.setData({ selectedChildId: Number(e.currentTarget.dataset.id), selectedChildName: e.currentTarget.dataset.name });
  },
  onGoToAccountLink() {
    wx.navigateTo({ url: `/pages/account_link/account_link?role=${this.data.role}` });
  },
  onSelectSubject(e) {
    this.setData({ selectedSubject: e.currentTarget.dataset.subject });
  },
  onCustomSubjectInput(e) {
    const v = e.detail.value;
    if (v.trim()) this.setData({ selectedSubject: v.trim() });
  },
  onMainTextInput(e) {
    this.setData({ mainText: e.detail.value });
  },
  onParseText() {
    const text = (this.data.mainText || '').trim();
    if (!text) return;
    uploadTaskListText(text)
      .then((tasks) => {
        this.appendDrafts(tasks.map((t) => ({ itemType: 'task', title: t.title, subject: t.subject || this.data.selectedSubject, date: dateOnly(t.due_at) })));
        this.setData({ mainText: '' });
      })
      .catch((err) => wx.showToast({ title: err.message || '解析失败', icon: 'none' }));
  },
  onQuickImage() {
    if (this.data.itemType === 'class') {
      this.setData({ uploadingSchedule: true });
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          uploadScheduleImage(res.tempFiles[0].tempFilePath)
            .then((sessions) => {
              this.appendDrafts(
                sessions.map((s) => ({
                  itemType: 'class',
                  title: s.subject,
                  subject: s.subject,
                  date: s.session_date,
                  time: `${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)}`,
                })),
              );
            })
            .catch((err) => wx.showToast({ title: err.message || '识别失败', icon: 'none' }))
            .then(() => this.setData({ uploadingSchedule: false }));
        },
        fail: () => this.setData({ uploadingSchedule: false }),
      });
    } else {
      this.setData({ uploadingImage: true });
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          uploadTaskListImage(res.tempFiles[0].tempFilePath)
            .then((tasks) => {
              this.appendDrafts(tasks.map((t) => ({ itemType: 'task', title: t.title, subject: t.subject || this.data.selectedSubject, date: dateOnly(t.due_at) })));
            })
            .catch((err) => wx.showToast({ title: err.message || '识别失败', icon: 'none' }))
            .then(() => this.setData({ uploadingImage: false }));
        },
        fail: () => this.setData({ uploadingImage: false }),
      });
    }
  },
  onQuickPdf() {
    wx.navigateTo({ url: '/pages/pdf_upload_webview/pdf_upload_webview' });
  },
  onQuickVoice() {
    if (this.data.isRecording) {
      this.setData({ isRecording: false });
      stopVoiceRecordingAndUpload()
        .then(({ draft_task }) => {
          if (draft_task) {
            this.appendDrafts([
              { itemType: 'task', title: draft_task.title, subject: this.data.selectedSubject, date: dateOnly(draft_task.due_at) },
            ]);
          }
        })
        .catch((err) => wx.showToast({ title: err.message || '识别失败', icon: 'none' }));
    } else {
      this.setData({ isRecording: true });
      startVoiceRecording().catch((err) => {
        this.setData({ isRecording: false });
        wx.showToast({ title: err.message || '无法录音', icon: 'none' });
      });
    }
  },
  onQuickManual() {
    this.setData({ showManualForm: !this.data.showManualForm, manualContent: '', manualDateOffset: 0 });
  },
  onManualContentInput(e) {
    this.setData({ manualContent: e.detail.value });
  },
  onManualDateOffset(e) {
    this.setData({ manualDateOffset: Number(e.currentTarget.dataset.offset) });
  },
  onManualTimeRange(e) {
    this.setData({ manualTimeRange: e.currentTarget.dataset.time });
  },
  onManualAdd() {
    const date = addDays(todayStr(), this.data.manualDateOffset);
    if (this.data.itemType === 'class') {
      this.appendDrafts([
        { itemType: 'class', title: (this.data.manualContent || '').trim() || this.data.selectedSubject, subject: this.data.selectedSubject, date, time: this.data.manualTimeRange },
      ]);
    } else {
      const title = (this.data.manualContent || '').trim();
      if (!title) {
        wx.showToast({ title: '请输入任务内容', icon: 'none' });
        return;
      }
      this.appendDrafts([{ itemType: 'task', title, subject: this.data.selectedSubject, date }]);
    }
    this.setData({ manualContent: '', showManualForm: false });
  },
  onDraftSubjectPick(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const drafts = this.data.drafts.slice();
    drafts[idx] = Object.assign({}, drafts[idx], { subject: e.currentTarget.dataset.subject });
    this.setData({ drafts });
  },
  onDraftTitleInput(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const drafts = this.data.drafts.slice();
    drafts[idx] = Object.assign({}, drafts[idx], { title: e.detail.value });
    this.setData({ drafts });
  },
  // Also covers itemType 'class' drafts missing a date, even though today
  // every path that creates one already fills in a date — keeps the field
  // editable/correctable either way rather than assuming it never happens.
  onDraftDateChange(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const drafts = this.data.drafts.slice();
    drafts[idx] = Object.assign({}, drafts[idx], { date: e.detail.value });
    this.setData({ drafts });
  },
  onRemoveDraft(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const drafts = this.data.drafts.slice();
    drafts.splice(idx, 1);
    this.setData({ drafts });
  },
  onSaveAll() {
    if (!this.data.selectedChildId || !this.data.selectedChildName) {
      // For 'parent' this means no student picked yet; for 'student' it
      // means their own profile fetch in _initRoleAndData hasn't resolved
      // (e.g. a dropped request) — either way, don't let a task/class save
      // with no one to attach it to (the backend would now reject it too).
      wx.showToast({ title: this.data.role === 'parent' ? '请先选择学生' : '无法确认您的身份，请退出重试', icon: 'none' });
      return;
    }
    const drafts = this.data.drafts;
    if (drafts.length === 0) return;
    if (drafts.some((d) => !d.title || !d.title.trim())) {
      wx.showToast({ title: '有内容为空，请检查', icon: 'none' });
      return;
    }
    if (drafts.some((d) => !d.date)) {
      wx.showToast({ title: '有项目还没有选择日期', icon: 'none' });
      return;
    }
    const studentId = this.data.selectedChildId;
    const childName = this.data.selectedChildName;
    const role = this.data.role;
    this.setData({ saving: true });
    let failed = 0;
    const saveOne = (draft) => {
      if (draft.itemType === 'class') {
        const [startTime, endTime] = draft.time.split('-');
        return createClass(
          { subject: draft.subject, session_date: draft.date, start_time: startTime, end_time: endTime, child_name: childName, student_user_id: studentId },
          role,
        );
      }
      return createTask(
        { title: draft.title, subject: draft.subject, due_at: `${draft.date}T00:00:00`, child_name: childName, student_user_id: studentId },
        role,
      );
    };
    const runNext = (i) => {
      if (i >= drafts.length) {
        this.setData({ saving: false, drafts: [] });
        wx.showToast({ title: failed ? `完成，${failed} 项失败` : '已保存' });
        if (drafts.length - failed > 0) {
          setTimeout(() => wx.navigateBack(), 600);
        }
        return;
      }
      saveOne(drafts[i])
        .catch(() => {
          failed += 1;
        })
        .then(() => runNext(i + 1));
    };
    runNext(0);
  },
});

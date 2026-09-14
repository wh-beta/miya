const {
  getMyProfile,
  setMyName,
  setVirtualStudentPassword,
  listLinkedStudents,
  linkStudent,
  unlinkStudent,
  addVirtualStudent,
} = require('../../utils/auth.js');

function goHome(role) {
  wx.reLaunch({ url: `/pages/task_calendar/task_calendar?role=${role}` });
}

Page({
  data: {
    role: 'student',
    name: '',
    connectCode: '',
    students: [],
    codeInput: '',
    virtualNameInput: '',
    showPrivacyModal: false,
  },
  onLoad(options) {
    const role = options.role || 'student';
    this.setData({ role });
    getMyProfile()
      .then((profile) => this.setData({ name: profile.name || '', connectCode: profile.connect_code || '' }))
      .catch(() => {});
    if (role === 'parent') this.refreshStudents();
    this.checkPrivacyAuth();
  },
  // The nickname-fill keyboard suggestion (type="nickname" in the wxml)
  // silently degrades to a plain text input — no error — if the user
  // hasn't agreed to the mini-program's privacy policy yet. Checking and
  // prompting up front (rather than waiting for it to silently fail) is
  // WeChat's documented pattern for this.
  checkPrivacyAuth() {
    if (!wx.getPrivacySetting) return; // base library too old to have this API
    wx.getPrivacySetting({
      success: (res) => {
        if (res.needAuthorization) this.setData({ showPrivacyModal: true });
      },
    });
  },
  onOpenPrivacyContract() {
    wx.openPrivacyContract({
      fail: () => wx.showToast({ title: '打开隐私协议失败', icon: 'none' }),
    });
  },
  onAgreePrivacy() {
    this.setData({ showPrivacyModal: false });
  },
  onDisagreePrivacy() {
    this.setData({ showPrivacyModal: false });
    wx.showToast({ title: '未同意授权，昵称将无法自动填入，可手动输入姓名', icon: 'none' });
  },
  refreshStudents() {
    listLinkedStudents()
      .then((students) => this.setData({ students }))
      .catch(() => {});
  },
  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },
  onSaveName() {
    const name = (this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    setMyName(name)
      .then((profile) => {
        this.setData({ name: profile.name || name, connectCode: profile.connect_code || '' });
        wx.showToast({ title: '已保存' });
      })
      .catch((err) => wx.showToast({ title: err.message || '保存失败', icon: 'none' }));
  },
  onCopyCode() {
    wx.setClipboardData({
      data: this.data.connectCode,
      success: () => wx.showToast({ title: '已复制' }),
    });
  },
  // Lets a parent hand a linked student's code to a second parent, who
  // enters it in their own "添加学生" field — same /links flow as binding
  // by the student's own code, just relayed instead of typed by the student.
  onCopyStudentCode(e) {
    wx.setClipboardData({
      data: e.currentTarget.dataset.code,
      success: () => wx.showToast({ title: '已复制' }),
    });
  },
  onCodeInput(e) {
    this.setData({ codeInput: e.detail.value });
  },
  onConfirmLink() {
    const code = (this.data.codeInput || '').trim();
    if (!code) {
      wx.showToast({ title: '请输入连接码', icon: 'none' });
      return;
    }
    linkStudent(code)
      .then((student) => {
        wx.showToast({ title: `已绑定 ${student.name || ''}` });
        this.setData({ codeInput: '' });
        this.refreshStudents();
      })
      .catch((err) => wx.showToast({ title: err.message || '绑定失败', icon: 'none' }));
  },
  onVirtualNameInput(e) {
    this.setData({ virtualNameInput: e.detail.value });
  },
  onAddVirtualStudent() {
    const name = (this.data.virtualNameInput || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入学生姓名', icon: 'none' });
      return;
    }
    addVirtualStudent(name)
      .then((student) => {
        wx.showToast({ title: `已添加 ${student.name || ''}` });
        this.setData({ virtualNameInput: '' });
        this.refreshStudents();
      })
      .catch((err) => wx.showToast({ title: err.message || '添加失败', icon: 'none' }));
  },
  // Bootstraps or changes a virtual student's password — the only way one
  // ever gets set, since the student has no session of their own to open
  // password_settings with until this has happened at least once. See
  // switch_account.js, which is what actually consumes it.
  onSetStudentPassword(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: `设置${name || '学生'}的密码`,
      editable: true,
      placeholderText: '用于该学生在其他手机上切换账号',
      success: (res) => {
        const password = (res.content || '').trim();
        if (!res.confirm) return;
        if (!password) {
          wx.showToast({ title: '密码不能为空', icon: 'none' });
          return;
        }
        setVirtualStudentPassword(id, password)
          .then(() => wx.showToast({ title: '已设置' }))
          .catch((err) => wx.showToast({ title: err.message || '设置失败', icon: 'none' }));
      },
    });
  },
  onRemoveStudent(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '解除关联',
      content: '确定要解除与该学生的关联吗？',
      success: (res) => {
        if (!res.confirm) return;
        unlinkStudent(id)
          .then(() => this.refreshStudents())
          .catch((err) => wx.showToast({ title: err.message || '解除失败', icon: 'none' }));
      },
    });
  },
  onGoHome() {
    goHome(this.data.role);
  },
  onShareAppMessage() {
    // Parent-only affordance (see the wxml's open-type="share" button, only
    // rendered for role === 'parent'): shares a card into WeChat (a family
    // group chat, most usefully) carrying this parent's own connect_code.
    // The student taps it, login.js picks up ?invite=, and student_home
    // consumes it via acceptInvite — no code needs to be typed by anyone.
    return {
      title: `${this.data.name || '家长'}邀请你加入课后助手，一起管理作业和课程`,
      path: `/pages/login/login?invite=${this.data.connectCode}`,
      // Without this, WeChat falls back to auto-screenshotting whatever the
      // current page looks like (the form, empty states and all) as the
      // card image — a static designed image avoids that.
      imageUrl: '/images/share_invite.png',
    };
  },
});

// A minimal identity-completion page for a user arriving via a 课程表
// link who's missing a role, a name, or both — deliberately NOT
// login.js's action-sheet-popup role picker, and NOT account_link.js's
// full page (name + connect code + linking to other users): the user
// asked for role selection to be a real page here, and none of
// account_link's relationship-management UI is relevant when 课程表
// access comes from the group context this user is already in the
// middle of joining, not from a parent-child link. See utils/auth.js's
// onNoName override and school_schedule.js's onLoad for how someone ends
// up here instead of account_link/login.js's popup.
const { getOpenid, registerRole, setMyName, claimVirtualStudentAndRoute } = require('../../utils/auth.js');

Page({
  data: {
    role: '', // '' = not yet chosen; the role-picker step shows until this is set
    name: '',
    saving: false,
    showPrivacyModal: false,
  },

  onLoad(options) {
    this._invite = options.invite || null;
    if (options.role) this.setData({ role: options.role });
    this._checkPrivacyAuth();
  },

  onPickRole(e) {
    this.setData({ role: e.currentTarget.dataset.role });
  },
  onChangeRole() {
    this.setData({ role: '' });
  },

  // A student may have started out virtual (added by a parent, no WeChat
  // account of their own — see account_link.js's "添加学生") and now have
  // a real account to take that same identity over with, using its
  // connect_code — skips the name step entirely (a virtual student
  // already has one) and goes straight back to 课程表.
  onClaimCode() {
    wx.showModal({
      title: '输入连接码',
      editable: true,
      placeholderText: '家长已经为你创建过账号时使用的连接码',
      success: (res) => {
        const code = (res.content || '').trim();
        if (res.confirm && code) this._claim(code);
      },
    });
  },

  _claim(code) {
    if (!getOpenid()) {
      wx.showToast({ title: '登录状态异常，请重新进入', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const goBack = () => {
      const inviteParam = this._invite ? `&invite=${this._invite}` : '';
      wx.reLaunch({ url: `/pages/school_schedule/school_schedule?role=student${inviteParam}` });
      return Promise.resolve();
    };
    claimVirtualStudentAndRoute(code, goBack).catch((err) => {
      this.setData({ saving: false });
      wx.showModal({ title: '认领失败', content: err.message || '未知错误', showCancel: false });
    });
  },

  // Same check as account_link.js — the nickname-fill keyboard suggestion
  // (type="nickname" below) silently degrades to a plain text input, no
  // error, if the user hasn't agreed to the privacy policy yet.
  _checkPrivacyAuth() {
    if (!wx.getPrivacySetting) return;
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

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onSave() {
    if (!this.data.role) {
      wx.showToast({ title: '请先选择身份', icon: 'none' });
      return;
    }
    const name = (this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    if (!getOpenid()) {
      // Shouldn't happen — school_schedule.js only routes here after a
      // successful wx.login()+/auth/login — but fail loud rather than
      // silently sending a null openid if it ever does.
      wx.showToast({ title: '登录状态异常，请重新进入', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    const role = this.data.role;
    // registerRole is idempotent — safe whether this user already had a
    // role (just missing a name) or is picking one for the first time
    // right here.
    registerRole(role)
      .then(() => setMyName(name))
      .then(() => {
        const inviteParam = this._invite ? `&invite=${this._invite}` : '';
        wx.reLaunch({ url: `/pages/school_schedule/school_schedule?role=${role}${inviteParam}` });
      })
      .catch((err) => {
        this.setData({ saving: false });
        wx.showToast({ title: err.message || '保存失败', icon: 'none' });
      });
  },
});

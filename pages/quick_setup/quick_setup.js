// Started out as an identity-*completion* page for a user arriving via a
// 课程表 link with no role/name on file at all. Now that
// checkLoginAndRoute's silent registration (see utils/auth.js) guarantees
// every visitor already has both — a placeholder name and a best-guess
// role — by the time they could ever reach a page, this has shifted to an
// identity-*review/correction* page instead: reached either as a fallback
// for a legacy pre-silent-registration account still missing one (see
// utils/auth.js's onNoName override and school_schedule.js's onLoad), or,
// more commonly now, as "完善资料" from 我的 for anyone who wants to check
// or fix what was silently assigned. Deliberately not login.js's
// action-sheet popup or account_link.js's full relationship-management
// page — neither fits reviewing just role+name.
const { getOpenid, getMyProfile, updateMyRole, setMyName, claimVirtualStudentAndRoute } = require('../../utils/auth.js');
const { debugLog } = require('../../utils/debugLog.js');

Page({
  data: {
    role: '', // '' = not yet chosen; the role-picker step shows until this is set
    name: '',
    saving: false,
    showPrivacyModal: false,
    loading: true,
  },

  onLoad(options) {
    this._invite = options.invite || null;
    // Carried through from school_schedule.js's _goToQuickSetup — a
    // group-targeted 一键共享 link's target group, forwarded back on save
    // so a brand-new user still lands on the right class, not just the
    // right page. See school_schedule.js's _goToQuickSetup for why.
    this._group = options.group || null;
    debugLog('quick_setup_onLoad', { options, hadOpenidAlready: !!getOpenid() });
    this._checkPrivacyAuth();

    if (options.role) {
      // The caller (e.g. school_schedule.js's redirect) already knows the
      // right role better than whatever's on file — still worth pulling
      // the current name in as a starting point rather than making them
      // retype it from scratch.
      this.setData({ role: options.role, loading: false });
      getMyProfile()
        .then((profile) => {
          if (profile.name) this.setData({ name: profile.name });
        })
        .catch(() => {});
      return;
    }

    getMyProfile()
      .then((profile) => {
        this.setData({ role: profile.role || '', name: profile.name || '', loading: false });
      })
      .catch(() => this.setData({ loading: false }));
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
      this._returnToApp('student');
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
    // updateMyRole (unlike register_role) always applies, since this page
    // now exists to let someone *correct* a role silently assigned by
    // checkLoginAndRoute, not just set one for the first time.
    updateMyRole(role)
      .then(() => setMyName(name))
      .then(() => {
        debugLog('quick_setup_onSave', { role, invite: this._invite, group: this._group });
        this._returnToApp(role);
      })
      .catch((err) => {
        this.setData({ saving: false });
        wx.showToast({ title: err.message || '保存失败', icon: 'none' });
      });
  },

  // Reached from two very different places now: school_schedule.js's
  // redirect (this._invite/_group set — there's a specific schedule to
  // get back to) and 我的's general "完善资料" (neither set — just go
  // home). Always bouncing to school_schedule regardless of entry context
  // made sense when that was the only caller; it no longer does.
  _returnToApp(role) {
    if (this._invite || this._group) {
      const inviteParam = this._invite ? `&invite=${this._invite}` : '';
      const groupParam = this._group ? `&group=${this._group}` : '';
      wx.reLaunch({ url: `/pages/school_schedule/school_schedule?role=${role}${inviteParam}${groupParam}` });
      return;
    }
    wx.reLaunch({ url: `/pages/task_calendar/task_calendar?role=${role}` });
  },
});

// A minimal name-completion page — reached as a fallback for a legacy
// account still missing a name (see utils/auth.js's onNoName override and
// school_schedule.js's onLoad), or from 我的 as "完善资料" for anyone who
// wants to review/change their display name. Role picking used to live
// here too; it now has its own dedicated page (role_setup.js), reachable
// from 我的 and from account_link.js right where it's actually needed
// (setting up a parent<->student connection) — role, unlike name, gets
// locked once a connection exists, and claiming an existing virtual
// student's identity belongs there now too. See role_setup.js.
const { getOpenid, getMyProfile, setMyName } = require('../../utils/auth.js');
const { debugLog } = require('../../utils/debugLog.js');

Page({
  data: {
    name: '',
    role: '', // display-only, for bottom-nav's routing — this page itself no longer picks a role, see role_setup.js
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

    getMyProfile()
      .then((profile) => {
        this._role = profile.role || null; // used to rebuild the return url below
        this.setData({ name: profile.name || '', role: profile.role || '', loading: false });
      })
      .catch(() => this.setData({ loading: false }));
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
    setMyName(name)
      .then(() => {
        debugLog('quick_setup_onSave', { invite: this._invite, group: this._group });
        this._returnToApp();
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
  _returnToApp() {
    const params = [];
    if (this._role) params.push(`role=${this._role}`);
    if (this._invite || this._group) {
      if (this._invite) params.push(`invite=${this._invite}`);
      if (this._group) params.push(`group=${this._group}`);
      wx.reLaunch({ url: `/pages/school_schedule/school_schedule${params.length ? '?' + params.join('&') : ''}` });
      return;
    }
    wx.reLaunch({ url: `/pages/task_calendar/task_calendar${params.length ? '?' + params.join('&') : ''}` });
  },
});

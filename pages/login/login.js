const { checkLoginAndRoute, registerRoleAndRoute, claimVirtualStudentAndRoute } = require('../../utils/auth.js');
const { DEV_MOCK_LOGIN } = require('../../utils/config.js');
const { debugLog } = require('../../utils/debugLog.js');

Page({
  data: { checking: true, showManualPicker: false },

  onLoad(options) {
    debugLog('login_onLoad', { options, sync: wx.getLaunchOptionsSync && wx.getLaunchOptionsSync() });
    // Arrived via a parent's "邀请学生加入" share card (see
    // account_link.js's onShareAppMessage) — stash the invite code for
    // task_calendar to consume once login finishes, and skip straight
    // past the role popup since an invite is always parent-inviting-student.
    this._forcedRole = options.invite ? 'student' : null;
    if (options.invite) {
      wx.setStorageSync('pendingInvite', options.invite);
    }

    // Tracks whether checkLoginAndRoute has already resolved an openid —
    // the manual-picker buttons need this to know whether they can go
    // straight to registerRoleAndRoute, or need to run the full check
    // first (e.g. after the initial check failed on a network error,
    // before any openid was ever established). Always true in mock mode,
    // since registerRoleAndRoute sets a fake openid unconditionally there.
    this._openidReady = DEV_MOCK_LOGIN;

    if (DEV_MOCK_LOGIN) {
      // No persisted account to check against in mock mode — always show
      // a picker (manual buttons, or auto-pick the forced role).
      this.setData({ checking: false, showManualPicker: !this._forcedRole });
      if (this._forcedRole) this.onStudent();
      return;
    }
    this._runCheck();
  },

  _runCheck() {
    this.setData({ checking: true, showManualPicker: false });
    // needsRole below is now only ever true in DEV_MOCK_LOGIN (which never
    // reaches this function at all — see onLoad) or a network hiccup on
    // the follow-up /users/me check (see checkLoginAndRoute's onNoName
    // fallback) — role isn't decided at login anymore at all (see the
    // backend's User.role docstring), so the _promptRole/_register branch
    // this guards is a vestigial safety net for those, not a path any
    // real login is expected to take.
    checkLoginAndRoute()
      .then((result) => {
        // A returning user (needsRole: false) has already been routed
        // away by checkLoginAndRoute itself — nothing left to do here.
        if (!result.needsRole) return;
        this._openidReady = true;
        this.setData({ checking: false });
        if (this._forcedRole) {
          this._register(this._forcedRole);
        } else {
          this._promptRole();
        }
      })
      .catch((err) => {
        this.setData({ checking: false, showManualPicker: true });
        wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' });
      });
  },

  // The actual "pop up dialogue box" — shown only once, the first time a
  // genuinely new openid opens the app (checkLoginAndRoute skips this
  // entirely for anyone who already has a role on file).
  _promptRole() {
    wx.showActionSheet({
      itemList: ['我是家长', '我是学生'],
      success: (res) => {
        if (res.tapIndex === 1) {
          this._offerClaim();
        } else {
          this._register('parent');
        }
      },
      fail: () => {
        // Dismissed without choosing — a role is required to proceed, so
        // fall back to the manual buttons rather than leaving the screen
        // stuck with nothing to tap.
        this.setData({ showManualPicker: true });
      },
    });
  },

  // A student may have started out virtual (added by a parent, no WeChat
  // account of their own — see account_link.js's "添加学生") and now have
  // a real account to take that same identity over with, using its
  // connect_code. Optional — leaving it blank just registers a fresh
  // student account like before.
  _offerClaim() {
    wx.showModal({
      title: '连接码（可选）',
      editable: true,
      placeholderText: '如果家长已经为你创建过账号，输入连接码继续使用；没有则留空',
      success: (res) => {
        const code = (res.content || '').trim();
        if (res.confirm && code) {
          this._claim(code);
        } else {
          this._register('student');
        }
      },
      fail: () => this._register('student'),
    });
  },

  _claim(code) {
    this.setData({ checking: true, showManualPicker: false });
    claimVirtualStudentAndRoute(code).catch((err) => {
      this.setData({ checking: false, showManualPicker: true });
      wx.showModal({ title: '认领失败', content: err.message || '未知错误，可以重新选择身份', showCancel: false });
    });
  },

  _register(role) {
    this.setData({ checking: true, showManualPicker: false });
    registerRoleAndRoute(role).catch((err) => {
      this.setData({ checking: false, showManualPicker: true });
      wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' });
    });
  },

  _manualPick(role) {
    if (this._openidReady) {
      this._register(role);
      return;
    }
    // The manual picker can also show up after checkLoginAndRoute itself
    // failed (network error) — no openid established yet, so re-run the
    // full check and only register once it actually resolves one.
    this.setData({ checking: true, showManualPicker: false });
    checkLoginAndRoute()
      .then((result) => {
        if (!result.needsRole) return;
        this._openidReady = true;
        this._register(role);
      })
      .catch((err) => {
        this.setData({ checking: false, showManualPicker: true });
        wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' });
      });
  },

  onParent() {
    this._manualPick('parent');
  },
  onStudent() {
    this._manualPick('student');
  },

  onShareAppMessage() {
    return {
      title: '课后助手',
      path: '/pages/login/login',
    };
  },
  onShareTimeline() {
    return {
      title: '课后助手',
    };
  },
});

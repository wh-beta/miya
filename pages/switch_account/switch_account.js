const { checkLoginAndRoute, isSwitchedAway, switchAccount, getMyProfile } = require('../../utils/auth.js');

// Temporarily adopts a virtual student's identity for this session (their
// connect_code + the password a parent set for them via
// account_link.js's onSetStudentPassword) — for a student with no WeChat
// account of their own using a borrowed/shared phone. Distinct from
// account_link.js's connect-code claim, which permanently transplants a
// real openid onto the row instead of just borrowing it for this session.
Page({
  data: {
    role: 'student',
    switchedAway: false,
    activeName: '',
    codeInput: '',
    passwordInput: '',
    working: false,
  },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
    this._refreshActiveIdentity();
  },
  _refreshActiveIdentity() {
    const switchedAway = isSwitchedAway();
    this.setData({ switchedAway });
    if (switchedAway) {
      getMyProfile()
        .then((profile) => this.setData({ activeName: profile.name || '' }))
        .catch(() => {});
    }
  },
  onCodeInput(e) {
    this.setData({ codeInput: e.detail.value });
  },
  onPasswordInput(e) {
    this.setData({ passwordInput: e.detail.value });
  },
  onSwitch() {
    const code = (this.data.codeInput || '').trim();
    const password = (this.data.passwordInput || '').trim();
    if (!code) {
      wx.showToast({ title: '请输入连接码', icon: 'none' });
      return;
    }
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }
    this.setData({ working: true });
    switchAccount(code, password)
      .then((identity) => {
        wx.showToast({ title: `已切换为 ${identity.name || ''}` });
        wx.reLaunch({ url: `/pages/task_calendar/task_calendar?role=${identity.role}` });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '切换失败', icon: 'none' });
        this.setData({ working: false });
      });
  },
  onSwitchBack() {
    this.setData({ working: true });
    checkLoginAndRoute()
      .catch((err) => {
        wx.showToast({ title: err.message || '切换失败', icon: 'none' });
        this.setData({ working: false });
      });
  },
});

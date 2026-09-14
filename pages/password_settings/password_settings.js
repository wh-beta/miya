const { getMyProfile, setMyPassword } = require('../../utils/auth.js');

// Sets/changes the password of whichever identity is currently active —
// a real user's own, or (once switched in via switch_account.js) a
// virtual student's own. A virtual student's *initial* password is set by
// their parent instead (account_link.js's onSetStudentPassword), since the
// student has no session of their own to open this page with until then.
Page({
  data: {
    role: 'student',
    name: '',
    password: '',
    confirmPassword: '',
    working: false,
  },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
    getMyProfile()
      .then((profile) => this.setData({ name: profile.name || '' }))
      .catch(() => {});
  },
  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },
  onConfirmInput(e) {
    this.setData({ confirmPassword: e.detail.value });
  },
  onSave() {
    const password = (this.data.password || '').trim();
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }
    if (password !== (this.data.confirmPassword || '').trim()) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
      return;
    }
    this.setData({ working: true });
    setMyPassword(password)
      .then(() => {
        wx.showToast({ title: '已保存' });
        this.setData({ password: '', confirmPassword: '' });
      })
      .catch((err) => wx.showToast({ title: err.message || '保存失败', icon: 'none' }))
      .then(() => this.setData({ working: false }));
  },
});

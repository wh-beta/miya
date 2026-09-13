// A minimal name-only setup step for a user arriving via a 课程表 link who
// has a role but no name on file yet — deliberately NOT account_link.js's
// full page (name + connect code + linking to other users): none of that
// relationship-management UI is relevant here, since 课程表 access comes
// from the group context this user is already in the middle of joining,
// not from a parent-child link. See utils/auth.js's onNoName override and
// school_schedule.js's onLoad for how a nameless user ends up here instead
// of account_link.
const { setMyName } = require('../../utils/auth.js');

Page({
  data: {
    role: 'parent',
    name: '',
    saving: false,
    showPrivacyModal: false,
  },

  onLoad(options) {
    this.setData({ role: options.role || 'parent' });
    this._invite = options.invite || null;
    this._checkPrivacyAuth();
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
    this.setData({ saving: true });
    setMyName(name)
      .then(() => {
        const inviteParam = this._invite ? `&invite=${this._invite}` : '';
        wx.reLaunch({ url: `/pages/school_schedule/school_schedule?role=${this.data.role}${inviteParam}` });
      })
      .catch((err) => {
        this.setData({ saving: false });
        wx.showToast({ title: err.message || '保存失败', icon: 'none' });
      });
  },
});

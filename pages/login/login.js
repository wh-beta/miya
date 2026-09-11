const { loginAndRoute } = require('../../utils/auth.js');

Page({
  data: {},
  onLoad(options) {
    // Arrived via a parent's "邀请学生加入" share card (see
    // account_link.js's onShareAppMessage) — stash the invite code for
    // student_home to consume once login finishes, and skip straight past
    // the role picker since an invite is always parent-inviting-student.
    if (options.invite) {
      wx.setStorageSync('pendingInvite', options.invite);
      this.onStudent();
    }
  },
  onParent() {
    loginAndRoute('parent').catch(() =>
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
    );
  },
  onStudent() {
    loginAndRoute('student').catch(() =>
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
    );
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

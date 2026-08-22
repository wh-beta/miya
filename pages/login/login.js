const { loginAndRoute } = require('../../utils/auth.js');

Page({
  data: {},
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

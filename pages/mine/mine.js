// A real page, not an action sheet — wx.showActionSheet's itemList has a
// hard platform limit (max 6 items) that this list quietly grew past as
// settings pages accumulated (账号与绑定, 姓名设置, 身份设置, 设置提醒,
// 登录密码, 切换账号, plus 关系列表 and 我的催办 for parents — 7-8 total),
// which meant the sheet silently failed to open at all: tapping 我的 did
// nothing, looking exactly like a dead/disabled button. A page has no such
// limit and lets you navigate back to it afterward, unlike the sheet's
// redirectTo-everything approach.
Page({
  data: { role: 'student' },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
  },
  onGo(e) {
    wx.navigateTo({ url: `/pages/${e.currentTarget.dataset.page}?role=${this.data.role}` });
  },
});

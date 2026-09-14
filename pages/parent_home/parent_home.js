const { ensureIdentity, getMyProfile } = require('../../utils/auth.js');

Page({
  data: { role: 'parent', greeting: '你好，家长' },
  onLoad(options) {
    this.setData({ role: options.role || 'parent' });
  },
  onShow() {
    // This page shares itself (see onShareAppMessage below), so it can be
    // a cold, session-less launch just like login.js/school_schedule.js —
    // ensureIdentity silently resolves (and, for a brand-new visitor,
    // registers) one before this needs it.
    ensureIdentity(this.data.role)
      .then(() => getMyProfile())
      .then((p) => this.setData({ greeting: `你好，${p.name || '家长'}` }))
      .catch(() => {});
  },
  onViewTaskCalendar() {
    wx.navigateTo({ url: `/pages/task_calendar/task_calendar?role=${this.data.role}` });
  },
  onViewSchoolSchedule() {
    wx.navigateTo({ url: `/pages/school_schedule/school_schedule?role=${this.data.role}` });
  },
  onShareAppMessage() {
    return {
      title: '课后助手 - 家长端',
      path: '/pages/parent_home/parent_home',
    };
  },
  onShareTimeline() {
    return {
      title: '课后助手 - 家长端',
    };
  },
});

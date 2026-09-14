const { ensureIdentity, getMyProfile } = require('../../utils/auth.js');

Page({
  data: { role: 'student', greeting: '你好，同学' },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
  },
  onShow() {
    // This page shares itself (see onShareAppMessage below), so it can be
    // a cold, session-less launch just like login.js/school_schedule.js —
    // ensureIdentity silently resolves (and, for a brand-new visitor,
    // registers) one before this needs it.
    ensureIdentity(this.data.role)
      .then(() => getMyProfile())
      .then((p) => this.setData({ greeting: `你好，${p.name || '同学'}` }))
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
      title: '课后助手 - 学生端',
      path: '/pages/student_home/student_home',
    };
  },
  onShareTimeline() {
    return {
      title: '课后助手 - 学生端',
    };
  },
});

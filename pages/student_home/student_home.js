const { setTaskReminder } = require('../../utils/reminder.js');
const { getMyProfile } = require('../../utils/auth.js');

Page({
  data: { role: 'student', greeting: '你好，同学' },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
  },
  onShow() {
    getMyProfile()
      .then((p) => this.setData({ greeting: `你好，${p.name || '同学'}` }))
      .catch(() => {});
  },
  onViewTaskCalendar() {
    wx.navigateTo({ url: `/pages/task_calendar/task_calendar?role=${this.data.role}` });
  },
  onManageAccount() {
    wx.navigateTo({ url: `/pages/account_link/account_link?role=${this.data.role}` });
  },
  onFindSimilarQuestions() {
    wx.navigateTo({ url: '/pages/similar_questions/similar_questions' });
  },
  onSetReminder() {
    // TODO: replace with a real task selected from the student's task list.
    const sampleTask = {
      title: 'Math homework due',
      due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    setTaskReminder(sampleTask).then((result) => {
      if (result.calendarAdded) {
        wx.showToast({ title: 'Reminder set' });
      } else {
        // Toast truncates long text, and this needs to be readable in full
        // to diagnose which step actually failed — show it in a modal instead.
        const detail = (result.calendarError && (result.calendarError.errMsg || result.calendarError.message)) || 'unknown error';
        wx.showModal({ title: 'Could not add to calendar', content: detail, showCancel: false });
      }
    });
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

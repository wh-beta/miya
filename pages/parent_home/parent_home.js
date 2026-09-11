const { setTaskReminder } = require('../../utils/reminder.js');
const { getMyProfile } = require('../../utils/auth.js');

Page({
  data: { role: 'parent', greeting: '你好，家长' },
  onLoad(options) {
    this.setData({ role: options.role || 'parent' });
  },
  onShow() {
    getMyProfile()
      .then((p) => this.setData({ greeting: `你好，${p.name || '家长'}` }))
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
    // TODO: replace with a real task selected from the parent's task list.
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

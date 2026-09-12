const { setTaskReminder } = require('../../utils/reminder.js');

Page({
  data: { role: 'student', working: false },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
  },
  onSetReminder() {
    // TODO: replace with a real task selected from the user's task list.
    const sampleTask = {
      title: 'Math homework due',
      due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    this.setData({ working: true });
    setTaskReminder(sampleTask)
      .then((result) => {
        if (result.calendarAdded) {
          wx.showToast({ title: 'Reminder set' });
        } else {
          // Toast truncates long text, and this needs to be readable in full
          // to diagnose which step actually failed — show it in a modal instead.
          const detail = (result.calendarError && (result.calendarError.errMsg || result.calendarError.message)) || 'unknown error';
          wx.showModal({ title: 'Could not add to calendar', content: detail, showCancel: false });
        }
      })
      .then(() => this.setData({ working: false }));
  },
});

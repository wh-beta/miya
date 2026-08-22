const { setTaskReminder } = require('../../utils/reminder.js');
const {
  chooseAndUploadImage,
  startVoiceRecording,
  stopVoiceRecordingAndUpload,
} = require('../../utils/ingest.js');
const { createTask } = require('../../utils/tasks.js');

Page({
  data: { isRecording: false, draftTask: null },
  onViewTimetable() {
    wx.navigateTo({ url: '/pages/timetable/timetable?role=student' });
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
  onScanImage() {
    chooseAndUploadImage()
      .then(({ draft_task }) => this.setData({ draftTask: draft_task }))
      .catch((err) => wx.showToast({ title: err.message || 'Scan failed', icon: 'none' }));
  },
  onUploadPdf() {
    wx.navigateTo({ url: '/pages/pdf_upload_webview/pdf_upload_webview' });
  },
  onToggleVoice() {
    if (this.data.isRecording) {
      this.setData({ isRecording: false });
      stopVoiceRecordingAndUpload()
        .then(({ draft_task }) => this.setData({ draftTask: draft_task }))
        .catch((err) => wx.showToast({ title: err.message || 'Transcription failed', icon: 'none' }));
    } else {
      this.setData({ isRecording: true });
      startVoiceRecording().catch((err) => {
        this.setData({ isRecording: false });
        wx.showToast({ title: err.message || 'Could not start recording', icon: 'none' });
      });
    }
  },
  onSaveDraftTask() {
    createTask(this.data.draftTask, 'student')
      .then((task) => {
        this.setData({ draftTask: null });
        wx.showToast({ title: 'Task saved' });
        return setTaskReminder(task).catch(() => {});
      })
      .catch((err) => wx.showToast({ title: err.message || 'Save failed', icon: 'none' }));
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

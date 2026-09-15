const { createGrowthRecord, uploadGrowthRecordImage } = require('../../utils/growth.js');
const { todayStr } = require('../../utils/dates.js');

const SUBJECTS = ['数学', '语文', '英语', '科学', '艺术', '体育'];

Page({
  data: {
    role: 'parent',
    studentId: null,
    studentName: '',
    subjects: SUBJECTS,
    selectedSubject: SUBJECTS[0],
    examName: '',
    score: '',
    maxScore: '',
    recordDate: todayStr(),
    note: '',
    imagePath: '', // local tempFilePath, for preview + upload — not sent as part of the record itself
    saving: false,
  },
  onLoad(options) {
    this.setData({
      role: options.role || 'parent',
      studentId: Number(options.student_id),
      studentName: decodeURIComponent(options.student_name || ''),
    });
  },

  onSelectSubject(e) {
    this.setData({ selectedSubject: e.currentTarget.dataset.subject });
  },
  onCustomSubjectInput(e) {
    const v = e.detail.value;
    if (v.trim()) this.setData({ selectedSubject: v.trim() });
  },
  onExamNameInput(e) {
    this.setData({ examName: e.detail.value });
  },
  onScoreInput(e) {
    this.setData({ score: e.detail.value });
  },
  onMaxScoreInput(e) {
    this.setData({ maxScore: e.detail.value });
  },
  onDateChange(e) {
    this.setData({ recordDate: e.detail.value });
  },
  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => this.setData({ imagePath: res.tempFiles[0].tempFilePath }),
    });
  },
  onRemoveImage() {
    this.setData({ imagePath: '' });
  },

  onSave() {
    const subject = (this.data.selectedSubject || '').trim();
    if (!subject) {
      wx.showToast({ title: '请选择或输入科目', icon: 'none' });
      return;
    }
    const score = this.data.score.trim();
    const maxScore = this.data.maxScore.trim();
    if (score && Number.isNaN(Number(score))) {
      wx.showToast({ title: '分数需为数字', icon: 'none' });
      return;
    }
    if (maxScore && Number.isNaN(Number(maxScore))) {
      wx.showToast({ title: '满分需为数字', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    createGrowthRecord({
      studentUserId: this.data.studentId,
      subject,
      examName: this.data.examName.trim(),
      score: score ? Number(score) : null,
      maxScore: maxScore ? Number(maxScore) : null,
      recordDate: this.data.recordDate,
      note: this.data.note.trim(),
    })
      .then((record) => {
        if (!this.data.imagePath) return record;
        return uploadGrowthRecordImage(record.id, this.data.imagePath).catch((err) => {
          err.imageUploadFailed = true;
          throw err;
        });
      })
      .then(() => {
        wx.showToast({ title: '已保存' });
        setTimeout(() => wx.navigateBack(), 400);
      })
      .catch((err) => {
        this.setData({ saving: false });
        if (err.imageUploadFailed) {
          // The record itself did save — navigate back once acknowledged
          // rather than leaving them on the form, which would invite an
          // accidental duplicate resubmission.
          wx.showModal({
            title: '记录已保存，图片上传失败',
            content: err.message || '未知错误，可稍后重新添加一条记录补充图片',
            showCancel: false,
            success: () => wx.navigateBack(),
          });
          return;
        }
        wx.showToast({ title: err.message || '保存失败', icon: 'none' });
      });
  },
});

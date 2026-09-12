Page({
  data: {
    role: 'student',
  },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
  },
  onFindSimilarQuestions() {
    wx.navigateTo({ url: '/pages/similar_questions/similar_questions' });
  },
});

Page({
  data: {
    role: 'student',
  },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
  },
});

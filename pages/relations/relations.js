const { listLinkedStudents, listLinkedParents, unlinkStudent } = require('../../utils/auth.js');

Page({
  data: {
    role: 'student',
    items: [],
  },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
  },
  onShow() {
    this.refresh();
  },
  refresh() {
    const load = this.data.role === 'parent' ? listLinkedStudents() : listLinkedParents();
    load.then((items) => this.setData({ items })).catch(() => {});
  },
  onRemoveStudent(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '解除关联',
      content: '确定要解除与该学生的关联吗？',
      success: (res) => {
        if (!res.confirm) return;
        unlinkStudent(id)
          .then(() => this.refresh())
          .catch((err) => wx.showToast({ title: err.message || '解除失败', icon: 'none' }));
      },
    });
  },
  onGoToAccountLink() {
    wx.navigateTo({ url: `/pages/account_link/account_link?role=${this.data.role}` });
  },
});

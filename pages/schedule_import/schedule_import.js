const {
  listScheduleGroups,
  createScheduleGroup,
  saveGroupSchedule,
  uploadWeeklyScheduleImage,
} = require('../../utils/schedule.js');

const DAYS = ['周一', '周二', '周三', '周四', '周五'];
const PERIOD_COUNT = 9;

function emptyGrid() {
  return Array.from({ length: PERIOD_COUNT }, () => ['', '', '', '', '']);
}

Page({
  data: {
    role: 'parent',
    step: 'photo', // 'photo' | 'review' | 'group'
    days: DAYS,
    ocrLoading: false,
    grid: emptyGrid(),
    groupMode: 'search', // 'search' | 'create'
    searchQuery: '',
    searchResults: [],
    searching: false,
    selectedGroupId: null,
    selectedGroupLabel: '',
    selectedGroupOwned: false,
    newSchool: '',
    newGrade: '',
    newClassName: '',
    saving: false,
  },

  onLoad(options) {
    this.setData({ role: options.role || 'parent' });
  },

  onChoosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ ocrLoading: true });
        wx.showToast({ title: '识别中，可能需要一分钟左右', icon: 'none', duration: 3000 });
        uploadWeeklyScheduleImage(res.tempFiles[0].tempFilePath)
          .then((entries) => {
            const grid = emptyGrid();
            entries.forEach((e) => {
              if (e.day_of_week >= 1 && e.day_of_week <= 5 && e.period >= 1 && e.period <= PERIOD_COUNT) {
                grid[e.period - 1][e.day_of_week - 1] = e.subject || '';
              }
            });
            this.setData({ grid, step: 'review' });
            if (entries.length === 0) {
              wx.showModal({ title: '未识别到课程', content: '这张图片没有识别出课程表内容，可以在下一步手动填写。', showCancel: false });
            }
          })
          .catch((err) => wx.showModal({ title: '识别失败', content: err.message || '未知错误，可以选择跳过并手动填写', showCancel: false }))
          .then(() => this.setData({ ocrLoading: false }));
      },
    });
  },

  onSkipPhoto() {
    this.setData({ grid: emptyGrid() });
    this._goToGroupStep();
  },

  onCellInput(e) {
    const { period, day } = e.currentTarget.dataset;
    const grid = this.data.grid;
    grid[period - 1][day - 1] = e.detail.value;
    this.setData({ grid });
  },

  onReviewNext() {
    this._goToGroupStep();
  },

  onReviewBack() {
    this.setData({ step: 'photo' });
  },

  _goToGroupStep() {
    this.setData({ step: 'group' });
    this._search('');
  },

  onGroupModeSearch() {
    this.setData({ groupMode: 'search' });
  },

  onGroupModeCreate() {
    this.setData({ groupMode: 'create', selectedGroupId: null, selectedGroupLabel: '', selectedGroupOwned: false });
  },

  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value });
  },

  onSearchConfirm() {
    this._search(this.data.searchQuery);
  },

  _search(q) {
    this.setData({ searching: true });
    listScheduleGroups(q)
      .then((groups) => this.setData({ searchResults: groups, searching: false }))
      .catch(() => this.setData({ searching: false }));
  },

  onPickGroup(e) {
    const { id, label, owner } = e.currentTarget.dataset;
    this.setData({
      selectedGroupId: id,
      selectedGroupLabel: label,
      selectedGroupOwned: owner === true || owner === 'true',
    });
  },

  onNewSchoolInput(e) {
    this.setData({ newSchool: e.detail.value });
  },
  onNewGradeInput(e) {
    this.setData({ newGrade: e.detail.value });
  },
  onNewClassNameInput(e) {
    this.setData({ newClassName: e.detail.value });
  },

  onGroupBack() {
    this.setData({ step: 'review' });
  },

  onConfirmImport() {
    if (this.data.saving) return;

    const entries = [];
    this.data.grid.forEach((row, pIdx) => {
      row.forEach((subject, dIdx) => {
        if (subject && subject.trim()) {
          entries.push({ day_of_week: dIdx + 1, period: pIdx + 1, subject: subject.trim() });
        }
      });
    });

    if (this.data.groupMode === 'search') {
      if (!this.data.selectedGroupId) {
        wx.showToast({ title: '请先选择一个班级', icon: 'none' });
        return;
      }
      if (!this.data.selectedGroupOwned) {
        wx.showModal({
          title: '无法导入',
          content: '这个班级由其他人创建，你没有编辑权限。可以创建一个新班级，或请对方分享课程表图片给你以获得查看权限。',
          showCancel: false,
        });
        return;
      }
      this._saveTo(this.data.selectedGroupId, entries);
      return;
    }

    const school = this.data.newSchool.trim();
    const grade = this.data.newGrade.trim();
    const className = this.data.newClassName.trim();
    if (!school || !grade || !className) {
      wx.showToast({ title: '请填写学校、年级和班级', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    createScheduleGroup({ school, grade, className })
      .then((group) => this._saveTo(group.id, entries))
      .catch((err) => {
        this.setData({ saving: false });
        wx.showModal({ title: '创建班级失败', content: err.message || '未知错误', showCancel: false });
      });
  },

  _saveTo(groupId, entries) {
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });
    saveGroupSchedule(groupId, entries)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '导入成功' });
        setTimeout(() => wx.navigateBack(), 600);
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showModal({ title: '保存失败', content: err.message || '未知错误', showCancel: false });
      })
      .then(() => this.setData({ saving: false }));
  },
});

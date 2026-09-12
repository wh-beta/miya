const {
  listMyScheduleGroups,
  getGroupSchedule,
  saveGroupSchedule,
  downloadGroupInviteQrcode,
  acceptScheduleInvite,
} = require('../../utils/schedule.js');
const { SCHEDULE_WIDTH, computeSchedulePosterHeight, drawSchedulePoster } = require('../../utils/posterCanvas.js');

const DAYS = ['周一', '周二', '周三', '周四', '周五'];
const PERIOD_COUNT = 9;

function emptyGrid() {
  return Array.from({ length: PERIOD_COUNT }, () => ['', '', '', '', '']);
}

function groupLabel(g) {
  return `${g.school} ${g.grade}${g.class_name}`;
}

Page({
  data: {
    role: 'parent',
    days: DAYS,
    groups: [],
    currentGroupId: null,
    currentGroupLabel: '',
    canEdit: false,
    grid: emptyGrid(),
    editing: false,
    loading: true,
    shareCanvasWidth: SCHEDULE_WIDTH,
    shareCanvasHeight: 0,
  },

  onLoad(options) {
    this.setData({ role: options.role || 'parent' });
    this._loadGroups();
  },

  onShow() {
    // Covers the already-logged-in path: scanning the invite wxacode
    // routes straight to this page's onLoad/onShow with the scene string
    // stashed by app.js. task_calendar.js's consumePending() covers the
    // other path (cold launch, had to go through login first, lands there
    // instead). Also covers returning from schedule_import after a save.
    const code = wx.getStorageSync('pendingScheduleInviteCode');
    if (code) {
      wx.removeStorageSync('pendingScheduleInviteCode');
      acceptScheduleInvite(code)
        .then(() => {
          wx.showToast({ title: '已获得课程表查看权限', icon: 'none' });
          this._loadGroups();
        })
        .catch((err) => wx.showToast({ title: err.message || '课程表授权失败', icon: 'none' }));
      return;
    }
    if (this._needsRefresh) {
      this._needsRefresh = false;
      this._loadGroups();
    }
  },

  _loadGroups() {
    this.setData({ loading: true });
    listMyScheduleGroups()
      .then((groups) => {
        this.setData({ groups, loading: false });
        if (groups.length === 0) return;
        const preferredId = this.data.currentGroupId;
        const stillThere = groups.find((g) => g.id === preferredId);
        const target = stillThere || groups[0];
        this._selectGroup(target.id, groupLabel(target), target.is_owner);
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
        this.setData({ loading: false });
      });
  },

  onSwitchGroup(e) {
    const { id, label, owner } = e.currentTarget.dataset;
    if (id === this.data.currentGroupId) return;
    this._selectGroup(id, label, owner === 'true' || owner === true);
  },

  _selectGroup(id, label, isOwner) {
    this.setData({
      currentGroupId: id,
      currentGroupLabel: label,
      canEdit: !!isOwner,
      editing: false,
      loading: true,
    });
    getGroupSchedule(id)
      .then((entries) => {
        const grid = emptyGrid();
        entries.forEach((e) => {
          if (e.day_of_week >= 1 && e.day_of_week <= 5 && e.period >= 1 && e.period <= PERIOD_COUNT) {
            grid[e.period - 1][e.day_of_week - 1] = e.subject || '';
          }
        });
        this.setData({ grid, loading: false });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '加载课程表失败', icon: 'none' });
        this.setData({ loading: false });
      });
  },

  onToggleEdit() {
    if (!this.data.canEdit) return;
    if (this.data.editing) {
      // Cancelling: reload from server so in-progress edits aren't kept around half-applied.
      this._selectGroup(this.data.currentGroupId, this.data.currentGroupLabel, true);
    } else {
      this.setData({ editing: true });
    }
  },

  onCellInput(e) {
    const { period, day } = e.currentTarget.dataset;
    const grid = this.data.grid;
    grid[period - 1][day - 1] = e.detail.value;
    this.setData({ grid });
  },

  onSave() {
    if (!this.data.canEdit || !this.data.currentGroupId) return;
    const entries = [];
    this.data.grid.forEach((row, pIdx) => {
      row.forEach((subject, dIdx) => {
        if (subject && subject.trim()) {
          entries.push({ day_of_week: dIdx + 1, period: pIdx + 1, subject: subject.trim() });
        }
      });
    });
    wx.showLoading({ title: '保存中...' });
    saveGroupSchedule(this.data.currentGroupId, entries)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '已保存' });
        this.setData({ editing: false });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showModal({ title: '保存失败', content: err.message || '未知错误', showCancel: false });
      });
  },

  onGoImport() {
    wx.navigateTo({ url: `/pages/schedule_import/schedule_import?role=${this.data.role}` });
    this._needsRefresh = true;
  },

  _shareWithQr(regenerate) {
    wx.showLoading({ title: '生成中...' });
    downloadGroupInviteQrcode(this.data.currentGroupId, regenerate)
      .then((qrPath) => this._renderAndShare(qrPath))
      .catch(() => {
        // Only the owner can mint an invite code (server-side 403 for
        // everyone else) — sharing the plain schedule image should still
        // work for a viewer, so a QR fetch failure of any kind just falls
        // back to a badge-less poster rather than blocking the share.
        this._renderAndShare(null);
      });
  },

  onShareSchedule() {
    this._shareWithQr(false);
  },

  onRegenerateInvite() {
    if (!this.data.canEdit) return;
    wx.showModal({
      title: '重新生成邀请码？',
      content: '之前分享过的课程表图片里的邀请码将失效，需要重新分享新图片。',
      success: (res) => {
        if (res.confirm) this._shareWithQr(true);
      },
    });
  },

  _renderAndShare(qrPath) {
    const height = computeSchedulePosterHeight(PERIOD_COUNT, !!qrPath);
    this.setData({ shareCanvasHeight: height }, () => {
      wx.nextTick(() => {
        const query = this.createSelectorQuery();
        query.select('#scheduleShareCanvas').fields({ node: true, size: true }).exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            wx.hideLoading();
            wx.showToast({ title: '生成失败', icon: 'none' });
            return;
          }
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
          const dpr = sys.pixelRatio || 2;
          const w = res[0].width;
          const h = res[0].height;
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          ctx.scale(dpr, dpr);

          const finish = (qrImage) => {
            drawSchedulePoster(ctx, w, h, { grid: this.data.grid, qrImage, groupLabel: this.data.currentGroupLabel });
            wx.canvasToTempFilePath({
              canvas,
              fileType: 'png',
              success: (r) => {
                wx.hideLoading();
                wx.showShareImageMenu({
                  path: r.tempFilePath,
                  fail: (err) => wx.showToast({ title: err.errMsg || '分享失败', icon: 'none' }),
                });
              },
              fail: () => {
                wx.hideLoading();
                wx.showToast({ title: '生成失败', icon: 'none' });
              },
            });
          };

          if (qrPath) {
            const img = canvas.createImage();
            img.onload = () => finish(img);
            img.onerror = () => finish(null);
            img.src = qrPath;
          } else {
            finish(null);
          }
        });
      });
    });
  },

  onShareAppMessage() {
    return { title: '课程表', path: `/pages/school_schedule/school_schedule?role=${this.data.role}` };
  },

  onShareTimeline() {
    return { title: '课程表' };
  },
});

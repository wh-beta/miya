const { getMyProfile } = require('../../utils/auth.js');
const { getWeeklySchedule, saveWeeklySchedule, downloadScheduleInviteQrcode, acceptScheduleInvite } = require('../../utils/schedule.js');
const { SCHEDULE_WIDTH, computeSchedulePosterHeight, drawSchedulePoster } = require('../../utils/posterCanvas.js');

const DAYS = ['周一', '周二', '周三', '周四', '周五'];
const PERIOD_COUNT = 9;

function emptyGrid() {
  return Array.from({ length: PERIOD_COUNT }, () => ['', '', '', '', '']);
}

Page({
  data: {
    role: 'parent',
    days: DAYS,
    grid: emptyGrid(),
    editing: false,
    canEdit: false,
    loading: true,
    unauthorized: false,
    shareCanvasWidth: SCHEDULE_WIDTH,
    shareCanvasHeight: 0,
  },

  onLoad(options) {
    this.setData({ role: options.role || 'parent', canEdit: (options.role || 'parent') === 'parent' });
    getMyProfile()
      .then((p) => this.setData({ canEdit: p.role === 'parent' }))
      .catch(() => {});
    this._load();
  },

  onShow() {
    // Covers the already-logged-in path: scanning the invite wxacode routes
    // straight to this page's onLoad/onShow with the scene string stashed
    // by app.js. task_calendar.js's consumePending() covers the other path
    // (cold launch, had to go through login first, lands there instead).
    const code = wx.getStorageSync('pendingScheduleInviteCode');
    if (!code) return;
    wx.removeStorageSync('pendingScheduleInviteCode');
    acceptScheduleInvite(code)
      .then(() => {
        wx.showToast({ title: '已获得课程表查看权限', icon: 'none' });
        this._load();
      })
      .catch((err) => wx.showToast({ title: err.message || '课程表授权失败', icon: 'none' }));
  },

  _load() {
    this.setData({ loading: true, editing: false, unauthorized: false });
    getWeeklySchedule()
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
        if (err.statusCode === 403) {
          this.setData({ loading: false, unauthorized: true });
        } else {
          wx.showToast({ title: err.message || '加载课程表失败', icon: 'none' });
          this.setData({ loading: false });
        }
      });
  },

  onToggleEdit() {
    if (!this.data.canEdit) return;
    if (this.data.editing) {
      // Cancelling: reload from server so in-progress edits aren't kept around half-applied.
      this._load();
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
    if (!this.data.canEdit) return;
    const entries = [];
    this.data.grid.forEach((row, pIdx) => {
      row.forEach((subject, dIdx) => {
        if (subject && subject.trim()) {
          entries.push({ day_of_week: dIdx + 1, period: pIdx + 1, subject: subject.trim() });
        }
      });
    });
    wx.showLoading({ title: '保存中...' });
    saveWeeklySchedule(entries)
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

  _shareWithQr(regenerate) {
    wx.showLoading({ title: '生成中...' });
    downloadScheduleInviteQrcode(regenerate)
      .then((qrPath) => this._renderAndShare(qrPath))
      .catch(() => {
        // The invite badge is a nice-to-have on top of the core "share the
        // schedule as an image" feature — don't let a WeChat API hiccup
        // (e.g. token/quota issue) block sharing entirely.
        wx.showToast({ title: '邀请码生成失败，仅分享课程表', icon: 'none' });
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
            drawSchedulePoster(ctx, w, h, { grid: this.data.grid, qrImage });
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

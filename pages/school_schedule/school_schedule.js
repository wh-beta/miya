const { API_BASE_URL } = require('../../utils/config.js');
const { getOpenid, getMyProfile } = require('../../utils/auth.js');
const { SCHEDULE_WIDTH, computeSchedulePosterHeight, drawSchedulePoster } = require('../../utils/posterCanvas.js');

const DAYS = ['周一', '周二', '周三', '周四', '周五'];
const PERIOD_COUNT = 9;

function emptyGrid() {
  return Array.from({ length: PERIOD_COUNT }, () => ['', '', '', '', '']);
}

// One shared schedule for the whole app — no per-student scoping, see
// ClassScheduleEntry's docstring in server/app/models.py for why.
function fetchSchedule() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/weekly_schedule`,
      method: 'GET',
      data: { openid: getOpenid() },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '获取失败'))),
      fail: reject,
    });
  });
}

function saveSchedule(grid) {
  const entries = [];
  grid.forEach((row, pIdx) => {
    row.forEach((subject, dIdx) => {
      if (subject && subject.trim()) {
        entries.push({ day_of_week: dIdx + 1, period: pIdx + 1, subject: subject.trim() });
      }
    });
  });
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/weekly_schedule`,
      method: 'PUT',
      data: { openid: getOpenid(), entries },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '保存失败'))),
      fail: reject,
    });
  });
}

Page({
  data: {
    role: 'parent',
    days: DAYS,
    grid: emptyGrid(),
    editing: false,
    canEdit: false,
    loading: true,
    shareCanvasWidth: SCHEDULE_WIDTH,
    shareCanvasHeight: 0,
  },

  onLoad(options) {
    this.setData({ role: options.role || 'parent', canEdit: (options.role || 'parent') === 'parent' });
    // Confirm role from the account itself rather than trusting the query
    // string alone — matches how other pages read canonical role state.
    getMyProfile()
      .then((p) => this.setData({ canEdit: p.role === 'parent' }))
      .catch(() => {});
    this._load();
  },

  _load() {
    this.setData({ loading: true, editing: false });
    fetchSchedule()
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
    wx.showLoading({ title: '保存中...' });
    saveSchedule(this.data.grid)
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

  onShareSchedule() {
    const height = computeSchedulePosterHeight(PERIOD_COUNT);
    wx.showLoading({ title: '生成中...' });
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
          drawSchedulePoster(ctx, w, h, { grid: this.data.grid });
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

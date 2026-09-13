const { getOpenid, checkLoginAndRoute, registerRoleAndRoute } = require('../../utils/auth.js');
const {
  listMyScheduleGroups,
  getGroupSchedule,
  saveGroupSchedule,
  getGroupInviteCode,
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
    inviteCode: '',
    grid: emptyGrid(),
    editing: false,
    loading: true,
    shareCanvasWidth: SCHEDULE_WIDTH,
    shareCanvasHeight: 0,
  },

  onLoad(options) {
    this.setData({ role: options.role || 'parent' });
    this._pendingInvite = options.invite || null;

    // Covers two entry paths that can both land here with no session at
    // all: a "邀请加入" card (see onShareAppMessage below) tapped while
    // logged out, and WeChat's generic "Open Mini Program" re-entry shown
    // under a 一键共享 image (which carries no data of its own, unlike the
    // card — this._pendingInvite just stays null in that case). Either
    // way, resolve identity right here instead of bouncing through
    // login.js, which would either land a nameless user on account_link's
    // full relationship-management page (irrelevant for someone who just
    // wants to see a schedule — see quick_setup.js) or a fully-set-up user
    // on task_calendar, losing the whole point of following the link.
    if (!getOpenid()) {
      this._resumeSessionInPlace();
      return;
    }

    this._afterIdentityResolved();
  },

  _afterIdentityResolved() {
    if (this._pendingInvite) {
      const code = this._pendingInvite;
      this._pendingInvite = null;
      acceptScheduleInvite(code)
        .then(() => wx.showToast({ title: '已获得课程表查看权限', icon: 'none' }))
        .catch((err) => wx.showToast({ title: err.message || '课程表授权失败', icon: 'none' }))
        .then(() => this._loadGroups());
    } else {
      this._loadGroups();
    }
  },

  _resumeSessionInPlace() {
    this.setData({ loading: true });
    const stayHere = (role) => {
      this.setData({ role });
      this._afterIdentityResolved();
      return Promise.resolve();
    };
    // A nameless user (new account, or an existing one that never
    // finished setup) goes to quick_setup instead of account_link's full
    // connections page — just name, then straight back here, carrying the
    // invite code along so it's still redeemed once identity is complete.
    const goToQuickSetup = (role) => {
      const inviteParam = this._pendingInvite ? `&invite=${this._pendingInvite}` : '';
      wx.reLaunch({ url: `/pages/quick_setup/quick_setup?role=${role}${inviteParam}` });
      return Promise.resolve();
    };
    checkLoginAndRoute(stayHere, goToQuickSetup)
      .then((result) => {
        if (result.needsRole) this._promptRoleInline(stayHere, goToQuickSetup);
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' });
      });
  },

  // The same role popup login.js shows for a genuinely new account — see
  // its _promptRole for why wx.showActionSheet, not a custom page.
  _promptRoleInline(stayHere, goToQuickSetup) {
    wx.showActionSheet({
      itemList: ['我是家长', '我是学生'],
      success: (res) => {
        const role = res.tapIndex === 0 ? 'parent' : 'student';
        registerRoleAndRoute(role, stayHere, goToQuickSetup).catch((err) => {
          this.setData({ loading: false });
          wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' });
        });
      },
      fail: () => {
        this.setData({ loading: false });
        wx.showToast({ title: '需要选择身份才能查看课程表', icon: 'none' });
      },
    });
  },

  onShow() {
    // Returning from schedule_import after a save.
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
      inviteCode: '',
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
    if (isOwner) {
      getGroupInviteCode(id).then((code) => this.setData({ inviteCode: code })).catch(() => {});
    }
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

  onRegenerateInvite() {
    if (!this.data.canEdit || !this.data.currentGroupId) return;
    wx.showModal({
      title: '重新生成邀请码？',
      content: '之前分享出去的"邀请加入"链接将失效。',
      success: (res) => {
        if (!res.confirm) return;
        getGroupInviteCode(this.data.currentGroupId, true)
          .then((code) => {
            this.setData({ inviteCode: code });
            wx.showToast({ title: '已重新生成', icon: 'none' });
          })
          .catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }));
      },
    });
  },

  // Renders the current grid to the offscreen canvas and hands the
  // resulting temp file path to `onDone` — shared by onShareSchedule and
  // onSaveImage so the two only differ in what they do with the image
  // (wx.showShareImageMenu vs wx.saveImageToPhotosAlbum).
  _renderPoster(onDone) {
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
          drawSchedulePoster(ctx, w, h, { grid: this.data.grid, groupLabel: this.data.currentGroupLabel });
          wx.canvasToTempFilePath({
            canvas,
            fileType: 'png',
            success: (r) => {
              wx.hideLoading();
              onDone(r.tempFilePath);
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

  onShareSchedule() {
    this._renderPoster((tempFilePath) => {
      wx.showShareImageMenu({
        path: tempFilePath,
        // fail also fires when the user just dismisses the native share
        // sheet without picking anything — not an error, so don't toast it.
        fail: (err) => {
          if ((err.errMsg || '').indexOf('cancel') !== -1) return;
          wx.showToast({ title: err.errMsg || '分享失败', icon: 'none' });
        },
      });
    });
  },

  onSaveImage() {
    this._renderPoster((tempFilePath) => {
      wx.saveImageToPhotosAlbum({
        filePath: tempFilePath,
        success: () => wx.showToast({ title: '已保存到相册' }),
        fail: (err) => {
          // "auth deny" covers both a fresh denial and a previously
          // remembered one — either way WeChat won't re-prompt on its
          // own, so send the user to Settings to flip it on manually.
          if ((err.errMsg || '').indexOf('auth deny') !== -1) {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中允许"保存到相册"权限后重试。',
              confirmText: '去设置',
              success: (res) => {
                if (res.confirm) wx.openSetting();
              },
            });
          } else {
            wx.showToast({ title: err.errMsg || '保存失败', icon: 'none' });
          }
        },
      });
    });
  },

  // Triggered by the "邀请加入" button (open-type="share"), not a bindtap —
  // WeChat calls this to build the card, then natively carries its `path`
  // (including the ?invite= query string) through to the recipient's own
  // onLoad — see this page's onLoad above and account_link.js's identical
  // pattern for the parent-student invite flow.
  onShareAppMessage() {
    if (this.data.canEdit && this.data.currentGroupId && this.data.inviteCode) {
      return {
        title: `邀请你加入"${this.data.currentGroupLabel}"课程表`,
        path: `/pages/school_schedule/school_schedule?invite=${this.data.inviteCode}`,
        imageUrl: '/images/share_invite.png',
      };
    }
    return { title: '课程表', path: `/pages/school_schedule/school_schedule?role=${this.data.role}` };
  },

  onShareTimeline() {
    return { title: '课程表' };
  },
});

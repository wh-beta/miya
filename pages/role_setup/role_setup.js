// Sets or changes 身份 (parent/student) — split out from quick_setup.js
// (name-only now) because role follows a different rule: it can stay
// unset indefinitely, is freely changeable right up until this user forms
// their first connection (a ParentChildLink, via 账号与学生绑定), and is
// then locked — changing it after a real link exists would corrupt what
// that link's parent_user_id/student_user_id pairing means. See the
// backend's User.role and update_my_role docstrings. Reachable any time
// from 我的, and from account_link.js right where a role first becomes a
// prerequisite (linking/adding a student).
const { getOpenid, getMyProfile, updateMyRole, claimVirtualStudent } = require('../../utils/auth.js');

Page({
  data: {
    role: '', // current role on file, '' = unset
    hasConnection: false,
    loading: true,
    saving: false,
  },

  onLoad() {
    this._refresh();
  },

  onShow() {
    // Picking up a role/connection change made elsewhere (e.g. just
    // linked a student in account_link.js, then tapped back here).
    if (!this.data.loading) this._refresh();
  },

  _refresh() {
    getMyProfile()
      .then((profile) => {
        this.setData({ role: profile.role || '', hasConnection: !!profile.has_connection, loading: false });
      })
      .catch(() => this.setData({ loading: false }));
  },

  onPickRole(e) {
    if (this.data.hasConnection || this.data.saving) return;
    const role = e.currentTarget.dataset.role;
    if (role === this.data.role) return;
    if (!getOpenid()) {
      wx.showToast({ title: '登录状态异常，请重新进入', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    updateMyRole(role)
      .then(() => {
        this.setData({ role, saving: false });
        wx.showToast({ title: '已设置' });
      })
      .catch((err) => {
        this.setData({ saving: false });
        wx.showToast({ title: err.message || '设置失败', icon: 'none' });
        // A 409 here means a connection formed concurrently elsewhere —
        // refresh so the locked state actually shows.
        this._refresh();
      });
  },

  // A student may have started out virtual (added by a parent, no WeChat
  // account of their own — see account_link.js's "添加学生") and now have
  // a real account to take that same identity over with, using its
  // connect_code — sets role to 'student' and is_virtual to false as a
  // side effect, so just refresh afterward rather than tracking that here.
  onClaimCode() {
    if (this.data.hasConnection) return;
    wx.showModal({
      title: '输入连接码',
      editable: true,
      placeholderText: '家长已经为你创建过账号时使用的连接码',
      success: (res) => {
        const code = (res.content || '').trim();
        if (res.confirm && code) this._claim(code);
      },
    });
  },

  _claim(code) {
    if (!getOpenid()) {
      wx.showToast({ title: '登录状态异常，请重新进入', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    claimVirtualStudent(code)
      .then(() => {
        wx.showToast({ title: '已关联' });
        this.setData({ saving: false });
        this._refresh();
      })
      .catch((err) => {
        this.setData({ saving: false });
        wx.showModal({ title: '认领失败', content: err.message || '未知错误', showCancel: false });
      });
  },
});

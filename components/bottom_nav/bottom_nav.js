// Custom (not WeChat's native tabBar) because 目录 has to route to two
// different pages depending on role (parent_home vs student_home) — native
// tabBar.list can only point each slot at one fixed page path, so it can't
// express that. redirectTo (not navigateTo) so switching between 目录/待办
// doesn't build up a growing back-stack — these are peer sections, not a
// drill-down flow.
Component({
  properties: {
    active: { type: String, value: '' }, // 'directory' | 'todo' | 'growth' | 'mine-relations' | 'mine-urging' | 'mine-account' | 'mine-reminder' | 'mine-password' | 'mine-switch' | 'mine-setup'
    role: { type: String, value: 'student' },
  },
  methods: {
    onTapDirectory() {
      if (this.data.active === 'directory') return;
      const page = this.data.role === 'parent' ? 'parent_home/parent_home' : 'student_home/student_home';
      wx.redirectTo({ url: `/pages/${page}?role=${this.data.role}` });
    },
    onTapTodo() {
      if (this.data.active === 'todo') return;
      wx.redirectTo({ url: `/pages/todo/todo?role=${this.data.role}` });
    },
    onTapGrowth() {
      if (this.data.active === 'growth') return;
      wx.redirectTo({ url: `/pages/growth/growth?role=${this.data.role}` });
    },
    onTapMine() {
      // 我的催办 is parent-only (urging is already a parent-only action
      // everywhere else in the app); everything else here applies to both
      // roles. Exclude whichever sub-page we're already on — showing it as
      // a choice in a menu popped up over itself just looks broken (see the
      // screenshot report: 我的催办 visible behind its own menu item). Still
      // always show the sheet (even down to one real item + the system's
      // own 取消) rather than silently auto-navigating — a tap jumping you
      // to another page with no menu shown reads as broken too.
      const options = [
        { label: '关系列表', page: 'relations/relations', active: 'mine-relations' },
        ...(this.data.role === 'parent' ? [{ label: '我的催办', page: 'urging/urging', active: 'mine-urging' }] : []),
        { label: '账号与绑定', page: 'account_link/account_link', active: 'mine-account' },
        // checkLoginAndRoute silently assigns every brand-new visitor a
        // placeholder name and a best-guess role (see utils/auth.js) —
        // this is where they review/correct either one.
        { label: '完善资料（身份与姓名）', page: 'quick_setup/quick_setup', active: 'mine-setup' },
        { label: '设置提醒', page: 'reminder_settings/reminder_settings', active: 'mine-reminder' },
        { label: '登录密码', page: 'password_settings/password_settings', active: 'mine-password' },
        { label: '切换账号', page: 'switch_account/switch_account', active: 'mine-switch' },
      ].filter((o) => o.active !== this.data.active);

      wx.showActionSheet({
        itemList: options.map((o) => o.label),
        success: (res) => {
          wx.redirectTo({ url: `/pages/${options[res.tapIndex].page}?role=${this.data.role}` });
        },
      });
    },
  },
});

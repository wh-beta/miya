// Custom (not WeChat's native tabBar) because 目录 has to route to two
// different pages depending on role (parent_home vs student_home) — native
// tabBar.list can only point each slot at one fixed page path, so it can't
// express that. redirectTo (not navigateTo) so switching between 目录/待办
// doesn't build up a growing back-stack — these are peer sections, not a
// drill-down flow.
Component({
  properties: {
    active: { type: String, value: '' }, // 'directory' | 'todo' | 'growth' | 'mine-relations' | 'mine-urging' | 'mine-account' | 'mine-reminder' | 'mine-password' | 'mine-switch' | 'mine-name' | 'mine-role'
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
      // A real page (pages/mine/mine), not wx.showActionSheet — that had
      // grown to 7-8 items (关系列表/我的催办/账号与绑定/姓名设置/身份设置/
      // 设置提醒/登录密码/切换账号) past wx.showActionSheet's hard 6-item
      // limit, which made the sheet silently fail to open at all: tapping
      // 我的 did nothing, indistinguishable from a dead button.
      if (this.data.active === 'mine') return;
      wx.redirectTo({ url: `/pages/mine/mine?role=${this.data.role}` });
    },
  },
});

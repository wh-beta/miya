// Launched via WeChat's "打开方式" menu on a chat image (supportedMaterials in
// app.json, scene 1173). Docs describe forwardMaterials as sitting alongside
// the launch options at the app level — NOT reliably inside the target
// page's own onLoad(options), which is where this was first tried and
// apparently didn't show up there in practice. Stashing it here instead,
// before any page has a chance to run, is the robust capture point;
// task_input.js's _consumePendingMaterial reads it back out of storage once
// a session/role is established.
function capturePendingMaterial(options) {
  const launchOptions = options || (wx.getLaunchOptionsSync && wx.getLaunchOptionsSync());
  const materials = launchOptions && launchOptions.forwardMaterials;
  if (!materials || !materials.length) return;
  const material = materials.find((m) => (m.type || '').indexOf('image') !== -1) || materials[0];
  if (material && material.path) {
    wx.setStorageSync('pendingMaterialPath', material.path);
  }
}

// Set when this launch came from scanning the wxacode embedded in a shared
// 课程表 poster (see server/app/wechat.py's get_schedule_invite_wxacode).
// WeChat delivers that code's custom `scene` string as
// launchOptions.query.scene, decodeURIComponent'd — NOT the top-level
// `scene` field, which is WeChat's own numeric launch-source id (1047 for
// "scanned a mini-program code"). Captured here for the same reason as
// capturePendingMaterial above: not reliably present in the target page's
// own onLoad(options) on a cold start, only in the app-level launch options.
function capturePendingScheduleInvite(options) {
  const launchOptions = options || (wx.getLaunchOptionsSync && wx.getLaunchOptionsSync());
  const code = launchOptions && launchOptions.query && launchOptions.query.scene;
  if (code) {
    wx.setStorageSync('pendingScheduleInviteCode', decodeURIComponent(code));
  }
}

App({
  onLaunch(options) {
    // Entry point; routing to the parent/student home page happens via app.json's pages list.
    capturePendingMaterial(options);
    capturePendingScheduleInvite(options);
  },
  // If the mini-program was already running/suspended in the background
  // rather than being freshly cold-started, onLaunch won't fire again for
  // this open — only onShow does, still carrying forwardMaterials the same
  // way. Covering both is what makes this reliable regardless of whether
  // WeChat treats a given "打开方式" tap as a cold start or a resume.
  onShow(options) {
    capturePendingMaterial(options);
    capturePendingScheduleInvite(options);
  },
});

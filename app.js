// Launched via WeChat's "打开方式" menu on a chat image (supportedMaterials in
// app.json, scene 1173). Docs describe forwardMaterials as sitting alongside
// the launch options at the app level — NOT reliably inside the target
// page's own onLoad(options), which is where this was first tried and
// apparently didn't show up there in practice. Stashing it here instead,
// before any page has a chance to run, is the robust capture point;
// task_input.js's _consumePendingMaterial reads it back out of storage once
// a session/role is established.
const { debugLog } = require('./utils/debugLog.js');

function capturePendingMaterial(options) {
  const launchOptions = options || (wx.getLaunchOptionsSync && wx.getLaunchOptionsSync());
  const materials = launchOptions && launchOptions.forwardMaterials;
  if (!materials || !materials.length) return;
  const material = materials.find((m) => (m.type || '').indexOf('image') !== -1) || materials[0];
  if (material && material.path) {
    wx.setStorageSync('pendingMaterialPath', material.path);
  }
}

// WeChat only auto-navigates to a scene's deep-linked page (options.path +
// options.query) on a genuine cold launch. If the mini-program was merely
// resumed from the background — suspended, not killed — tapping a shared
// 课程表 link/image (一键共享's ?group=, 邀请加入's ?invite=) just brings the
// existing instance to the foreground wherever it already was sitting,
// silently dropping the query entirely: confirmed via debugLog, an
// app_onShow correctly reported {group:"1"} in its options.query, but
// school_schedule_onLoad never fired at all right after it — the user
// landed on whatever page the app happened to already be showing, with no
// group ever resolved. Re-navigating by hand fixes that, but ONLY matters
// for a true resume — on a cold launch the framework already does this
// itself correctly. _justLaunched (below) is the guard for that: without
// it, this ran on every onShow including the one immediately following a
// cold onLaunch, and getCurrentPages() isn't reliably populated yet at
// that exact synchronous instant, so it looked like "not there yet" and
// fired a second, redundant wx.reLaunch — confirmed via debugLog as two
// school_schedule_onLoad calls ~160ms apart right after one onLaunch,
// which raced the identity/group-join flow and lost it entirely (the
// "你没有这个班级课程表的查看权限" report this was meant to fix, caused by
// this fix's own first version).
let _justLaunched = false;

function reenterScheduleLinkIfNeeded(options) {
  const path = options && options.path;
  const query = (options && options.query) || {};
  if (path !== 'pages/school_schedule/school_schedule') return;
  if (!query.group && !query.invite) return;

  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  const currentOptions = (current && current.options) || {};
  const alreadyThere =
    current && current.route === path && currentOptions.group === query.group && currentOptions.invite === query.invite;
  if (alreadyThere) return;

  const qs = Object.keys(query)
    .map((k) => `${k}=${encodeURIComponent(query[k])}`)
    .join('&');
  wx.reLaunch({ url: `/${path}${qs ? '?' + qs : ''}` });
}

App({
  onLaunch(options) {
    // Entry point; routing to the parent/student home page happens via app.json's pages list.
    capturePendingMaterial(options);
    debugLog('app_onLaunch', { options, sync: wx.getLaunchOptionsSync && wx.getLaunchOptionsSync() });
    _justLaunched = true;
  },
  // If the mini-program was already running/suspended in the background
  // rather than being freshly cold-started, onLaunch won't fire again for
  // this open — only onShow does, still carrying forwardMaterials the same
  // way. Covering both is what makes this reliable regardless of whether
  // WeChat treats a given "打开方式" tap as a cold start or a resume.
  onShow(options) {
    capturePendingMaterial(options);
    debugLog('app_onShow', { options, sync: wx.getLaunchOptionsSync && wx.getLaunchOptionsSync() });
    // This onShow immediately follows onLaunch on a cold start — the
    // framework itself already navigated to options.path/query correctly
    // in that case. Only a later onShow (a true resume, _justLaunched
    // already consumed) needs the manual re-navigate above.
    if (_justLaunched) {
      _justLaunched = false;
      return;
    }
    reenterScheduleLinkIfNeeded(options);
  },
});

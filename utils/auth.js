const { API_BASE_URL, DEV_MOCK_LOGIN } = require('./config.js');

let _openid = null;
// Set true only by switchAccount, below — lets a page (e.g. the 我的 action
// sheet) tell whether the active session is a real WeChat login or a
// virtual student borrowed via switchAccount, without needing its own
// round-trip to the server. wx.login() always resolves the true underlying
// WeChat identity regardless of this flag or of what _openid currently
// holds, so "switch back" never needs to remember the original openid —
// re-running checkLoginAndRoute() (see switch_account.js) does that for free.
let _switchedAway = false;

function getOpenid() {
  return _openid;
}

function isSwitchedAway() {
  return _switchedAway;
}

// 任务日历 is home for a known user — parent_home/student_home (the old
// landing page) is now a secondary "目录" screen reached via the bottom nav.
// role can legitimately be null now (see User.role's docstring on the
// backend) — omitting the param entirely rather than sending the literal
// string "null" lets task_calendar's own onLoad fallback apply instead.
function _navigateTo(role) {
  wx.reLaunch({ url: `/pages/task_calendar/task_calendar${role ? '?role=' + role : ''}` });
}

// A user with no name yet (first login) is sent to account_link to set one
// before reaching home — that's also where a student first sees their
// connect_code and a parent first gets to link one (account_link is the
// full relationship-management page, not needed at all for a user who
// just arrived via a 课程表 link — see quick_setup.js). Once a name is on
// file, the default is to land on home like before. A caller that's not
// login.js (e.g. school_schedule.js recovering from a cold launch that
// landed there directly, see its onLoad) can override either outcome:
// onHasName to stay on its own page instead of being swept off to
// task_calendar, onNoName to send a nameless user somewhere lighter than
// account_link's full connections UI.
function _checkNameAndRoute(role, onHasName, onNoName) {
  const whenReady = onHasName || (() => _navigateTo(role));
  const whenNoName = onNoName || (() => wx.reLaunch({ url: `/pages/account_link/account_link?role=${role}&setup=1` }));
  return new Promise((resolve) => {
    wx.request({
      url: `${API_BASE_URL}/users/me`,
      method: 'GET',
      data: { openid: _openid },
      success: (r) => {
        // role is passed through here so a custom onHasName/onNoName (e.g.
        // school_schedule.js's stayHere, or its (role) => _goToQuickSetup(role))
        // actually receives it — the default callbacks above already close
        // over it and ignore this extra argument, but a caller-supplied one
        // was previously always getting called with no arguments at all,
        // silently arriving as undefined.
        if (r.statusCode < 400 && r.data && r.data.name) {
          whenReady(role);
        } else {
          whenNoName(role);
        }
        resolve(_openid);
      },
      // Can't confirm profile state — fall back to home rather than blocking login.
      fail: () => {
        whenReady(role);
        resolve(_openid);
      },
    });
  });
}

// Exchanges a fresh wx.login() code for an openid — a returning user has
// no session persisted across cold starts (see getOpenid, an in-memory
// variable) but does already have whatever's on file server-side, so
// there's no need to ask again every launch. The very first time a given
// openid is ever seen, POST /auth/login itself silently creates its User
// row (a placeholder name — see its docstring) rather than requiring a
// setup page before any real content shows. role comes back possibly
// null now (see the backend's User.role docstring — it's only required
// once a connection is being formed, not just to browse) — needsRole
// below is only ever true in DEV_MOCK_LOGIN (no persisted account to
// check against there) or, vanishingly rarely, a legacy account from
// before this existed that still has no name on file (_checkNameAndRoute's
// onNoName, i.e. quick_setup.js). Resolves { needsRole, isNew } — isNew
// lets a caller show a one-time "you're all set" nudge.
function checkLoginAndRoute(onHasName, onNoName) {
  if (DEV_MOCK_LOGIN) {
    return Promise.resolve({ needsRole: true, isNew: true });
  }
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        wx.request({
          url: `${API_BASE_URL}/auth/login`,
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: { code: res.code },
          success: (r) => {
            if (r.statusCode >= 400) {
              reject(new Error((r.data && r.data.detail) || '登录失败'));
              return;
            }
            _openid = r.data.openid;
            _switchedAway = false;
            // Disabled for now — the toast was covering real content
            // (e.g. a schedule page's table) right as it renders, and
            // overlapping with _maybePromptRole's action sheet in
            // school_schedule.js. isNew is still resolved below for any
            // caller that wants it.
            // if (r.data.is_new) {
            //   wx.showToast({ title: '已为您自动创建账号，可前往"我的"完善身份和姓名', icon: 'none', duration: 3000 });
            // }
            _checkNameAndRoute(r.data.role, onHasName, onNoName).then(
              () => resolve({ needsRole: false, isNew: r.data.is_new }),
              reject,
            );
          },
          fail: (err) => reject(new Error(err.errMsg || '网络错误')),
        });
      },
      fail: (err) => reject(new Error(err.errMsg || 'wx.login 失败')),
    });
  });
}

let _identityPromise = null;

// Guarantees getOpenid() is resolved before a page proceeds, regardless of
// which page happens to be the cold-launch entry point — a shared card or
// QR code can point at almost any page's own path (parent_home.js and
// student_home.js both share themselves via onShareAppMessage, same as
// school_schedule.js does, but had no cold-launch handling of their own —
// this covers that gap once, centrally, instead of every page needing its
// own copy of login.js/school_schedule.js's recovery logic). Silent by
// design: unlike checkLoginAndRoute's own default callbacks, this never
// redirects anywhere on a legacy no-name account — the calling page just
// proceeds with whatever's on file. Memoized so multiple pages/calls
// during one cold launch only ever trigger one wx.login()+/auth/login
// exchange. roleHintForMock only picks the fake openid's name in
// DEV_MOCK_LOGIN (there's no real role to hint at the server anymore —
// see checkLoginAndRoute).
function ensureIdentity(roleHintForMock) {
  if (getOpenid()) return Promise.resolve();
  if (DEV_MOCK_LOGIN) {
    _openid = _openid || '__dev_' + (roleHintForMock || 'parent');
    return Promise.resolve();
  }
  if (!_identityPromise) {
    _identityPromise = checkLoginAndRoute(() => Promise.resolve(), () => Promise.resolve()).catch((err) => {
      _identityPromise = null; // don't cache a failure forever — let a later call retry
      throw err;
    });
  }
  return _identityPromise;
}

// Registers a chosen role for the openid checkLoginAndRoute already
// resolved as new, then completes routing exactly like a returning user
// (see onHasName/onNoName above).
function registerRoleAndRoute(role, onHasName, onNoName) {
  if (DEV_MOCK_LOGIN) {
    _openid = '__dev_' + role;
    wx.showToast({ title: '开发模式 (模拟登录)', icon: 'none', duration: 2000 });
    (onHasName || (() => _navigateTo(role)))();
    return Promise.resolve(_openid);
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/auth/register_role`,
      method: 'POST',
      data: { openid: _openid, role },
      success: (r) => {
        if (r.statusCode >= 400) {
          reject(new Error((r.data && r.data.detail) || '注册失败'));
          return;
        }
        _checkNameAndRoute(role, onHasName, onNoName).then(resolve, reject);
      },
      fail: (err) => reject(new Error(err.errMsg || '网络错误')),
    });
  });
}

// Lets a student who started out virtual (no WeChat account of their own —
// see addVirtualStudent) take over that same record once they get a real
// WeChat account, using the student's own connect_code. Requires _openid
// to already be set (a prior wx.login()/checkLoginAndRoute call) — bare
// version with no routing, for a caller that wants the raw result.
function claimVirtualStudent(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/users/me/claim_virtual`,
      method: 'POST',
      data: { openid: _openid, code },
      success: (r) => (r.statusCode < 400 ? resolve(r.data) : reject(new Error((r.data && r.data.detail) || '认领失败'))),
      fail: (err) => reject(new Error(err.errMsg || '网络错误')),
    });
  });
}

// Claims, then completes routing exactly like a returning user (see
// onHasName/onNoName above) — a claimed account already has a name (set
// when it was created as virtual), so onHasName is the expected path, but
// routing through _checkNameAndRoute anyway keeps this consistent with
// every other entry point rather than assuming.
function claimVirtualStudentAndRoute(code, onHasName, onNoName) {
  return claimVirtualStudent(code).then((user) => _checkNameAndRoute(user.role, onHasName, onNoName));
}

// Bare registration, no routing side effects — for a caller (quick_setup.js)
// that owns its own linear flow (pick role -> fill name -> save both ->
// navigate once) rather than the auto-navigate chain registerRoleAndRoute
// drives. Idempotent server-side: a returning user's real role always
// wins over whatever's passed, so calling this for someone who already
// has a role (just missing a name) is always safe.
function registerRole(role) {
  if (DEV_MOCK_LOGIN) {
    _openid = _openid || '__dev_' + role;
    return Promise.resolve({ openid: _openid, role });
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/auth/register_role`,
      method: 'POST',
      data: { openid: _openid, role },
      success: (r) => (r.statusCode < 400 ? resolve(r.data) : reject(new Error((r.data && r.data.detail) || '注册失败'))),
      fail: (err) => reject(new Error(err.errMsg || '网络错误')),
    });
  });
}

function getMyProfile() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/users/me`,
      method: 'GET',
      data: { openid: getOpenid() },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '获取信息失败'))),
      fail: reject,
    });
  });
}

// An explicit, user-initiated role correction — unlike registerRole/
// registerRoleAndRoute, which lock a role in on first creation and no-op
// on any later call for the same openid by design. Needed now that
// checkLoginAndRoute's silent registration assigns a brand-new visitor's
// role from a guess: anyone defaulted wrong needs a way to fix it. See
// quick_setup.js's "身份选错了？重新选择".
function updateMyRole(role) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/users/me/role`,
      method: 'PATCH',
      data: { openid: getOpenid(), role },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '保存失败'))),
      fail: reject,
    });
  });
}

function setMyName(name) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/users/me`,
      method: 'PATCH',
      data: { openid: getOpenid(), name },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '保存失败'))),
      fail: reject,
    });
  });
}

function listLinkedStudents() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/users/me/students`,
      method: 'GET',
      data: { openid: getOpenid() },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '获取失败'))),
      fail: reject,
    });
  });
}

function listLinkedParents() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/users/me/parents`,
      method: 'GET',
      data: { openid: getOpenid() },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '获取失败'))),
      fail: reject,
    });
  });
}

// For a child with no WeChat account of their own (e.g. too young for a
// phone) — creates a real student record by name alone, linked exactly
// like any other student, so the rest of the app never has to special-case it.
function addVirtualStudent(name) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/users/me/virtual_students`,
      method: 'POST',
      data: { parent_openid: getOpenid(), name },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '添加失败'))),
      fail: reject,
    });
  });
}

function linkStudent(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/links`,
      method: 'POST',
      data: { parent_openid: getOpenid(), code },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '绑定失败'))),
      fail: reject,
    });
  });
}

function unlinkStudent(studentId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/links/${studentId}?parent_openid=${encodeURIComponent(getOpenid())}`,
      method: 'DELETE',
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '解除失败'))),
      fail: reject,
    });
  });
}

// The reverse of linkStudent: a student consuming a parent's own
// connect_code (e.g. from a card the parent shared into a family group
// chat), instead of the parent typing the student's code.
function acceptInvite(inviteCode) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/links/accept_invite`,
      method: 'POST',
      data: { student_openid: getOpenid(), invite_code: inviteCode },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '绑定失败'))),
      fail: reject,
    });
  });
}

// Sets/changes the password of whichever identity is currently active
// (a real user's own, or — once switched in via switchAccount — a virtual
// student's own). See password_settings.js.
function setMyPassword(password) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/users/me/password`,
      method: 'PATCH',
      data: { openid: getOpenid(), password },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '保存失败'))),
      fail: reject,
    });
  });
}

// A parent setting/changing a linked virtual student's password on their
// behalf — the only bootstrap path, since the student has no session of
// their own to set it with until a password already exists. See
// account_link.js's onSetStudentPassword.
function setVirtualStudentPassword(studentId, password) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/users/me/virtual_students/${studentId}/password`,
      method: 'POST',
      data: { parent_openid: getOpenid(), password },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '设置失败'))),
      fail: reject,
    });
  });
}

// Temporarily adopts a virtual student's identity for this session (their
// connect_code + the password a parent set for them via
// setVirtualStudentPassword) — distinct from claimVirtualStudentAndRoute,
// which permanently transplants a real openid onto the row. See
// switch_account.js.
function switchAccount(code, password) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/auth/switch_account`,
      method: 'POST',
      data: { code, password },
      success: (res) => {
        if (res.statusCode >= 400) {
          reject(new Error((res.data && res.data.detail) || '切换失败'));
          return;
        }
        _openid = res.data.openid;
        _switchedAway = true;
        resolve(res.data);
      },
      fail: reject,
    });
  });
}

module.exports = {
  checkLoginAndRoute,
  registerRoleAndRoute,
  registerRole,
  claimVirtualStudent,
  claimVirtualStudentAndRoute,
  getOpenid,
  ensureIdentity,
  isSwitchedAway,
  getMyProfile,
  setMyName,
  updateMyRole,
  setMyPassword,
  setVirtualStudentPassword,
  switchAccount,
  listLinkedStudents,
  listLinkedParents,
  linkStudent,
  unlinkStudent,
  acceptInvite,
  addVirtualStudent,
};

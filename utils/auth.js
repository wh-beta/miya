const { API_BASE_URL, DEV_MOCK_LOGIN } = require('./config.js');

let _openid = null;

function getOpenid() {
  return _openid;
}

// 任务日历 is home for a known user — parent_home/student_home (the old
// landing page) is now a secondary "目录" screen reached via the bottom nav.
function _navigateTo(role) {
  wx.reLaunch({ url: `/pages/task_calendar/task_calendar?role=${role}` });
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
        if (r.statusCode < 400 && r.data && r.data.name) {
          whenReady();
        } else {
          whenNoName();
        }
        resolve(_openid);
      },
      // Can't confirm profile state — fall back to home rather than blocking login.
      fail: () => {
        whenReady();
        resolve(_openid);
      },
    });
  });
}

// Exchanges a fresh wx.login() code for an openid and checks whether it's
// already registered — a returning user has no session persisted across
// cold starts (see getOpenid, an in-memory variable) but does already
// have a role on file server-side, so there's no need to ask again every
// launch. Resolves { needsRole: true } for a genuinely new openid (caller
// should prompt and call registerRoleAndRoute); for a returning user it
// completes routing itself (via _checkNameAndRoute, see onHasName above)
// and resolves { needsRole: false } — DEV_MOCK_LOGIN has no persisted
// account to check against, so it always reports needsRole: true.
function checkLoginAndRoute(onHasName, onNoName) {
  if (DEV_MOCK_LOGIN) {
    return Promise.resolve({ needsRole: true });
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
            if (r.data.is_new) {
              resolve({ needsRole: true });
            } else {
              _checkNameAndRoute(r.data.role, onHasName, onNoName).then(() => resolve({ needsRole: false }), reject);
            }
          },
          fail: (err) => reject(new Error(err.errMsg || '网络错误')),
        });
      },
      fail: (err) => reject(new Error(err.errMsg || 'wx.login 失败')),
    });
  });
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

module.exports = {
  checkLoginAndRoute,
  registerRoleAndRoute,
  getOpenid,
  getMyProfile,
  setMyName,
  listLinkedStudents,
  listLinkedParents,
  linkStudent,
  unlinkStudent,
  acceptInvite,
  addVirtualStudent,
};

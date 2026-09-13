const { API_BASE_URL } = require('./config.js');

// Temporary diagnostic channel for capturing what a real device actually
// sees on launch (wx.getLaunchOptionsSync(), Page.onLoad(options)) — see
// DebugLogEntry's docstring in server/app/models.py. Fire-and-forget:
// never throws or blocks real app behavior, even if the request itself
// fails. Remove callers (and this file) once the 一键共享 vs 邀请加入
// launch-data question is settled.
function debugLog(tag, data) {
  try {
    wx.request({
      url: `${API_BASE_URL}/debug/log`,
      method: 'POST',
      data: { tag, data: data || {} },
      success: () => {},
      fail: () => {},
    });
  } catch (e) {
    // no-op — must never affect the caller
  }
}

module.exports = { debugLog };

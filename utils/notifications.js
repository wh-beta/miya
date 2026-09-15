const { API_BASE_URL } = require('./config.js');
const { getOpenid } = require('./auth.js');

// In-app only (no WeChat push — see main.py's Notification docstring for
// why). Currently the only thing that ever creates one is a schedule
// group's owner deleting it out from under a viewer.

function listNotifications() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/notifications`,
      method: 'GET',
      data: { openid: getOpenid() },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '获取失败'))),
      fail: reject,
    });
  });
}

// Marks everything read at once — meant to fire when the 通知 page opens,
// not per-item (see main.py's mark_notifications_read docstring).
function markNotificationsRead() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/notifications/mark_read`,
      method: 'POST',
      data: { openid: getOpenid() },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '操作失败'))),
      fail: reject,
    });
  });
}

module.exports = {
  listNotifications,
  markNotificationsRead,
};

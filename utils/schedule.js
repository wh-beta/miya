const { API_BASE_URL } = require('./config.js');
const { getOpenid } = require('./auth.js');

// The shared weekly class schedule — see ClassScheduleEntry's docstring in
// server/app/models.py. Every call is gated server-side by
// _ensure_schedule_authorized, not by anything client-side; a 403 here
// means "not invited yet", not a bug.

function getWeeklySchedule() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/weekly_schedule`,
      method: 'GET',
      data: { openid: getOpenid() },
      success: (res) => {
        if (res.statusCode < 400) {
          resolve(res.data);
        } else {
          const err = new Error((res.data && res.data.detail) || '获取失败');
          err.statusCode = res.statusCode;
          reject(err);
        }
      },
      fail: reject,
    });
  });
}

function saveWeeklySchedule(entries) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/weekly_schedule`,
      method: 'PUT',
      data: { openid: getOpenid(), entries },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '保存失败'))),
      fail: reject,
    });
  });
}

// Downloads the current invite wxacode (a scannable WeChat mini-program
// code, not a generic QR code) to a local temp file. wx.downloadFile
// (rather than wx.request) so WeChat handles the binary transfer directly
// and hands back a file path ready for canvas.createImage().
function downloadScheduleInviteQrcode(regenerate) {
  return new Promise((resolve, reject) => {
    const q = `openid=${encodeURIComponent(getOpenid())}${regenerate ? '&regenerate=true' : ''}`;
    wx.downloadFile({
      url: `${API_BASE_URL}/weekly_schedule/invite_qrcode?${q}`,
      success: (res) => (res.statusCode < 400 ? resolve(res.tempFilePath) : reject(new Error('获取邀请码失败'))),
      fail: reject,
    });
  });
}

function acceptScheduleInvite(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/weekly_schedule/accept_invite`,
      method: 'POST',
      data: { openid: getOpenid(), code },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '兑换邀请码失败'))),
      fail: reject,
    });
  });
}

module.exports = {
  getWeeklySchedule,
  saveWeeklySchedule,
  downloadScheduleInviteQrcode,
  acceptScheduleInvite,
};

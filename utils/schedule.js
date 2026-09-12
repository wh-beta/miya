const { API_BASE_URL } = require('./config.js');
const { getOpenid } = require('./auth.js');

// A ScheduleGroup is one real class (school + grade + class_name), owned by
// whoever created/imported it — see ScheduleGroup's docstring in
// server/app/models.py. Every call below is gated server-side, not by
// anything client-side; a 403 here means "not the owner" or "not invited",
// not a bug.

function listScheduleGroups(q) {
  return new Promise((resolve, reject) => {
    const data = { openid: getOpenid() };
    if (q) data.q = q;
    wx.request({
      url: `${API_BASE_URL}/schedule_groups`,
      method: 'GET',
      data,
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '获取失败'))),
      fail: reject,
    });
  });
}

function listMyScheduleGroups() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/schedule_groups/mine`,
      method: 'GET',
      data: { openid: getOpenid() },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '获取失败'))),
      fail: reject,
    });
  });
}

function createScheduleGroup({ school, grade, className }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/schedule_groups`,
      method: 'POST',
      data: { openid: getOpenid(), school, grade, class_name: className },
      success: (res) => {
        if (res.statusCode < 400) {
          resolve(res.data);
          return;
        }
        // A 409 carries a structured detail (see create_schedule_group in
        // main.py) — {message, existing_group_id, owner_name} — rather
        // than a plain string, so the caller can point the user straight
        // at the group that already exists instead of just failing.
        const detail = res.data && res.data.detail;
        const isDuplicate = detail && typeof detail === 'object';
        const err = new Error((isDuplicate ? detail.message : detail) || '创建失败');
        err.statusCode = res.statusCode;
        if (isDuplicate) {
          err.existingGroupId = detail.existing_group_id;
          err.ownerName = detail.owner_name;
        }
        reject(err);
      },
      fail: reject,
    });
  });
}

function getGroupSchedule(groupId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/schedule_groups/${groupId}/schedule`,
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

function saveGroupSchedule(groupId, entries) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/schedule_groups/${groupId}/schedule`,
      method: 'PUT',
      data: { openid: getOpenid(), entries },
      success: (res) => {
        if (res.statusCode < 400) {
          resolve(res.data);
        } else {
          const err = new Error((res.data && res.data.detail) || '保存失败');
          err.statusCode = res.statusCode;
          reject(err);
        }
      },
      fail: reject,
    });
  });
}

// Downloads the current invite wxacode (a scannable WeChat mini-program
// code, not a generic QR code) for one group to a local temp file.
// wx.downloadFile (rather than wx.request) so WeChat handles the binary
// transfer directly and hands back a file path ready for canvas.createImage().
function downloadGroupInviteQrcode(groupId, regenerate) {
  return new Promise((resolve, reject) => {
    const q = `openid=${encodeURIComponent(getOpenid())}${regenerate ? '&regenerate=true' : ''}`;
    wx.downloadFile({
      url: `${API_BASE_URL}/schedule_groups/${groupId}/invite_qrcode?${q}`,
      success: (res) => (res.statusCode < 400 ? resolve(res.tempFilePath) : reject(new Error('获取邀请码失败'))),
      fail: reject,
    });
  });
}

function acceptScheduleInvite(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/schedule_groups/accept_invite`,
      method: 'POST',
      data: { openid: getOpenid(), code },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '兑换邀请码失败'))),
      fail: reject,
    });
  });
}

// Uploads a photo of a printed weekly schedule for vision-LLM extraction
// into draft {day_of_week, period, subject} cells — no OCR+regex fallback
// (see weekly_schedule_vision.py), so a failure here means "try again" or
// "fill it in by hand", not a silently degraded result.
function uploadWeeklyScheduleImage(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/ingest/weekly_schedule_image`,
      filePath,
      name: 'file',
      success: (res) => {
        if (res.statusCode >= 400) {
          reject(new Error('识别失败'));
          return;
        }
        try {
          resolve(JSON.parse(res.data).entries || []);
        } catch (e) {
          reject(new Error('识别结果解析失败'));
        }
      },
      fail: reject,
    });
  });
}

module.exports = {
  listScheduleGroups,
  listMyScheduleGroups,
  createScheduleGroup,
  getGroupSchedule,
  saveGroupSchedule,
  downloadGroupInviteQrcode,
  acceptScheduleInvite,
  uploadWeeklyScheduleImage,
};

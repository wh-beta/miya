const { API_BASE_URL } = require('./config.js');

// Returns {completed, total, previous_completed, previous_total} for
// [start, end] (YYYY-MM-DD, inclusive); previous_* covers the immediately
// preceding period of equal length. Omitting studentUserId aggregates
// everything visible to the caller (used for a student's own view).
function getProgress({ start, end, studentUserId }) {
  const data = { start, end };
  if (studentUserId != null) data.student_user_id = studentUserId;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/progress`,
      method: 'GET',
      data,
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '获取进度失败'))),
      fail: reject,
    });
  });
}

module.exports = { getProgress };

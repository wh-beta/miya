const { API_BASE_URL } = require('./config.js');
const { getOpenid } = require('./auth.js');

// A GrowthRecord is one combined entry — 科目 plus an optional 分数/满分/
// 考试名称/日期/备注 and an optional photo (the actual exercise/test sheet)
// — not two separate scores-list/photo-gallery features. Parent-entry
// only; a student can list their own but never create/delete.

function createGrowthRecord({ studentUserId, subject, examName, score, maxScore, recordDate, note }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/growth_records`,
      method: 'POST',
      data: {
        parent_openid: getOpenid(),
        student_user_id: studentUserId,
        subject,
        exam_name: examName || undefined,
        score: score === '' || score === null || score === undefined ? undefined : score,
        max_score: maxScore === '' || maxScore === null || maxScore === undefined ? undefined : maxScore,
        record_date: recordDate || undefined,
        note: note || undefined,
      },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '保存失败'))),
      fail: reject,
    });
  });
}

function listGrowthRecords(studentUserId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/growth_records`,
      method: 'GET',
      data: { student_user_id: studentUserId, openid: getOpenid() },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '获取失败'))),
      fail: reject,
    });
  });
}

// openid directly in the url's query string (not a `data` object) for
// this DELETE — matching unlinkStudent/deleteScheduleGroup's established
// pattern, not the shape joinScheduleGroup got wrong earlier: wx.request's
// `data` becomes the request body on non-GET methods, not query params.
function deleteGrowthRecord(recordId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/growth_records/${recordId}?openid=${encodeURIComponent(getOpenid())}`,
      method: 'DELETE',
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '删除失败'))),
      fail: reject,
    });
  });
}

function uploadGrowthRecordImage(recordId, filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/growth_records/${recordId}/image`,
      filePath,
      name: 'file',
      success: (res) => {
        try {
          const body = JSON.parse(res.data);
          if (res.statusCode >= 400) {
            reject(new Error(body.detail || '上传失败'));
          } else {
            resolve(body);
          }
        } catch (err) {
          reject(err);
        }
      },
      fail: reject,
    });
  });
}

module.exports = {
  createGrowthRecord,
  listGrowthRecords,
  deleteGrowthRecord,
  uploadGrowthRecordImage,
};

const { API_BASE_URL } = require('./config.js');

function listClasses() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/classes`,
      method: 'GET',
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

function createClass(session, ownerRole) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/classes`,
      method: 'POST',
      data: {
        subject: session.subject,
        session_date: session.session_date,
        start_time: session.start_time,
        end_time: session.end_time,
        note: session.note || null,
        owner_role: ownerRole,
        child_name: session.child_name || null,
        student_user_id: session.student_user_id || null,
      },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

function deleteClass(classId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/classes/${classId}`,
      method: 'DELETE',
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

// Uploads a photo of a schedule table; the backend OCRs it and parses out a
// best-effort list of draft sessions {subject, session_date, start_time,
// end_time, note} for the user to review before anything is saved.
function uploadScheduleImage(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/ingest/schedule_image`,
      filePath,
      name: 'file',
      success: (res) => {
        try {
          const body = JSON.parse(res.data);
          if (res.statusCode >= 400) {
            reject(new Error(body.detail || 'Upload failed'));
          } else {
            resolve(body.sessions);
          }
        } catch (err) {
          reject(err);
        }
      },
      fail: reject,
    });
  });
}

function updateClassStatus(classId, status) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/classes/${classId}`,
      method: 'PATCH',
      data: { status },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

function urgeClass(classId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/classes/${classId}/urge`,
      method: 'POST',
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

// Optional proof-of-completion photo, attached after the student flips a
// class session to "done" — see task_calendar.js's promptCompletionPhoto.
function uploadClassCompletionImage(classId, filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/classes/${classId}/completion_image`,
      filePath,
      name: 'file',
      success: (res) => {
        try {
          const body = JSON.parse(res.data);
          if (res.statusCode >= 400) {
            reject(new Error(body.detail || 'Upload failed'));
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

// All photos uploaded for a class session so far — see tasks.js's
// listTaskCompletionImages.
function listClassCompletionImages(classId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/classes/${classId}/completion_images`,
      method: 'GET',
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '获取失败'))),
      fail: reject,
    });
  });
}

// "检查" flow — see tasks.js's extractTaskCompletionQuestions/
// confirmTaskCompletionQuestions for the two-step rationale.
function extractClassCompletionQuestions(classId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/classes/${classId}/completion_image/extract_preview`,
      method: 'POST',
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

function confirmClassCompletionQuestions(classId, imagePath, selectedQuestions) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/classes/${classId}/completion_image/extract_confirm`,
      method: 'POST',
      data: { image_path: imagePath, selected_questions: selectedQuestions },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

// See tasks.js's findSimilarForTaskCandidate for the markWrong rationale.
function findSimilarForClassCandidate(classId, content, markWrong) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/classes/${classId}/completion_image/candidates/similar`,
      method: 'POST',
      data: { content, mark_wrong: !!markWrong },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

// See tasks.js's gradeTaskCompletionImage for the AI-grading rationale.
function gradeClassCompletionImage(classId, imageUrl) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/classes/${classId}/completion_image/grade`,
      method: 'POST',
      data: { image_url: imageUrl || null },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '批改失败'))),
      fail: reject,
    });
  });
}

module.exports = {
  listClasses,
  createClass,
  deleteClass,
  uploadScheduleImage,
  updateClassStatus,
  urgeClass,
  uploadClassCompletionImage,
  listClassCompletionImages,
  extractClassCompletionQuestions,
  confirmClassCompletionQuestions,
  findSimilarForClassCandidate,
  gradeClassCompletionImage,
};

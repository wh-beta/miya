const { API_BASE_URL } = require('./config.js');

function createTask(draftTask, ownerRole) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/tasks`,
      method: 'POST',
      data: {
        title: draftTask.title,
        subject: draftTask.subject || null,
        due_at: draftTask.due_at || new Date().toISOString(),
        owner_role: ownerRole,
        child_name: draftTask.child_name || null,
        student_user_id: draftTask.student_user_id || null,
      },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

// Uploads a photo of a homework list (subject header + list of dated
// items); the backend OCRs it and parses out a best-effort list of draft
// tasks {title, subject, due_at} for the user to review before saving.
function listTasks() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/tasks`,
      method: 'GET',
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

function uploadTaskListImage(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/ingest/task_list`,
      filePath,
      name: 'file',
      success: (res) => {
        try {
          const body = JSON.parse(res.data);
          if (res.statusCode >= 400) {
            reject(new Error(body.detail || 'Upload failed'));
          } else {
            resolve(body.tasks);
          }
        } catch (err) {
          reject(err);
        }
      },
      fail: reject,
    });
  });
}

function updateTaskStatus(taskId, status) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/tasks/${taskId}`,
      method: 'PATCH',
      data: { status },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

function urgeTask(taskId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/tasks/${taskId}/urge`,
      method: 'POST',
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

function deleteTask(taskId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/tasks/${taskId}`,
      method: 'DELETE',
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

// Same idea as uploadTaskListImage, but for text pasted/typed directly into
// the composer — skips OCR entirely, straight to the heuristic list parser.
function uploadTaskListText(text) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/ingest/task_list_text`,
      method: 'POST',
      data: { text },
      success: (res) => {
        if (res.statusCode >= 400) {
          reject(new Error((res.data && res.data.detail) || '解析失败'));
        } else {
          resolve(res.data.tasks);
        }
      },
      fail: reject,
    });
  });
}

// Optional proof-of-completion photo, attached after the student flips a
// task to "done" — see task_calendar.js's promptCompletionPhoto.
function uploadTaskCompletionImage(taskId, filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/tasks/${taskId}/completion_image`,
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

// All photos uploaded for a task so far (task.completion_image_url only
// ever points at the latest one) — used by completion_check's gallery.
function listTaskCompletionImages(taskId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/tasks/${taskId}/completion_images`,
      method: 'GET',
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '获取失败'))),
      fail: reject,
    });
  });
}

// "检查" flow, step 1 — OCRs the already-uploaded completion photo and
// returns candidate questions; nothing is stored yet (see task_bank_review.js).
function extractTaskCompletionQuestions(taskId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/tasks/${taskId}/completion_image/extract_preview`,
      method: 'POST',
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

// "检查" flow, step 2 — stores only the parent-selected subset from step 1.
function confirmTaskCompletionQuestions(taskId, imagePath, selectedQuestions) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/tasks/${taskId}/completion_image/extract_confirm`,
      method: 'POST',
      data: { image_path: imagePath, selected_questions: selectedQuestions },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

// "检查" flow — find similar practice questions for one already-OCR'd
// candidate (no image re-upload needed). markWrong also nudges that
// question's knowledge points down in the student's mastery record — see
// question_extraction.py's _nudge_knowledge_mastery for why that's a
// separate opt-in flag rather than always-on.
function findSimilarForTaskCandidate(taskId, content, markWrong) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/tasks/${taskId}/completion_image/candidates/similar`,
      method: 'POST',
      data: { content, mark_wrong: !!markWrong },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

// AI 批改 — checks the student's handwritten answers in a completion photo
// against the printed problems and reports right/wrong. Nothing is stored;
// each call is a fresh check. imageUrl (the completion_images path this
// page is currently showing) is optional — omitted means the task's latest
// photo (see server's GradeImageRequest).
function gradeTaskCompletionImage(taskId, imageUrl) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/tasks/${taskId}/completion_image/grade`,
      method: 'POST',
      data: { image_url: imageUrl || null },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error((res.data && res.data.detail) || '批改失败'))),
      fail: reject,
    });
  });
}

module.exports = {
  createTask,
  listTasks,
  uploadTaskListImage,
  updateTaskStatus,
  urgeTask,
  deleteTask,
  uploadTaskListText,
  uploadTaskCompletionImage,
  listTaskCompletionImages,
  extractTaskCompletionQuestions,
  confirmTaskCompletionQuestions,
  findSimilarForTaskCandidate,
  gradeTaskCompletionImage,
};

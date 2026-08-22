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

module.exports = { createTask, listTasks, uploadTaskListImage };

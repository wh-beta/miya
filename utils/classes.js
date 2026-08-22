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
      },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

function listChildren() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/children`,
      method: 'GET',
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

module.exports = { listClasses, createClass, deleteClass, uploadScheduleImage, listChildren };

const { API_BASE_URL } = require('./config.js');

// Pure query — never stores anything. See homework-backend's
// find_similar_from_image/find_similar_from_pdf: OCRs whatever's in the
// photo, then finds questions in the bank with overlapping knowledge points
// and similar complexity. PDF input goes through a separate <web-view>
// bridge (see pages/similar_search_pdf_webview) since mini-programs have no
// API to open the phone's native file picker — this function only covers
// the direct-photo path.
function searchSimilarQuestionsFromImage(filePath, subject) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/questions/similar-search`,
      filePath,
      name: 'file',
      formData: subject ? { subject } : {},
      success: (res) => {
        try {
          const body = JSON.parse(res.data);
          if (res.statusCode >= 400) {
            reject(new Error(body.detail || '查找失败'));
          } else {
            resolve(body.results || []);
          }
        } catch (err) {
          reject(err);
        }
      },
      fail: reject,
    });
  });
}

module.exports = { searchSimilarQuestionsFromImage };

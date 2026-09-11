const { API_BASE_URL } = require('../../utils/config.js');

// Mirrors pages/pdf_upload_webview exactly (see that page's comment for why
// a <web-view> + H5 <input type="file"> bridge is needed at all — mini-
// programs have no API to open the phone's native Files app). This one
// loads static/similar_search_pdf.html instead, which posts to
// /questions/similar-search and forwards back `results` rather than
// `draft_task`/`tasks`.
Page({
  data: { url: '' },
  onLoad() {
    this._result = null;
    this.setData({ url: `${API_BASE_URL}/webview/similar_search_pdf.html` });
  },
  onMessage(e) {
    const messages = e.detail.data || [];
    if (messages.length > 0) {
      this._result = messages[messages.length - 1];
    }
  },
  onUnload() {
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (!prevPage || !this._result) return;
    if (this._result.results) {
      // setResults() (not setData directly) so the percent-rounding
      // normalization stays in one place — see similar_questions.js.
      prevPage.setResults(this._result.results);
    } else if (this._result.error) {
      wx.showToast({ title: this._result.error, icon: 'none' });
    }
  },
});

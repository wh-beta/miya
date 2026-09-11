const { API_BASE_URL } = require('../../utils/config.js');

// wx.chooseMessageFile can only reach files already sitting in WeChat chat
// history — there is no Mini Program API to open the phone's native Files
// app. This page instead loads an H5 page (server/app/static/upload_pdf.html)
// in a <web-view>, which can use a plain <input type="file"> to reach the
// OS file picker. The H5 page uploads directly to /ingest/pdf itself (it's
// same-origin, no auth needed beyond what that endpoint already requires)
// and reports the result back via wx.miniProgram.postMessage before
// navigating back here.
Page({
  data: { url: '' },
  onLoad() {
    this._result = null;
    this.setData({ url: `${API_BASE_URL}/webview/upload_pdf.html` });
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
    if (this._result.draft_task) {
      prevPage.setData({ draftTask: this._result.draft_task });
      if (this._result.tasks && this._result.tasks.length) {
        prevPage.setData({ taskDrafts: this._result.tasks });
      }
    } else if (this._result.error) {
      wx.showToast({ title: this._result.error, icon: 'none' });
    }
  },
});

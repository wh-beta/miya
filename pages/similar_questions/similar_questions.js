const { searchSimilarQuestionsFromImage } = require('../../utils/questions.js');

// Pure search, nothing gets stored. Two input paths: a direct photo (this
// page uploads straight to /questions/similar-search) or a PDF, which has
// to go through the <web-view> bridge page since mini-programs can't open
// the phone's native file picker — see similar_search_pdf_webview.js.
// WXML can't do the percent-rounding math itself, so it's precomputed here
// on every result — shared by both input paths (the direct-image path
// below, and similar_search_pdf_webview.js, which calls this page's
// setResults() instead of setData directly so this normalization only
// needs to live in one place).
function normalizeResults(results) {
  return (results || []).map((r) => Object.assign({}, r, {
    similar_questions: (r.similar_questions || []).map((s) => Object.assign({}, s, {
      scorePercent: Math.round(s.score * 100),
    })),
  }));
}

Page({
  data: {
    status: 'idle', // idle | searching | done
    results: [],
  },

  onShow() {
    // Set right before navigating to the PDF webview (see onChoosePdf) —
    // by the time we're shown again the webview has already handed results
    // back via setResults() below (or nothing, on error/cancel), so this
    // only needs to close out the loading state.
    if (this._pdfPending) {
      this._pdfPending = false;
      this.setData({ status: 'done' });
    }
  },

  setResults(results) {
    this.setData({ results: normalizeResults(results) });
  },

  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ status: 'searching', results: [] });
        searchSimilarQuestionsFromImage(res.tempFiles[0].tempFilePath)
          .then((results) => {
            this.setResults(results);
            this.setData({ status: 'done' });
          })
          .catch((err) => {
            this.setData({ status: 'idle' });
            wx.showToast({ title: err.message || '查找失败', icon: 'none' });
          });
      },
    });
  },

  onChoosePdf() {
    this._pdfPending = true;
    this.setData({ status: 'searching', results: [] });
    wx.navigateTo({ url: '/pages/similar_search_pdf_webview/similar_search_pdf_webview' });
  },
});

const {
  extractTaskCompletionQuestions,
  confirmTaskCompletionQuestions,
  findSimilarForTaskCandidate,
  listTaskCompletionImages,
  gradeTaskCompletionImage,
} = require('../../utils/tasks.js');
const {
  extractClassCompletionQuestions,
  confirmClassCompletionQuestions,
  findSimilarForClassCandidate,
  listClassCompletionImages,
  gradeClassCompletionImage,
} = require('../../utils/classes.js');
const { API_BASE_URL } = require('../../utils/config.js');

// "检查" review flow: parent views the student's completion photo(s), can
// optionally trigger question extraction from the latest one, then
// hand-picks which of the OCR'd candidates are worth keeping before
// anything is stored. Nothing is saved until onConfirm — extraction alone
// (onParse) is read-only on the backend, and always targets the latest
// photo server-side (Task/ClassSession.completion_image_url) regardless of
// which thumbnail the parent is looking at — the student may have
// uploaded several (see task_calendar.js's promptCompletionPhoto), so
// `images` here is a full gallery of all of them for the parent to review,
// while extraction only ever runs against the most recent. See
// utils/tasks.js / utils/classes.js for the API calls this mirrors, and
// homework-backend's question_extraction.py (store_selected_questions) for
// why confirmed picks land as review_status='pending' rather than
// immediately searchable.
Page({
  data: {
    kind: 'task',
    id: null,
    imageUrl: '',
    images: [],
    currentIndex: 0,
    currentUrl: '',
    status: 'idle', // idle | parsing | parsed | confirming | done
    candidates: [],
    selectedCount: 0,
    // AI 批改 — independent of the parse/confirm flow above (that OCRs
    // printed questions into the question bank; this checks correctness of
    // the student's own answers on whichever photo is currently shown, and
    // nothing here is ever stored).
    gradeStatus: 'idle', // idle | grading | graded
    gradeItems: [],
    gradeWrongCount: 0,
  },

  onLoad(options) {
    const kind = options.kind;
    const id = Number(options.id);
    this.setData({
      kind,
      id,
      imageUrl: `${API_BASE_URL}${decodeURIComponent(options.url || '')}`,
    });
    const listFn = kind === 'class' ? listClassCompletionImages : listTaskCompletionImages;
    listFn(id)
      .then((images) => {
        const urls = images.map((img) => `${API_BASE_URL}${img.url}`);
        // Falls back to the single url the calendar card linked in with if
        // this list comes back empty (e.g. a pre-existing row saved before
        // this endpoint existed) so the parent still sees something. Starts
        // on the last (most recent) photo, matching what "检查" implied
        // before this page could show more than one.
        const list = urls.length ? urls : [this.data.imageUrl];
        this.setData({ images: list, currentIndex: list.length - 1, currentUrl: list[list.length - 1] });
      })
      .catch(() => this.setData({ images: [this.data.imageUrl], currentIndex: 0, currentUrl: this.data.imageUrl }));
  },

  onPrevImage() {
    if (this.data.currentIndex <= 0) return;
    const currentIndex = this.data.currentIndex - 1;
    this.setData({ currentIndex, currentUrl: this.data.images[currentIndex], gradeStatus: 'idle', gradeItems: [] });
  },

  onNextImage() {
    if (this.data.currentIndex >= this.data.images.length - 1) return;
    const currentIndex = this.data.currentIndex + 1;
    this.setData({ currentIndex, currentUrl: this.data.images[currentIndex], gradeStatus: 'idle', gradeItems: [] });
  },

  onPreviewImage() {
    wx.previewImage({ urls: this.data.images, current: this.data.currentUrl });
  },

  // Grades whichever photo is currently displayed (unlike onParse, which
  // always targets the task/class's latest photo server-side) — strip the
  // API_BASE_URL prefix back off since the server stores/expects the
  // relative completion_image_url form.
  onGradeImage() {
    const relativeUrl = this.data.currentUrl.startsWith(API_BASE_URL)
      ? this.data.currentUrl.slice(API_BASE_URL.length)
      : null;
    this.setData({ gradeStatus: 'grading' });
    const gradeFn = this.data.kind === 'class' ? gradeClassCompletionImage : gradeTaskCompletionImage;
    gradeFn(this.data.id, relativeUrl)
      .then((res) => {
        const items = res.items || [];
        if (items.length === 0) {
          this.setData({ gradeStatus: 'idle' });
          wx.showToast({ title: '没有识别到可批改的题目', icon: 'none' });
          return;
        }
        this.setData({
          gradeStatus: 'graded',
          gradeItems: items,
          gradeWrongCount: items.filter((it) => !it.correct).length,
        });
      })
      .catch((err) => {
        this.setData({ gradeStatus: 'idle' });
        wx.showToast({ title: err.message || '批改失败', icon: 'none' });
      });
  },

  onParse() {
    this.setData({ status: 'parsing' });
    const extractFn = this.data.kind === 'class' ? extractClassCompletionQuestions : extractTaskCompletionQuestions;
    extractFn(this.data.id)
      .then((res) => {
        this._imagePath = res.imagePath;
        // Likely duplicates (the backend already checked against the whole
        // question bank) default to unchecked — the parent has to notice
        // and opt in, rather than needing to notice and uncheck one among
        // several real candidates. WXML can't do the percent-rounding math
        // itself, so it's precomputed here instead of in the template.
        const candidates = (res.questions || []).map((q) => Object.assign({}, q, {
          selected: !q.duplicate,
          duplicateScorePercent: q.duplicate ? Math.round(q.duplicate.score * 100) : null,
          wrong: false,
          similarLoading: false,
          similarResults: null,
        }));
        if (candidates.length === 0) {
          this.setData({ status: 'idle' });
          wx.showToast({ title: '没有识别到印刷体题目', icon: 'none' });
          return;
        }
        this.setData({ status: 'parsed', candidates, selectedCount: candidates.length });
      })
      .catch((err) => {
        this.setData({ status: 'idle' });
        wx.showToast({ title: err.message || '解析失败', icon: 'none' });
      });
  },

  onToggleSelect(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const candidates = this.data.candidates.slice();
    candidates[idx] = Object.assign({}, candidates[idx], { selected: !candidates[idx].selected });
    this.setData({ candidates, selectedCount: candidates.filter((c) => c.selected).length });
  },

  // Independent of onToggleSelect — a question can be both "wrong" and
  // worth importing into the bank (in fact especially worth it), or wrong
  // but not import-worthy (e.g. a duplicate), so these two flags don't
  // imply each other.
  onToggleWrong(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const candidates = this.data.candidates.slice();
    candidates[idx] = Object.assign({}, candidates[idx], { wrong: !candidates[idx].wrong });
    this.setData({ candidates });
  },

  // Finds similar practice questions for one candidate — no image re-
  // upload needed, the content's already been OCR'd. When that candidate
  // is marked wrong, the same call also nudges its knowledge points down
  // in the student's mastery record (see findSimilarForTaskCandidate).
  onFindSimilar(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const candidate = this.data.candidates[idx];
    this.setData({ [`candidates[${idx}].similarLoading`]: true });

    const findFn = this.data.kind === 'class' ? findSimilarForClassCandidate : findSimilarForTaskCandidate;
    findFn(this.data.id, candidate.content, candidate.wrong)
      .then((res) => {
        // WXML can't do the percent-rounding math itself.
        const similarResults = (res.similar_questions || []).map((s) => Object.assign({}, s, {
          scorePercent: Math.round(s.score * 100),
        }));
        this.setData({
          [`candidates[${idx}].similarLoading`]: false,
          [`candidates[${idx}].similarResults`]: similarResults,
        });
        if (candidate.wrong) {
          wx.showToast({ title: '已记录为薄弱知识点', icon: 'none' });
        }
      })
      .catch((err) => {
        this.setData({ [`candidates[${idx}].similarLoading`]: false });
        wx.showToast({ title: err.message || '查找失败', icon: 'none' });
      });
  },

  onConfirm() {
    const selected = this.data.candidates
      .filter((c) => c.selected)
      .map((c) => ({ content: c.content, question_type: c.question_type, options: c.options, bbox: c.bbox }));
    if (selected.length === 0) return;

    this.setData({ status: 'confirming' });
    const confirmFn = this.data.kind === 'class' ? confirmClassCompletionQuestions : confirmTaskCompletionQuestions;
    confirmFn(this.data.id, this._imagePath, selected)
      .then(() => {
        this.setData({ status: 'done' });
        wx.showToast({ title: `已提交${selected.length}道题，待审核后收录` });
        setTimeout(() => wx.navigateBack(), 1500);
      })
      .catch((err) => {
        this.setData({ status: 'parsed' });
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      });
  },
});

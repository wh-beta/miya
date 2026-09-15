const { getMyProfile, listLinkedStudents } = require('../../utils/auth.js');
const { listGrowthRecords, deleteGrowthRecord } = require('../../utils/growth.js');
const { API_BASE_URL } = require('../../utils/config.js');

function scoreLabel(item) {
  if (item.score === null || item.score === undefined) return '';
  return item.max_score ? `${item.score}/${item.max_score}` : `${item.score}`;
}

// The backend returns image_url as a relative path (see
// completion_check.js's identical pattern for why — same server, same
// need to prefix it before an <image> tag or wx.previewImage can load it).
function withDisplayFields(r) {
  return { ...r, scoreLabel: scoreLabel(r), imageUrl: r.image_url ? `${API_BASE_URL}${r.image_url}` : '' };
}

Page({
  data: {
    role: 'student',
    loading: true,
    // Parent view: one section per linked student.
    sections: [],
    // Student view: just their own records, flat.
    myRecords: [],
  },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
  },
  onShow() {
    this._refresh();
  },
  onFindSimilarQuestions() {
    wx.navigateTo({ url: '/pages/similar_questions/similar_questions' });
  },

  _refresh() {
    this.setData({ loading: true });
    if (this.data.role === 'parent') {
      this._refreshParentView();
    } else {
      this._refreshStudentView();
    }
  },

  _refreshParentView() {
    listLinkedStudents()
      .then((students) => {
        if (students.length === 0) {
          this.setData({ sections: [], loading: false });
          return Promise.resolve();
        }
        return Promise.all(
          students.map((s) =>
            listGrowthRecords(s.id).then((records) => ({
              id: s.id,
              name: s.name,
              records: records.map(withDisplayFields),
            })),
          ),
        ).then((sections) => this.setData({ sections, loading: false }));
      })
      .catch(() => this.setData({ loading: false }));
  },

  _refreshStudentView() {
    getMyProfile()
      .then((profile) =>
        listGrowthRecords(profile.id).then((records) =>
          this.setData({
            myRecords: records.map(withDisplayFields),
            loading: false,
          }),
        ),
      )
      .catch(() => this.setData({ loading: false }));
  },

  onAddRecord(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/growth_entry/growth_entry?role=${this.data.role}&student_id=${id}&student_name=${encodeURIComponent(name || '')}`,
    });
  },

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({ current: url, urls: [url] });
  },

  onDeleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除记录？',
      content: '此操作无法撤销。',
      success: (res) => {
        if (!res.confirm) return;
        deleteGrowthRecord(id)
          .then(() => this._refresh())
          .catch((err) => wx.showToast({ title: err.message || '删除失败', icon: 'none' }));
      },
    });
  },
});

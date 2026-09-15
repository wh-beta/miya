// A full-screen wait overlay that reveals a short, well-known classical
// poem one line at a time instead of a bare spinner — for the specific
// waits that can genuinely run up to a minute (OCR/vision calls: photo or
// PDF upload in task_input.js, schedule_import.js), not every spinner in
// the app. A different poem is picked at random each time it opens; once
// fully revealed it just stays as-is rather than cycling to a new one —
// simpler, and the wait is usually over by then anyway.
const POEMS = [
  { title: '静夜思', author: '李白', lines: ['床前明月光，', '疑是地上霜。', '举头望明月，', '低头思故乡。'] },
  { title: '春晓', author: '孟浩然', lines: ['春眠不觉晓，', '处处闻啼鸟。', '夜来风雨声，', '花落知多少。'] },
  { title: '登鹳雀楼', author: '王之涣', lines: ['白日依山尽，', '黄河入海流。', '欲穷千里目，', '更上一层楼。'] },
  { title: '悯农', author: '李绅', lines: ['锄禾日当午，', '汗滴禾下土。', '谁知盘中餐，', '粒粒皆辛苦。'] },
  { title: '咏鹅', author: '骆宾王', lines: ['鹅鹅鹅，', '曲项向天歌。', '白毛浮绿水，', '红掌拨清波。'] },
  { title: '江雪', author: '柳宗元', lines: ['千山鸟飞绝，', '万径人踪灭。', '孤舟蓑笠翁，', '独钓寒江雪。'] },
];

const LINE_INTERVAL_MS = 1600;

Component({
  properties: {
    visible: { type: Boolean, value: false, observer: 'onVisibleChange' },
    hint: { type: String, value: '识别中，可能需要一分钟左右…' },
  },
  data: { poem: null, shownLines: [] },
  lifetimes: {
    detached() {
      this._clearTimer();
    },
  },
  methods: {
    onVisibleChange(visible) {
      this._clearTimer();
      if (!visible) {
        this.setData({ poem: null, shownLines: [] });
        return;
      }
      const poem = POEMS[Math.floor(Math.random() * POEMS.length)];
      this.setData({ poem, shownLines: poem.lines.slice(0, 1) });
      this._scheduleNext(poem, 1);
    },
    _scheduleNext(poem, idx) {
      if (idx >= poem.lines.length) return;
      this._timer = setTimeout(() => {
        // The overlay may have been hidden (or reopened with a different
        // poem) while this was pending — only apply it to the still-current one.
        if (!this.data.poem || this.data.poem.title !== poem.title) return;
        this.setData({ shownLines: poem.lines.slice(0, idx + 1) });
        this._scheduleNext(poem, idx + 1);
      }, LINE_INTERVAL_MS);
    },
    _clearTimer() {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
    },
  },
});

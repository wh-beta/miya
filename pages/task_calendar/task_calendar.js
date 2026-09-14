const { listTasks, updateTaskStatus, urgeTask, deleteTask, uploadTaskCompletionImage } = require('../../utils/tasks.js');
const { listClasses, updateClassStatus, urgeClass, deleteClass, uploadClassCompletionImage } = require('../../utils/classes.js');
const { addTaskToPhoneCalendar, addSessionToPhoneCalendar } = require('../../utils/calendar.js');
const { ensureIdentity, getMyProfile, listLinkedStudents, acceptInvite } = require('../../utils/auth.js');
const { getProgress } = require('../../utils/progress.js');
const {
  todayStr,
  addDays,
  displayDate,
  shortDate,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} = require('../../utils/dates.js');
const { STATUS_LABEL, NEXT_STATUS, normalizeTask, normalizeClass, filterByIdentity } = require('../../utils/taskItems.js');
const { POSTER_WIDTH, computePosterHeight, drawSummaryPoster } = require('../../utils/posterCanvas.js');

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function ymd(year, month1to12, day) {
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Builds a full 7-wide grid for the given 'YYYY-MM' month, padded with the
// trailing days of the previous month / leading days of the next so every
// row has 7 cells — the same shape a normal calendar-app month view uses.
function buildMonthGrid(monthStr, selectedDate, taskDates) {
  const [year, month] = monthStr.split('-').map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const total = daysInMonth(year, month);
  const today = todayStr();

  const cells = [];
  const prevMonthDays = daysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ key: `pre-${i}`, day: prevMonthDays - firstWeekday + 1 + i, date: '', inMonth: false, isToday: false, isSelected: false, hasTasks: false });
  }
  for (let d = 1; d <= total; d++) {
    const date = ymd(year, month, d);
    cells.push({ key: date, day: d, date, inMonth: true, isToday: date === today, isSelected: date === selectedDate, hasTasks: taskDates.has(date) });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ key: `post-${nextDay}`, day: nextDay, date: '', inMonth: false, isToday: false, isSelected: false, hasTasks: false });
    nextDay += 1;
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function trendInfo(completed, total, prevCompleted, prevTotal) {
  if (!prevTotal) return { text: '暂无对比', cls: 'flat' };
  const curRate = total ? completed / total : 0;
  const prevRate = prevCompleted / prevTotal;
  const diff = Math.round((curRate - prevRate) * 100);
  if (diff > 0) return { text: `+${diff}%`, cls: 'up' };
  if (diff < 0) return { text: `${diff}%`, cls: 'down' };
  return { text: '持平', cls: 'flat' };
}

Page({
  data: {
    role: 'student',
    view: 'month',
    selectedDate: todayStr(),
    selectedSubject: '全部',
    dateLabel: '',
    isToday: true,
    dateItems: [],
    subjectChips: [],
    subjectItems: [],
    weekdayLabels: WEEKDAY_LABELS,
    calendarMonth: todayStr().slice(0, 7),
    calendarMonthLabel: '',
    calendarWeeks: [],
    range: 'today',
    customStart: todayStr(),
    customEnd: todayStr(),
    progressStudent: { completed: 0, total: 0, pct: 0 },
    progressChildren: [],
    shareCanvasWidth: POSTER_WIDTH,
    shareCanvasHeight: 400,
  },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
    this._items = [];
  },
  onShow() {
    // Normally reached only after identity is already resolved elsewhere
    // (login.js, school_schedule.js, parent_home/student_home) — this is
    // just the same defensive guarantee as those, in case a tap ever lands
    // here before that finished (see ensureIdentity's docstring).
    ensureIdentity(this.data.role).then(() => {
      this.consumePending();
      this.refreshAll();
    });
  },
  // This page is now the landing page for a known user (see auth.js's
  // _navigateTo), so this is where both of these hand-offs land instead of
  // parent_home/student_home:
  consumePending() {
    // Set when this session was cold-launched via WeChat's "打开方式" menu
    // on a chat image (see task_input.js's onLoad) before login had run —
    // now that we're safely here with a real session, hand off to
    // task_input, which picks the stashed image back up and OCRs it.
    if (wx.getStorageSync('pendingMaterialPath')) {
      wx.navigateTo({ url: `/pages/task_input/task_input?role=${this.data.role}` });
      return;
    }
    // Set by login.js when this session started from a parent's group-invite
    // share card.
    const invite = wx.getStorageSync('pendingInvite');
    if (!invite) return;
    wx.removeStorageSync('pendingInvite');
    acceptInvite(invite)
      .then((parent) => wx.showToast({ title: `已与${parent.name || '家长'}关联`, icon: 'none' }))
      .catch((err) => wx.showToast({ title: err.message || '关联失败', icon: 'none' }));
  },
  refreshAll() {
    const proceed = () => {
      this.loadItems();
      this.loadProgress();
    };
    if (this.data.role === 'parent') {
      listLinkedStudents()
        .then((students) => this.setData({ linkedStudents: students }))
        .catch(() => {})
        .then(proceed);
    } else {
      getMyProfile()
        .then((p) => this.setData({ myId: p.id, myName: p.name }))
        .catch(() => {})
        .then(proceed);
    }
  },
  loadItems() {
    Promise.all([listTasks(), listClasses()])
      .then(([tasksRaw, classesRaw]) => {
        const merged = tasksRaw.map(normalizeTask).concat(classesRaw.map(normalizeClass));
        this._items = filterByIdentity(merged, this.data.role, this.data.myId, this.data.myName, this.data.linkedStudents);
        this.renderCurrentView();
      })
      .catch((err) => wx.showToast({ title: err.message || '加载失败', icon: 'none' }));
  },
  renderCurrentView() {
    if (this.data.view === 'subject') {
      this.renderSubjectView();
      return;
    }
    // 'date' and 'month' both drive the same task-card list off
    // selectedDate — 'month' just offers a different way to pick that date.
    this.renderDateView();
    if (this.data.view === 'month') this.renderMonthGrid();
  },
  renderMonthGrid() {
    const taskDates = new Set((this._items || []).map((it) => it.date));
    const weeks = buildMonthGrid(this.data.calendarMonth, this.data.selectedDate, taskDates);
    const [y, m] = this.data.calendarMonth.split('-');
    this.setData({ calendarWeeks: weeks, calendarMonthLabel: `${y} / ${m}` });
  },
  onPrevMonth() {
    const [y, m] = this.data.calendarMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    this.setData({ calendarMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }, () => this.renderMonthGrid());
  },
  onNextMonth() {
    const [y, m] = this.data.calendarMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    this.setData({ calendarMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }, () => this.renderMonthGrid());
  },
  onJumpTodayMonth() {
    const t = todayStr();
    this.setData({ selectedDate: t, calendarMonth: t.slice(0, 7) }, () => {
      this.renderDateView();
      this.renderMonthGrid();
    });
  },
  onSelectCalendarDay(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return; // padding cell from the previous/next month, not tappable
    this.setData({ selectedDate: date }, () => {
      this.renderDateView();
      this.renderMonthGrid();
    });
  },
  renderDateView() {
    const selected = this.data.selectedDate;
    const items = (this._items || [])
      .filter((it) => it.date === selected)
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'class' ? -1 : 1))
      .map((it) => Object.assign({}, it, { key: `${it.kind}-${it.id}`, metaRight: it.time || '', statusLabel: STATUS_LABEL[it.status] }));
    this.setData({
      dateItems: items,
      dateLabel: displayDate(selected),
      isToday: selected === todayStr(),
    });
  },
  renderSubjectView() {
    const all = this._items || [];
    const subjects = Array.from(new Set(all.map((it) => it.subject))).filter(Boolean);
    const chips = ['全部', ...subjects];
    const sel = this.data.selectedSubject;
    const items = all
      .filter((it) => sel === '全部' || it.subject === sel)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((it) =>
        Object.assign({}, it, {
          key: `${it.kind}-${it.id}`,
          metaRight: shortDate(it.date) + (it.time ? ' ' + it.time : ''),
          statusLabel: STATUS_LABEL[it.status],
        }),
      );
    this.setData({ subjectChips: chips, subjectItems: items });
  },
  onSwitchView(e) {
    this.setData({ view: e.currentTarget.dataset.view }, () => this.renderCurrentView());
  },
  onSelectSubject(e) {
    this.setData({ selectedSubject: e.currentTarget.dataset.subject }, () => this.renderSubjectView());
  },
  onPrevDay() {
    this.setData({ selectedDate: addDays(this.data.selectedDate, -1) }, () => this.renderDateView());
  },
  onNextDay() {
    this.setData({ selectedDate: addDays(this.data.selectedDate, 1) }, () => this.renderDateView());
  },
  onJumpToday() {
    this.setData({ selectedDate: todayStr() }, () => this.renderDateView());
  },
  onTouchStart(e) {
    this._touchStartX = e.touches[0].clientX;
  },
  onTouchEnd(e) {
    if (this._touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - this._touchStartX;
    this._touchStartX = null;
    if (dx > 50) this.onPrevDay();
    else if (dx < -50) this.onNextDay();
  },
  _findItem(e) {
    const { kind, id } = e.currentTarget.dataset;
    return (this._items || []).find((it) => it.kind === kind && it.id === Number(id));
  },
  onToggleStatus(e) {
    const item = this._findItem(e);
    if (!item || item.status === 'done') return;
    const next = NEXT_STATUS[item.status];
    const update = item.kind === 'class' ? updateClassStatus : updateTaskStatus;
    update(item.id, next)
      .then(() => {
        item.status = next;
        item.urged = false;
        this.renderCurrentView();
        this.loadProgress();
        if (next === 'done' && this.data.role === 'student') this.promptCompletionPhoto(item);
        if (next === 'done' && item.date === todayStr()) this.maybeCelebrateToday();
      })
      .catch((err) => wx.showToast({ title: err.message || '更新失败', icon: 'none' }));
  },
  // Fires once, exactly at the moment the last item due today flips to
  // done — only reachable via a today-dated item's own transition above, so
  // there's no need to track a "was it already complete" flag separately.
  maybeCelebrateToday() {
    const today = todayStr();
    const todays = (this._items || []).filter((it) => it.date === today);
    if (todays.length > 0 && todays.every((it) => it.status === 'done')) {
      const fw = this.selectComponent('#fireworks');
      if (fw) fw.play();
    }
  },
  // Optional, skippable — offered to the student right after they mark
  // something done, so a parent can later tap 检查 to see proof of work.
  promptCompletionPhoto(item) {
    wx.showModal({
      title: '任务已完成',
      content: '要上传一张完成照片吗？（可选，可跳过）',
      confirmText: '上传照片',
      cancelText: '跳过',
      success: (res) => {
        if (!res.confirm) return;
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          success: (mediaRes) => {
            const filePath = mediaRes.tempFiles[0].tempFilePath;
            const uploadFn = item.kind === 'class' ? uploadClassCompletionImage : uploadTaskCompletionImage;
            uploadFn(item.id, filePath)
              .then((updated) => {
                item.completionImageUrl = updated.completion_image_url;
                this.renderCurrentView();
                wx.showToast({ title: '已上传' });
              })
              .catch((err) => wx.showToast({ title: err.message || '上传失败', icon: 'none' }));
          },
        });
      },
    });
  },
  onCheckCompletionImage(e) {
    const { kind, id, url } = e.currentTarget.dataset;
    if (!url) return;
    wx.navigateTo({
      url: `/pages/completion_check/completion_check?kind=${kind}&id=${id}&url=${encodeURIComponent(url)}`,
    });
  },
  onAddToCalendar(e) {
    const item = this._findItem(e);
    if (!item) return;
    const calendarFn = item.kind === 'class' ? addSessionToPhoneCalendar : addTaskToPhoneCalendar;
    calendarFn(item.raw)
      .then(() => wx.showToast({ title: '已添加到日历' }))
      .catch((err) => {
        const msg = err.errMsg || err.message || '';
        // The user tapping "Cancel" on WeChat's own native add-to-calendar
        // confirmation surfaces as a rejection here too (addPhoneCalendar:
        // fail cancel) — that's a normal choice, not a failure worth a modal.
        if (/cancel/i.test(msg)) return;
        wx.showModal({ title: '添加到日历失败', content: msg || '未知错误', showCancel: false });
      });
  },
  onUrge(e) {
    const item = this._findItem(e);
    if (!item || item.status === 'done') return;
    const urgeFn = item.kind === 'class' ? urgeClass : urgeTask;
    urgeFn(item.id)
      .then(() => {
        item.urged = true;
        this.renderCurrentView();
        wx.showToast({ title: '已催办' });
      })
      .catch((err) => wx.showToast({ title: err.message || '催办失败', icon: 'none' }));
  },
  onDelete(e) {
    const { kind, id } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除',
      content: '确定要删除这项吗？',
      success: (res) => {
        if (!res.confirm) return;
        const deleteFn = kind === 'class' ? deleteClass : deleteTask;
        deleteFn(Number(id))
          .then(() => {
            this._items = (this._items || []).filter((it) => !(it.kind === kind && it.id === Number(id)));
            this.renderCurrentView();
            this.loadProgress();
            wx.showToast({ title: '已删除' });
          })
          .catch((err) => wx.showToast({ title: err.message || '删除失败', icon: 'none' }));
      },
    });
  },
  currentRangeDates() {
    const today = todayStr();
    if (this.data.range === 'today') return { start: today, end: today };
    if (this.data.range === 'week') return { start: startOfWeek(today), end: endOfWeek(today) };
    if (this.data.range === 'month') return { start: startOfMonth(today), end: endOfMonth(today) };
    return { start: this.data.customStart || today, end: this.data.customEnd || today };
  },
  loadProgress() {
    const { start, end } = this.currentRangeDates();
    if (this.data.role === 'student') {
      getProgress({ start, end, studentUserId: this.data.myId })
        .then((r) => {
          const pct = r.total ? Math.round((r.completed / r.total) * 100) : 0;
          this.setData({ progressStudent: { completed: r.completed, total: r.total, pct } });
        })
        .catch(() => {});
    } else {
      const students = this.data.linkedStudents || [];
      Promise.all(
        students.map((s) => getProgress({ start, end, studentUserId: s.id }).then((r) => Object.assign({ id: s.id, name: s.name }, r))),
      )
        .then((results) => {
          const rows = results.map((r) => {
            const pct = r.total ? Math.round((r.completed / r.total) * 100) : 0;
            const trend = trendInfo(r.completed, r.total, r.previous_completed, r.previous_total);
            return { id: r.id, name: r.name, completed: r.completed, total: r.total, pct, trendText: trend.text, trendClass: trend.cls };
          });
          this.setData({ progressChildren: rows });
        })
        .catch(() => {});
    }
  },
  onSelectRange(e) {
    this.setData({ range: e.currentTarget.dataset.range }, () => this.loadProgress());
  },
  onCustomStartChange(e) {
    this.setData({ customStart: e.detail.value }, () => this.loadProgress());
  },
  onCustomEndChange(e) {
    this.setData({ customEnd: e.detail.value }, () => this.loadProgress());
  },
  onOpenInput() {
    wx.navigateTo({ url: `/pages/task_input/task_input?role=${this.data.role}` });
  },
  onGoToAccountLink() {
    wx.navigateTo({ url: `/pages/account_link/account_link?role=${this.data.role}` });
  },
  // Parent-only: generates a shareable summary image (poster) of the
  // current view — the selected day's tasks, or the selected subject's —
  // scoped to one linked student at a time, since a card mixing several
  // kids' tasks isn't something a parent would forward to a chat. Prompts
  // for which student when more than one is linked.
  onShareSummary() {
    const students = this.data.linkedStudents || [];
    if (students.length === 0) {
      wx.showToast({ title: '还没有关联学生', icon: 'none' });
      return;
    }
    if (students.length === 1) {
      this._shareForStudent(students[0]);
      return;
    }
    wx.showActionSheet({
      itemList: students.map((s) => s.name),
      success: (res) => this._shareForStudent(students[res.tapIndex]),
    });
  },
  _itemsForStudent(student) {
    return (this._items || []).filter(
      (it) => (it.studentUserId && it.studentUserId === student.id) || (!it.studentUserId && it.childName === student.name),
    );
  },
  _shareForStudent(student) {
    const isSubjectView = this.data.view === 'subject';
    let scoped = this._itemsForStudent(student);
    let title;
    if (isSubjectView) {
      const sel = this.data.selectedSubject;
      scoped = scoped.filter((it) => sel === '全部' || it.subject === sel);
      title = sel === '全部' ? '全部科目任务' : sel;
    } else {
      scoped = scoped.filter((it) => it.date === this.data.selectedDate);
      title = displayDate(this.data.selectedDate);
    }
    scoped = scoped.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const posterItems = scoped.map((it) => ({
      title: it.title,
      status: it.status,
      meta: isSubjectView ? `${it.subject} · ${shortDate(it.date)}${it.time ? ' ' + it.time : ''}` : `${it.subject}${it.time ? ' · ' + it.time : ''}`,
    }));
    const completed = scoped.filter((it) => it.status === 'done').length;
    this._renderPosterAndShare({
      title,
      subtitle: `${student.name} 的任务`,
      items: posterItems,
      completed,
      total: posterItems.length,
    });
  },
  _renderPosterAndShare(posterData) {
    const height = computePosterHeight(posterData.items.length);
    wx.showLoading({ title: '生成中...' });
    this.setData({ shareCanvasHeight: height }, () => {
      wx.nextTick(() => {
        const query = this.createSelectorQuery();
        query
          .select('#shareCanvas')
          .fields({ node: true, size: true })
          .exec((res) => {
            if (!res || !res[0] || !res[0].node) {
              wx.hideLoading();
              wx.showToast({ title: '生成失败', icon: 'none' });
              return;
            }
            const canvas = res[0].node;
            const ctx = canvas.getContext('2d');
            const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            const dpr = sys.pixelRatio || 2;
            const w = res[0].width;
            const h = res[0].height;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            ctx.scale(dpr, dpr);
            drawSummaryPoster(ctx, w, h, posterData);
            wx.canvasToTempFilePath({
              canvas,
              fileType: 'png',
              success: (r) => {
                wx.hideLoading();
                wx.showShareImageMenu({
                  path: r.tempFilePath,
                  // fail also fires when the user just dismisses the native
                  // share sheet without picking anything — not an error.
                  fail: (err) => {
                    if ((err.errMsg || '').indexOf('cancel') !== -1) return;
                    wx.showToast({ title: err.errMsg || '分享失败', icon: 'none' });
                  },
                });
              },
              fail: () => {
                wx.hideLoading();
                wx.showToast({ title: '生成失败', icon: 'none' });
              },
            });
          });
      });
    });
  },
});

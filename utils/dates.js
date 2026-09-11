// Date-only ("YYYY-MM-DD") helpers shared by task_calendar/task_input.
// Always builds Date objects via the numeric constructor, never by handing
// a raw string to `new Date(...)` — see calendar.js's _parseLocalDateTime
// for the cross-platform parsing bug this avoids.

// Some parsed drafts intentionally have no guessed date (see
// task_list_parser.py) — pass those through as '' rather than throwing, so
// the caller can show a "pick a date" placeholder instead of a real value.
function dateOnly(isoLike) {
  return isoLike ? isoLike.split('T')[0] : '';
}

function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayStr() {
  return formatYmd(new Date());
}

function addDays(ymd, n) {
  const date = toDate(ymd);
  date.setDate(date.getDate() + n);
  return formatYmd(date);
}

const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function displayDate(ymd) {
  const date = toDate(ymd);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS_ZH[date.getDay()]}`;
}

function shortDate(ymd) {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function startOfWeek(ymd) {
  const date = toDate(ymd);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday-start week
  date.setDate(date.getDate() - diff);
  return formatYmd(date);
}

function endOfWeek(ymd) {
  return addDays(startOfWeek(ymd), 6);
}

function startOfMonth(ymd) {
  const [y, m] = ymd.split('-');
  return `${y}-${m}-01`;
}

function endOfMonth(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  return formatYmd(new Date(y, m, 0)); // day 0 of next month = last day of this month
}

module.exports = {
  dateOnly,
  formatYmd,
  todayStr,
  addDays,
  displayDate,
  shortDate,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
};

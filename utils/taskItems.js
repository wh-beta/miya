// Shared task/class shaping + identity scoping, used by both task_calendar
// (date/月/科目 views) and the todo page (flat incomplete-items list) — kept
// in one place so the identity-filtering rules (privacy-relevant: who gets
// to see what) can't drift out of sync between the two.
const { dateOnly } = require('./dates.js');

const STATUS_LABEL = { assigned: '未开始', in_progress: '进行中', done: '已完成' };
const NEXT_STATUS = { assigned: 'in_progress', in_progress: 'done', done: 'done' };

function normalizeTask(t) {
  return {
    id: t.id,
    kind: 'task',
    title: t.title,
    subject: t.subject || '未分类',
    date: dateOnly(t.due_at),
    time: '',
    status: t.status,
    urged: t.urged,
    childName: t.child_name,
    studentUserId: t.student_user_id,
    completionImageUrl: t.completion_image_url || null,
    calStatus: 'idle',
    raw: t,
  };
}

function normalizeClass(c) {
  return {
    id: c.id,
    kind: 'class',
    title: c.subject,
    subject: c.subject,
    date: c.session_date,
    time: `${c.start_time.slice(0, 5)}-${c.end_time.slice(0, 5)}`,
    status: c.status,
    urged: c.urged,
    childName: c.child_name,
    studentUserId: c.student_user_id,
    completionImageUrl: c.completion_image_url || null,
    calStatus: 'idle',
    raw: c,
  };
}

// Strictly scoped either way: parent sees only tasks tied to one of their
// own linked students (nothing until they've linked someone — no
// show-everything fallback), student sees only tasks assigned to
// themself. student_user_id is the source of truth when set; child_name is
// only consulted as a fallback for legacy rows that predate linking, never
// for a row with neither field set (those are simply not shown to anyone).
function filterByIdentity(items, role, myId, myName, linkedStudents) {
  if (role === 'student') {
    return items.filter((it) => (myId && it.studentUserId === myId) || (!it.studentUserId && myName && it.childName === myName));
  }
  const ids = new Set((linkedStudents || []).map((s) => s.id));
  const names = new Set((linkedStudents || []).map((s) => s.name));
  return items.filter((it) => (it.studentUserId && ids.has(it.studentUserId)) || (!it.studentUserId && it.childName && names.has(it.childName)));
}

module.exports = { STATUS_LABEL, NEXT_STATUS, normalizeTask, normalizeClass, filterByIdentity };

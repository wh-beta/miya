// In-app reminders use WeChat's subscribe-message system: the user grants
// one-time permission here, and the server sends the actual push later by
// calling the WeChat API at the task's remind_at time.
//
// TEMPLATE_ID must be registered in the WeChat mini-program admin console
// (subscribe message templates) then set in .env as WECHAT_TEMPLATE_ID.
const TEMPLATE_ID = 'TODO_REGISTER_TEMPLATE_ID';
const { API_BASE_URL } = require('./config.js');
const { getOpenid } = require('./auth.js');

function requestReminderPermission() {
  return new Promise((resolve, reject) => {
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success: resolve,
      fail: reject,
    });
  });
}

function scheduleServerReminder(taskId, remindAt) {
  const openid = getOpenid();
  if (!openid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}/tasks/${taskId}/reminders`,
      method: 'POST',
      data: { openid, remind_at: remindAt },
      success: (res) => (res.statusCode < 400 ? resolve(res.data) : reject(new Error(res.data.detail))),
      fail: reject,
    });
  });
}

// Combines all reminder channels for a task:
//  1. WeChat subscribe-message permission grant (in-app push gated by user)
//  2. Server-scheduled push at 30 min before due (fires even when app is closed)
//  3. Native phone calendar event with OS alarm
//
// Resolves to per-channel booleans instead of the raw allSettled array —
// Promise.allSettled never rejects, so a caller that just did
// `.then(() => showToast('Reminder set'))` was reporting success even when
// every channel failed (e.g. TEMPLATE_ID above is still an unregistered
// placeholder, so requestReminderPermission fails on every call). Callers
// should check `calendarAdded` specifically since it's the one channel the
// user can immediately verify themselves.
function setTaskReminder(task) {
  const { addTaskToPhoneCalendar } = require('./calendar.js');
  const remindAt = task.due_at
    ? new Date(new Date(task.due_at).getTime() - 30 * 60 * 1000).toISOString()
    : null;
  const subscribePromise = requestReminderPermission();
  const calendarPromise = addTaskToPhoneCalendar(task);
  const serverPromise = task.id && remindAt ? scheduleServerReminder(task.id, remindAt) : Promise.resolve();

  return Promise.allSettled([subscribePromise, calendarPromise, serverPromise]).then(
    ([subscribeResult, calendarResult, serverResult]) => ({
      subscribed: subscribeResult.status === 'fulfilled',
      calendarAdded: calendarResult.status === 'fulfilled',
      calendarError: calendarResult.status === 'rejected' ? calendarResult.reason : null,
      serverScheduled: serverResult.status === 'fulfilled',
    }),
  );
}

module.exports = { requestReminderPermission, setTaskReminder, TEMPLATE_ID };

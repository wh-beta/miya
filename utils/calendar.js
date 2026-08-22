// Parses a date-only ("YYYY-MM-DD") or full ISO datetime
// ("YYYY-MM-DDTHH:MM:SS") string into a local Date via the numeric
// constructor, never by handing the raw string to `new Date(...)` —
// WeChat's iOS/Android JS engines parse ISO datetime strings inconsistently
// (timezone handling differs across platforms), which caused a confirmed
// wrong-date bug before. Ignores any trailing "Z"/offset, treating the
// value as local time (matching how due_at is produced elsewhere in this
// app: naive, no timezone info).
function _parseLocalDateTime(isoLike) {
  const [datePart, timePart] = isoLike.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = (timePart || '00:00').split(':').map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0);
}

// wx.addPhoneCalendar needs its own scope.addPhoneCalendar authorization —
// unlike scope.record, this can't be pre-declared in app.json's `permission`
// block (that field only accepts the location scopes); it instead requires
// the calendar-write purpose to be declared in the mini-program admin
// console's 用户隐私保护指引 (User Privacy Protection Guidelines).
//
// Confirmed on a real device: wx.addPhoneCalendar fails with "can only be
// invoked by user TAP gesture" when it's called from a separate .then()
// chained after an auth-check Promise resolves — WeChat's gesture tracking
// doesn't survive that extra microtask hop. So the actual add always happens
// directly, synchronously, inside a native success callback below — never
// via a separate .then().
//
// Also confirmed on a real device: wx.getSetting can report
// scope.addPhoneCalendar as already granted (authStatus === true) while the
// real OS-level permission is actually denied — WeChat's own authorization
// cache getting out of sync with the system, a known platform quirk. In
// that case wx.addPhoneCalendar itself fails with an auth-flavored errMsg
// (e.g. "authorization refuesed" — that typo is WeChat's, not ours) *after*
// getSetting already said it was fine, so the settings-recovery prompt has
// to be offered reactively here too, not just when getSetting reports false.
function _isAuthError(err) {
  const msg = (err && err.errMsg) || '';
  return /auth/i.test(msg);
}

function _promptOpenSettings(retryAdd, resolve, reject) {
  wx.showModal({
    title: 'Calendar access needed',
    content: 'Please enable calendar access in settings to add this to your calendar.',
    confirmText: 'Open settings',
    success: (modalRes) => {
      if (modalRes.confirm) {
        wx.openSetting({
          success: (settingRes) => {
            if (settingRes.authSetting['scope.addPhoneCalendar']) {
              retryAdd(resolve, reject);
            } else {
              reject(new Error('Calendar permission was not granted'));
            }
          },
          fail: reject,
        });
      } else {
        reject(new Error('Calendar permission was not granted'));
      }
    },
    fail: reject,
  });
}

function _addToPhoneCalendar(eventOptions) {
  return new Promise((resolve, reject) => {
    // `alreadyRetried` guards against looping forever if the OS keeps
    // reporting auth failure even right after the user (apparently)
    // re-granted it in Settings — surface the real error at that point
    // instead of prompting again.
    const attemptAdd = (res, rej, alreadyRetried) => {
      wx.addPhoneCalendar(
        Object.assign({}, eventOptions, {
          success: res,
          fail: (err) => {
            if (!alreadyRetried && _isAuthError(err)) {
              _promptOpenSettings((res2, rej2) => attemptAdd(res2, rej2, true), res, rej);
            } else {
              rej(err);
            }
          },
        }),
      );
    };

    wx.getSetting({
      success: (res) => {
        const authStatus = res.authSetting['scope.addPhoneCalendar'];
        if (authStatus === false) {
          _promptOpenSettings((res2, rej2) => attemptAdd(res2, rej2, true), resolve, reject);
        } else if (authStatus === true) {
          attemptAdd(resolve, reject, false);
        } else {
          wx.authorize({
            scope: 'scope.addPhoneCalendar',
            success: () => attemptAdd(resolve, reject, false),
            fail: reject,
          });
        }
      },
      fail: reject,
    });
  });
}

// Adds a task as a native event in the phone's own calendar app (iOS/Android),
// independent of WeChat — requires base library >= 2.31.1.
//
// wx.addPhoneCalendar's startTime/endTime are Unix *seconds*, not the
// milliseconds Date.getTime() returns — passing milliseconds inflates the
// resulting date ~1000x into the far future (confirmed on a real device:
// showed as year 58560 instead of 2026), so every timestamp here is
// explicitly converted with / 1000.
function addTaskToPhoneCalendar(task) {
  const startTime = Math.floor(_parseLocalDateTime(task.due_at).getTime() / 1000);
  const endTime = startTime + 30 * 60; // 30-minute block by default, in seconds

  return _addToPhoneCalendar({
    title: task.title,
    startTime,
    endTime,
    allDay: false,
    alarm: true,
    alarmOffset: -30 * 60, // remind 30 min before due time, in seconds
  });
}

// Same idea, for a class session parsed from a schedule photo — these carry
// their own explicit start/end time rather than a single due_at.
function addSessionToPhoneCalendar(session) {
  const [year, month, day] = session.session_date.split('-').map(Number);
  const [startHour, startMinute] = session.start_time.split(':').map(Number);
  const [endHour, endMinute] = session.end_time.split(':').map(Number);
  const startTime = Math.floor(new Date(year, month - 1, day, startHour, startMinute).getTime() / 1000);
  const endTime = Math.floor(new Date(year, month - 1, day, endHour, endMinute).getTime() / 1000);

  return _addToPhoneCalendar({
    title: session.subject,
    startTime,
    endTime,
    allDay: false,
    alarm: true,
    alarmOffset: -30 * 60,
  });
}

module.exports = { addTaskToPhoneCalendar, addSessionToPhoneCalendar };

const { listNotifications, markNotificationsRead } = require('../../utils/notifications.js');

function formatTime(iso) {
  // Backend sends naive UTC (datetime.utcnow(), no offset) — treat it as
  // such explicitly rather than letting Date() assume local time from an
  // unmarked string.
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: { role: 'student', items: [], loading: true },
  onLoad(options) {
    this.setData({ role: options.role || 'student' });
  },
  onShow() {
    this._refresh();
  },
  _refresh() {
    listNotifications()
      .then((items) => {
        this.setData({
          items: items.map((n) => ({ ...n, timeLabel: formatTime(n.created_at) })),
          loading: false,
        });
        // Marks everything read as a side effect of viewing this page —
        // no per-item toggle, see markNotificationsRead's docstring. Runs
        // after rendering so the still-unread styling is visible for at
        // least this one view rather than vanishing before it's seen.
        return markNotificationsRead();
      })
      .catch(() => this.setData({ loading: false }));
  },
});

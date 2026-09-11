// Draws the "一键分享" summary poster (task_calendar.js's onShareSummary)
// onto a canvas 2d context — pure drawing logic, kept separate from the
// canvas-node/query plumbing so the layout math lives in one place.

const POSTER_WIDTH = 700;
const PAD = 36;
const HEADER_H = 118;
const PROGRESS_H = 92;
const ROW_H = 84;
const FOOTER_H = 70;
const GAP = 24;

const STATUS_STYLE = {
  assigned: { bg: '#EEF2EA', fg: '#8E9C90', label: '未开始' },
  in_progress: { bg: '#FBEBD4', fg: '#C97F1F', label: '进行中' },
  done: { bg: '#E1F3E6', fg: '#2F9A63', label: '已完成' },
};

function computePosterHeight(itemCount) {
  const rows = Math.max(itemCount, 1) * ROW_H;
  return PAD + HEADER_H + GAP + PROGRESS_H + GAP + rows + GAP + FOOTER_H + PAD;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function truncateToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

// data: { title, subtitle, items: [{title, subject, status, meta}], completed, total }
function drawSummaryPoster(ctx, width, height, data) {
  const { title, subtitle, items, completed, total } = data;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#F6F9F2';
  ctx.fillRect(0, 0, width, height);

  let y = PAD;

  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, PAD, y, width - PAD * 2, HEADER_H, 20);
  ctx.fill();
  ctx.strokeStyle = '#DCE6D6';
  ctx.lineWidth = 1;
  roundRect(ctx, PAD, y, width - PAD * 2, HEADER_H, 20);
  ctx.stroke();

  ctx.fillStyle = '#24302A';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(truncateToWidth(ctx, title, width - PAD * 2 - 56), PAD + 28, y + 26);

  ctx.fillStyle = '#146E64';
  ctx.font = '600 24px sans-serif';
  ctx.fillText(subtitle, PAD + 28, y + 74);

  y += HEADER_H + GAP;

  const pct = total ? Math.round((completed / total) * 100) : 0;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, PAD, y, width - PAD * 2, PROGRESS_H, 20);
  ctx.fill();
  ctx.strokeStyle = '#DCE6D6';
  roundRect(ctx, PAD, y, width - PAD * 2, PROGRESS_H, 20);
  ctx.stroke();

  ctx.fillStyle = '#24302A';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(`完成进度 ${completed}/${total}`, PAD + 28, y + 18);

  const barX = PAD + 28;
  const barY = y + 58;
  const barW = width - PAD * 2 - 56 - 100;
  const barH = 16;
  ctx.fillStyle = '#E4ECDC';
  roundRect(ctx, barX, barY, barW, barH, 8);
  ctx.fill();
  ctx.fillStyle = '#1F8F82';
  roundRect(ctx, barX, barY, Math.max(barH, barW * (pct / 100)), barH, 8);
  ctx.fill();

  ctx.fillStyle = '#1F8F82';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${pct}%`, width - PAD - 28, barY - 6);
  ctx.textAlign = 'left';

  y += PROGRESS_H + GAP;

  if (items.length === 0) {
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, PAD, y, width - PAD * 2, ROW_H - 12, 16);
    ctx.fill();
    ctx.strokeStyle = '#DCE6D6';
    roundRect(ctx, PAD, y, width - PAD * 2, ROW_H - 12, 16);
    ctx.stroke();
    ctx.fillStyle = '#8B978C';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无任务', width / 2, y + 24);
    ctx.textAlign = 'left';
    y += ROW_H;
  } else {
    items.forEach((it) => {
      const st = STATUS_STYLE[it.status] || STATUS_STYLE.assigned;
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, PAD, y, width - PAD * 2, ROW_H - 12, 16);
      ctx.fill();
      ctx.strokeStyle = '#DCE6D6';
      roundRect(ctx, PAD, y, width - PAD * 2, ROW_H - 12, 16);
      ctx.stroke();

      ctx.font = 'bold 22px sans-serif';
      const labelW = ctx.measureText(st.label).width + 28;
      const pillX = width - PAD - 24 - labelW;

      ctx.fillStyle = '#24302A';
      ctx.font = '600 26px sans-serif';
      ctx.fillText(truncateToWidth(ctx, it.title, pillX - (PAD + 24) - 16), PAD + 24, y + 14);

      ctx.fillStyle = '#8B978C';
      ctx.font = '21px sans-serif';
      ctx.fillText(truncateToWidth(ctx, it.meta || '', width - PAD * 2 - 48), PAD + 24, y + 44);

      const pillY = y + (ROW_H - 12) / 2 - 20;
      ctx.fillStyle = st.bg;
      roundRect(ctx, pillX, pillY, labelW, 40, 999);
      ctx.fill();
      ctx.fillStyle = st.fg;
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(st.label, pillX + labelW / 2, pillY + 9);
      ctx.textAlign = 'left';

      y += ROW_H;
    });
  }

  y += GAP;
  ctx.fillStyle = '#8B978C';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('课后助手 · 任务日历', width / 2, y + 10);
  ctx.textAlign = 'left';
}

module.exports = { POSTER_WIDTH, computePosterHeight, drawSummaryPoster };

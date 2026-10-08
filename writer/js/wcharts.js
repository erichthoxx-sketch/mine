// Графики Мастерской (в авторских листах): написано по дням с нормой и рост книги с прогнозом
import { niceMax, ticks, bindTip } from '../../js/charts.js';
import { num, fmtDate, fmtShort } from '../../js/format.js';
import { alNum, al } from './wcalc.js';

// Знаки по дням: столбики, пунктир — норма цели, линия — среднее за 7 дней
export function writtenChart(el, { days, target = null, height = 210 }) {
  if (!el) return;
  const W = Math.max(300, el.clientWidth || 340), H = height;
  const L = 46, R = 8, T = 14, B = 24, pw = W - L - R, ph = H - T - B;
  const n = days.length;
  if (!n || !days.some((d) => d.known)) { el.innerHTML = '<p class="small muted" style="margin:0">Пока мало данных — график появится, когда объём обновится несколько дней.</p>'; return; }
  const ma = days.map((_, i) => { const w = days.slice(Math.max(0, i - 6), i + 1).filter((d) => d.known); return w.length ? w.reduce((s, d) => s + d.value, 0) / w.length : 0; });
  const max = niceMax(Math.max(...days.map((d) => d.value), target || 0, 1));
  const y = (v) => T + ph - (v / max) * ph;
  const xc = (i) => L + ((i + 0.5) / n) * pw;
  const bw = Math.max(2, Math.min(16, pw / n - 3));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Знаки по дням">`;
  s += ticks(max, 3).map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${alNum(t)}</text>`).join('');
  s += days.map((d, i) => `<rect class="bar${d.known ? '' : ' unk'}${target && d.value >= target * 0.95 ? ' hit' : ''}" x="${xc(i) - bw / 2}" y="${y(d.value)}" width="${bw}" height="${Math.max(0, T + ph - y(d.value))}" rx="2"/>`).join('');
  // среднее — только с первого дня, где есть данные
  const first = days.findIndex((d) => d.known);
  s += `<polyline class="ma" fill="none" points="${ma.map((v, i) => (i < first ? null : `${xc(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ')}"/>`;
  if (target) s += `<line class="target" x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}"/>`;
  const step = Math.max(1, Math.ceil(n / 6));
  for (let i = 0; i < n; i += step) s += `<text class="axis" x="${xc(i)}" y="${H - 6}" text-anchor="middle">${fmtShort(days[i].date)}</text>`;
  s += `<line class="cursor" y1="${T}" y2="${T + ph}" hidden/></svg>`;
  el.innerHTML = s;
  bindTip(el, el.querySelector('svg'), W, L, W - R, n, (i) => `<b>${fmtDate(days[i].date)}</b><div>${days[i].known ? al(days[i].value) : 'нет данных'}</div><div class="muted">среднее 7 дн.: ${al(ma[i])}</div>${target ? `<div class="muted">норма: ${al(target)}</div>` : ''}`);
}

// Рост книги: линия объёма по дням + пунктир к цели (срок и нужный объём)
export function growthChart(el, { points, goal = null, height = 190 }) {
  if (!el) return;
  const W = Math.max(300, el.clientWidth || 340), H = height;
  const L = 50, R = 12, T = 12, B = 24, pw = W - L - R, ph = H - T - B;
  if (points.length < 2) { el.innerHTML = '<p class="small muted" style="margin:0">График роста появится через пару дней обновлений.</p>'; return; }
  const dates = [...points.map((p) => p.date), ...(goal ? [goal.date] : [])].sort();
  const d0 = new Date(dates[0] + 'T00:00:00Z'), d1 = new Date(dates[dates.length - 1] + 'T00:00:00Z');
  const span = Math.max(1, (d1 - d0) / 86400000);
  const x = (d) => L + (((new Date(d + 'T00:00:00Z') - d0) / 86400000) / span) * pw;
  const vals = [...points.map((p) => p.value), ...(goal ? [goal.value] : [])];
  const lo = Math.max(0, Math.min(...vals) * 0.9), max = niceMax(Math.max(...vals));
  const y = (v) => T + ph - ((v - lo) / (max - lo || 1)) * ph;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Рост книги">`;
  s += ticks(max - lo, 3).map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(lo + t)}" y2="${y(lo + t)}"/><text class="axis" x="${L - 6}" y="${y(lo + t) + 4}" text-anchor="end">${alNum(lo + t)}</text>`).join('');
  s += `<polyline class="line1" fill="none" points="${points.map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}"/>`;
  const last = points[points.length - 1];
  if (goal) s += `<line class="target" x1="${x(last.date)}" y1="${y(last.value)}" x2="${x(goal.date)}" y2="${y(goal.value)}"/><circle class="goal-dot" cx="${x(goal.date)}" cy="${y(goal.value)}" r="4"><title>${goal.label}</title></circle>`;
  s += `<circle class="dot1" cx="${x(last.date)}" cy="${y(last.value)}" r="4"/>`;
  [dates[0], dates[dates.length - 1]].forEach((d, i) => { s += `<text class="axis" x="${x(d)}" y="${H - 6}" text-anchor="${i ? 'end' : 'start'}">${fmtShort(d)}</text>`; });
  el.innerHTML = s + '</svg>';
}

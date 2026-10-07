// Графики на чистом SVG (без библиотек). Один масштаб по оси Y на график; подсказка при наведении/касании.
import { num, fmtDate, fmtShort } from './format.js';

export const EVENT_TYPES = {
  chapter: { label: 'Выкладка главы', color: 'var(--ev-chapter)' },
  discount: { label: 'Скидка', color: 'var(--ev-discount)' },
  start: { label: 'Старт книги', color: 'var(--ev-start)' },
  finish: { label: 'Завершение книги', color: 'var(--ev-start)' },
  promo: { label: 'Акция Литнета', color: 'var(--ev-promo)' },
  contest: { label: 'Итоги конкурса', color: 'var(--ev-contest)' },
  note: { label: 'Заметка', color: 'var(--ev-note)' },
  other: { label: 'Другое', color: 'var(--ev-note)' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
export function ticks(max, n = 4) { return Array.from({ length: n + 1 }, (_, i) => (max / n) * i); }

function tooltipHost(el) {
  let t = el.querySelector('.tip');
  if (!t) { t = document.createElement('div'); t.className = 'tip'; t.hidden = true; el.appendChild(t); }
  return t;
}
export function bindTip(el, svg, W, plotL, plotR, count, html) {
  const tip = tooltipHost(el);
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.min(count - 1, Math.max(0, Math.floor(((x - plotL) / (plotR - plotL)) * count)));
    tip.innerHTML = html(i);
    tip.hidden = false;
    const cx = ((plotL + ((i + 0.5) / count) * (plotR - plotL)) / W) * r.width;
    tip.style.left = Math.min(Math.max(cx, tip.offsetWidth / 2 + 4), r.width - tip.offsetWidth / 2 - 4) + 'px';
    el.querySelector('.cursor')?.setAttribute('x1', (plotL + ((i + 0.5) / count) * (plotR - plotL)));
    el.querySelector('.cursor')?.setAttribute('x2', (plotL + ((i + 0.5) / count) * (plotR - plotL)));
    el.querySelector('.cursor')?.removeAttribute('hidden');
  };
  const hide = () => { tip.hidden = true; el.querySelector('.cursor')?.setAttribute('hidden', ''); };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', hide);
}

// Доход по дням: столбики + среднее за 7 дней, затенение рекламы, метки событий, линии смены цены
export function dailyChart(el, { days, ma, bands = [], events = [], priceLines = [], fmtVal = (v) => num(v, 2) + ' ₽', height = 260 }) {
  const W = Math.max(300, el.clientWidth || 340), H = height;
  const L = 46, R = 8, T = 24, B = 24, pw = W - L - R, ph = H - T - B;
  const n = days.length;
  if (!n) { el.innerHTML = '<p class="muted">Нет данных за выбранный период.</p>'; return; }
  const max = niceMax(Math.max(...days.map((d) => d.value), ...ma, 1));
  const y = (v) => T + ph - (v / max) * ph;
  const xc = (i) => L + ((i + 0.5) / n) * pw;
  const bw = Math.max(1, Math.min(18, pw / n - (pw / n > 6 ? 2 : 0.6)));
  const idx = new Map(days.map((d, i) => [d.date, i]));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Доход по дням">`;
  s += ticks(max).map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${num(t)}</text>`).join('');
  for (const b of bands) {
    const a = Math.max(0, days.findIndex((d) => d.date >= b.from));
    let z = -1;
    for (let i = n - 1; i >= 0; i--) if (days[i].date <= b.to) { z = i; break; }
    if (z < a || days[a].date > b.to) continue;
    s += `<rect class="band" x="${L + (a / n) * pw}" y="${T}" width="${((z - a + 1) / n) * pw}" height="${ph}"><title>${esc(b.label)}</title></rect>`;
  }
  s += days.map((d, i) => `<rect class="bar${d.known === false ? ' unk' : ''}" x="${xc(i) - bw / 2}" y="${y(d.value)}" width="${bw}" height="${Math.max(0, T + ph - y(d.value))}" rx="${bw > 4 ? 2 : 0.5}"/>`).join('');
  s += `<polyline class="ma" fill="none" points="${ma.map((v, i) => `${xc(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`;
  for (const p of priceLines) {
    const i = idx.get(p.date);
    if (i === undefined) continue;
    s += `<line class="price" x1="${xc(i) - bw / 2}" x2="${xc(i) - bw / 2}" y1="${T}" y2="${T + ph}"><title>${esc(p.label)}</title></line>`;
  }
  const evBy = new Map();
  for (const e of events) { if (!idx.has(e.date)) continue; (evBy.get(e.date) || evBy.set(e.date, []).get(e.date)).push(e); }
  for (const [d, list] of evBy) {
    const t = EVENT_TYPES[list[0].type] || EVENT_TYPES.note;
    s += `<circle class="ev" cx="${xc(idx.get(d))}" cy="${9}" r="5" fill="${t.color}"/>`;
    if (list.length > 1) s += `<text class="evn" x="${xc(idx.get(d))}" y="12" text-anchor="middle">${list.length}</text>`;
  }
  const step = Math.max(1, Math.ceil(n / 6));
  for (let i = 0; i < n; i += step) s += `<text class="axis" x="${xc(i)}" y="${H - 6}" text-anchor="middle">${fmtShort(days[i].date)}</text>`;
  s += `<line class="cursor" y1="${T}" y2="${T + ph}" hidden/></svg>`;
  el.innerHTML = s;
  const priceBy = new Map(priceLines.map((p) => [p.date, p.label]));
  bindTip(el, el.querySelector('svg'), W, L, W - R, n, (i) => {
    const d = days[i];
    const ev = (evBy.get(d.date) || []).map((e) => `<div class="tev"><i style="background:${(EVENT_TYPES[e.type] || EVENT_TYPES.note).color}"></i>${esc((EVENT_TYPES[e.type] || EVENT_TYPES.note).label)}${e.text ? ': ' + esc(e.text) : ''}</div>`).join('');
    const pr = priceBy.has(d.date) ? `<div class="tev">Цена: ${esc(priceBy.get(d.date))}</div>` : '';
    const bd = bands.filter((b) => d.date >= b.from && d.date <= b.to).map((b) => `<div class="tev">Реклама: ${esc(b.label)}</div>`).join('');
    return `<b>${fmtDate(d.date)}</b><div>${fmtVal(d.value)}</div><div class="muted">среднее 7 дн.: ${fmtVal(ma[i])}</div>${ev}${pr}${bd}`;
  });
}

// Простая линия по неделям (один показатель — одна ось)
export function lineChart(el, { points, fmtVal, height = 170 }) {
  const W = Math.max(280, el.clientWidth || 320), H = height;
  const L = 44, R = 12, T = 12, B = 26, pw = W - L - R, ph = H - T - B;
  const n = points.length;
  if (!n) { el.innerHTML = '<p class="muted">Добавьте недельные отчёты — здесь появится график.</p>'; return; }
  const vals = points.map((p) => p.value);
  const max = niceMax(Math.max(...vals));
  const y = (v) => T + ph - (v / max) * ph;
  const x = (i) => L + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">`;
  s += ticks(max, 3).map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${fmtVal(t)}</text>`).join('');
  s += `<polyline class="line1" fill="none" points="${points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}"/>`;
  s += points.map((p, i) => `<circle class="dot1" cx="${x(i)}" cy="${y(p.value)}" r="4"><title>${esc(p.label)}: ${fmtVal(p.value)}</title></circle>`).join('');
  const step = Math.max(1, Math.ceil(n / 5));
  for (let i = 0; i < n; i += step) s += `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(points[i].short)}</text>`;
  el.innerHTML = s + '</svg>';
}

// План/факт по месяцам: столбики — факт, линия — план, пунктир — среднее за 3 месяца
export function goalChart(el, { rows, fmtVal, height = 230 }) {
  const W = Math.max(300, el.clientWidth || 340), H = height;
  const L = 50, R = 8, T = 12, B = 26, pw = W - L - R, ph = H - T - B;
  const n = rows.length;
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.plan, r.fact || 0)), 1));
  const y = (v) => T + ph - (v / max) * ph;
  const xc = (i) => L + ((i + 0.5) / n) * pw;
  const bw = Math.min(22, pw / n - 4);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="План и факт">`;
  s += ticks(max).map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${num(t)}</text>`).join('');
  s += rows.map((r, i) => (r.fact == null ? '' : `<rect class="bar${r.partial ? ' unk' : ''}" x="${xc(i) - bw / 2}" y="${y(r.fact)}" width="${bw}" height="${Math.max(0, T + ph - y(r.fact))}" rx="2"><title>${esc(r.label)}: факт ${fmtVal(r.fact)}</title></rect>`)).join('');
  s += `<polyline class="ma" fill="none" points="${rows.map((r, i) => `${xc(i)},${y(r.plan)}`).join(' ')}"/>`;
  const pts = rows.map((r, i) => (r.ma3 == null ? null : `${xc(i)},${y(r.ma3)}`)).filter(Boolean);
  if (pts.length > 1) s += `<polyline class="ma3" fill="none" points="${pts.join(' ')}"/>`;
  rows.forEach((r, i) => { if (i % Math.ceil(n / 7) === 0) s += `<text class="axis" x="${xc(i)}" y="${H - 6}" text-anchor="middle">${esc(r.short)}</text>`; });
  el.innerHTML = s + '</svg>';
}

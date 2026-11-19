// Вкладка «Диагноз» кампании: оценка, экономика добавления, воронка, узкое место, динамика, разрезы и план на неделю (расчёты — ../diagnose.js)
import { esc, acts, toast, ask } from '../../../js/ui.js';
import { rub, num, fmtShort } from '../../../js/format.js';
import { outageSet } from '../../../js/calc.js';
import { diagnose, SEG_NAME } from '../diagnose.js';
import { placementRows } from '../qualitycalc.js';
import { logOf } from '../demo.js';
import { execPlan } from '../sync.js';
import { pultModel } from './pult.js';
import { actBtn } from './common.js';
import { demo } from '../demo.js';

const app = () => window.__app;
const pc = (v) => (v == null ? '—' : (Math.round(v * 1000) / 10).toString().replace('.', ',') + ' %');
const sign = (d) => (d == null ? '' : `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)} %`);
const VERD = { cut: ['утечка', 'down'], boost: ['работает лучше', 'up'], few: ['мало данных', 'muted'], ok: ['как в среднем', ''] };

// диагноз кампании по её строке Пульта (там уже книга, цели, ценность добавления)
export function diagOf(a, camp, row = null) {
  const r = row || pultModel(a).rows.find((x) => x.camp.id === camp.id);
  if (!r) return null;
  const stats = a.snap('stats') || {}, main = a.snap('main') || {}, c = a.ctx();
  return diagnose({
    camp, daily: stats.daily || [], conv: stats.conv || [], adDaily: stats.adDaily || [], ads: main.ads || [],
    places: placementRows(stats.placements || [], main.campaigns || []), segments: stats.segments || [],
    goals: r.goals, today: c.today, libValue: r.econ.libValue, perSale: r.perSale, skip: outageSet(c.data.days || []), log: logOf(a) || [],
  });
}

// маленький график цены добавления (скользящие 7 дней), риски — дни изменений
function trendSvg(D) {
  const pts = D.trend.map((x, i) => ({ i, ...x })).filter((x) => x.cpa != null);
  if (pts.length < 5) return '<p class="small muted">График появится, когда наберётся неделя-две добавлений.</p>';
  const W = typeof window !== 'undefined' && window.innerWidth < 600 ? 360 : 640, H = W < 400 ? 170 : 150, L = 46, R = 8, T = 10, B = 22, n = D.trend.length, max = Math.max(...pts.map((p) => p.cpa)) * 1.12, min = 0;
  const X = (i) => L + (i / (n - 1)) * (W - L - R), Y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const line = pts.map((p) => `${X(p.i).toFixed(1)},${Y(p.cpa).toFixed(1)}`).join(' ');
  const lv = D.unit.libValue != null && D.unit.libValue < max ? `<line class="dg-lv" x1="${L}" x2="${W - R}" y1="${Y(D.unit.libValue)}" y2="${Y(D.unit.libValue)}"/><text class="axis" x="${W - R}" y="${Y(D.unit.libValue) - 4}" text-anchor="end">приносит ${rub(D.unit.libValue, 0)}</text>` : '';
  const marks = D.marks.map((m) => { const i = D.trend.findIndex((x) => x.date === m.date); return i < 0 ? '' : `<line class="dg-mk" x1="${X(i)}" x2="${X(i)}" y1="${T}" y2="${H - B}"><title>${esc(fmtShort(m.date))}: ${esc(m.text)}</title></line>`; }).join('');
  const tk = [0, 0.5, 1].map((f) => min + f * (max - min));
  return `<svg class="dg-chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Цена добавления по дням">
    ${tk.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="axis" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${rub(v, 0)}</text>`).join('')}
    ${lv}${marks}<polyline class="line1" fill="none" points="${line}"/>
    ${pts.map((p) => `<circle class="dg-dot" cx="${X(p.i)}" cy="${Y(p.cpa)}" r="9"><title>${fmtShort(p.date)}: добавление ${rub(p.cpa, 0)} (за 7 дней: ${p.lib} добавл., ${rub(p.cost, 0)})</title></circle>`).join('')}
    <text class="axis" x="${L}" y="${H - 6}">${fmtShort(D.trend[0].date)}</text><text class="axis" x="${W - R}" y="${H - 6}" text-anchor="end">${fmtShort(D.trend[n - 1].date)}</text></svg>
    <p class="small muted" style="margin:4px 0 0">Цена добавления за последние 7 дней на каждый день${D.marks.length ? ' · вертикальные риски — ваши изменения (наведите)' : ''}${D.unit.libValue != null ? ' · пунктир — сколько приносит добавление: ниже него — в плюсе' : ''}.</p>`;
}

function groupHtml(g, list) {
  if (!list?.length) return '';
  return `<div class="dg-grp"><div class="dg-gh">${SEG_NAME[g]}</div>${list.map((x) => {
    const [vt, tone] = VERD[x.verdict];
    return `<div class="dg-row"><div class="dg-rl"><span class="dg-name">${esc(x.label)}</span><span class="dg-bar"><i style="width:${Math.max(2, Math.round(x.share * 100))}%"></i></span></div>
      <div class="dg-rv small"><span>${pc(x.share)} расхода</span><span>${num(x.lib)} добавл.</span><span>${x.cpa != null ? rub(x.cpa, 0) : '—'}</span><span class="${tone}">${vt}</span></div></div>`;
  }).join('')}</div>`;
}

export function diagHtml(a, camp) {
  const D = diagOf(a, camp);
  if (!D) return '<p class="muted">Нет данных по кампании.</p>';
  const u = D.unit;
  const head = `<div class="dg-head"><div class="dg-score dg-${D.grade}">${D.score ?? '…'}</div><div><div class="dg-grade">${esc(D.gradeText)}</div>
    ${D.why.length ? D.why.map((x) => `<p class="small" style="margin:2px 0 0">${esc(x)}</p>`).join('') : `<p class="small muted" style="margin:2px 0 0">${esc(D.neck.text)}</p>`}</div></div>`;
  const econ = D.enough ? `<h3>Экономика одного добавления</h3>
    <div class="tiles dg-econ"><div><div class="k">Стоит</div><div class="v">${rub(u.cpa, 0)}</div><div class="s">${num(u.lib)} добавл. за 30 дней</div></div>
      <div><div class="k">Приносит</div><div class="v">${u.libValue != null ? '≈ ' + rub(u.libValue, 0) : '—'}</div><div class="s">${u.libValue != null ? 'роялти × доля, кто потом покупает' : 'нужна Метрика автора и продажи'}</div></div>
      <div><div class="k">${u.margin == null ? 'Покупок с рекламы' : u.margin >= 1 ? 'Запас' : 'Перерасход'}</div><div class="v ${u.margin == null ? '' : u.margin >= 1 ? 'up' : 'down'}">${u.margin == null ? num(u.buy) : pc(Math.abs(u.margin - 1))}</div><div class="s">${u.margin == null ? 'за 30 дней' : u.margin >= 1 ? 'добавление окупается' : 'каждое добавление в минусе'}</div></div></div>
    ${u.maxCpc != null ? `<p class="small" style="margin:8px 0 0">Точка безубыточности: при нынешней доле добавлений клик может стоить до <b>${rub(u.maxCpc, 1)}</b> (сейчас ${rub(u.cpc, 1)}); при нынешней цене клика из 100 кликов должны добавлять <b>${pc(u.needCr)}</b> (сейчас ${pc(u.cr)}).</p>` : ''}` : '';
  const funnel = `<h3>Воронка: неделя против трёх до неё</h3><div class="dg-funnel">${D.funnel.map((x) => `<div class="dg-fs"><div class="small muted">${x.label}</div><b>${x.fmt(x.now)}</b><div class="small ${x.tone === 'bad' ? 'down' : x.tone === 'good' ? 'up' : 'muted'}">${x.d == null ? 'не с чем сравнить' : `${sign(x.d)} · было ${x.fmt(x.was)}`}</div></div>`).join('')}</div>`;
  const neck = `<div class="dg-neck dg-${D.neck.k}"><div class="small muted">Узкое место</div><b>${esc(D.neck.title)}</b><p class="small" style="margin:4px 0 0">${esc(D.neck.text)}</p><p class="small" style="margin:6px 0 0"><b>Что сделать:</b> ${esc(D.neck.fix)}</p></div>`;
  const groups = Object.entries(D.groups).map(([g, list]) => groupHtml(g, list)).join('');
  const plan = D.plan.length ? `<h3>План на неделю</h3><div class="list">${D.plan.map((p, i) => `<div class="item dg-plan"><div class="row between" style="gap:10px;align-items:flex-start"><div style="min-width:0"><b>${i + 1}. ${esc(p.text)}</b><div class="small muted">${esc(p.why)}</div></div>
      ${p.where === 'app' && p.g === 'place' ? `<button data-act="dg.place" data-cid="${camp.id}" data-p="${esc(p.key)}">Исключить</button>` : p.where === 'app' && p.g === 'ad' ? actBtn({ do: 'pause', target: 'ad', ids: [Number(p.key)], why: 'Диагноз: добавление заметно дороже' }, 'Остановить', '') : p.where === 'cabinet' ? '<a class="small" href="https://direct.yandex.ru/dna/grid/campaigns" target="_blank" rel="noopener">в кабинете →</a>' : ''}</div></div>`).join('')}</div>
    <p class="small muted">Ставки по полу, возрасту и устройствам меняются в кабинете: кампания → «Корректировки ставок». Приложение их не трогает — как и бюджет.</p>` : '';
  return `<div class="dg-wrap">${head}${econ}${funnel}${neck}<h3>Цена добавления по дням</h3>${trendSvg(D)}
    ${groups ? `<h3>Где деньги работают, а где утекают <span class="small muted" style="font-weight:400">· 30 дней</span></h3>${groups}<p class="small muted">«Утечка» и «работает лучше» — только когда разница с остальными заметна наверняка (95 %); где кликов мало — «мало данных».</p>` : ''}
    ${plan}</div>`;
}

acts['dg.place'] = async (d) => {
  if (demo.on) { toast('Это пример данных — в настоящем кабинете площадка исключится'); return false; }
  if (!(await ask(`Исключить площадку «${d.p}» из кампании? Объявления перестанут там показываться.`, 'Исключить'))) return false;
  const done = await execPlan(app(), [{ key: 'dg:' + d.cid + ':' + d.p, rule: 'places', cid: Number(d.cid), places: [d.p] }], 'app');
  toast(done.length ? 'Площадка исключена — записано в «Что меняли»' : 'Директ не принял — подробности в «Что меняли»');
  return false;
};
// строка «Диагноз» в карточке Пульта: оценка, вывод и узкое место — подробности во вкладке кампании
export function diagStrip(a, r) {
  let D; try { D = diagOf(a, r.camp, r); } catch (e) { console.error(e); return ''; }
  if (!D || (!D.enough && !D.unit.cost)) return '';
  return `<a href="#" class="dg-strip" data-act="dg.open" data-id="${r.camp.id}"><span class="dg-score dg-sm dg-${D.grade}">${D.score ?? '…'}</span>
    <span style="min-width:0"><b>${esc(D.gradeText)}</b><span class="small muted"> · ${esc(D.neck.title.toLowerCase())}</span></span><span class="small dg-more">Диагноз →</span></a>`;
}
acts['dg.open'] = (d) => { app().ui.cTab = 'diag'; app().go('/c/' + d.id); return false; };

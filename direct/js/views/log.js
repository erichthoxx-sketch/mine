// Дневник изменений: что и когда меняли в Директе — и что стало через 7 дней (13.11.2026, её «да»: «чтобы видеть, какие правки сработали»)
import { esc } from '../../../js/ui.js';
import { logOf } from '../demo.js';
import { changeDiary } from '../dcalc.js';
import { goalsOf } from '../pult.js';
import { metrikaOf } from './metrika.js';

const BADGE = { better: ['помогло', 'up'], worse: ['стало хуже', 'down'], same: ['без заметной разницы', 'muted'], early: ['предварительно', 'muted'], few: ['мало данных', 'muted'], wait: ['', 'muted'], failed: ['не применилось', 'down'] };
const BY = { ai: 'по плану нейросети', auto: 'автоправило', app: 'вы' };
const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const r1 = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toString().replace('.', ','));
const rub = (v) => (v == null ? '—' : Math.round(v) + ' ₽');
const pc = (p, q) => (p != null && q != null && p > 0 ? ` <span class="${q < p ? 'up' : 'down'}">${q < p ? '−' : '+'}${Math.round(Math.abs(q - p) / p * 100)} %</span>` : '');

export function logView(a, cid = null) {
  const c = a.ctx(), stats = a.snap('stats') || {}, g = goalsOf(metrikaOf(c) || {});
  const list = changeDiary(stats.daily || [], stats.conv || [], logOf(a) || [], c.today, { lib: g.lib, buy: g.buy || [] }).filter((x) => cid == null || x.log.cid === cid);
  const when = (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const cnt = (k) => list.filter((x) => x.state === k).length;
  const sum = ['better', 'worse', 'same'].some((k) => cnt(k)) ? `<p class="small" style="margin:0 0 6px">Через 7 дней: <span class="up">помогло ${cnt('better')}</span> · <span class="down">хуже ${cnt('worse')}</span> · без разницы ${cnt('same')}</p>` : '';
  const row = (x) => {
    const L = x.log, [bt, bc] = BADGE[x.state] || ['', 'muted'], badge = x.state === 'wait' ? `итог ${dm(x.ready)}` : x.state === 'early' ? `предварительно · итог ${dm(x.ready)}` : bt;
    const m = x.before && x.after ? [
      x.by === 'cpa' ? `добавление ${rub(x.before.cpa)} → ${rub(x.after.cpa)}${pc(x.before.cpa, x.after.cpa)} · в день ${r1(x.before.conv)} → ${r1(x.after.conv)}` : '',
      x.before.clicks || x.after.clicks ? `клик ${rub(x.before.cpc)} → ${rub(x.after.cpc)}${x.by === 'cpc' ? pc(x.before.cpc, x.after.cpc) : ''} · CTR ${r1(x.before.ctr * 100)} → ${r1(x.after.ctr * 100)} %` : '',
      `расход в день ${rub(x.before.cost)} → ${rub(x.after.cost)}`,
    ].filter(Boolean).join('<br>') : '';
    return `<div class="item"><b>${esc(L.text)}</b>${badge ? `<div class="small ${bc}" style="margin-top:2px">${badge}</div>` : ''}
      <div class="small muted">${when(L.at)} · ${BY[L.by] || 'вы'}${L.why ? ' · ' + esc(L.why) : ''}${L.demo ? ' · пример' : ''}</div>
      ${m ? `<div class="small" style="margin-top:4px">${m}</div>` : ''}
      ${x.near ? `<div class="small muted">В эти дни меняли ещё ${x.near} — результат общий для всех правок.</div>` : ''}
      ${L.errors?.length ? `<div class="small down">${esc(L.errors.join('; '))}</div>` : ''}${L.warnings?.length ? `<div class="small warnc">${esc(L.warnings.join('; '))}</div>` : ''}</div>`;
  };
  return {
    html: `<div class="card"><h2>Дневник изменений</h2><p class="small muted" style="margin:0 0 8px">Каждая правка и что стало за 7 дней после неё против 7 дней до. Главное мерило — цена добавления в библиотеку, если добавлений хватает; иначе цена клика и CTR.</p>${sum}
      ${list.length ? `<div class="list">${list.map(row).join('')}</div>` : '<p class="muted">Пока ничего не меняли. Здесь будет видно, что, когда и почему поменялось, — и помогло ли.</p>'}</div>`,
  };
}

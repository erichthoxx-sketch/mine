// «Разбор недели» (#/week): еженедельный отчёт по каждой идущей кампании — как от таргетолога, с объяснением, как читать цифры.
// Расчёты — ../weekreview.js. Отметки «сделано» и «Разобрала» — settings.direct.weekTodo / weekDone (ключ — понедельник недели).
import { esc, acts, changes, fold, toast } from '../../../js/ui.js';
import { rub, num } from '../../../js/format.js';
import { outageSet } from '../../../js/calc.js';
import { weekReview, weekKeyOf, whatIf } from '../weekreview.js';
import { actBtn } from './common.js';
import { placementRows } from '../qualitycalc.js';
import { pultModel } from './pult.js';

const TONE = { good: 'up', bad: 'down', warn: 'warnc', info: '', wait: 'muted' };
const dm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const money = (v) => (v == null ? '—' : rub(v, 0));
const p1 = (v) => (v == null ? '—' : (v * 100).toFixed(1).replace('.', ',') + ' %');
// изменение к прошлому периоду: good — куда «хорошо» (расход ↑ — нейтрально, цена ↓ — хорошо)
const ch = (v, good = 0) => (v == null || Math.abs(v) < 0.03 ? '' : `<span class="${good ? ((v > 0) === (good > 0) ? 'up' : 'down') : 'muted'}">${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)} %</span> к прошлому`);
const how = (t) => `<p class="small muted" style="margin:8px 0 0"><b>Как читать.</b> ${t}</p>`;
const table = (head, rows) => `<div style="overflow-x:auto"><table class="tq-table"><thead><tr>${head.map((h, i) => `<th${i ? ' style="text-align:right"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' style="text-align:right;white-space:nowrap"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

function campBlock(a, r, wk, done) {
  const c = a.ctx(), stats = a.snap('stats') || {}, main = a.snap('main') || {};
  const R = weekReview({ camp: r.camp, daily: stats.daily, conv: stats.conv, adDaily: stats.adDaily, ads: main.ads, queries: stats.queries, places: placementRows(stats.placements || [], main.campaigns || []),
    goals: r.goals, today: c.today, libValue: r.econ.libValue, perSale: r.perSale, skip: outageSet(c.data.days || []) });
  if (!R) return '';
  const { now: n, delta: d, period: p } = R, id = r.camp.id;
  const tile = (k, v, s = '') => `<div><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  const todo = R.todo.map((t) => `<label class="d-check" style="display:flex;gap:10px;align-items:flex-start;margin:8px 0"><input type="checkbox" data-chg="wk.done" data-k="${esc(id + ':' + t.k)}"${done.includes(id + ':' + t.k) ? ' checked' : ''}> <span>${esc(t.text)}${t.to ? ` <button class="link small" data-act="go" data-to="${t.to}">открыть</button>` : ''}</span></label>`).join('');
  return `<div class="card">
    <div class="row between"><h2 style="margin:0">${esc(r.book?.title ? `«${r.book.title}»` : r.camp.name)}</h2><span class="small muted">${dm(p.from)}–${dm(p.to)} · ${p.days} дн.${p.days < 7 ? ' (кампания моложе недели)' : ''}</span></div>
    <div class="tiles d-tiles" style="margin-top:12px">
      ${tile('Расход', money(n.cost), ch(d?.cost))}
      ${tile('Клики', num(n.clicks), ch(d?.clicks, 1))}
      ${tile('В библиотеку', n.lib == null ? '—' : num(n.lib), ch(d?.lib, 1))}
      ${tile('Цена добавления', money(n.cpaLib), ch(d?.cpaLib, -1) || (r.camp.cpa ? `цель ${money(r.camp.cpa)} + НДС` : ''))}
    </div>
    <div class="list" style="margin-top:10px">${R.notes.map((x) => `<div class="item ${TONE[x.tone] || ''}" style="padding:8px 0">${esc(x.text)}</div>`).join('')}</div>
    ${todo ? `<h3 style="margin:16px 0 2px">Что сделать на этой неделе</h3>${todo}` : ''}
    ${fold('wk-f-' + id, 'Воронка', table(['Шаг', 'Сколько', 'Доля'], [['Показы', num(n.impr), ''], ['Клики', num(n.clicks), `${p1(n.ctr)} от показов`], ['В библиотеку', n.lib == null ? '—' : num(n.lib), n.toLib == null ? '' : `${p1(n.toLib)} от кликов`], ['Покупки', n.buy == null ? '—' : num(n.buy), n.toBuy == null ? '' : `${p1(n.toBuy)} от добавивших`]])
      + how('Каждая строка — сколько людей дошло до шага. Узкое место там, где доля заметно упала к прошлой неделе: мало кликов — слабое объявление, мало добавлений — страница книги (обложка, аннотация, первая глава), мало покупок — цена или момент, где начинается платная часть. Покупки приходят позже добавлений, поэтому в первые недели их может не быть.'), { sub: n.toLib != null ? `в библиотеку ${p1(n.toLib)} кликов` : '' })}
    ${R.nets.length ? fold('wk-n-' + id, 'Поиск и сети', table(['Где', 'Показы', 'Клики', 'CTR', 'Расход'], R.nets.map((x) => [x.name, num(x.impr), num(x.clicks), p1(x.ctr), money(x.cost)]))
      + how('Поиск — человек сам набрал запрос, он «тёплый», но таких мало. Сети — объявление показывают на сайтах и в приложениях, охват большой, CTR ниже — это нормально. Сравнивайте не поиск с сетями, а каждый с самим собой неделю к неделе.'), { sub: R.nets.map((x) => `${x.k === 'n' ? 'сети' : 'поиск'} ${num(x.clicks)}`).join(' · ') }) : ''}
    ${R.adRows.length ? fold('wk-a-' + id, 'Объявления', table(['Объявление', 'Показы', 'Клики', 'CTR'], R.adRows.map((x) => [esc(x.title) + (R.best?.aid === x.aid && R.adRows.length > 1 ? ' <span class="up small">лучшее</span>' : ''), num(x.impr), num(x.clicks), p1(x.ctr)]))
      + (R.adTest?.status === 'win' ? `<p style="margin:10px 0 0"><b class="up">Победитель определён:</b> «${esc(R.adTest.best.title)}» кликают чаще, чем «${esc(R.adTest.loser.title)}» (${p1(R.adTest.best.ctr)} против ${p1(R.adTest.loser.ctr)}), и это не случайность. ${R.liveAds >= 3 ? actBtn({ do: 'pause', target: 'ad', ids: [Number(R.adTest.loser.aid)], why: 'тест объявлений: проигравшее по CTR' }, 'Остановить проигравшее', 'small-btn') : 'Сначала добавьте новое объявление на замену — потом остановите проигравшее.'}</p>`
        : R.adTest ? `<p class="small muted" style="margin:10px 0 0"><b>Тест объявлений ещё идёт.</b> Разница пока может быть случайной${R.adTest.need ? ` — нужно ещё примерно ${num(R.adTest.need)} показов на каждое` : ''}. Не останавливайте по первым цифрам.</p>` : '')
      + how('CTR — доля тех, кто кликнул, из увидевших. Сравнивайте объявления между собой при 500+ показах: слабое замените новым вариантом, сильное не трогайте. Если CTR одного объявления падает неделю за неделей — оно приелось, нужна свежая картинка или крючок.'), { sub: `${R.liveAds} ${R.liveAds === 1 ? 'идёт' : 'идут'}` }) : ''}
    ${r.camp.cpa ? (() => { const u = a.ui.wi?.[id] || {}, cpa = Number(u.cpa) || r.camp.cpa, perWeek = Number(u.n) || Math.max(1, Math.round((n.lib || 0) / p.days * 7)), w = whatIf({ cpa, perWeek, libValue: r.econ.libValue, weekLimit: r.wk?.limit ?? null });
      return `<h3 style="margin:18px 0 6px">Что если</h3>
      <div class="row" style="gap:14px;flex-wrap:wrap;align-items:flex-end"><label class="small">Цена цели, ₽<input type="number" min="1" step="1" value="${cpa}" data-chg="wk.wi" data-id="${id}" data-f="cpa" style="width:110px;display:block"></label>
        <label class="small">Добавлений в неделю<input type="number" min="1" step="1" value="${perWeek}" data-chg="wk.wi" data-id="${id}" data-f="n" style="width:130px;display:block"></label></div>
      <p style="margin:10px 0 0">Расход ≈ <b>${money(w.cost)}</b> в неделю${w.over ? ` <span class="warnc">— больше бюджета недели: влезет ${num(w.fits)} добавл.</span>` : ''}${w.royalty != null ? ` → ожидаемое роялти ≈ <b>${money(w.royalty)}</b> → <b class="${w.profit >= 0 ? 'up' : 'down'}">${w.profit >= 0 ? '+' : '−'}${money(Math.abs(w.profit))}</b>` : ''}</p>
      <p class="small muted" style="margin:6px 0 0">${w.maxCpa != null ? `Предел: при цене цели выше ${w.maxCpa} ₽ добавление стоит больше, чем приносит. ` : 'Сколько приносит добавление, станет видно после первых покупок. '}Сколько добавлений Директ даст при новой цене, заранее не знает никто — меняйте понемногу и смотрите неделю.</p>`; })() : ''}
    ${R.topQ.length ? fold('wk-q-' + id, 'Запросы (30 дней)', table(['Запрос', 'Показы', 'Клики', 'Расход'], R.topQ.map((x) => [esc(x.query), num(x.impr), num(x.clicks), money(x.cost)]))
      + how('Это то, что люди набирали в поиске перед показом объявления. Ищите чужое: «скачать», «аудиокнига», другие авторы, не ваш жанр — такие слова добавляют в минус-слова, и реклама перестаёт на них показываться.') + `<p style="margin:8px 0 0"><button class="link small" data-act="go" data-to="/c/${id}">Все запросы и минус-слова →</button></p>`, { sub: R.junk ? `мусорных: ${R.junk}` : 'чисто' }) : ''}
    ${R.topP.length ? fold('wk-p-' + id, 'Площадки', table(['Площадка', 'Клики', 'Отказы', 'Расход'], R.topP.map((x) => [esc(x.place), num(x.clicks), x.bounce == null ? '—' : Math.round(x.bounce) + ' %', money(x.cost)]))
      + how('Отказ — человек ушёл со страницы в первые секунды. Площадка, где 20+ кликов и отказов больше половины, скорее всего даёт случайные нажатия (игры, приложения) — её исключают в настройках кампании: «Запрещённые площадки».') + `<p style="margin:8px 0 0"><button class="link small" data-act="go" data-to="/quality">Качество трафика →</button></p>`, { sub: R.badP.length ? `подозрительных: ${R.badP.length}` : 'без замечаний' }) : ''}
  </div>`;
}

export function weekView(a) {
  const c = a.ctx(), M = pultModel(a), wk = weekKeyOf(c.today), d = c.settings.direct || {};
  const live = M.rows.filter((r) => ['on', 'capped', 'idle'].includes(r.st.key));
  const done = d.weekTodo?.[wk] || [], closed = d.weekDone === wk;
  const blocks = live.map((r) => campBlock(a, r, wk, done)).filter(Boolean).join('');
  return { html: `<p style="margin:0 0 6px"><button class="link small" data-act="go" data-to="/">← Пульт</button></p>
    <div class="row between" style="margin-bottom:6px"><h2 style="margin:0">Разбор недели</h2>${blocks ? (closed ? '<span class="small up">✓ разобрано</span>' : '<button class="primary" data-act="wk.close">Разобрала</button>') : ''}</div>
    <p class="small muted" style="margin:0 0 14px">Раз в неделю, по понедельникам: что принесла реклама, где узкое место и что поменять. Остальные дни достаточно Пульта.</p>
    ${blocks || '<div class="card"><p class="muted" style="margin:0">Идущих кампаний нет — разбирать пока нечего.</p></div>'}` };
}

const dset = (a) => a.ctx().settings.direct || {};
changes['wk.done'] = async (v, el) => {
  const a = window.__app, d = dset(a), wk = weekKeyOf(a.ctx().today), cur = new Set(d.weekTodo?.[wk] || []);
  if (el.checked) cur.add(el.dataset.k); else cur.delete(el.dataset.k);
  await a.store.saveSettings({ direct: { ...d, weekTodo: { [wk]: [...cur] } } }); // хранится только текущая неделя
  return false;
};
acts['wk.close'] = async () => { const a = window.__app; await a.store.saveSettings({ direct: { ...dset(a), weekDone: weekKeyOf(a.ctx().today) } }); toast('Отмечено. Следующий разбор — в понедельник'); };
changes['wk.wi'] = (v, el) => { const a = window.__app; a.ui.wi = { ...(a.ui.wi || {}), [el.dataset.id]: { ...(a.ui.wi?.[el.dataset.id] || {}), [el.dataset.f]: v } }; };

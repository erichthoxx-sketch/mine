// «Книги»: у каждой книги — всё о её рекламе в одном месте. Где рекламируется (свой Директ, таргетологи из «Доходов»),
// как идёт (расход, покупки), запуск, читатели по Метрике (страница книги и читалка), её метки и ссылки, её слова.
// Всё связывается само: кампания — из плана запуска, привязки слов или по названию; реклама «Доходов» — по книге.
import { esc, acts } from '../../../js/ui.js';
import { rub, num, pct, fmtShort } from '../../../js/format.js';
import { addDays, outageSet, bookIdFor } from '../../../js/calc.js';
import { totals, goalTotals } from '../dcalc.js';
import { byBook } from '../mcalc.js';
import { sameBook } from '../launchcalc.js';
import { resolvedLaunches } from './launchctx.js';
import { launchStrip } from './launch.js';
import { metrikaOf } from './metrika.js';
import { stateDot } from './common.js';
import { keywordsView } from './keywords.js';
import { demo } from '../demo.js';
import { ic } from '../../../js/icons.js';

const CH = { litnet: 'Литнет платит', own: 'Мой таргет', other: 'Другое' };
const STATUS = { progress: 'В процессе', done: 'Завершена' };
const norm = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// название кампании говорит о книге: полное название или первые два слова (кампании часто называют коротко)
const sameTitle = (x, y) => { const a2 = norm(x), b2 = norm(y); return !!a2 && !!b2 && (a2 === b2 || (Math.min(a2.length, b2.length) >= 8 && (a2.startsWith(b2) || b2.startsWith(a2)))); };
const nameHas = (name, title) => { const n = norm(name), t = norm(title), two = t.split(' ').slice(0, 2).join(' '); return !!t && (n.includes(t) || (two.length >= 8 && n.includes(two))); };

// Всё о книге из всех приложений
export function bookAds(a, b) {
  const c = a.ctx(), t = c.today, m = metrikaOf(c), skip = outageSet(c.data.days || []);
  const main = a.snap('main') || {}, stats = a.snap('stats') || {}, daily = stats.daily || [];
  const L = resolvedLaunches(a).find((x) => x.id === String(b.id)) || null;
  const bind = (c.data.d_kw_bindings || []).find((x) => String(x.bookId) === String(b.id));
  const ids = new Set([L?.fl.campaignId, bind?.campaignId].filter(Boolean).map(String));
  const camps = (main.campaigns || []).filter((x) => x.state !== 'ARCHIVED' && (ids.has(String(x.id)) || nameHas(x.name, b.title))).map((x) => ({
    ...x, w: totals(daily, addDays(t, -6), t, x.id), g: m?.counterId ? goalTotals(daily, stats.conv || [], addDays(t, -29), t, { cid: x.id, goals: m.main, skip }) : null }));
  // книга в «Доходах» названа по выгрузке Литнета — часто длиннее («Альпийский развод. Он оставил меня умирать»): сравниваем по началу
  const bid = new Set([bookIdFor(b.title), ...(c.data.books || []).filter((x) => sameTitle(x.title, b.title)).map((x) => x.id)]);
  const others = (c.data.campaigns || []).filter((k) => !k.oneOff && (bid.has(k.bookId) || k.scope === 'all' || !k.bookId)).map((k) => ({ ...k, all: !bid.has(k.bookId) }))
    .sort((x, y) => (x.all - y.all) || (y.start || '').localeCompare(x.start || ''));
  // таргетологи из «Связей» Мастерской, которые ведут эту книгу
  const people = (c.data.w_links || []).filter((x) => x.kind === 'target' && (x.bookIds || []).map(String).includes(String(b.id)));
  const mk = a.snap('mk'), rd = mk?.pages ? byBook(mk.pages, (m?.main || []).map(String), [b.title]).find((x) => x.title === b.title) : null;
  const url = L?.plan.bookUrl || '', litId = (/-b(\d+)/.exec(url) || [])[1];
  const utms = (c.settings.direct?.utms || []).filter((u) => (litId && new RegExp(`-b${litId}(\\b|\\?|$)`).test(u.url || '')) || nameHas(u.label, b.title) || nameHas(u.campaign, b.title));
  const promos = (c.data.w_promolinks || []).filter((x) => x.status !== 'archived' && String(x.bookId) === String(b.id));
  const live = (k) => k.start && k.start <= t && (!k.end || k.end >= t);
  const active = camps.some((x) => x.state === 'ON') || others.some((k) => !k.all && live(k)) || people.some((x) => (x.partnerStatus || 'active') === 'active');
  const allLive = others.some((k) => k.all && live(k)); // реклама «на все книги» — отдельная пометка
  return { b, L, camps, others, people, rd, utms, promos, active, allLive, w7: camps.reduce((s, x) => s + x.w.cost, 0) };
}

const order = (x) => ({ progress: 0, done: 1 }[x.status || 'progress'] ?? 2);
export function booksAdsView(a) {
  const list = (a.ctx().data.w_books || []).filter((b) => b.title && (b.status || 'progress') !== 'idea').sort((x, y) => order(x) - order(y) || (y.publishStart || '').localeCompare(x.publishStart || ''));
  if (!list.length) return { html: '<div class="card"><h2>Книги</h2><p class="muted">Книги появятся здесь из Мастерской.</p></div>' };
  return { html: `<div class="card"><h2>Книги</h2><p class="small muted">Где рекламируется каждая книга и что с рекламой — всё из Директа, «Доходов», Метрики и Мастерской.</p>
    <div class="list">${list.map((b) => {
      const x = bookAds(a, b), where = [x.camps.length ? `Директ: ${x.camps.length}` : '', x.others.filter((k) => !k.all).length ? `реклама в «Доходах»: ${x.others.filter((k) => !k.all).length}` : '', x.people.length ? `таргетолог: ${x.people.map((p) => p.name).join(', ')}` : '', x.utms.length + x.promos.length ? `меток: ${x.utms.length + x.promos.length}` : ''].filter(Boolean).join(' · ');
      return `<a class="item" href="#" data-act="go" data-to="/book/${esc(b.id)}"><div class="row between"><b>${esc(b.title)}</b><span class="small ${x.active ? 'up' : 'muted'}">● ${x.active ? 'реклама идёт' : x.allLive ? 'реклама на все книги' : x.L ? ({ prep: 'готовим запуск', free: 'запуск: бесплатные главы', paid: 'запуск: подписка' }[x.L.plan.phase]) : 'рекламы нет'}</span></div>
        <div class="small muted">${STATUS[b.status || 'progress'] || ''}${where ? ' · ' + where : ''}${x.w7 ? ` · за 7 дней ${rub(x.w7, 0)}` : ''}${x.rd ? ` · визитов за 30 дней ${num(x.rd.visits)}` : ''}</div></a>`;
    }).join('')}</div></div>` };
}

export function bookAdView(a, id) {
  const b = (a.ctx().data.w_books || []).find((x) => String(x.id) === String(id));
  if (!b) return { html: '<div class="card"><p>Книга не найдена.</p><button data-act="go" data-to="/books">Все книги</button></div>' };
  const x = bookAds(a, b), c = a.ctx(), t = c.today, tab = ['ads', 'readers', 'links', 'words'].includes(a.ui.bTab) ? a.ui.bTab : 'ads';
  a.ui.kwBook = b.id; // слова — этой книги
  const TABS = [['ads', 'Реклама'], ['readers', 'Читатели'], ['links', 'Метки'], ['words', 'Слова']];
  const ads = `${x.L ? `<div class="card fl-panel"><div class="row between"><h2 style="margin:0">Запуск</h2><button class="primary" data-act="go" data-to="/launch/${esc(b.id)}">План</button></div>${launchStrip(x.L.plan)}</div>` : ''}
    <div class="card"><h2>Яндекс Директ</h2>${x.camps.length ? `<div class="list">${x.camps.map((k) => `<a class="item" href="#" data-act="go" data-to="/c/${k.id}"><div class="row between"><b>${esc(k.name)}</b>${stateDot(k)}</div>
      <div class="small muted">за 7 дней ${rub(k.w.cost, 0)} · кликов ${num(k.w.clicks)}${k.g ? ` · за 30 дней покупок ${num(k.g.conv)}${k.g.cpa != null ? ` по ${rub(k.g.cpa, 0)}` : ''}` : ''}${k.budget?.amount ? ` · бюджет ${rub(k.budget.amount, 0)}${k.budget.kind === 'week' ? ' в неделю' : ''}` : k.daily ? ` · ${rub(k.daily, 0)} в день` : ''}</div></a>`).join('')}</div>`
      : `<p class="small muted">${demo.on ? 'В примере кампании не привязаны к книгам.' : 'Кампаний этой книги пока нет. Кампания привязывается сама: из плана запуска или по названию книги в имени кампании.'}</p>`}</div>
    ${x.others.length || x.people.length ? `<div class="card"><h2>Другая реклама</h2><p class="small muted">Из «Доходов» (Литнет платит, таргет, соцсети — окупаемость считается там) и таргетологи из «Связей» Мастерской.</p><div class="list">${x.people.map((p) => `<a class="item" href="../pisatel/#/link/${esc(p.id)}"><div class="row between"><b>Таргетолог: ${esc(p.name || '')}</b><span class="small ${(p.partnerStatus || 'active') === 'active' ? 'up' : 'muted'}">● ${({ active: 'работаем', paused: 'на паузе', done: 'завершено' })[p.partnerStatus || 'active'] || ''}</span></div>${p.campaignNote ? `<div class="small muted">${esc(p.campaignNote)}</div>` : ''}</a>`).join('')}${x.others.map((k) => `<a class="item" href="../#/ad/${esc(k.id)}"><div class="row between"><b>${esc(k.name)}${k.all ? ' <span class="small muted">· на все книги</span>' : ''}</b><span class="small ${k.start <= t && (!k.end || k.end >= t) ? 'up' : 'muted'}">● ${k.start > t ? 'скоро' : !k.end || k.end >= t ? 'идёт' : 'закончилась'}</span></div>
      <div class="small muted">${esc(CH[k.channel] || '')}${k.start ? ' · ' + fmtShort(k.start) : ''}${k.end ? '–' + fmtShort(k.end) : ''}${k.budget ? ` · ${rub(k.budget, 0)}` : ''}</div></a>`).join('')}</div></div>` : ''}`;
  const readers = x.rd ? `<div class="card"><h2>Читатели за 30 дней</h2><div class="list">
      <div class="item"><b>Страница книги</b><div class="small">входов ${num(x.rd.book.visits)}${x.rd.book.cr != null ? ` · покупают ${pct(x.rd.book.cr, 1)}` : ''}${x.rd.book.bounce != null ? ` · отказы ${pct(x.rd.book.bounce, 0)}` : ''}</div></div>
      <div class="item"><b>Читалка</b><div class="small">входов ${num(x.rd.reader.visits)}${x.rd.reader.cr != null ? ` · ${pct(x.rd.reader.cr, 1)}` : ''} <span class="muted">— здесь продолжают читать, покупок меньше всегда</span></div></div></div>
      <p class="small"><button class="link" data-act="go" data-to="/an">Все читатели →</button></p></div>`
    : '<div class="card"><h2>Читатели</h2><p class="muted">Метрика пока не видела заходов на эту книгу (или счётчик не подключён — ⚙ Настройки).</p></div>';
  const links = `<div class="card"><h2>Метки и ссылки книги</h2>${x.utms.length + x.promos.length ? `<div class="list">${x.utms.map((u) => `<div class="item"><b>${esc(u.label)}</b><div class="small muted" style="word-break:break-all">${esc(u.url || '')}${u.cost ? ` · расход ${rub(u.cost, 0)}` : ''}</div></div>`).join('')}${x.promos.map((p) => `<div class="item"><b>${esc(p.name || p.url)}</b><div class="small muted">Ссылка Литнета${p.expires ? ` · действует до ${fmtShort(p.expires)}` : ''}</div></div>`).join('')}</div>` : '<p class="muted">Меток этой книги пока нет.</p>'}
      <p class="small"><button class="link" data-act="an.tabGo" data-k="links">Создать метку или добавить ссылку Литнета →</button></p></div>`;
  return {
    html: `<p><button class="link" data-act="go" data-to="/books">← Все книги</button></p>
    <div class="card"><div class="row between"><h2 style="margin:0">${esc(b.title)}</h2><span class="small muted">${STATUS[b.status || 'progress'] || ''}</span></div>
      <div class="lg-tabs an-tabs">${TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="b.tab" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="row dl-row"><button class="dl" data-act="ai.dl">${ic('download')} Скачать для нейросети</button></div></div>
    ${tab === 'readers' ? readers : tab === 'links' ? links : tab === 'words' ? keywordsView(a, { embedded: true }).html : ads}`,
  };
}
acts['b.tab'] = (d) => { window.__app.ui.bTab = d.k; };

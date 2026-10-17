// Кампания: итоги, связь с «Доходами» и вкладки — запросы, фразы, объявления, минус-фразы
import { esc, acts, forms, changes, openSheet, opt, toast, N, uid } from '../../../js/ui.js';
import { rub, num, fmtShort, fmtDate } from '../../../js/format.js';
import { addDays, outageSet } from '../../../js/calc.js';
import { lineChart } from '../../../js/charts.js';
import { totals, spendSeries, JUNK, hasNegative, goalTotals, metrikaFor, sumGoals, DEFAULT_MAX_BID } from '../dcalc.js';
import { metrikaOf } from './metrika.js';
import { pushToIncome } from '../sync.js';
import { demo } from '../demo.js';
import { stateDot, strategyText, manualBids, tiles, statLine, actBtn, runAction, q } from './common.js';

const app = () => window.__app;
const maxBid = () => Number(app().ctx().settings.direct?.maxBid) || DEFAULT_MAX_BID;
const TABS = [['queries', 'Запросы'], ['keywords', 'Фразы'], ['ads', 'Объявления'], ['minus', 'Минус-фразы']];

function queriesTab(camp, stats) {
  const rows = (stats?.queries || []).filter((x) => x.cid === camp.id);
  if (!rows.length) return '<p class="muted">Запросов пока нет: они появляются, когда объявления показываются на поиске.</p>';
  return `<p class="small muted">Что люди написали в Яндексе, когда увидели объявление, за 30 дней ${q('query')}. Лишнее — в минус: объявление перестанет показываться по таким запросам.</p>
  <div class="list">${rows.map((r) => {
    const low = r.query.toLowerCase(), j = JUNK.find(([stem, w]) => low.includes(stem) && !hasNegative(camp.negatives, w));
    return `<div class="item"><div class="row between"><span>${esc(r.query)}${j ? ` <span class="small warnc" title="${esc(j[2])}">● ${esc(j[1])}</span>` : ''}</span><button class="link" data-act="d.minusQ" data-cid="${camp.id}" data-q="${esc(r.query)}" data-w="${esc(j ? j[1] : '')}">в минус</button></div>
      <div class="small muted">${statLine(r)}</div></div>`;
  }).join('')}</div>`;
}
// «в минус» из запроса: предлагаем минус-слово (если узнали) или весь запрос — можно поправить
acts['d.minusQ'] = (d) => {
  openSheet('В минус-фразы', `<p class="small">Запрос: «${esc(d.q)}»</p>
    <label>Что не показывать</label><input name="ph" value="${esc(d.w || d.q)}" required>
    <p class="hint">Одно слово убирает все запросы с ним («бесплатно» → и «читать бесплатно», и «бесплатно полностью»). Целый запрос убирает только похожие на него. Лучше одно точное слово.</p>`, async (fd) => {
    const ph = fd.get('ph').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    if (ph.length) await runAction({ do: 'minus', campaign: Number(d.cid), phrases: ph, why: `запрос «${d.q}»` }, { confirm: false });
  }, { submitText: 'Добавить в минус' });
  return false;
};

function keywordsTab(camp, main, stats) {
  const groups = (main.groups || []).filter((g) => g.cid === camp.id);
  const kws = (main.keywords || []).filter((k) => k.cid === camp.id);
  if (!kws.length) return '<p class="muted">Ключевых фраз нет (в сетях кампании могут работать без них — по интересам).</p>';
  const manual = manualBids(camp), m = metrikaOf(app().ctx()), goalsOn = m?.counterId ? m.main : null;
  return `${manual ? '' : '<p class="small muted">У кампании автоматическая стратегия: ставки Директ подбирает сам, менять их вручную нет смысла.</p>'}
  ${groups.map((g) => {
    const list = kws.filter((k) => k.gid === g.id);
    return `<div class="d-group"><div class="row between"><b>${esc(g.name)}</b><button class="link" data-act="d.addKw" data-g="${g.id}">+ Фразы</button></div>
    ${list.length ? `<div class="list">${list.map((k) => `<div class="item ${k.state === 'SUSPENDED' ? 'faded' : ''}"><div class="row between"><span>${esc(k.phrase)}</span>${k.state === 'SUSPENDED' ? actBtn({ do: 'resume', target: 'keyword', ids: [k.id] }, 'включить') : actBtn({ do: 'pause', target: 'keyword', ids: [k.id] }, 'остановить')}</div>
      <div class="small muted">${stateDot(k, 'фраза')} · ${statLine(stats?.kw?.[k.id])}${goalsOn ? ` · покупок ${num(sumGoals(stats?.kwConv?.[k.id], goalsOn))}` : ''} · ставка ${manual ? `<button class="link" data-act="d.bid" data-id="${k.id}" data-v="${k.bid ?? ''}">${k.bid != null ? rub(k.bid, 1) : 'задать'}</button>` : 'авто'}</div></div>`).join('')}</div>` : '<p class="small muted">Фраз нет.</p>'}</div>`;
  }).join('')}`;
}
acts['d.bid'] = (d) => {
  const lim = maxBid();
  openSheet('Ставка на поиске', `<label>Ставка за клик, ₽</label><input name="v" inputmode="decimal" value="${esc(String(d.v).replace('.', ','))}" required>
    <p class="hint">Это максимум, который вы готовы платить за клик; обычно Директ списывает меньше. Предел в приложении — ${lim} ₽ (меняется в Настройках).</p>`, async (fd) => {
    const v = N(fd.get('v'));
    if (!(v > 0)) { toast('Впишите ставку числом'); return false; }
    if (v > lim) { toast(`Больше ${lim} ₽ нельзя — предел из Настроек`); return false; }
    await runAction({ do: 'bid', keyword: Number(d.id), rub: v }, { confirm: false });
  }, { submitText: 'Поставить' });
  return false;
};
acts['d.addKw'] = (d) => {
  openSheet('Новые ключевые фразы', `<label>По одной в строке</label><textarea name="v" rows="5" required placeholder="роман про истинную пару"></textarea>
    <p class="hint">Фразы — то, что читательница могла бы написать в Яндексе. Лучше 2–4 слова, без названия книги (его никто не знает).</p>`, async (fd) => {
    const ph = fd.get('v').split('\n').map((x) => x.trim()).filter(Boolean);
    if (ph.length) await runAction({ do: 'keywords', group: Number(d.g), phrases: ph }, { confirm: false });
  }, { submitText: 'Добавить' });
  return false;
};

function adsTab(camp, main) {
  const ads = (main.ads || []).filter((x) => x.cid === camp.id && x.state !== 'ARCHIVED');
  if (!ads.length) return '<p class="muted">Объявлений нет.</p>';
  return `<p class="small muted">Тексты меняются в кабинете Директа (после правки объявление снова проходит модерацию). Попросите ИИ-помощника предложить варианты.</p>
  <div class="list">${ads.map((x) => `<div class="item d-ad ${x.state === 'SUSPENDED' ? 'faded' : ''}"><div class="row between">${stateDot(x, 'объявление')}${x.state === 'SUSPENDED' ? actBtn({ do: 'resume', target: 'ad', ids: [x.id] }, 'включить') : actBtn({ do: 'pause', target: 'ad', ids: [x.id] }, 'остановить')}</div>
    <div class="d-ad-t">${esc(x.title)}${x.title2 ? ` — ${esc(x.title2)}` : ''}</div><div class="d-ad-u small">${esc(x.href.replace(/^https?:\/\//, '').slice(0, 60))}</div><div class="small">${esc(x.text)}</div>
    ${x.note ? `<div class="small ${x.status === 'REJECTED' ? 'down' : 'muted'}">${esc(x.note)}</div>` : ''}</div>`).join('')}</div>`;
}

function minusTab(camp) {
  const n = camp.negatives || [];
  return `<p class="small muted">${n.length ? `Сейчас ${num(n.length)}.` : 'Пока нет.'} ${q('minus')}</p>
  ${n.length ? `<div class="chips">${n.map((p) => `<span class="chip">${esc(p)} ${actBtn({ do: 'unminus', campaign: camp.id, phrases: [p] }, '×', 'link d-x')}</span>`).join('')}</div>` : ''}
  <form data-form="d.minus" data-cid="${camp.id}" class="d-addminus"><label>Добавить (через запятую или с новой строки)</label><textarea name="v" rows="2" placeholder="бесплатно, скачать"></textarea><div class="row"><button class="primary" type="submit">Добавить в минус</button></div></form>`;
}
forms['d.minus'] = async (fd, f) => {
  const ph = fd.get('v').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  if (ph.length) await runAction({ do: 'minus', campaign: Number(f.dataset.cid), phrases: ph });
};

// Связь с кампанией в «Доходах»: туда уходит расход по неделям, там видна окупаемость
function incomeLink(camp, c) {
  if (demo.on) return '<p class="small muted">Свяжите кампанию с «Доходами» — там будет видно, окупается ли она продажами.</p>';
  const links = c.settings.direct?.links || {}, cur = links[camp.id] || '';
  const own = c.data.campaigns.filter((k) => !k.oneOff).sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  return `<div class="row d-link"><label class="small" for="dl${camp.id}">В «Доходах»:</label><select id="dl${camp.id}" data-chg="d.link" data-cid="${camp.id}"><option value="">не связана</option>${own.map((k) => opt(k.id, k.name, cur)).join('')}<option value="+">+ Создать там кампанию</option></select></div>
  <p class="small muted">${cur ? 'Расход по неделям уходит в «Доходы» сам — там видно, окупается ли кампания продажами.' : 'Свяжите — и «Доходы» сами посчитают, окупается ли кампания продажами.'}</p>`;
}
changes['d.link'] = async (v, el) => {
  const a = app(), c = a.ctx(), cid = el.dataset.cid, camp = a.snap('main').campaigns.find((x) => String(x.id) === cid);
  let id = v;
  if (v === '+') {
    id = 'k' + uid();
    await a.store.put('campaigns', { id, name: 'Директ: ' + camp.name, bookId: '', scope: 'all', channel: 'own', start: camp.start || c.today, end: '', budget: null, paidAt: '', baseMode: 'auto' });
  }
  await a.store.saveSettings({ direct: { ...(c.settings.direct || {}), links: { ...(c.settings.direct?.links || {}), [cid]: id } } });
  await pushToIncome(a, a.snap('stats')?.daily || []);
  toast(id ? 'Связано с «Доходами»' : 'Связь убрана');
};

// Покупки по целям и поведение на странице книги (Метрика) — за 30 дней
function goalLine(camp, c, daily, stats) {
  const mk = metrikaOf(c);
  if (!mk?.counterId) return '';
  if (Array.isArray(camp.counters) && !camp.counters.map(Number).includes(Number(mk.counterId))) return `<p class="small warnc">Счётчик Метрики не привязан к кампании — Директ не видит покупки. ${actBtn({ do: 'counter', campaign: camp.id, counter: mk.counterId, why: 'чтобы Директ видел покупки' }, 'Привязать')}</p>`;
  const t = c.today, g = goalTotals(daily, stats?.conv || [], addDays(t, -29), t, { cid: camp.id, goals: mk.main, skip: outageSet(c.data.days || []) });
  const mr = metrikaFor(stats?.mrows || [], camp);
  return `<div class="small">За 30 дней: покупок ${q('conv')} <b>${num(g.conv)}</b>${g.cpa != null ? ` · цена покупки ${q('cpa')} <b>${rub(g.cpa, 0)}</b>` : ''}${g.cr != null && g.conv ? ` · из 100 кликов ${String(Math.round(g.cr * 1000) / 10).replace('.', ',')}` : ''}</div>
    ${mr ? `<div class="small muted">На странице книги (Метрика): визитов ${num(mr.visits)} · отказы ${q('bounce')} ${Math.round(mr.bounce * 100)} % · ${String(mr.depth).replace('.', ',')} стр. · ${Math.floor(mr.dur / 60)} мин ${mr.dur % 60} с</div>` : ''}`;
}

export function campaignView(a, id) {
  const c = a.ctx(), main = a.snap('main'), stats = a.snap('stats');
  const camp = main?.campaigns?.find((x) => x.id === id);
  if (!camp) return { html: '<div class="card"><p>Кампания не найдена.</p><button data-act="go" data-to="/">На обзор</button></div>' };
  const t = c.today, daily = stats?.daily || [], tab = a.ui.cTab || 'queries';
  const w = totals(daily, addDays(t, -6), t, id), m = totals(daily, addDays(t, -29), t, id);
  return {
    html: `<p><button class="link" data-act="go" data-to="/">← Все кампании</button></p>
    <div class="card"><div class="row between"><h2 style="margin:0">${esc(camp.name)}</h2>${stateDot(camp)}</div>
      <div class="small muted">${[camp.start && 'старт ' + fmtDate(camp.start), camp.daily && `лимит ${rub(camp.daily, 0)} в день`, strategyText(camp.strategy)].filter(Boolean).join(' · ')}</div>
      ${tiles(w, 'за 7 дней')}
      <div class="small muted">За 30 дней: ${rub(m.cost, 0)} · кликов ${num(m.clicks)}${m.cpc != null ? ` · клик ${rub(m.cpc, 1)}` : ''}</div>
      ${goalLine(camp, c, daily, stats)}
      <div class="chart" id="dCamp"></div>
      ${incomeLink(camp, c)}
      <div class="row">${camp.state === 'SUSPENDED' ? actBtn({ do: 'resume', target: 'campaign', ids: [camp.id] }, 'Запустить кампанию', '') : camp.state === 'ON' ? actBtn({ do: 'pause', target: 'campaign', ids: [camp.id] }, 'Остановить кампанию', '') : ''}</div></div>
    <div class="card"><div class="chips">${TABS.map(([k, l]) => `<button class="chip ${tab === k ? 'on' : ''}" data-act="d.tab" data-k="${k}">${l}</button>`).join('')}</div>
      ${tab === 'keywords' ? keywordsTab(camp, main, stats) : tab === 'ads' ? adsTab(camp, main) : tab === 'minus' ? minusTab(camp) : queriesTab(camp, stats)}</div>`,
    after() {
      const el = document.getElementById('dCamp');
      if (el) lineChart(el, { points: spendSeries(daily, t, 30, id).map((x) => ({ label: fmtShort(x.date), value: x.value })), fmtVal: (v) => rub(v, 0), height: 130 });
    },
  };
}
acts['d.tab'] = (d) => { app().ui.cTab = d.k; };

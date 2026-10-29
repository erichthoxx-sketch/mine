// ИИ-помощник: «пакет» со всеми данными для любой нейросети и разбор её ответа в понятные действия с галочками
import { esc, acts, forms, changes, toast, download, openSheet } from '../../../js/ui.js';
import { addDays, outageSet } from '../../../js/calc.js';
import { ic } from '../../../js/icons.js';
import { aiPackage, parsePlan, describe, totals, adFatigue, auditCampaign, spendAdvice, DEFAULT_MAX_BID, DEFAULT_TEST_BUDGET, PLAN_TAG } from '../dcalc.js';
import { namesOf } from '../sync.js';
import { logOf } from '../demo.js';
import { runAction } from './common.js';
import { metrikaOf } from './metrika.js';
import { resolvedLaunch } from './launchctx.js';
import { royaltyPerSale } from '../mcalc.js';

const app = () => window.__app;
const plan = { text: '', actions: [], errors: [], pick: [], done: {} };

// Всё, что нужно ИИ, — компактно: кампании, фразы со статистикой, объявления, запросы, расход по дням, что уже меняли
// cid — только одна кампания (её группы, фразы, объявления, запросы, расход, покупки, разбор приложения)
export function packageText(a, question = '', { cid = null } = {}) {
  const c = a.ctx(), d = c.settings.direct || {}, t = c.today;
  const one = (arr, k = 'cid') => (cid == null ? arr : (arr || []).filter((x) => x[k] === cid));
  const m0 = a.snap('main') || {}, s0 = a.snap('stats') || {};
  const main = cid == null ? m0 : { ...m0, campaigns: one(m0.campaigns, 'id'), groups: one(m0.groups), keywords: one(m0.keywords), ads: one(m0.ads) };
  const kwIds = new Set((main.keywords || []).map((k) => String(k.id)));
  const stats = cid == null ? s0 : { ...s0, daily: one(s0.daily), adDaily: one(s0.adDaily), queries: one(s0.queries), conv: one(s0.conv), mrows: one(s0.mrows), kwConv: Object.fromEntries(Object.entries(s0.kwConv || {}).filter(([k]) => kwIds.has(k))) };
  const daily = (stats.daily || []).filter((x) => x.date >= addDays(t, -29));
  const { plan: lp } = resolvedLaunch(a), skip = outageSet(c.data.days || []), m = metrikaOf(c);
  const value = Number(d.econ?.rev) || lp.royalty || royaltyPerSale(c.data.sales || [], t)?.perSale || null;
  const state = {
    ...(main.campaigns ? {} : { note: 'Директ ещё не подключён: данных кампаний нет. Помоги по вопросу владелицы и объясни, как настроить кампанию с нуля для книги.' }),
    books: (c.data.books || []).map((b) => b.title).filter(Boolean),
    campaigns: (main.campaigns || []).filter((x) => x.state !== 'ARCHIVED').map((x) => ({ ...x, last7: totals(daily, addDays(t, -6), t, x.id), last30: totals(daily, addDays(t, -29), t, x.id) })),
    groups: main.groups || [],
    keywords: (main.keywords || []).map((k) => ({ ...k, stats30: stats.kw?.[k.id] || null })),
    ads: (main.ads || []).filter((x) => x.state !== 'ARCHIVED'),
    searchQueries30: (stats.queries || []).slice(0, 150),
    dailySpend30: daily.map(({ date, cid, impr, clicks, cost }) => ({ date, cid, impr, clicks, cost })),
    ...(metrikaOf(c)?.counterId ? {
      metrika: { counter: metrikaOf(c).counterName, goals: metrikaOf(c).goals, mainGoals: metrikaOf(c).main },
      conversionsDaily30: (stats.conv || []).filter((x) => x.date >= addDays(t, -29)),
      keywordConversions30: stats.kwConv || {},
      pageBehavior30: stats.mrows || [],
    } : {}),
    ...(a.snap('mk') ? { metrikaSite: ((mk) => ({ note: 'Метрика автора на Литнете за 30 дней: источники, устройства, страницы входа; по дням — 8 недель', sources: mk.sources, devices: mk.devices, pages: (mk.pages || []).slice(0, 10), daily: (mk.daily || []).map(({ key, visits, bounce, goals }) => ({ date: key, visits, bounce, goals })) }))(a.snap('mk')) } : {}),
    // выгорание: CTR и цена клика в дни 3–16 показов против последних 7 дней, отдельно поиск (s) и сети (n)
    adFatigue: adFatigue(stats.adDaily || [], t, { skip: outageSet(c.data.days || []) }).map((f) => ({ ad: f.aid, cid: f.cid, net: f.net, days: f.age, state: f.state, ctrFirst: f.base.ctr, ctrLast7: f.rec.ctr, cpcFirst: f.base.cpc, cpcLast7: f.rec.cpc, imprLast7: f.rec.impr })),
    // план запуска книги: фаза, даты, цели и деньги — чтобы советы были про текущий этап
    launch: { book: lp.book, phase: lp.phase, firstChapter: lp.pubDate || null, subscriptionStart: lp.subDate || null, bookUrl: lp.bookUrl || null, goals: { library: lp.lib?.name || null, purchase: lp.buy?.name || null }, royaltyPerSale: lp.royalty, libraryValue: lp.libValue, money: lp.money, todo: (lp.steps[lp.phase] || []).filter((x) => !x.ok).map((x) => x.text) },
    ...(main.campaigns?.length ? { appAudit: (main.campaigns || []).filter((x) => x.state !== 'ARCHIVED').map((camp) => ({ campaign: camp.id, name: camp.name,
      items: auditCampaign({ camp, main, stats, log: logOf(a), today: t, econ: { ...(d.econ || {}), perSale: value }, m, goalHs: [], skip }).items.map((x) => ({ status: x.status, area: x.area, title: x.title, why: x.why })),
      spend: spendAdvice({ camp, daily: stats.daily || [], conv: stats.conv || [], today: t, goals: m?.main || null, skip, value }) })) } : {}),
    outageDays: [...outageSet(c.data.days || [])].filter((x) => x >= addDays(t, -29)).sort(),
    recentChanges: logOf(a).slice().sort((x, y) => y.at.localeCompare(x.at)).slice(0, 20).map((x) => ({ at: x.at.slice(0, 10), what: x.text, why: x.why, ok: x.ok })),
  };
  return aiPackage(state, { today: t, maxBid: Number(d.maxBid) || DEFAULT_MAX_BID, budget: { test: Number(d.testBudget) || DEFAULT_TEST_BUDGET, from: d.testFrom || null }, question });
}

export function aiView(a) {
  const names = namesOf(a.snap('main'));
  const has = !!a.snap('main');
  return {
    html: `<p class="small"><button class="link" data-act="go" data-to="/">← Реклама</button></p>
    <div class="card"><h2>Ответ нейросети с планом действий</h2>
      <p class="small muted">По желанию: скопируйте ответ Claude целиком и вставьте сюда — приложение найдёт в нём план (блок ${esc(PLAN_TAG)}) и покажет каждое действие с галочкой. Применится только то, что вы отметите.</p>
      <form data-form="ai.parse"><textarea name="v" rows="5" placeholder="Вставьте сюда ответ нейросети">${esc(plan.text)}</textarea><div class="row"><button type="submit">Разобрать</button></div></form>
      ${plan.errors.length ? `<div class="alert">${plan.errors.map(esc).join('<br>')}</div>` : ''}
      ${plan.actions.length ? `<div class="list">${plan.actions.map((x, i) => {
        const r = plan.done[i];
        return `<label class="item row d-pick"><input type="checkbox" data-chg="ai.pick" data-i="${i}" ${plan.pick[i] ? 'checked' : ''} ${r ? 'disabled' : ''}><span><b>${esc(describe(x, names))}</b>${x.why ? `<span class="sub">${esc(x.why)}</span>` : ''}${r ? `<span class="sub ${r.ok ? 'up' : 'down'}">${r.ok ? '✓ применено' : '✗ ' + esc(r.err)}</span>` : ''}</span></label>`;
      }).join('')}</div>
      <div class="row"><button class="primary" data-act="ai.apply"${plan.pick.some((p, i) => p && !plan.done[i]) ? '' : ' disabled'}>Применить отмеченное</button><button class="link" data-act="ai.clear">Очистить</button></div>` : ''}</div>
    <div class="card"><h2>Как это устроено</h2><p class="small">ИИ видит только то, что вы ему вставили, и сам в кабинет не заходит. Изменения делает приложение — и только после вашей галочки. Бюджет не меняет никто, кроме вас: дневной лимит ставится в кабинете Директа. Все изменения записываются в «Историю».</p></div>`,
  };
}
const q = () => document.getElementById('aiQ')?.value.trim() || '';
// Готовые вопросы — подставляются в поле одним нажатием
const ASKS = [
  ['Недельный аудит', 'Проведи недельный аудит всех кампаний: что работает, что сливает деньги, 3 главных действия с наибольшим эффектом и что подождать.'],
  ['Утечки бюджета', 'Найди, куда утекает бюджет без результата: запросы, фразы, сети. Что убрать в минус и что остановить.'],
  ['Новые фразы', 'По поисковым запросам и тропам книги предложи новые точные фразы по группам и кросс-минусовку.'],
  ['Тексты объявлений', 'Предложи по 3 варианта объявлений для каждой группы с гипотезой теста (списком, не действиями).'],
  ['Итоги теста', 'Подведи итоги теста: окупилось ли, что сработало, что нет, и план на следующие 2 недели.'],
];
acts['ai.ask'] = (d) => { const el = document.getElementById('aiQ'); if (el) el.value = ASKS[Number(d.i)][1]; return false; };
// Скопировать данные и открыть чат: сначала копирование (пока страница в фокусе), потом новая вкладка
export const CHATS = { claude: ['Claude', 'https://claude.ai/new'], chatgpt: ['ChatGPT', 'https://chatgpt.com/'] };
export async function sendToChat(text, to = 'claude') {
  let copied;
  try { copied = navigator.clipboard.writeText(text); } catch { copied = Promise.reject(); }
  window.open(CHATS[to][1], '_blank', 'noopener');
  try { await copied; toast(`Скопировано — вставьте в ${CHATS[to][0]} и отправьте`); } catch { toast('Не получилось скопировать — нажмите «Скачать файлом» и приложите файл в чат'); }
}
acts['ai.chat'] = (d) => { sendToChat(packageText(app(), q()), d.to); return false; };
acts['ai.copy'] = async () => {
  try { await navigator.clipboard.writeText(packageText(app(), q())); toast('Скопировано — вставьте в чат с ИИ'); } catch { toast('Не получилось скопировать — нажмите «Скачать файлом»'); }
  return false;
};
acts['ai.file'] = async () => { await download(`direkt_dlya_ii_${app().ctx().today}.md`, packageText(app(), q()), 'text/markdown'); return false; };
forms['ai.parse'] = (fd) => {
  const r = parsePlan(fd.get('v'), { maxBid: Number(app().ctx().settings.direct?.maxBid) || DEFAULT_MAX_BID });
  Object.assign(plan, { text: fd.get('v'), actions: r.actions, errors: r.errors, pick: r.actions.map(() => true), done: {} });
  if (r.actions.length) toast(`Нашла действий: ${r.actions.length}`);
  app().rerender();
};
changes['ai.pick'] = (v, el, on) => { plan.pick[el.dataset.i] = on; app().rerender(); };
acts['ai.clear'] = () => { Object.assign(plan, { text: '', actions: [], errors: [], pick: [], done: {} }); };
acts['ai.apply'] = async () => {
  for (let i = 0; i < plan.actions.length; i++) {
    if (!plan.pick[i] || plan.done[i]) continue;
    try {
      const r = await runAction(plan.actions[i], { by: 'ai', confirm: false });
      plan.done[i] = r.errors.length ? { ok: false, err: r.errors.join('; ') } : { ok: true };
    } catch (e) { plan.done[i] = { ok: false, err: e.message || String(e) }; }
  }
  const bad = Object.values(plan.done).filter((x) => !x.ok).length;
  toast(bad ? `Готово, но ${bad} не применилось — причины в списке` : 'Всё применено');
};

// «Скачать для нейросети»: один файл со всем нужным (весь аккаунт или одна кампания) — приложить в любой чат и спросить своими словами
const DL_ASKS = [
  ['Разбор', 'Разбери эту рекламу: что работает, что сливает деньги, три самых полезных шага сейчас и что пока подождать.'],
  ['Настройка запуска', 'Помоги настроить кампанию под текущий этап запуска книги: цели, стратегия, бюджет по неделям, объявления и фразы.'],
  ['Объявления', 'Предложи по 3 варианта объявлений (заголовок до 56 знаков, текст до 81) с гипотезой, что проверяет каждый.'],
  ['Минус-слова и фразы', 'Найди по запросам и фразам, что убрать в минус и что остановить, и какие точные фразы добавить.'],
  ['Окупаемость', 'Окупается ли реклама: цена покупателя против дохода с покупки, урезать или добавлять расход и на сколько.'],
];
acts['ai.dl'] = (d) => {
  const a = app(), cid = d.cid ? Number(d.cid) : null, camp = cid ? (a.snap('main')?.campaigns || []).find((x) => x.id === cid) : null;
  openSheet('Для нейросети', `<p class="small">Файл со всеми данными ${camp ? `кампании «${esc(camp.name)}»` : 'рекламы и запуска книги'}: цифры, запросы, объявления, покупки, разбор приложения. Приложите его в любой чат — Claude, ChatGPT — и спросите.</p>
    <label for="dlQ">Вопрос (можно пусто — будет общий разбор)</label><textarea id="dlQ" name="q" rows="3"></textarea>
    <div class="chips ai-tasks">${DL_ASKS.map(([t], i) => `<button type="button" class="chip" data-act="ai.dlAsk" data-i="${i}">${t}</button>`).join('')}</div>
    <div class="row dl-row"><button type="button" class="dl" data-act="ai.dlCopy" data-cid="${cid || ''}">${ic('copy')} Скопировать текст</button><button type="button" class="dl" data-act="ai.dlPlan">Вставить ответ с планом действий</button></div>`,
  async (fd) => {
    const name = camp ? camp.name : 'reklama';
    await download(`direkt_${name}_${a.ctx().today}.md`, packageText(a, String(fd.get('q') || '').trim(), { cid }), 'text/markdown');
  }, { submitText: 'Скачать файл' });
  return false;
};
acts['ai.dlAsk'] = (d) => { const el = document.getElementById('dlQ'); if (el) el.value = DL_ASKS[Number(d.i)][1]; return false; };
acts['ai.dlCopy'] = async (d) => {
  const q = document.getElementById('dlQ')?.value.trim() || '';
  try { await navigator.clipboard.writeText(packageText(app(), q, { cid: d.cid ? Number(d.cid) : null })); toast('Скопировано — вставьте в чат'); } catch { toast('Не получилось скопировать — скачайте файлом'); }
  return false;
};
acts['ai.dlPlan'] = () => { document.getElementById('sheet')?.close(); app().go('/ai'); return false; };

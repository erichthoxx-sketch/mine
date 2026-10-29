// Первый самостоятельный рекламный тест: план и расчёты. Никаких действий в Директе.
import { goalTotals } from './dcalc.js';

export const FIRST_LAUNCH = {
  book: 'Развод для черной вдовы',
  prepDate: '2026-11-01',
  publicationDate: '2026-11-09',
  subscriptionDate: '',
  subscriptionOpen: false,
  bookUrl: '',
  budget: 10000,
  royalty: '',
  hypothesis: '',
  creativeReady: false,
  goalVerified: false,
  limitVerified: false,
  campaignId: '',
  actualStart: '',
};

export const firstLaunchOf = (settings = {}) => ({ ...FIRST_LAUNCH, ...(settings.direct?.firstLaunch || {}) });
const paidName = (name = '') =>
  /покуп|оплат|купил|purchase|payment|paid/i.test(name)
  && !/начал|начат|start|begin|корзин/i.test(name);

// Главная цель должна быть одной покупкой, а не суммой «начала покупки» + «покупки».
export function purchaseGoal(m = null) {
  const main = (m?.main || []).map(String);
  if (main.length !== 1) return null;
  const goal = (m?.goals || []).find((g) => String(g.id) === main[0]);
  return goal && paidName(goal.name) ? goal : null;
}

export function launchReadiness(cfg, { today, campaigns = [], metrika = null } = {}) {
  const goal = purchaseGoal(metrika);
  const picked = campaigns.find((x) => String(x.id) === String(cfg.campaignId));
  const checks = [
    { id: 'subscription', ok: !!cfg.subscriptionOpen && !!cfg.subscriptionDate && cfg.subscriptionDate <= today, label: 'Открыта платная подписка (4–5 глав)' },
    { id: 'goal', ok: !!goal && !!cfg.goalVerified, label: 'Подтверждена цель настоящей оплаты в Метрике' },
    { id: 'creative', ok: !!String(cfg.hypothesis || '').trim() && !!cfg.creativeReady, label: 'Составлена гипотеза и подготовлено объявление' },
    { id: 'limit', ok: !!cfg.limitVerified && Number(cfg.budget) > 0, label: 'Проверен лимит расходов в кабинете Директа' },
    { id: 'campaign', ok: !!picked && picked.state === 'ON', label: 'Выбрана действующая собственная кампания' },
  ];
  return { ready: checks.every((x) => x.ok), checks, goal, picked };
}

// Статистика теста строго по выбранной кампании с фактической даты ее старта.
// Не использует старые кампании, всю Метрику сайта или продажи от сторонних таргетологов.
export function launchMetrics(cfg, { daily = [], conv = [], today, goalId = null } = {}) {
  const budget = Number(cfg.budget) > 0 ? Number(cfg.budget) : 10000;
  const start = cfg.actualStart;
  if (!start || !cfg.campaignId || !today || today < start) {
    return { budget, spent: 0, balance: budget, clicks: 0, conversions: null, cpa: null, estimate: null, estimatedProfit: null, dataReady: false };
  }
  const from = start;
  const cid = Number(cfg.campaignId);
  const totals = goalTotals(daily, goalId ? conv : [], from, today, { cid, goals: goalId ? [goalId] : [] });
  const royalty = Number(cfg.royalty);
  const estimate = goalId && royalty > 0 ? totals.conv * royalty : null;
  return {
    budget, spent: totals.cost, balance: Math.max(0, budget - totals.cost),
    clicks: totals.clicks, conversions: goalId ? totals.conv : null, cpa: goalId ? totals.cpa : null,
    estimate, estimatedProfit: estimate == null ? null : Math.round((estimate - totals.cost) * 100) / 100,
    dataReady: true,
  };
}

// ---------- план запуска по фазам: подготовка → бесплатные главы → подписка ----------
// Даты берутся сами: публикация — из Мастерской (w_books.publishStart), старт подписки и ссылка на Литнет — с сайта
// (книга в админке: «Дата старта подписки», поле «Литнет»); то, что владелица вписала в плане, — главнее.
const libName = (name = '') => /библиотек/i.test(name);
export const libraryGoal = (m = null) => (m?.goals || []).find((g) => libName(g.name)) || null;
export const buyGoal = (m = null) => (m?.goals || []).find((g) => paidName(g.name)) || null;
const norm = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
const sameBook = (a, b) => !!norm(a) && norm(a) === norm(b);
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const addD = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// Ценность добавления в библиотеку: какая доля добавивших потом покупает (по Метрике автора за 30 дней) × доход с покупки
export function libraryValue({ libN = 0, buyN = 0, royalty = 0 } = {}) {
  if (!(royalty > 0)) return null;
  const share = libN >= 30 && buyN > 0 ? Math.min(0.6, buyN / libN) : 0.15; // мало данных — осторожно: 15 %
  return { share, value: Math.max(1, Math.round(royalty * share)), measured: libN >= 30 && buyN > 0 };
}

export const PHASES = [
  { id: 'prep', name: 'Подготовка' },
  { id: 'free', name: 'Бесплатные главы' },
  { id: 'paid', name: 'Подписка' },
];

export function launchPlan(cfg, { today, wbooks = [], siteBooks = [], metrika = null, campaigns = [], royalty = null, mkTotals = null } = {}) {
  const wb = wbooks.find((b) => sameBook(b.title, cfg.book)) || null;
  const sb = siteBooks.find((b) => sameBook(b.title, cfg.book)) || null;
  const pubDate = cfg.publicationDate && cfg.pubManual ? cfg.publicationDate : wb?.publishStart || cfg.publicationDate || '';
  const subDate = cfg.subscriptionDate || sb?.startDate || '';
  const bookUrl = cfg.bookUrl || sb?.litnet || '';
  const src = { pub: cfg.pubManual ? 'plan' : wb?.publishStart ? 'workshop' : 'plan', sub: cfg.subscriptionDate ? 'plan' : sb?.startDate ? 'site' : '', url: cfg.bookUrl ? 'plan' : sb?.litnet ? 'site' : '' };
  const phase = !pubDate || today < pubDate ? 'prep' : subDate && today >= subDate ? 'paid' : 'free';
  const lib = libraryGoal(metrika), buy = buyGoal(metrika);
  const roy = Number(cfg.royalty) > 0 ? Number(cfg.royalty) : royalty > 0 ? royalty : null;
  const lv = libraryValue({ libN: mkTotals?.lib || 0, buyN: mkTotals?.buy || 0, royalty: roy });
  // деньги: на бесплатные главы — треть бюджета (не больше), остальное — на подписку (примерно 3 недели)
  const budget = Number(cfg.budget) > 0 ? Number(cfg.budget) : 10000;
  const freeDays = pubDate && subDate ? Math.max(1, dayDiff(pubDate, subDate)) : 14;
  const freeBudget = Math.round(budget * 0.33 / 100) * 100, paidBudget = budget - freeBudget;
  const money = { budget, freeDays, freeBudget, paidBudget, freeWeek: Math.round(freeBudget / freeDays * 7 / 10) * 10, paidWeek: Math.round(paidBudget / 3 / 10) * 10 };
  const picked = campaigns.find((x) => String(x.id) === String(cfg.campaignId)) || null;
  const step = (id, ok, text, how = '') => ({ id, ok: !!ok, text, how });
  const steps = {
    prep: [
      step('goals', lib && buy, 'Цели в Метрике: «Добавление в библиотеку» и «Покупка»', lib && buy ? '' : 'Отметьте обе цели в ⚙ Настройках → «Яндекс Метрика».'),
      step('url', /litnet\.com\//.test(bookUrl), 'Ссылка на книгу на Литнете', 'Появится после создания книги на Литнете: впишите её на сайте (админка → книга → «Литнет») — приложение возьмёт сама.'),
      step('campaign', picked, 'Кампания-черновик в Директе', 'Ниже — конструктор: кампания, группа, объявление и фразы без запуска.'),
      step('creative', cfg.creativeReady, 'Объявления: 2–3 варианта заголовка и обложка для сетей'),
      step('limit', cfg.limitVerified, `Недельный бюджет в Директе ≈ ${money.freeWeek} ₽ на время бесплатных глав`),
    ],
    free: [
      step('start', cfg.actualStart, 'Кампания включена в день первой главы', 'Включите кампанию в кабинете и отметьте дату ниже.'),
      step('goal', cfg.goalVerified, `Цель кампании — «${lib?.name || 'Добавление в библиотеку'}»${buy ? `, вторая — «${buy.name}»` : ''}`, 'В кабинете: кампания → стратегия → целевые действия.'),
      step('limit', cfg.limitVerified, `Недельный бюджет ≈ ${money.freeWeek} ₽`),
    ],
    paid: [
      step('switch', cfg.buySwitched, `Главная цель — «${buy?.name || 'Покупка книги'}»`, 'В день старта подписки: стратегия → целевые действия → покупка главной (библиотеку можно оставить второй).'),
      step('limit2', cfg.limit2Verified, `Недельный бюджет ≈ ${money.paidWeek} ₽ на подписку`),
    ],
  };
  const next = phase === 'prep' ? { date: pubDate, text: 'первая глава — включаем рекламу' } : phase === 'free' ? { date: subDate, text: subDate ? 'старт подписки — меняем цель на покупку' : 'дата старта подписки ещё не известна' } : { date: subDate ? addD(subDate, 14) : '', text: 'две недели подписки — подводим итоги' };
  return { book: cfg.book, wb, sb, pubDate, subDate, bookUrl, src, phase, lib, buy, royalty: roy, libValue: lv, money, picked, steps, next, daysToNext: next.date ? dayDiff(today, next.date) : null };
}

// Даты для Планера Мастерской (и оттуда — в Todoist)
export function launchMilestones(p) {
  const out = [], add = (date, title, sub) => { if (date) out.push({ date, title, sub }); };
  const b = `«${p.book}»`;
  if (p.pubDate) { add(addD(p.pubDate, -3), `Реклама ${b}: проверить черновик кампании`, 'Директ → Реклама → план запуска'); add(p.pubDate, `Включить рекламу ${b}`, 'цель — добавление в библиотеку'); }
  if (p.subDate) { add(p.subDate, `Реклама ${b}: цель — покупка`, 'старт подписки: сменить главную цель в Директе'); add(addD(p.subDate, 14), `Итоги рекламы ${b}`, 'Директ → Реклама: окупаемость и что дальше'); }
  return out;
}

// Актуальная книга для запуска: самая новая из начатых или начинающихся в ближайшие 45 дней (по первой главе в Мастерской).
// Новая книга подходит к старту — карточка сама переключается на неё; прошлый план уходит в архив (pastLaunches).
export function pickLaunchBook(wbooks = [], today) {
  const soon = addD(today, 45);
  const list = wbooks.filter((b) => b?.title && b.publishStart && b.publishStart <= soon && (b.status || 'progress') !== 'idea')
    .sort((x, y) => y.publishStart.localeCompare(x.publishStart));
  return list[0]?.title || null;
}
// Новый план для другой книги: бюджет и доход с покупки переносятся, остальное — с нуля
export const freshLaunch = (prev, book) => ({ ...FIRST_LAUNCH, prepDate: '', publicationDate: '', budget: prev.budget || FIRST_LAUNCH.budget, book });
export { sameBook };

// План текущего запуска с учётом актуальной книги (для Директа и Планера Мастерской); switched — книга сменилась
export function currentLaunch(settings, wbooks = [], today) {
  const fl = firstLaunchOf(settings);
  const auto = fl.bookManual ? null : pickLaunchBook(wbooks, today);
  const pubOf = (t) => wbooks.find((b) => sameBook(b.title, t))?.publishStart || '';
  const curPub = pubOf(fl.book) || fl.publicationDate || '';
  if (auto && !sameBook(auto, fl.book) && pubOf(auto) > curPub) return { cfg: freshLaunch(fl, auto), switched: auto };
  return { cfg: fl, switched: null };
}

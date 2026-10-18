// Пример данных: пока Директ не подключён, приложение можно посмотреть и потренироваться.
// Пример живёт только в памяти страницы — в базу (и в «Доходы») не попадает.
import { addDays } from '../../js/calc.js';

export const demo = { on: false, docs: {}, log: [] };
export const isDemo = () => demo.on;

// Документ d_snap: из примера или из базы
export function snap(app, id) { return demo.on ? demo.docs[id] : app.ctx().data.d_snap.find((x) => x.id === id); }
export async function putSnap(app, docs) {
  if (!demo.on) return app.store.putMany('d_snap', docs);
  for (const d of docs) demo.docs[d.id] = d;
  app.rerender();
}
export const logOf = (app) => (demo.on ? demo.log : app.ctx().data.d_log);
export async function putLog(app, item) {
  if (!demo.on) return app.store.put('d_log', item);
  demo.log.push(item); app.rerender();
}

// История примера: правка неделю назад — чтобы в «Учёбе» было видно, как разбирается её эффект
export function demoLog(today) {
  return [{ id: 'l-demo', at: addDays(today, -6) + 'T10:00:00.000Z', by: 'app', do: 'minus', cid: 701, text: 'Кампания «Книга — поиск»: добавить минус-фразы — скачать, fb2', why: 'ищут файл для скачивания', ok: true, errors: [], warnings: [], demo: true }];
}

// Псевдослучайные, но одинаковые при каждом открытии числа
function rnd(seed) { let x = seed; return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; }

export function demoSnapshot(today) {
  const r = rnd(42);
  const campaigns = [
    { id: 701, name: 'Книга — поиск', state: 'ON', status: 'ACCEPTED', type: 'TEXT_CAMPAIGN', start: addDays(today, -40), daily: 400, negatives: ['скачать', 'fb2'], strategy: { search: 'HIGHEST_POSITION', network: 'SERVING_OFF' }, counters: [555] },
    { id: 702, name: 'Книга — сети', state: 'ON', status: 'ACCEPTED', type: 'TEXT_CAMPAIGN', start: addDays(today, -12), daily: 200, negatives: [], strategy: { search: 'SERVING_OFF', network: 'MAXIMUM_COVERAGE' }, counters: [] },
  ];
  const groups = [{ id: 801, name: 'Любовное фэнтези', cid: 701 }, { id: 802, name: 'Похожие книги', cid: 701 }, { id: 803, name: 'Читательницы романов', cid: 702 }];
  const P = [
    [901, 'любовное фэнтези читать', 801, 14], [902, 'роман про истинную пару', 801, 11], [903, 'книги про драконов любовь', 801, 9],
    [904, 'литнет любовное фэнтези', 802, 16], [905, 'читать романы онлайн', 802, 7], [906, 'попаданка в другой мир', 801, 12],
    [907, 'любовный роман', 803, null], [908, 'фэнтези книги', 803, null],
  ];
  const keywords = P.map(([id, phrase, gid, bid]) => ({ id, phrase, gid, cid: groups.find((g) => g.id === gid).cid, bid, state: 'ON', status: 'ACCEPTED' }));
  const ads = [
    { id: 1001, gid: 801, cid: 701, state: 'ON', status: 'ACCEPTED', note: '', title: 'Истинная пара для дракона', title2: 'Новый роман — читать на Литнете', text: 'Она сбежала со свадьбы, он нашёл её по запаху. Первые главы бесплатно.', href: 'https://litnet.com/' },
    { id: 1002, gid: 802, cid: 701, state: 'ON', status: 'ACCEPTED', note: '', title: 'Любовное фэнтези с юмором', title2: 'Читать онлайн', text: 'Попаданка, дракон и очень упрямая академия. Продолжение каждый день.', href: 'https://litnet.com/' },
    { id: 1003, gid: 803, cid: 702, state: 'ON', status: 'REJECTED', note: 'Изображение не соответствует требованиям', title: 'Роман, от которого не оторваться', title2: '', text: 'Новая история о любви и магии.', href: 'https://litnet.com/' },
    { id: 1004, gid: 803, cid: 702, state: 'ON', status: 'ACCEPTED', note: '', title: 'Он дракон. Она — его истинная', title2: '', text: 'Обложка и первые строки — в сетях.', href: 'https://litnet.com/' },
    { id: 1005, gid: 801, cid: 701, state: 'ON', status: 'ACCEPTED', note: '', title: 'Сбежала со свадьбы — от дракона', title2: 'Читать на Литнете', text: 'Новый вариант: другой троп в заголовке.', href: 'https://litnet.com/' },
  ];
  // по объявлениям: 1001 выгорело (CTR упал вдвое), 1002 устаёт, 1004 в сетях 3+ недели, 1005 — свежая замена
  const adDaily = [];
  for (const [aid, cid, net, from, impr0, ctr0, decay] of [[1001, 701, 's', 38, 260, 0.06, 0.55], [1002, 701, 's', 36, 200, 0.05, 0.28], [1004, 702, 'n', 24, 1500, 0.007, 0], [1005, 701, 's', 6, 120, 0.065, 0]]) {
    for (let i = from; i >= 0; i--) {
      const date = addDays(today, -i), life = (from - i) / from, impr = Math.round(impr0 * (0.85 + r() * 0.3));
      const clicks = Math.round(impr * ctr0 * (1 - decay * Math.max(0, life - 0.35) / 0.65) * (0.85 + r() * 0.3));
      adDaily.push({ date, cid, aid, net, impr, clicks, cost: Math.round(clicks * (net === 'n' ? 6 : 9) * (1 + decay * life * 0.6) * 100) / 100 });
    }
  }
  const daily = [];
  for (let i = 29; i >= 0; i--) {
    const date = addDays(today, -i);
    for (const c of campaigns) {
      if (date < c.start) continue;
      const impr = Math.round((c.id === 701 ? 380 : 1600) * (0.7 + r() * 0.6));
      const clicks = Math.round(impr * (c.id === 701 ? 0.045 : 0.006) * (0.7 + r() * 0.6));
      daily.push({ date, cid: c.id, name: c.name, impr, clicks, cost: Math.round(clicks * (c.id === 701 ? 9 : 6) * (0.8 + r() * 0.4) * 100) / 100 });
    }
  }
  const kw = {};
  for (const k of keywords) {
    const impr = Math.round((k.cid === 702 ? 9000 : 1500) * (0.4 + r())), ctrv = k.id === 905 ? 0.003 : k.cid === 702 ? 0.006 : 0.04 + r() * 0.03;
    const clicks = Math.round(impr * ctrv);
    kw[k.id] = { impr, clicks, cost: Math.round(clicks * (k.bid || 6) * 0.7 * 100) / 100 };
  }
  const Q = [
    ['любовное фэнтези читать онлайн', 701, 801, 820, 41, 352], ['читать любовное фэнтези бесплатно полностью', 701, 801, 640, 33, 281],
    ['роман про истинную пару дракона', 701, 801, 410, 26, 240], ['книги про драконов и любовь скачать бесплатно', 701, 801, 300, 14, 120],
    ['попаданка в академию читать', 701, 801, 380, 19, 171], ['литнет любовное фэнтези новинки', 701, 802, 520, 30, 315],
    ['истинная пара фильм', 701, 801, 150, 6, 52], ['читать романы онлайн', 701, 802, 900, 4, 30], ['фэнтези про драконов epub', 701, 801, 120, 5, 41],
  ];
  const queries = Q.map(([query, cid, gid, impr, clicks, cost]) => ({ query, cid, gid, kw: '', impr, clicks, cost }));
  // покупки по цели 9001 (пример счётчика Метрики): примерно 1 из 25 кликов на поиске
  const conv = daily.filter((x) => x.cid === 701).map((x) => ({ date: x.date, cid: x.cid, conv: { 9001: Math.round(x.clicks * (0.02 + r() * 0.04)), 9002: Math.round(x.clicks * 0.1) } })).filter((x) => x.conv[9001] || x.conv[9002]);
  const kwConv = { 901: { 9001: 9 }, 902: { 9001: 6 }, 904: { 9001: 4 }, 906: { 9001: 3 } };
  if (kw[903]) { kw[903].clicks = Math.max(kw[903].clicks, 30); kw[903].cost = Math.max(kw[903].cost, 900); } // фраза тратит без покупок
  const mrows = [{ cid: 701, name: 'Книга — поиск', visits: 412, bounce: 0.21, depth: 3.4, dur: 255 }, { cid: 702, name: 'Книга — сети', visits: 160, bounce: 0.68, depth: 1.3, dur: 34 }];
  const at = new Date().toISOString();
  return [{ id: 'main', at, demo: true, campaigns, groups, keywords, ads }, { id: 'stats', at, demo: true, daily, adDaily, kw, queries, conv, kwConv, mrows }];
}

// Пример Метрики: 8 недель по дням (с ритмом недели), источники, устройства, страницы входа
export function demoMetrikaSnap(today) {
  const r = rnd(7), daily = [];
  const W = [1.25, 0.9, 0.95, 1.0, 1.05, 1.1, 1.3]; // вс…сб
  for (let i = 55; i >= 0; i--) {
    const key = addDays(today, -i), wd = new Date(key + 'T00:00:00Z').getUTCDay();
    const visits = Math.round((i < 7 ? 150 : 120) * W[wd] * (0.85 + r() * 0.3));
    daily.push({ key, name: key, visits, users: Math.round(visits * 0.8), bounce: 0.28 + r() * 0.1, depth: 3.2, dur: 210, goals: { 9001: Math.round(visits * (i < 7 ? 0.035 : 0.03)), 9002: Math.round(visits * 0.09), 9003: Math.round(visits * 0.62), 9004: Math.round(visits * 0.06) } });
  }
  const S = [
    ['internal', 'Внутренние переходы', 1900, 0.22, 0.04], ['ad', 'Переходы по рекламе', 820, 0.55, 0.012], ['social', 'Переходы из социальных сетей', 520, 0.3, 0.07],
    ['organic', 'Переходы из поисковых систем', 410, 0.35, 0.03], ['direct', 'Прямые заходы', 300, 0.25, 0.05], ['messenger', 'Переходы из мессенджеров', 90, 0.4, 0.06],
  ].map(([key, name, visits, bounce, cr]) => ({ key, name, visits, users: Math.round(visits * 0.8), bounce, depth: 3, dur: 200, goals: { 9001: Math.round(visits * cr), 9002: Math.round(visits * cr * 3) } }));
  const D = [['mobile', 'Смартфоны', 2900, 0.33, 0.026], ['desktop', 'ПК', 980, 0.24, 0.055], ['tablet', 'Планшеты', 160, 0.3, 0.03]]
    .map(([key, name, visits, bounce, cr]) => ({ key, name, visits, users: visits, bounce, depth: 3, dur: 200, goals: { 9001: Math.round(visits * cr), 9002: 0 } }));
  // страница книги (решают купить) и читалка (уже читают — покупок меньше)
  const P = [['https://litnet.com/ru/book/istinnaya-para-dlya-drakona-b100001', 1500, 0.055, 0.25], ['https://litnet.com/ru/reader/istinnaya-para-dlya-drakona-b100001', 900, 0.012, 0.12],
    ['https://litnet.com/ru/book/popadanka-v-akademiyu-b100002', 700, 0.012, 0.42], ['https://litnet.com/ru/reader/popadanka-v-akademiyu-b100002', 450, 0.006, 0.1], ['https://litnet.com/ru/lana-freitag-u12345', 400, 0.02, 0.3]]
    .map(([key, visits, cr, bounce]) => ({ key, name: key, visits, users: visits, bounce, depth: 3, dur: 200, goals: { 9001: Math.round(visits * cr), 9002: 0 } }));
  // метки UTM: свои ссылки из соцсетей и рассылки
  const U = [[['telegram', 'social', 'istinnaya_para_start', 'post_1'], 260, 0.07], [['vk', 'social', 'istinnaya_para_start', ''], 140, 0.03], [['email', 'email', 'skidka_oktyabr', ''], 90, 0.11]]
    .map(([dims, visits, cr]) => ({ key: dims.join('|'), dims, name: dims.join(' / '), visits, users: visits, bounce: 0.2, depth: 3, dur: 240, goals: { 9001: Math.round(visits * cr), 9002: 0 } }));
  // ссылки для продвижения из кабинета Литнета (страница входа с ?utm_litref=…)
  const L = [['https://litnet.com/ru/book/istinnaya-para-dlya-drakona-b100001?utm_litref=ol_Demo1', 640, 0.06], ['https://litnet.com/ru/book/popadanka-v-akademiyu-b100002?utm_litref=ol_Demo2', 210, 0.02]]
    .map(([key, visits, cr]) => ({ key, name: key, visits, users: visits, bounce: 0.2, depth: 3, dur: 240, goals: { 9001: Math.round(visits * cr), 9002: 0 } }));
  return { id: 'mk', at: new Date().toISOString(), demo: true, counterId: 555, goals: [9001, 9002, 9003, 9004], daily, sources: S, engines: [], devices: D, pages: P, utm: U, litref: L, errors: [] };
}

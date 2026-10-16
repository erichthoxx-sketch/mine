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

// Псевдослучайные, но одинаковые при каждом открытии числа
function rnd(seed) { let x = seed; return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; }

export function demoSnapshot(today) {
  const r = rnd(42);
  const campaigns = [
    { id: 701, name: 'Книга — поиск', state: 'ON', status: 'ACCEPTED', type: 'TEXT_CAMPAIGN', start: addDays(today, -20), daily: 400, negatives: ['скачать', 'fb2'], strategy: { search: 'HIGHEST_POSITION', network: 'SERVING_OFF' } },
    { id: 702, name: 'Книга — сети', state: 'ON', status: 'ACCEPTED', type: 'TEXT_CAMPAIGN', start: addDays(today, -12), daily: 200, negatives: [], strategy: { search: 'SERVING_OFF', network: 'MAXIMUM_COVERAGE' } },
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
  ];
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
  const at = new Date().toISOString();
  return [{ id: 'main', at, demo: true, campaigns, groups, keywords, ads }, { id: 'stats', at, demo: true, daily, kw, queries }];
}

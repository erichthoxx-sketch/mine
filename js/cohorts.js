// Когорты по Logs API Метрики (вариант А, 10.11.2026 — владелица: «вариант А, выгрузки разрешаю»).
// «Директ» раз в сутки сам: оценка → запрос логов визитов → ждём → скачиваем части → очищаем выгрузку в Метрике →
// считаем у себя → в личный Cloudflare уходят только обезличенные строки посетителей (без ClientID, без адресов страниц).
// Сырые логи живут только в памяти этой вкладки. Счётчик и цели не меняются. Инструмент для нейросети — get_cohorts.

export const LOG_FIELDS = ['ym:s:visitID', 'ym:s:clientID', 'ym:s:dateTime', 'ym:s:<attribution>TrafficSource', 'ym:s:<attribution>AdvEngine',
  'ym:s:<attribution>DirectClickOrder', 'ym:s:<attribution>UTMSource', 'ym:s:<attribution>UTMCampaign', 'ym:s:<attribution>UTMContent',
  'ym:s:goalsID', 'ym:s:goalsDateTime'];
const DAY = 86400000;
const dayOf = (s) => String(s || '').slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
const addD = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
// «[1,2]» / «['2026-11-10 12:00:00','…']» → массив строк
const arr = (v) => String(v || '').replace(/^\[|\]$/g, '').split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);

// Цели по названиям (как в Метрике автора на Литнете)
export function stageGoals(goals = []) {
  const f = (re) => goals.find((g) => re.test(g.name))?.id;
  return { read: f(/начал[а-яё]*\s+чтен|начал[а-яё]*\s+чита/i), lib: f(/библиотек/i), buyStart: f(/начал[а-яё]*\s+покуп|оформ/i), buy: f(/^(?!.*начал).*(покупк|купил|оплат)/i) };
}

// Разбор TSV Logs API (части склеены) → обезличенные строки посетителей
// person = [день первого визита (от from), источник первого визита, дни до: чтения, библиотеки, начала покупки, покупки,
//           покупка не в первом визите (1/0), источник визита с покупкой]
export function buildCohortData(tsvParts = [], { from, to, goals }) {
  const G = Object.fromEntries(Object.entries(stageGoals(goals)).filter(([, v]) => v).map(([k, v]) => [String(v), k]));
  const byClient = new Map();
  for (const text of tsvParts) {
    const lines = String(text || '').split('\n').filter(Boolean);
    if (!lines.length) continue;
    const head = lines[0].split('\t').map((h) => h.replace(/^ym:s:/, '').replace(/^(<attribution>|last)/, ''));
    const at = (k) => head.indexOf(k);
    const iC = at('clientID'), iT = at('dateTime'), iS = at('TrafficSource'), iE = at('AdvEngine'), iD = at('DirectClickOrder'),
      iUs = at('UTMSource'), iUc = at('UTMCampaign'), iUn = at('UTMContent'), iG = at('goalsID'), iGt = at('goalsDateTime');
    for (const l of lines.slice(1)) {
      const c = l.split('\t');
      if (!c[iC] || c[iC] === '0') continue;
      const v = { t: c[iT], src: { t: c[iS] || '', e: c[iE] || '', d: c[iD] && c[iD] !== '0' ? c[iD] : '', s: c[iUs] || '', c: c[iUc] || '', n: c[iUn] || '' }, goals: [] };
      const ids = arr(c[iG]), ts = arr(c[iGt]);
      ids.forEach((g, i) => { if (G[g]) v.goals.push([G[g], ts[i] || c[iT]]); });
      (byClient.get(c[iC]) || byClient.set(c[iC], []).get(c[iC])).push(v);
    }
  }
  const sources = [], srcIdx = new Map();
  const idx = (s) => { const k = JSON.stringify(s); if (!srcIdx.has(k)) { srcIdx.set(k, sources.length); sources.push(s); } return srcIdx.get(k); };
  const people = [];
  for (const visits of byClient.values()) {
    visits.sort((x, y) => x.t.localeCompare(y.t));
    const first = visits[0], d0 = dayOf(first.t);
    if (d0 < from || d0 > to) continue;
    const firstDay = (k) => { let best = null; for (const v of visits) for (const [g, t] of v.goals) if (g === k && (best == null || t < best.t)) best = { t, v }; return best; };
    const days = (k) => { const b = firstDay(k); return b ? Math.max(0, diffDays(d0, dayOf(b.t))) : null; };
    const buy = firstDay('buy');
    people.push([diffDays(from, d0), idx(first.src), days('read'), days('lib'), days('buyStart'), buy ? Math.max(0, diffDays(d0, dayOf(buy.t))) : null,
      buy && buy.v !== first ? 1 : 0, buy ? idx(buy.v.src) : null]);
  }
  return { from, to, sources, people };
}

// ---------- выгрузка: раз в сутки, в фоне ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let busy = false;
export async function autoCohorts(store, { days = 90 } = {}) {
  const s = store?.data?.settings || {}, base = String(s.bookAiWorker || '').replace(/\/+$/, ''), m = s.direct?.metrika || {};
  const user = store?.auth?.currentUser;
  if (busy || !base || !user || store.mode !== 'firebase' || !m.counterId || !s.directToken || s.aiDirectLive === 'off') return;
  const last = Date.parse(s.direct?.cohortsAt || '') || 0;
  if (Date.now() - last < 20 * 3600000) return;
  busy = true;
  const call = async (op, body = {}) => {
    const r = await fetch(base + '/sync/logs', { method: 'POST', headers: { Authorization: 'Bearer ' + await user.getIdToken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ op, counter: String(m.counterId), ...body }) });
    if (!r.ok) { let t = ''; try { t = (await r.json()).message || ''; } catch { /* не JSON */ } throw Error(`Logs API (${op}): ${r.status}${t ? ' — ' + t : ''}`); }
    return op === 'download' ? r.text() : r.json();
  };
  const put = (data) => user.getIdToken().then((tok) => fetch(base + '/sync/section/cohorts', { method: 'PUT', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ section: 'cohorts', generatedAt: new Date().toISOString(), at: new Date().toISOString(), ...data }) }));
  const save = (patch) => store.saveSettings({ direct: { ...(store.data.settings.direct || {}), ...patch } });
  let id = null;
  try {
    const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
    const to = addD(today, -1), from = addD(to, -(days - 1)); // Logs API — только до вчерашнего дня
    const q = { date1: from, date2: to, fields: LOG_FIELDS.join(','), attribution: 'LAST' };
    const ev = (await call('evaluate', q)).log_request_evaluation || {};
    if (!ev.possible) throw Error('Метрика говорит, что выгрузить логи за ' + days + ' дней сейчас нельзя (квота или права доступа к счётчику).');
    id = (await call('create', q)).log_request?.request_id;
    if (!id) throw Error('Метрика не создала запрос логов');
    let info = null;
    for (let i = 0; i < 40; i++) { // до ~10 минут
      await sleep(15000);
      info = (await call('info', { id })).log_request || {};
      if (info.status === 'processed') break;
      if (['processing_failed', 'canceled', 'cleaned_by_user', 'cleaned_automatically_as_too_old'].includes(info.status)) throw Error('Метрика не подготовила логи: ' + info.status);
    }
    if (info?.status !== 'processed') throw Error('Метрика долго готовит логи — попробую завтра');
    const parts = [];
    for (const p of info.parts || []) parts.push(await call('download', { id, part: p.part_number }));
    const data = buildCohortData(parts, { from, to, goals: m.goals || [] });
    await put(data);
    // короткая сводка — и в сам «Директ» (Деньги → «Когда покупают»); без людей, только счётчики
    await store.put('d_snap', { id: 'cohorts', at: new Date().toISOString(), ...cohortSummary(data, to) }).catch(() => {});
    await save({ cohortsAt: new Date().toISOString(), cohortsErr: '' });
  } catch (e) {
    console.warn('Когорты:', e);
    await save({ cohortsAt: new Date().toISOString(), cohortsErr: String(e.message || e).slice(0, 300) }).catch(() => {});
  } finally {
    if (id) await call('clean', { id }).catch(() => {}); // выгрузку в Метрике не храним
    busy = false;
  }
}

// Сводка по когортам для «Директа» (12.11.2026, её «да» на п. 21): кто пришёл впервые с Директа / с другой рекламы / сам —
// сколько добавили в библиотеку и сколько купили за 7, 30, 60, 90 дней. Доля «за N дней» считается только по тем, кто пришёл
// не позже чем N дней назад (иначе свежие читательницы занижают цифру). По кампаниям Директа — отдельно.
export function cohortSummary(data, today) {
  const span = data?.from && today ? Math.round((Date.parse(today) - Date.parse(data.from)) / 86400000) : 0;
  const kind = (s) => (s?.d || /direct/i.test(s?.e || '') ? 'direct' : s?.t === 'ad' ? 'ads' : 'other');
  const mk = () => ({ n: 0, lib: 0, buy: 0, late: 0, days: [], w: { 7: [0, 0], 30: [0, 0], 60: [0, 0], 90: [0, 0] } });
  const groups = { direct: mk(), ads: mk(), other: mk() }, camps = {};
  for (const [off, si, , lib, , buy, late] of data?.people || []) {
    const src = data.sources[si], age = span - off;
    for (const g of [groups[kind(src)], ...(src?.d ? [(camps[src.d] ||= mk())] : [])]) {
      g.n++; if (lib != null) g.lib++;
      if (buy != null) { g.buy++; g.days.push(buy); if (late) g.late++; }
      for (const d of [7, 30, 60, 90]) if (age >= d) { g.w[d][0]++; if (buy != null && buy <= d) g.w[d][1]++; }
    }
  }
  const fin = (g) => { const ds = g.days.sort((a, b) => a - b); return { n: g.n, lib: g.lib, buy: g.buy, lateShare: g.buy ? g.late / g.buy : null, median: ds.length ? ds[Math.floor(ds.length / 2)] : null,
    by: Object.fromEntries(Object.entries(g.w).map(([d, [n, k]]) => [d, n >= 20 ? k / n : null])) }; };
  return { from: data?.from || '', to: data?.to || '', groups: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, fin(g)])), camps: Object.fromEntries(Object.entries(camps).map(([k, g]) => [k, fin(g)])) };
}

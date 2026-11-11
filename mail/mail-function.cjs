// Сервис писем Ланы Фрейтаг — функция Yandex Cloud Functions (Node.js 18+, без пакетов).
// Подписка с подтверждением, отписка одной ссылкой, письма через Yandex Cloud Postbox, список — в бакете Object Storage (в России).
// Ключей в этом файле нет: всё секретное — в «Переменных окружения» функции. Права — у сервисного аккаунта функции.
//
// Переменные окружения:
//   BUCKET     — имя бакета (закрытого), например lana-mail
//   ADMIN_KEY  — придуманный длинный пароль для админки сайта
//   FROM       — отправитель, например: Лана Фрейтаг <hello@lanafreitag.ru>
//   REPLY_TO   — куда приходят ответы читательниц (обычная почта владелицы); туда же — пробные письма.
//                С версии 3 адрес меняется из «Мастерской» → Почта (op: reply → subs.json.replyTo); переменная — запасной вариант.
//   SITE       — https://lanafreitag.ru/
//   SELF       — адрес этой функции (https://functions.yandexcloud.net/…), для ссылок «подтвердить» и «отписаться»
const ENV = process.env;
const S3 = 'https://storage.yandexcloud.net';
const PB = 'https://postbox.cloud.yandex.net/v2/email/outbound-emails';
const ORIGINS = [/^https:\/\/(www\.)?lanafreitag\.ru$/, /^https:\/\/erichthoxx-sketch\.github\.io$/, /^http:\/\/localhost(:\d+)?$/];

let TOKEN = '';
const auth = () => ({ 'X-YaCloud-SubjectToken': TOKEN });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isMail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ''));
const rnd = () => require('crypto').randomBytes(18).toString('hex');

// ---------- хранилище: один файл со списком ----------
async function getObj(key, fallback) {
  const r = await fetch(`${S3}/${ENV.BUCKET}/${key}`, { headers: auth() });
  if (r.status === 404) return fallback;
  if (!r.ok) throw new Error('storage ' + r.status);
  return r.json();
}
async function putObj(key, body, type = 'application/json', pub = false) {
  const r = await fetch(`${S3}/${ENV.BUCKET}/${key}`, { method: 'PUT', headers: { ...auth(), 'Content-Type': type, ...(pub ? { 'x-amz-acl': 'public-read' } : {}) }, body });
  if (!r.ok) throw new Error('storage put ' + r.status);
}
// адрес для ответов: из Мастерской (subs.json.replyTo), иначе переменная REPLY_TO
let REPLY = '';
const replyTo = () => REPLY || ENV.REPLY_TO || '';
const loadList = () => getObj('subs.json', { list: [] }).then((d) => { REPLY = isMail(d.replyTo) ? d.replyTo : ''; return d; });
const saveList = (d) => putObj('subs.json', JSON.stringify(d));

// ---------- отправка одного письма ----------
// «Имя через сайт <адрес сайта>»: имя по-русски — закодировано, как требует почта (RFC 2047)
const fromAs = (name) => {
  const addr = (/<([^>]+)>/.exec(ENV.FROM || '') || [])[1] || String(ENV.FROM || '').trim();
  return name ? `=?UTF-8?B?${Buffer.from(String(name).replace(/["<>\r\n]/g, ''), 'utf8').toString('base64')}?= <${addr}>` : ENV.FROM;
};
async function send(to, subject, html, text, unsub, reply = '', fromName = '') {
  const rt = reply || replyTo();
  const body = {
    FromEmailAddress: fromName ? fromAs(fromName) : ENV.FROM, Destination: { ToAddresses: [to] }, ReplyToAddresses: rt ? [rt] : [],
    Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Html: { Data: html, Charset: 'UTF-8' }, Text: { Data: text, Charset: 'UTF-8' } },
      ...(unsub ? { Headers: [{ Name: 'List-Unsubscribe', Value: `<${unsub}>` }, { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }] } : {}) } },
  };
  const r = await fetch(PB, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('postbox ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
const link = (a, t) => `${ENV.SELF}?a=${a}&t=${t}`;
const fill = (s, p) => String(s).replace(/\{unsub\}/g, link('unsub', p.token)).replace(/\{name\}/g, esc(p.name || ''));

// письмо «подтвердите подписку» — короткое, в стиле сайта; тексты владелица меняет в Мастерской → Сайт → Почта (op: texts → d.texts)
const FN_V = 8; // 8 — письмо «Разбор недели» по понедельникам и письма от приложений (op: note); 7 — сторож Директа (op: watch, таймер); 6 — круглосуточный поиск пиратских копий (op: piracy, таймер); 5 — претензии пиратам из Мастерской (op: claim); 4 — письмо с сайта выглядит как обычное письмо от читательницы; 3 — «Письмо автору» с сайта (?a=msg), адрес для ответов из Мастерской (op: reply) // версия программы: Почта видит, что программу пора обновить
const TEXTS_DEF = { subj: 'Подтвердите подписку', head: 'Подтвердите подписку', text: 'Одно нажатие — и я напишу вам, когда выйдет мой новый роман. Только тогда.', btn: 'Подтвердить' };
const textsOf = (d) => ({ ...TEXTS_DEF, ...Object.fromEntries(Object.entries(d?.texts || {}).filter(([k, v]) => k in TEXTS_DEF && String(v || '').trim())) });
function confirmMail(p, t = TEXTS_DEF) {
  const url = link('confirm', p.token), site = ENV.SITE || '';
  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f4;font-family:Georgia,'Times New Roman',serif;color:#141517">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e4e0">
<tr><td style="padding:36px 36px 12px;text-align:center;letter-spacing:.3em;font-size:13px;text-transform:uppercase;color:#5c6167">Лана Фрейтаг</td></tr>
<tr><td style="padding:12px 36px 8px;text-align:center;font-size:26px;line-height:1.25">${esc(t.head)}</td></tr>
<tr><td style="padding:8px 36px 24px;text-align:center;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#5c6167">${esc(t.text).replace(/\n/g, '<br>')}</td></tr>
<tr><td align="center" style="padding:0 36px 32px"><a href="${url}" style="display:inline-block;background:#141517;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;letter-spacing:.18em;text-transform:uppercase;padding:15px 28px">${esc(t.btn)}</a></td></tr>
<tr><td style="padding:0 36px 32px;text-align:center;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#979ca1">Если вы не подписывались на ${esc(site.replace(/^https?:\/\//, '').replace(/\/$/, ''))}, просто удалите это письмо.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: t.subj, html, text: `${t.head}\n\n${t.text}\n\n${t.btn}: ${url}\n\nЕсли вы не подписывались, просто удалите это письмо.` };
}

// ---------- ответы ----------
const cors = (origin) => (ORIGINS.some((re) => re.test(origin || '')) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', Vary: 'Origin' } : {});
const json = (o, status = 200, h = {}) => ({ statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...h }, body: JSON.stringify(o) });
const back = (q) => ({ statusCode: 302, headers: { Location: `${ENV.SITE}?pismo=${q}` }, body: '' });

// ---------- отложенные письма: таймер (триггер функции раз в 5–10 минут) отправляет те, чьё время пришло ----------
const LATE = 2 * 3600e3;
const clean = (x) => ({ id: x.id, at: x.at, subject: x.subject, draft: x.draft || null, made: x.made, late: x.late || '' });
async function sendAll(d, subject, html, text) {
  let sent = 0; const failed = [];
  for (const p of d.list.filter((x) => x.status === 'ok')) {
    try { await send(p.email, subject, fill(html, p), fill(text, p), link('unsub', p.token)); sent++; } catch { failed.push(p.email); }
  }
  return { sent, failed };
}
async function runQueue() {
  const d = await loadList(), now = Date.now();
  let changed = false;
  // копия адресов раз в день — в том же бакете (backup/подписчицы-ГГГГ-ММ-ДД.json)
  const day = new Date(now + 3 * 3600e3).toISOString().slice(0, 10);
  if (d.backupDay !== day && d.list.length) { await putObj(`backup/subs-${day}.json`, JSON.stringify(d.list.map(({ token, ...x }) => x))); d.backupDay = day; changed = true; }
  // опоздало больше чем на 2 часа (таймер не будил сервис) — само не уходит: владелица решит в Почте («Отправить сейчас» или отменить)
  for (const q of d.queue || []) if (!q.late && !q.sending && now - Date.parse(q.at) > LATE) { q.late = new Date().toISOString(); changed = true; }
  const due = (d.queue || []).filter((q) => !q.late && Date.parse(q.at) <= now && (!q.sending || now - Date.parse(q.sending) > 15 * 60e3));
  if (!due.length) { if (changed) await saveList(d); return { due: 0 }; }
  for (const q of due) q.sending = new Date().toISOString(); // чтобы второй вызов не отправил то же письмо
  await saveList(d);
  for (const q of due) {
    const r = await sendAll(d, q.subject, q.html, q.text);
    d.queue = d.queue.filter((x) => x.id !== q.id);
    d.sent = [...(d.sent || []), { id: q.id, at: new Date().toISOString(), subject: q.subject, sent: r.sent, failed: r.failed.length, planned: q.at, draft: q.draft || null }].slice(-50);
  }
  await saveList(d);
  return { due: due.length };
}

// ---------- круглосуточный поиск пиратских копий (12.11.2026, владелица: «да, нужен круглосуточный поиск») ----------
// Мастерская раз в день присылает задание (op: piracy): запросы по книгам, поисковики, свои площадки, уже известные находки.
// Таймер (каждые 5 минут) делает ОДИН запрос к поисковику за вызов — книги обходятся за несколько часов, каждый день заново.
// Находки лежат в piracy.json, Мастерская забирает их при открытии; о новой уверенной находке — письмо владелице.
// Разбор выдачи — тот же, что в Мастерской (writer/js/piracy.js: parseResults, judge); тест сверяет на одной выдаче.
const pNorm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const pHost = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
function pUnwrap(url) {
  let u = String(url || '').replace(/&amp;/g, '&').trim();
  if (u.startsWith('//')) u = 'https:' + u;
  try { const x = new URL(u); if (/duckduckgo\.com$/.test(x.hostname) && x.searchParams.get('uddg')) return x.searchParams.get('uddg'); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
}
function pParse(text) {
  const src = String(text || ''), out = [], seen = new Set();
  for (const m of src.matchAll(/\[([^\]]{0,300})\]\(\s*<?((?:https?:)?\/\/[^)\s>]+)>?[^)]*\)/g)) {
    const url = pUnwrap(m[2]), host = pHost(url);
    if (!host) continue;
    const title = m[1].replace(/[*_]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (seen.has(url)) { const o = out.find((x) => x.url === url); if (o && title.length > o.title.length && !/^!\[|^https?:/.test(title)) o.title = title; continue; }
    seen.add(url);
    out.push({ url, host, title, snip: src.slice(Math.max(0, m.index - 120), m.index + 500).replace(/\]\([^)]*\)/g, ' ').replace(/[[\]*_#>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) });
  }
  return out;
}
function pJudge(r, title, author, cfg) {
  if ((cfg.legit || []).some((d) => r.host === d || r.host.endsWith('.' + d))) return null;
  let dec = r.url; try { dec = decodeURIComponent(r.url); } catch { /* как есть */ }
  const t = pNorm(title), hay = pNorm(r.title + ' ' + r.snip + ' ' + dec);
  if (!t || !hay.includes(t)) return null;
  const a = pNorm(String(author || '').split(/\s+/).pop() || '');
  const known = new RegExp(cfg.hint || '$^', 'i').test(r.host), words = new RegExp(cfg.words || '$^', 'i').test(r.title + ' ' + r.snip), byAuthor = !!a && hay.includes(a);
  if (!byAuthor && !words) return null;
  return { ...r, sure: byAuthor || known, why: [known ? 'известная пиратская библиотека' : '', words ? 'предлагает читать или скачать бесплатно' : '', byAuthor ? 'автор указан' : 'автор не указан — проверьте, ваша ли книга'].filter(Boolean).join(' · ') };
}
async function runPiracy() {
  const p = await getObj('piracy.json', null), cfg = p?.cfg;
  if (!cfg?.on || !(cfg.books || []).length || !(cfg.engines || []).length) return null;
  const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  if (p.day !== day) { p.day = day; p.i = 0; }
  const steps = cfg.books.flatMap((b) => (b.q || []).flatMap((q) => cfg.engines.map((e) => ({ b, q, e }))));
  if (p.i >= steps.length) return { done: true };
  const st = steps[p.i];
  p.i++; p.at = new Date().toISOString();
  let fresh = [];
  try {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 25000);
    const r = await fetch('https://r.jina.ai/' + st.e + encodeURIComponent(st.q), { signal: ctl.signal }); clearTimeout(tm);
    if (r.ok) {
      const have = new Set([...(cfg.known || []), ...(p.finds || []).map((f) => f.host + '|' + f.bookId)]);
      for (const x of pParse(await r.text())) {
        const hit = pJudge(x, st.b.title, cfg.author, cfg);
        if (!hit || have.has(hit.host + '|' + st.b.id)) continue;
        have.add(hit.host + '|' + st.b.id);
        fresh.push({ url: hit.url, host: hit.host, bookId: st.b.id, title: st.b.title, page: hit.title, why: hit.why, sure: hit.sure, foundAt: p.at });
      }
      p.err = '';
    } else p.err = 'поиск ответил ' + r.status;
  } catch (e) { p.err = String(e.message || e).slice(0, 120); }
  p.finds = [...(p.finds || []), ...fresh].slice(-300);
  await putObj('piracy.json', JSON.stringify(p));
  const loud = fresh.filter((f) => f.sure), to = replyTo();
  if (loud.length && to) {
    const text = `Найдена пиратская копия:\n\n${loud.map((f) => `«${f.title}» — ${f.host}\n${f.url}`).join('\n\n')}\n\nОткройте Мастерскую → Маркетинг → «Пираты»: претензия уже готова${cfg.auto ? ' и уйдёт сама' : ''}.`;
    try { await send(to, `Пираты: «${loud[0].title}» на ${loud[0].host}`, `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55">${esc(text).replace(/\n/g, '<br>')}</div>`, text, '', ''); } catch { /* письмо не ушло — находка всё равно сохранена */ }
  }
  return { step: p.i, of: steps.length, fresh: fresh.length };
}

// ---------- круглосуточный сторож Директа (12.11.2026, её «да» на п. 18) ----------
// «Директ» (галочка «Сторож» на Пульте) присылает задание (op: watch): ключ Директа и список идущих кампаний. Ключ лежит только
// в этом закрытом бакете (watch.json) и в ответах не возвращается. Раз в 3 часа сервис ТОЛЬКО ЧИТАЕТ кампании и объявления
// и пишет владелице письмо, если: кампания остановилась или отклонена, объявление отклонено, показы не растут 6+ дневных часов.
const WATCH_EVERY = 3 * 3600e3;
async function directGet(w, service, params) {
  const r = await fetch(`https://api.direct.yandex.com/json/v501/${service}`, { method: 'POST', headers: { Authorization: 'Bearer ' + w.token, 'Accept-Language': 'ru', 'Content-Type': 'application/json; charset=utf-8', ...(w.login ? { 'Client-Login': w.login } : {}) }, body: JSON.stringify({ method: 'get', params }) });
  const j = await r.json();
  if (j.error) throw new Error(`Директ: ${j.error.error_string || ''} ${j.error.error_detail || ''}`.trim());
  return j.result || {};
}
function watchAlerts(w, camps, ads, now) {
  const out = [], hour = new Date(now + 3 * 3600e3).getUTCHours(), prev = w.seen || {}, seen = {};
  for (const c of w.campaigns || []) {
    const k = camps.find((x) => String(x.Id) === String(c.id));
    if (!k) continue;
    const impr = Number(k.Statistics?.Impressions || 0);
    if (k.State !== 'ON') out.push({ key: `state:${c.id}:${k.State}`, text: `«${c.name}» больше не идёт: ${k.StatusClarification || k.State}.` });
    else if (k.Status === 'REJECTED') out.push({ key: `rej:${c.id}`, text: `«${c.name}» отклонена модерацией: ${k.StatusClarification || ''}` });
    else {
      // показы: счётчик за всё время не вырос с прошлой дневной проверки (ночью тишина — не тревога)
      const p = prev[c.id];
      if (p && impr <= p.impr && hour >= 12 && now - p.at >= 6 * 3600e3) out.push({ key: `idle:${c.id}:${new Date(now).toISOString().slice(0, 10)}`, text: `«${c.name}»: показов нет уже ${Math.round((now - p.at) / 3600e3)} ч. ${k.StatusClarification || 'Проверьте деньги на счёте и недельный бюджет.'}` });
    }
    seen[c.id] = prev[c.id] && impr <= prev[c.id].impr ? prev[c.id] : { impr, at: now };
    for (const a of ads.filter((x) => String(x.CampaignId) === String(c.id) && x.Status === 'REJECTED' && x.State !== 'ARCHIVED')) out.push({ key: `ad:${a.Id}`, text: `«${c.name}»: объявление отклонено модерацией${a.StatusClarification ? ' — ' + a.StatusClarification : ''}.` });
  }
  return { out, seen };
}
// Письмо «Разбор недели» по понедельникам (12.11.2026, идея «Е», её «да»): сервис сам берёт отчёт Директа за 14 дней (только чтение)
// и сравнивает прошлую неделю с позапрошлой по каждой кампании. Отчёт ещё готовится (201/202) — вернёт null, попробуем в следующий вызов.
const mskDay = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
const addD = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
function weekDigest(rows, w, today) {
  const to = addD(today, -1), mid = addD(today, -7), from = addD(today, -14), g = w.goals || {}, num = (v) => Number(String(v || '0').replace(',', '.')) || 0;
  const conv = (r, ids) => ids.reduce((a, id) => a + num(r[`Conversions_${id}_LSCCD`]), 0);
  const out = [];
  for (const c of w.campaigns || []) {
    const sum = (a, b) => rows.filter((r) => String(r.CampaignId) === String(c.id) && r.Date >= a && r.Date <= b).reduce((t, r) => ({ cost: t.cost + num(r.Cost), clicks: t.clicks + num(r.Clicks), lib: t.lib + (g.lib ? conv(r, [g.lib]) : 0), buy: t.buy + conv(r, g.buy || []) }), { cost: 0, clicks: 0, lib: 0, buy: 0 });
    const now = sum(mid, to), prev = sum(from, addD(mid, -1));
    if (!now.cost && !now.clicks) continue;
    const ch = (a, b) => (b ? ` (${a >= b ? '+' : '−'}${Math.round(Math.abs(a - b) / b * 100)} %)` : '');
    out.push(`«${c.name}»\n  расход ${Math.round(now.cost)} ₽${ch(now.cost, prev.cost)} · клики ${now.clicks}${ch(now.clicks, prev.clicks)}\n  в библиотеку ${now.lib}${ch(now.lib, prev.lib)}${now.lib ? ` по ${Math.round(now.cost / now.lib)} ₽` : ''} · покупки ${now.buy}${now.buy ? ` по ${Math.round(now.cost / now.buy)} ₽` : ''}`);
  }
  return out.length ? `Реклама за неделю ${mid.slice(8, 10)}.${mid.slice(5, 7)}–${to.slice(8, 10)}.${to.slice(5, 7)} (в скобках — к неделе до неё):\n\n${out.join('\n\n')}\n\nВыводы, тест объявлений и что поменять — «Директ» → «Разбор недели».` : '';
}
async function directReport(w, today) {
  const g = w.goals || {}, goals = [g.lib, ...(g.buy || [])].filter(Boolean).map(String).slice(0, 10);
  const params = { SelectionCriteria: { DateFrom: addD(today, -14), DateTo: addD(today, -1), Filter: [{ Field: 'CampaignId', Operator: 'IN', Values: w.campaigns.map((c) => String(c.id)) }] }, FieldNames: ['Date', 'CampaignId', 'Impressions', 'Clicks', 'Cost', ...(goals.length ? ['Conversions'] : [])],
    ReportName: 'week-' + today, ReportType: 'CUSTOM_REPORT', DateRangeType: 'CUSTOM_DATE', Format: 'TSV', IncludeVAT: 'YES', IncludeDiscount: 'NO', ...(goals.length ? { Goals: goals, AttributionModels: ['LSCCD'] } : {}) };
  const r = await fetch('https://api.direct.yandex.com/json/v5/reports', { method: 'POST', headers: { Authorization: 'Bearer ' + w.token, 'Accept-Language': 'ru', 'Content-Type': 'application/json; charset=utf-8', processingMode: 'auto', returnMoneyInMicros: 'false', skipReportHeader: 'true', skipReportSummary: 'true', ...(w.login ? { 'Client-Login': w.login } : {}) }, body: JSON.stringify({ params }) });
  if (r.status === 201 || r.status === 202) return null;
  if (r.status !== 200) throw new Error('отчёт Директа: ' + r.status);
  const lines = (await r.text()).split('\n').filter(Boolean), head = (lines[0] || '').split('\t');
  return lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [head[i], v])));
}
async function runWeekly(w, now) {
  const today = mskDay(now), d = new Date(now + 3 * 3600e3);
  if (!w.weekly || d.getUTCDay() !== 1 || d.getUTCHours() < 9 || w.weekSent === today) return false;
  const rows = await directReport(w, today);
  if (!rows) return 'wait';
  const text = weekDigest(rows, w, today), to = replyTo();
  if (text && to) await send(to, 'Реклама за неделю — разбор', `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55">${esc(text).replace(/\n/g, '<br>')}</div>`, text, '', '');
  w.weekSent = today;
  return true;
}
async function runWatch() {
  const w = await getObj('watch.json', null), now = Date.now();
  if (!w?.on || !w.token || !(w.campaigns || []).length) return null;
  // письмо недели: по понедельникам с 9:00 по Москве, отдельно от трёхчасовых проверок (отчёт может готовиться несколько вызовов)
  try { const wk = await runWeekly(w, now); if (wk === true) await putObj('watch.json', JSON.stringify(w)); } catch (e) { w.err = String(e.message || e).slice(0, 200); }
  if (now - (w.at || 0) < WATCH_EVERY) return null;
  w.at = now;
  let res;
  try {
    const ids = w.campaigns.map((c) => Number(c.id));
    const camps = (await directGet(w, 'campaigns', { SelectionCriteria: { Ids: ids }, FieldNames: ['Id', 'Name', 'State', 'Status', 'StatusClarification', 'Statistics'] })).Campaigns || [];
    const ads = (await directGet(w, 'ads', { SelectionCriteria: { CampaignIds: ids }, FieldNames: ['Id', 'CampaignId', 'State', 'Status', 'StatusClarification'] })).Ads || [];
    const { out, seen } = watchAlerts(w, camps, ads, now);
    const told = new Set(w.told || []), fresh = out.filter((x) => !told.has(x.key));
    w.seen = seen; w.err = ''; w.told = [...(w.told || []), ...fresh.map((x) => x.key)].slice(-200);
    const to = replyTo();
    if (fresh.length && to) {
      const text = `Сторож Директа:\n\n${fresh.map((x) => '• ' + x.text).join('\n')}\n\nОткройте «Директ» → Пульт.`;
      await send(to, `Директ: ${fresh[0].text.slice(0, 80)}`, `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55">${esc(text).replace(/\n/g, '<br>')}</div>`, text, '', '');
    }
    w.last = fresh.map((x) => x.text).slice(0, 5); res = { alerts: fresh.length };
  } catch (e) { w.err = String(e.message || e).slice(0, 200); res = { error: w.err }; }
  await putObj('watch.json', JSON.stringify(w));
  return res;
}

module.exports.watchAlerts = watchAlerts;
module.exports.weekDigest = weekDigest;
module.exports.handler = async function (event, context) {
  TOKEN = context?.token?.access_token || '';
  if (Array.isArray(event?.messages)) { // вызов таймером (триггер Yandex Cloud)
    let out;
    try { out = await runQueue(); } catch (e) { return json({ error: String(e.message || e).slice(0, 300) }, 500); }
    // поиск пиратских копий — после писем: если вызов оборвётся по времени, отложенные письма уже ушли
    try { await loadList(); out.watch = await runWatch(); } catch (e) { out.watch = { error: String(e.message || e).slice(0, 200) }; }
    try { out.piracy = await runPiracy(); } catch (e) { out.piracy = { error: String(e.message || e).slice(0, 200) }; }
    return json(out);
  }
  const q = event.queryStringParameters || {}, h = event.headers || {}, origin = h.Origin || h.origin || '';
  const C = cors(origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: C, body: '' };
  let body = {};
  if (event.body) { try { body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body); } catch { /* не JSON */ } }
  try {
    // подписка с сайта → письмо «подтвердите»
    if (q.a === 'sub') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!isMail(email) || body.ok !== true) return json({ error: 'email' }, 400, C);
      const d = await loadList();
      let p = d.list.find((x) => x.email === email);
      if (p?.status === 'ok') return json({ ok: true, already: true }, 200, C);
      if (!p) { p = { email, name: String(body.name || '').slice(0, 80), src: String(body.src || '').slice(0, 60), at: new Date().toISOString(), token: rnd() }; d.list.push(p); }
      p.status = 'pending'; p.asked = new Date().toISOString();
      await saveList(d);
      const m = confirmMail(p, textsOf(d));
      await send(email, m.subject, m.html, m.text);
      return json({ ok: true }, 200, C);
    }
    // «Письмо автору» с сайта → владелице на почту; «Ответить» в почте сразу пишет читательнице (Reply-To)
    if (q.a === 'msg') {
      const email = String(body.email || '').trim().toLowerCase(), text = String(body.text || '').trim().slice(0, 4000), name = String(body.name || '').trim().slice(0, 80);
      if (body.site) return json({ ok: true }, 200, C); // ловушка для ботов: людям это поле не видно
      if (!isMail(email) || text.length < 5 || body.ok !== true) return json({ error: 'form' }, 400, C);
      const d = await loadList(), now = Date.now();
      const recent = (d.msgs || []).filter((m) => now - Date.parse(m.at) < 3600e3);
      if (recent.filter((m) => m.email === email).length >= 3 || recent.length >= 30) return json({ error: 'often' }, 429, C); // не чаще 3 писем в час от одного адреса
      const to = replyTo() || ENV.FROM;
      const who = name || email, src = String(body.src || '').slice(0, 80);
      // как обычное письмо от читательницы (владелица: «выглядит как внутренняя форма»): отправитель — «Анна через сайт»,
      // тема — начало письма, внутри только её текст и тихая строка внизу; «Ответить» пишет ей (Reply-To)
      const first = text.split(/\n/)[0].replace(/\s+/g, ' ').trim();
      const subject = first.length > 60 ? first.slice(0, 60).replace(/\s+\S*$/, '') + '…' : first;
      const page = src.startsWith('kniga:') ? 'со страницы книги ' + src.slice(6) : 'с сайта';
      const html = `<!doctype html><html><body style="margin:0;padding:0"><div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#141517;max-width:640px;padding:8px 4px">${esc(text).replace(/\n/g, '<br>')}${name ? `<br><br>${esc(name)}` : ''}</div>
<div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#979ca1;padding:22px 4px 0">${esc(email)} · написала ${page} lanafreitag.ru</div></body></html>`;
      await send(to, subject || 'Письмо с сайта', html, `${text}${name ? '\n\n' + name : ''}\n\n—\n${email} · написала ${page} lanafreitag.ru`, '', email, `${who} через сайт`);
      d.msgs = [...(d.msgs || []), { at: new Date().toISOString(), name, email, text, src }].slice(-200);
      await saveList(d);
      return json({ ok: true }, 200, C);
    }
    // «проверить очередь» — без пароля: отправляет только то, что владелица уже запланировала (будит таймер GitHub раз в 10 минут)
    if (q.a === 'tick') return json(await runQueue(), 200, C);
    // ссылки из писем
    if (q.a === 'confirm' || q.a === 'unsub') {
      const d = await loadList(), p = d.list.find((x) => x.token === q.t);
      if (!p) return back('net');
      p.status = q.a === 'confirm' ? 'ok' : 'unsub'; p[q.a === 'confirm' ? 'okAt' : 'unsubAt'] = new Date().toISOString();
      await saveList(d);
      if (event.httpMethod === 'POST') return json({ ok: true }); // отписка одним нажатием из почты (List-Unsubscribe-Post)
      return back(q.a === 'confirm' ? 'ok' : 'unsub');
    }
    // админка сайта: только с паролем ADMIN_KEY
    if (q.a === 'admin') {
      if (!ENV.ADMIN_KEY || body.key !== ENV.ADMIN_KEY) return json({ error: 'key' }, 403, C);
      const d = await loadList();
      if (body.op === 'list') return json({ list: d.list.map(({ token, ...x }) => x), sent: d.sent || [], queue: (d.queue || []).map(clean), tick: d.backupDay || '', from: ENV.FROM, replyTo: replyTo(), texts: textsOf(d), msgs: (d.msgs || []).slice(-50), v: FN_V }, 200, C);
      if (body.op === 'reply') { // адрес для ответов читательниц (его видят в письмах) — из Мастерской
        const e = String(body.email || '').trim().toLowerCase();
        if (!isMail(e)) return json({ error: 'email' }, 400, C);
        d.replyTo = e; await saveList(d); REPLY = e;
        return json({ ok: true, replyTo: e }, 200, C);
      }
      if (body.op === 'texts') { // письмо «Подтвердите подписку»: свои тексты (пустое поле — как было)
        const t = body.texts || {};
        d.texts = Object.fromEntries(Object.keys(TEXTS_DEF).map((k) => [k, String(t[k] || '').trim().slice(0, 400)]));
        await saveList(d);
        if (body.test) { const to = replyTo() || ENV.FROM; const m = confirmMail({ token: 'test' }, textsOf(d)); await send(to, m.subject, m.html, m.text); }
        return json({ ok: true, texts: textsOf(d) }, 200, C);
      }
      if (body.op === 'schedule') { // отложить письмо на дату и время (at — ISO); тот же id — заменить
        if (!Date.parse(body.at)) return json({ error: 'at' }, 400, C);
        const q = { id: String(body.id || rnd()).slice(0, 40), at: new Date(body.at).toISOString(), subject: String(body.subject || ''), html: String(body.html || ''), text: String(body.text || ''), draft: body.draft || null, made: new Date().toISOString() };
        d.queue = [...(d.queue || []).filter((x) => x.id !== q.id), q].sort((a, b) => a.at.localeCompare(b.at));
        await saveList(d); return json({ ok: true, queue: d.queue.map(clean) }, 200, C);
      }
      if (body.op === 'sendq') { // отложенное письмо — сейчас (например, опоздавшее: владелица нажала «Отправить сейчас»)
        const q = (d.queue || []).find((x) => x.id === body.id);
        if (!q) return json({ error: 'нет такого письма' }, 404, C);
        const r = await sendAll(d, q.subject, q.html, q.text);
        d.queue = d.queue.filter((x) => x.id !== q.id);
        d.sent = [...(d.sent || []), { id: q.id, at: new Date().toISOString(), subject: q.subject, sent: r.sent, failed: r.failed.length, planned: q.at, draft: q.draft || null }].slice(-50);
        await saveList(d); return json({ ok: true, sent: r.sent, failed: r.failed, queue: d.queue.map(clean) }, 200, C);
      }
      if (body.op === 'unschedule') { d.queue = (d.queue || []).filter((x) => x.id !== body.id); await saveList(d); return json({ ok: true, queue: d.queue.map(clean) }, 200, C); }
      if (body.op === 'import') { // подписчицы, оставившие почту раньше (с согласием) — сразу подтверждённые
        let n = 0;
        for (const x of body.list || []) {
          const email = String(x.email || '').trim().toLowerCase();
          if (!isMail(email) || d.list.some((y) => y.email === email)) continue;
          d.list.push({ email, name: String(x.name || '').slice(0, 80), src: 'firebase', at: x.at || new Date().toISOString(), token: rnd(), status: 'ok', okAt: new Date().toISOString() }); n++;
        }
        await saveList(d); return json({ ok: true, added: n }, 200, C);
      }
      if (body.op === 'note') { // письмо самой владелице от её приложений (итог месяца из Мастерской)
        const to = replyTo(), subject = String(body.subject || '').slice(0, 200), text = String(body.text || '').slice(0, 12000);
        if (!to || !subject || text.length < 20) return json({ error: 'form' }, 400, C);
        await send(to, subject, `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#141517;max-width:640px">${esc(text).replace(/\n/g, '<br>')}</div>`, text, '', '');
        return json({ ok: true }, 200, C);
      }
      if (body.op === 'watch') { // сторож Директа: задание от приложения «Директ» (ключ хранится здесь и наружу не отдаётся)
        const w = (await getObj('watch.json', null)) || {};
        if (body.cfg) { const c = body.cfg; Object.assign(w, { on: !!c.on, token: c.on ? String(c.token || w.token || '') : '', login: String(c.login || ''), campaigns: (c.campaigns || []).slice(0, 30).map((x) => ({ id: x.id, name: String(x.name || '').slice(0, 120) })), weekly: c.weekly !== false, goals: { lib: c.goals?.lib || '', buy: (c.goals?.buy || []).slice(0, 5) } }); if (!w.on) { w.seen = {}; } await putObj('watch.json', JSON.stringify(w)); }
        return json({ ok: true, on: !!w.on, at: w.at || 0, err: w.err || '', last: w.last || [], campaigns: (w.campaigns || []).length }, 200, C);
      }
      if (body.op === 'piracy') { // задание на круглосуточный поиск + забрать находки (Мастерская → Пираты)
        const p = (await getObj('piracy.json', null)) || {};
        if (body.cfg) { p.cfg = body.cfg; await putObj('piracy.json', JSON.stringify(p)); }
        if (body.clear) { p.finds = (p.finds || []).filter((f) => !body.clear.includes(f.url)); await putObj('piracy.json', JSON.stringify(p)); }
        return json({ ok: true, finds: p.finds || [], at: p.at || '', day: p.day || '', i: p.i || 0, err: p.err || '', on: !!p.cfg?.on }, 200, C);
      }
      if (body.op === 'claim') { // претензия пирату (Мастерская → Маркетинг → Пираты): обычное текстовое письмо с адреса сайта, ответ — владелице
        const to = [].concat(body.to || []).map((x) => String(x).trim().toLowerCase()).filter(isMail).slice(0, 4), subject = String(body.subject || '').slice(0, 200), text = String(body.text || '').slice(0, 8000);
        if (!to.length || !subject || text.length < 50) return json({ error: 'form' }, 400, C);
        const day = new Date().toISOString().slice(0, 10), log = (d.claims || []).filter((x) => x.at.slice(0, 10) === day);
        if (log.length >= 40) return json({ error: 'often' }, 429, C); // не больше 40 претензий в день
        const html = `<!doctype html><html><body><div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#141517;max-width:680px">${esc(text).replace(/\n/g, '<br>')}</div></body></html>`;
        const done = [];
        for (const a of to) { try { await send(a, subject, html, text, '', ''); done.push(a); } catch (e) { /* адрес не принял — остальные идут */ } }
        d.claims = [...(d.claims || []), { at: new Date().toISOString(), to: done, subject }].slice(-300);
        await saveList(d);
        return json({ ok: done.length > 0, sent: done }, 200, C);
      }
      if (body.op === 'remove') { d.list = d.list.filter((x) => x.email !== body.email); await saveList(d); return json({ ok: true }, 200, C); }
      if (body.op === 'img') { // обложка для письма: в бакет, открытой для чтения
        const key = 'img/' + String(body.name || rnd()).replace(/[^a-z0-9._-]/gi, '') ;
        await putObj(key, Buffer.from(String(body.data || '').replace(/^data:[^,]+,/, ''), 'base64'), body.type || 'image/jpeg', true);
        return json({ ok: true, url: `${S3}/${ENV.BUCKET}/${key}` }, 200, C);
      }
      if (body.op === 'send') { // письмо: пробное — только владелице, иначе — всем подтверждённым
        const subject = String(body.subject || ''), html = String(body.html || ''), text = String(body.text || '');
        if (body.test) {
          const p = { email: replyTo(), token: 'test', name: '' };
          try { await send(p.email, subject, fill(html, p), fill(text, p), ''); return json({ ok: true, sent: 1, failed: [] }, 200, C); } catch { return json({ ok: true, sent: 0, failed: [p.email] }, 200, C); }
        }
        const { sent, failed } = await sendAll(d, subject, html, text);
        d.sent = [...(d.sent || []), { id: rnd().slice(0, 12), at: new Date().toISOString(), subject, sent, failed: failed.length, draft: body.draft || null }].slice(-50);
        await saveList(d);
        return json({ ok: true, sent, failed }, 200, C);
      }
      return json({ error: 'op' }, 400, C);
    }
    return json({ ok: true, service: 'lana-mail' }, 200, C);
  } catch (e) {
    return json({ error: String(e.message || e).slice(0, 300) }, 500, C);
  }
};

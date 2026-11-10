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
const FN_V = 4; // 4 — письмо с сайта выглядит как обычное письмо от читательницы; 3 — «Письмо автору» с сайта (?a=msg), адрес для ответов из Мастерской (op: reply) // версия программы: Почта видит, что программу пора обновить
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

module.exports.handler = async function (event, context) {
  TOKEN = context?.token?.access_token || '';
  if (Array.isArray(event?.messages)) { // вызов таймером (триггер Yandex Cloud)
    try { return json(await runQueue()); } catch (e) { return json({ error: String(e.message || e).slice(0, 300) }, 500); }
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

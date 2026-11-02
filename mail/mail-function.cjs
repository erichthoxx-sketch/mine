// Сервис писем Ланы Фрейтаг — функция Yandex Cloud Functions (Node.js 18+, без пакетов).
// Подписка с подтверждением, отписка одной ссылкой, письма через Yandex Cloud Postbox, список — в бакете Object Storage (в России).
// Ключей в этом файле нет: всё секретное — в «Переменных окружения» функции. Права — у сервисного аккаунта функции.
//
// Переменные окружения:
//   BUCKET     — имя бакета (закрытого), например lana-mail
//   ADMIN_KEY  — придуманный длинный пароль для админки сайта
//   FROM       — отправитель, например: Лана Фрейтаг <hello@lanafreitag.ru>
//   REPLY_TO   — куда приходят ответы читательниц (обычная почта владелицы); туда же — пробные письма
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
const loadList = () => getObj('subs.json', { list: [] });
const saveList = (d) => putObj('subs.json', JSON.stringify(d));

// ---------- отправка одного письма ----------
async function send(to, subject, html, text, unsub) {
  const body = {
    FromEmailAddress: ENV.FROM, Destination: { ToAddresses: [to] }, ReplyToAddresses: ENV.REPLY_TO ? [ENV.REPLY_TO] : [],
    Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Html: { Data: html, Charset: 'UTF-8' }, Text: { Data: text, Charset: 'UTF-8' } },
      ...(unsub ? { Headers: [{ Name: 'List-Unsubscribe', Value: `<${unsub}>` }, { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' }] } : {}) } },
  };
  const r = await fetch(PB, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('postbox ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
const link = (a, t) => `${ENV.SELF}?a=${a}&t=${t}`;
const fill = (s, p) => String(s).replace(/\{unsub\}/g, link('unsub', p.token)).replace(/\{name\}/g, esc(p.name || ''));

// письмо «подтвердите подписку» — короткое, в стиле сайта
function confirmMail(p) {
  const url = link('confirm', p.token), site = ENV.SITE || '';
  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f4;font-family:Georgia,'Times New Roman',serif;color:#141517">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e4e0">
<tr><td style="padding:36px 36px 12px;text-align:center;letter-spacing:.3em;font-size:13px;text-transform:uppercase;color:#5c6167">Лана Фрейтаг</td></tr>
<tr><td style="padding:12px 36px 8px;text-align:center;font-size:26px;line-height:1.25">Подтвердите подписку</td></tr>
<tr><td style="padding:8px 36px 24px;text-align:center;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#5c6167">Одно нажатие — и я напишу вам, когда выйдет мой новый роман. Только тогда.</td></tr>
<tr><td align="center" style="padding:0 36px 32px"><a href="${url}" style="display:inline-block;background:#141517;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;letter-spacing:.18em;text-transform:uppercase;padding:15px 28px">Подтвердить</a></td></tr>
<tr><td style="padding:0 36px 32px;text-align:center;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#979ca1">Если вы не подписывались на ${esc(site.replace(/^https?:\/\//, '').replace(/\/$/, ''))}, просто удалите это письмо.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: 'Подтвердите подписку', html, text: `Подтвердите подписку: ${url}\n\nЕсли вы не подписывались, просто удалите это письмо.` };
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
      const m = confirmMail(p);
      await send(email, m.subject, m.html, m.text);
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
      if (body.op === 'list') return json({ list: d.list.map(({ token, ...x }) => x), sent: d.sent || [], queue: (d.queue || []).map(clean), tick: d.backupDay || '', from: ENV.FROM, replyTo: ENV.REPLY_TO }, 200, C);
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
          const p = { email: ENV.REPLY_TO, token: 'test', name: '' };
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

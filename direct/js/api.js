// Связь с API Яндекс Директа v5 через свой «переходник» (Cloudflare Worker, код — proxy/direct-worker.js):
// браузер не может обращаться к Директу напрямую. Ключ (OAuth-токен) хранится в настройках владелицы.
import { parseTsv } from './dcalc.js';

const ERR = {
  53: 'Ключ Яндекса недействителен или устарел — войдите заново в Настройках.',
  58: 'Яндекс ещё не одобрил заявку на доступ к API Директа (или она не подана).',
  513: 'Этот аккаунт Яндекса не подключён к Директу.',
};

export function apiBase(s) {
  const d = s.direct || {};
  if (!d.proxy) throw new Error('Не указан адрес переходника — откройте Настройки.');
  if (!s.directToken) throw new Error('Директ не подключён — откройте Настройки и войдите через Яндекс.');
  return `${d.proxy.replace(/\/+$/, '')}/${d.sandbox ? 'sandbox' : 'live'}/json/v5/`;
}
function headers(s, extra = {}) {
  const h = { Authorization: 'Bearer ' + s.directToken, 'Content-Type': 'application/json; charset=utf-8', 'Accept-Language': 'ru', ...extra };
  if (s.direct?.clientLogin) h['Client-Login'] = s.direct.clientLogin;
  return h;
}
// Перебои у Яндекса (сбой, перегрузка): такие ошибки не значат, что что-то настроено не так —
// повторяем один раз, а если опять — приложение покажет последние сохранённые данные
const TRANSIENT = new Set([52, 1000, 1001, 1002]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const OUTAGE_TEXT = 'Яндекс сейчас отвечает с перебоями — показаны последние сохранённые данные. Приложение попробует снова само.';
function transientErr(msg) { const e = new Error(msg); e.transient = true; return e; }
async function post(url, s, body, extra, retry = 1) {
  let res;
  try { res = await fetch(url, { method: 'POST', headers: headers(s, extra), body: JSON.stringify(body) }); } catch { throw transientErr('Нет связи с переходником. Проверьте интернет и адрес переходника в Настройках.'); }
  if (res.status >= 500 && retry > 0) { await sleep(3000); return post(url, s, body, extra, retry - 1); }
  return res;
}
function apiError(e) {
  const code = Number(e?.error_code);
  const err = new Error(ERR[code] || (TRANSIENT.has(code) ? 'Директ временно недоступен (сбой у Яндекса).' : `Директ отказал (код ${code}): ${e?.error_string || ''}${e?.error_detail ? ' — ' + e.error_detail : ''}`));
  err.code = code;
  err.transient = TRANSIENT.has(code);
  return err;
}

// Обычный запрос: call(s, 'campaigns', 'get', {…}) → result
export async function call(s, service, method, params, retry = 1) {
  const res = await post(apiBase(s) + service, s, { method, params });
  let data = null;
  try { data = await res.json(); } catch { /* не JSON */ }
  if (data?.error) {
    const e = apiError(data.error);
    // повтор только для чтения: запись при сбое не дублируем
    if (e.transient && retry > 0 && method === 'get') { await sleep(3000); return call(s, service, method, params, retry - 1); }
    throw e;
  }
  if (!res.ok || !data) { const e = new Error(`Директ ответил ошибкой ${res.status}`); e.transient = res.status >= 500; throw e; }
  return data.result || {};
}

// Отчёт (Reports API): Директ может готовить его в очереди — ждём и спрашиваем снова
// goals — номера целей Метрики (до 10): тогда в отчёте поля вида Conversions_<цель>_LSC
export async function report(s, { name, type = 'CUSTOM_REPORT', fields, range = 'LAST_30_DAYS', from, to, filter, goals }, { wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const sel = {};
  if (from && to) { sel.DateFrom = from; sel.DateTo = to; }
  if (filter) sel.Filter = filter;
  const body = { params: { SelectionCriteria: sel, FieldNames: fields, ReportName: `${name}-${Date.now()}`, ReportType: type, DateRangeType: from && to ? 'CUSTOM_DATE' : range, Format: 'TSV', IncludeVAT: 'YES', IncludeDiscount: 'NO' } };
  if (goals?.length) { body.params.Goals = goals.slice(0, 10).map(String); body.params.AttributionModels = ['LSC']; }
  const extra = { processingMode: 'auto', returnMoneyInMicros: 'false', skipReportHeader: 'true', skipReportSummary: 'true' };
  for (let i = 0; i < 20; i++) {
    const res = await post(apiBase(s) + 'reports', s, body, extra);
    if (res.status === 200) return parseTsv(await res.text());
    if (res.status === 201 || res.status === 202) { await wait(Math.min(Number(res.headers.get('retryIn')) || 5, 20) * 1000); continue; }
    let data = null;
    try { data = await res.json(); } catch { /* не JSON */ }
    if (data?.error) throw apiError(data.error);
    const e = new Error(`Отчёт Директа: ошибка ${res.status}`); e.transient = res.status >= 500; throw e;
  }
  throw new Error('Директ долго готовит отчёт — попробуйте обновить через минуту.');
}

// ---------- Яндекс Метрика (только чтение, через тот же переходник) ----------
// metrika(s, 'management/v1/counters') · metrika(s, 'stat/v1/data', {ids, metrics, …})
export async function metrika(s, path, params = {}, retry = 1) {
  const d = s.direct || {};
  if (!d.proxy) throw new Error('Не указан адрес переходника — откройте Настройки.');
  if (!s.directToken) throw new Error('Сначала войдите через Яндекс в Настройках.');
  const url = `${d.proxy.replace(/\/+$/, '')}/metrika/${path}${Object.keys(params).length ? '?' + new URLSearchParams(params) : ''}`;
  let res;
  try { res = await fetch(url, { headers: { Authorization: 'OAuth ' + s.directToken } }); } catch { throw transientErr('Нет связи с переходником — проверьте интернет.'); }
  if (res.status >= 500 && retry > 0) { await sleep(3000); return metrika(s, path, params, retry - 1); }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* не JSON */ }
  if (res.ok && data) return data;
  let msg = data?.message || data?.errors?.[0]?.message || '';
  const e = new Error(
    /Неизвестный адрес/.test(text) ? 'Переходник старой версии — обновите его код в Cloudflare (Настройки → Метрика, шаг 2).'
    : res.status === 401 || res.status === 403 ? `Нет доступа к Метрике: в приложении Яндекса добавьте право «Получение статистики, чтение параметров своих и доверенных счётчиков» и войдите заново.${msg ? ' (' + msg + ')' : ''}`
    : res.status >= 500 ? 'Метрика временно недоступна (сбой у Яндекса).'
    : `Метрика ответила ошибкой ${res.status}${msg ? ': ' + msg : ''}`);
  e.status = res.status; e.transient = res.status >= 500;
  throw e;
}
export async function proxyVersion(s) {
  try { const r = await fetch(`${(s.direct?.proxy || '').replace(/\/+$/, '')}/version`, { cache: 'no-store' }); return r.ok ? Number(await r.text()) || 1 : 1; } catch { return 0; }
}

// ---------- вход через Яндекс (токен приходит в адрес страницы после «#») ----------
export const redirectUri = () => location.origin + location.pathname;
export function authorizeUrl(clientId) {
  // без redirect_uri Яндекс берёт адрес из настроек приложения: для «доступа к API» это его страница
  // verification_code — там он показывает ключ, и его вставляют в приложение; для веб-сервиса — возврат сюда же
  return 'https://oauth.yandex.ru/authorize?' + new URLSearchParams({ response_type: 'token', client_id: clientId, force_confirm: 'yes' });
}
// Яндекс вернул #access_token=…&expires_in=… → {token, exp} и чистим адрес
export function takeTokenFromUrl() {
  const h = location.hash.slice(1);
  if (!/access_token=|error=/.test(h)) return null;
  const p = new URLSearchParams(h);
  try { history.replaceState(null, '', location.pathname + '#/settings'); } catch { /* ок */ }
  if (p.get('error')) return { error: p.get('error_description') || p.get('error') };
  const sec = Number(p.get('expires_in')) || 0;
  return { token: p.get('access_token'), exp: sec ? Date.now() + sec * 1000 : null };
}

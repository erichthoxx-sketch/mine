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
async function post(url, s, body, extra) {
  let res;
  try { res = await fetch(url, { method: 'POST', headers: headers(s, extra), body: JSON.stringify(body) }); } catch { throw new Error('Нет связи с переходником. Проверьте интернет и адрес переходника в Настройках.'); }
  return res;
}
function apiError(e) {
  const code = Number(e?.error_code);
  const err = new Error(ERR[code] || `Директ отказал (код ${code}): ${e?.error_string || ''}${e?.error_detail ? ' — ' + e.error_detail : ''}`);
  err.code = code;
  return err;
}

// Обычный запрос: call(s, 'campaigns', 'get', {…}) → result
export async function call(s, service, method, params) {
  const res = await post(apiBase(s) + service, s, { method, params });
  let data = null;
  try { data = await res.json(); } catch { /* не JSON */ }
  if (data?.error) throw apiError(data.error);
  if (!res.ok || !data) throw new Error(`Директ ответил ошибкой ${res.status}`);
  return data.result || {};
}

// Отчёт (Reports API): Директ может готовить его в очереди — ждём и спрашиваем снова
export async function report(s, { name, type = 'CUSTOM_REPORT', fields, range = 'LAST_30_DAYS', from, to, filter }, { wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const sel = {};
  if (from && to) { sel.DateFrom = from; sel.DateTo = to; }
  if (filter) sel.Filter = filter;
  const body = { params: { SelectionCriteria: sel, FieldNames: fields, ReportName: `${name}-${Date.now()}`, ReportType: type, DateRangeType: from && to ? 'CUSTOM_DATE' : range, Format: 'TSV', IncludeVAT: 'YES', IncludeDiscount: 'NO' } };
  const extra = { processingMode: 'auto', returnMoneyInMicros: 'false', skipReportHeader: 'true', skipReportSummary: 'true' };
  for (let i = 0; i < 20; i++) {
    const res = await post(apiBase(s) + 'reports', s, body, extra);
    if (res.status === 200) return parseTsv(await res.text());
    if (res.status === 201 || res.status === 202) { await wait(Math.min(Number(res.headers.get('retryIn')) || 5, 20) * 1000); continue; }
    let data = null;
    try { data = await res.json(); } catch { /* не JSON */ }
    if (data?.error) throw apiError(data.error);
    throw new Error(`Отчёт Директа: ошибка ${res.status}`);
  }
  throw new Error('Директ долго готовит отчёт — попробуйте обновить через минуту.');
}

// ---------- вход через Яндекс (токен приходит в адрес страницы после «#») ----------
export const redirectUri = () => location.origin + location.pathname;
export function authorizeUrl(clientId) {
  return 'https://oauth.yandex.ru/authorize?' + new URLSearchParams({ response_type: 'token', client_id: clientId, redirect_uri: redirectUri(), force_confirm: 'yes' });
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

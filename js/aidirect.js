// Живое чтение Директа нейросетью (личный Worker «Мастерской», get_direct_live).
// Только когда владелица разрешила (settings.aiDirectLive === true): после нового входа в Директ
// свежий ключ сам уходит в её закрытый Cloudflare, после «Отключить Директ» — удаляется оттуда.
export async function syncDirectAccess(store, settings, { off = false } = {}) {
  const base = String(settings?.bookAiWorker || '').replace(/\/+$/, '');
  const user = store?.auth?.currentUser;
  if (!base || settings.aiDirectLive !== true || store.mode !== 'firebase' || !user) return false;
  const token = await user.getIdToken();
  const remove = off || !settings.directToken;
  const res = await fetch(base + '/sync/direct-access', {
    method: remove ? 'DELETE' : 'PUT',
    headers: { Authorization: 'Bearer ' + token, ...(remove ? {} : { 'Content-Type': 'application/json' }) },
    ...(remove ? {} : { body: JSON.stringify({ token: settings.directToken, clientLogin: settings.direct?.clientLogin || '',
      sandbox: !!settings.direct?.sandbox, exp: settings.directTokenExp ? String(settings.directTokenExp) : '' }) })
  });
  let out = null; try { out = await res.json(); } catch { /* не JSON */ }
  if (!res.ok || !out?.ok) throw Error(out?.error || 'Cloudflare ответил ошибкой ' + res.status);
  return true;
}
// Без ошибок наружу: вход в Директ не должен ломаться, если Cloudflare недоступен
export const syncDirectAccessQuiet = (store, settings, opts) => syncDirectAccess(store, settings, opts).catch((e) => console.warn('Директ вживую:', e));

// Живое чтение Директа нейросетью (личный Worker «Мастерской», get_direct_live).
// Владелица разрешила это в чате 08.11.2026 («сделай так, чтобы ты всё видела»), без кнопок: ключ сам уходит в её закрытый
// Cloudflare при открытии «Мастерской» и «Директа» и после нового входа в Директ; после «Отключить Директ» — удаляется.
// Выключено только после «Отключить всё» в Мастерской (settings.aiDirectLive === 'off').
export async function syncDirectAccess(store, settings, { off = false } = {}) {
  const base = String(settings?.bookAiWorker || '').replace(/\/+$/, '');
  const user = store?.auth?.currentUser;
  if (!base || settings.aiDirectLive === 'off' || store.mode !== 'firebase' || !user) return false;
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

// Один раз за открытие страницы, как только есть вход, адрес Worker и ключ Директа (настройки приходят не сразу)
let autoDone = false;
export function autoDirectAccess(store) {
  if (autoDone) return;
  const s = store?.data?.settings || {};
  if (store.mode !== 'firebase' || !store.auth?.currentUser || !s.bookAiWorker || !s.directToken || s.aiDirectLive === 'off') return;
  autoDone = true;
  syncDirectAccess(store, s).then((ok) => { if (ok && s.aiDirectLive !== true) store.saveSettings({ aiDirectLive: true }); })
    .catch((e) => { autoDone = false; console.warn('Директ вживую:', e); });
}

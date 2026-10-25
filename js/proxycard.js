// «Обновить переходник» — общая карточка для «Директа» и «Мастерской»: переходник один (Cloudflare, settings.direct.proxy),
// новая версия нужна обоим приложениям (Директ, Метрика, страницы конкурсов). Версию проверяем сами раз за открытие.
import { acts, toast } from './ui.js';
import { ic } from './icons.js';

export const PROXY_LATEST = 5; // 4 — новые ЕПК; 5 — платный Wordstat, выключен до ручной настройки
const app = () => window.__app;
const saveD = (patch) => app().store.saveSettings({ direct: { ...(app().ctx().settings.direct || {}), ...patch } });
const base = (s) => (s.direct?.proxy || '').replace(/\/+$/, '');
export async function proxyVersion(s) {
  try { const r = await fetch(`${base(s)}/version`, { cache: 'no-store' }); return r.ok ? Number(await r.text()) || 1 : 1; } catch { return 0; }
}

let checked = false;
export function proxyCard(s) {
  const d = s.direct || {};
  if (!d.proxy) return '';
  if (!checked) { checked = true; proxyVersion(s).then((v) => { if (v && v !== d.proxyV) saveD({ proxyV: v }); }); }
  if (!d.proxyV || d.proxyV >= PROXY_LATEST) return '';
  return `<div class="card"><div class="row between"><h2 style="margin:0">Обновить переходник</h2><span class="d-st">версия ${d.proxyV} → ${PROXY_LATEST}</span></div>
    <p class="small">Переходник на Cloudflare общий для «Директа» и «Мастерской». Обновление сохраняет Директ, Метрику и страницы конкурсов; добавляет защищенный Wordstat. Без его отдельной настройки платные запросы не работают:</p>
    <ol class="small st-how">
      <li>Нажмите <button type="button" class="dl" data-act="px.copy">${ic('copy')} Скопировать новый код</button></li>
      <li>Откройте <a href="https://dash.cloudflare.com/" target="_blank" rel="noopener">Cloudflare</a> → слева <b>Compute → Workers & Pages</b> → <b>direct</b> → справа вверху <b>Edit code</b>.</li>
      <li>В окне с кодом нажмите Ctrl+A (на Mac — Cmd+A), затем Ctrl+V — старый код заменится новым. Нажмите синюю кнопку <b>Deploy</b>.</li>
      <li>Вернитесь сюда и нажмите <button type="button" class="link" data-act="px.ver">Проверить</button>.</li>
    </ol></div>`;
}
// код переходника лежит на сайте рядом с «Директом» (/direct/direct-worker.js), при проверке на компьютере — в /proxy/
acts['px.copy'] = async () => {
  let code = '';
  for (const u of ['direct-worker.js', '../direct/direct-worker.js', '../proxy/direct-worker.js']) { try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok && /export default/.test(await r.clone().text())) { code = await r.text(); break; } } catch { /* следующий адрес */ } }
  if (!code) { toast('Не получилось загрузить код — обновите страницу'); return false; }
  try { await navigator.clipboard.writeText(code); toast('Код скопирован — вставьте его в Cloudflare'); } catch { toast('Не получилось скопировать'); }
  return false;
};
acts['px.ver'] = async () => { const v = await proxyVersion(app().ctx().settings); await saveD({ proxyV: v }); toast(v >= PROXY_LATEST ? 'Переходник обновлён ✓' : v ? 'Пока старая версия — вставьте новый код и нажмите Deploy' : 'Переходник не ответил'); return false; };

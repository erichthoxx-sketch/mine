// Сторож Директа: задание сервису писем в Яндекс Облаке владелицы (он проверяет кампании раз в 3 часа и пишет письмо,
// если показы пропали, кампания остановилась или объявление отклонено). Включается галочкой на Пульте (settings.direct.auto.watch).
// Ключ Директа уходит только в её сервис (закрытый бакет) — на это она дала согласие 12.11.2026; выключила — ключ там стирается.
import { loadMailCfg, mailCall } from '../../js/sitepub.js';
import { goalsOf } from './pult.js';
import { metrikaOf } from './views/metrika.js';

let busy = false;
export async function syncWatch(app, { force = false } = {}) {
  const c = app.ctx(), s = c.settings, d = s.direct || {}, on = !!d.auto?.watch, url = s.site?.mailUrl, user = app.store.auth?.currentUser;
  if (busy || app.store.mode !== 'firebase' || !user || !url || (!on && !d.watchSent)) return null;
  const camps = (app.snap('main')?.campaigns || []).filter((x) => x.state === 'ON' && x.status === 'ACCEPTED').map((x) => ({ id: x.id, name: x.name }));
  const sig = on ? `v8|${c.today}|${camps.map((x) => x.id).join(',')}|${String(s.directToken || '').slice(-6)}` : '';
  if (!force && sig === (d.watchSent || '')) return null;
  const g = goalsOf(metrikaOf(c) || {});
  busy = true;
  try {
    const cfg = await loadMailCfg(user.uid, await user.getIdToken());
    if (!cfg?.key) return null;
    const r = await mailCall(url, cfg.key, { op: 'watch', cfg: { on, token: on ? s.directToken : '', login: d.clientLogin || '', campaigns: camps, weekly: true, goals: { lib: g.lib || '', buy: g.buy || [] } } });
    await app.store.saveSettings({ direct: { ...(app.ctx().settings.direct || {}), watchSent: sig, watchInfo: { on: !!r.on, at: r.at || 0, err: r.err || '', last: r.last || [], old: on && !r.on } } }); // on не подтвердился — программа сервиса старее версии 7
    return r;
  } catch (e) {
    // сервис писем старее версии 7 не знает задания «watch»
    await app.store.saveSettings({ direct: { ...(app.ctx().settings.direct || {}), watchInfo: { on: false, err: String(e.message || e).slice(0, 120), old: true } } });
    return null;
  } finally { busy = false; }
}

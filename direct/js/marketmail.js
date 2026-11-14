// Письмо «Рынок за неделю»: раз в неделю (с понедельника), когда открыт Директ и есть срезы за 5+ дней. Уходит через сервис писем (op: note, версия 8+).
import { marketInsights, marketDigest, myRanks, watchReport, tropeForecast } from '../../js/market.js';
import { marketSnap } from './marketscan.js';
import { weekKeyOf } from './weekreview.js';
import { loadSiteRaw, loadMailCfg, mailCall } from '../../js/sitepub.js';

let armed = false;
export function autoMarketMail(app) {
  if (armed || typeof window === 'undefined' || /^(localhost|127\.)/.test(location.hostname) || app.store.mode !== 'firebase' || !marketSnap(app)) return;
  armed = true;
  setTimeout(async () => {
    try {
      const c = app.ctx(), d = c.settings.direct || {}, week = weekKeyOf(c.today);
      if (d.market?.mailedWeek === week || d.market?.mailOff) return;
      const mine = [...new Set((c.data.w_books || []).flatMap((b) => b.tags || []))];
      const snap = marketSnap(app);
      const text = marketDigest(marketInsights(snap, { mine }), { myTropes: mine, ranks: myRanks(snap), watched: watchReport(snap, d.market?.watch || []), forecast: tropeForecast(snap) });
      if (!text) return; // сравнивать пока не с чем
      const u = app.store.auth?.currentUser; if (!u) return;
      const [cfg, raw] = await Promise.all([loadMailCfg(u.uid, await u.getIdToken()), loadSiteRaw()]);
      if (!raw?.mailUrl || !cfg?.key) return;
      const r = await mailCall(raw.mailUrl, cfg.key, { op: 'note', subject: 'Рынок за неделю: что изменилось в топах', text });
      if (r?.ok) await app.store.saveSettings({ direct: { ...(app.ctx().settings.direct || {}), market: { ...((app.ctx().settings.direct || {}).market || {}), mailedWeek: week } } });
    } catch (e) { console.warn('Письмо о рынке:', e); }
  }, 40000);
}

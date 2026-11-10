// Карточка «Метка Литнета · сайт и Директ» (Мастерская → Сайт → Обзор): одна кнопка «Новая метка» ставит метку «Мой Литнет»
// во все ссылки сайта на Литнет и в «Параметры URL» единых кампаний Директа, которые ведут на Литнет. Расчёты — js/littag.js.
import { esc, acts, toast, openSheet } from '../../../js/ui.js';
import { fmtDate, plural } from '../../../js/format.js';
import { addDays } from '../../../js/calc.js';
import { loadSiteRaw, patchSite } from '../../../js/sitepub.js';
import { call } from '../../../direct/js/api.js';
import { withLitref } from '../../../direct/js/dcalc.js';
import { parseLitTag, siteUtmWith, litTagInfo, LITTAG_DAYS } from '../../../js/littag.js';

const app = () => window.__app;
const UTM_BASE = 'utm_source=lanafreitag.ru&utm_medium=site'; // как UTM_DEFAULT сайта

export function litTagCard(c) {
  const i = litTagInfo(c.settings, c.today);
  const where = i ? [i.site ? 'сайт' : '', Object.keys(i.direct || {}).length ? `Директ: ${Object.keys(i.direct).length} ${plural(Object.keys(i.direct).length, ['кампания', 'кампании', 'кампаний'])}` : ''].filter(Boolean).join(' · ') : '';
  return `<div class="card"><div class="row between"><h2 style="margin:0">Метка Литнета · сайт и Директ</h2>
      <button class="${i && !i.soon ? 'small-btn' : 'primary'}" data-act="lt.new">Новая метка</button></div>
    ${i ? `<p style="margin:10px 0 4px"><b>${esc(i.tag)}</b></p>
      <p class="small ${i.late ? 'down' : i.soon ? 'warnc' : 'muted'}" style="margin:0">${i.late ? `истекла ${fmtDate(i.until)} — новые читательницы к вам больше не привязываются` : `действует до ${fmtDate(i.until)} · ещё ${i.left} ${plural(i.left, ['день', 'дня', 'дней'])}`}${where ? ` · стоит: ${esc(where)}` : ''}</p>
      ${i.errors ? `<p class="small down" style="margin:6px 0 0">${esc(i.errors)}</p>` : ''}`
      : `<p class="small muted" style="margin:8px 0 0">Ссылка «Мой Литнет» живёт ${LITTAG_DAYS} дней. Создайте её в кабинете Литнета и вставьте сюда — метка сама встанет во все ссылки сайта на Литнет и в кампании Директа. За 2 дня до конца срока Планер напомнит сделать новую.</p>`}
  </div>`;
}

// Поставить метку везде: сайт (content.utm) + единые кампании Директа, которые ведут на Литнет или уже с utm_litref
export async function applyLitTag(code) {
  const a = app(), s = a.ctx().settings, now = new Date().toISOString(), errors = [];
  let site = false;
  try {
    const user = a.store.auth?.currentUser;
    if (!user) throw new Error('нужен вход');
    const raw = await loadSiteRaw();
    await patchSite({ utm: siteUtmWith(raw?.utm ?? UTM_BASE, code), utmAt: now }, await user.getIdToken());
    site = true;
  } catch (e) { errors.push('сайт: ' + (e.message || e)); }
  const direct = {};
  if (s.directToken && s.direct?.proxy) {
    try {
      const r = await call(s, 'campaigns', 'get', { SelectionCriteria: {}, FieldNames: ['Id', 'Name', 'State', 'Type'], UnifiedCampaignFieldNames: ['TrackingParams'] }, 2, undefined, 'v501');
      const camps = (r.Campaigns || []).filter((k) => k.State !== 'ARCHIVED' && k.UnifiedCampaign);
      const ids = camps.map((k) => k.Id);
      const ads = ids.length ? ((await call(s, 'ads', 'get', { SelectionCriteria: { CampaignIds: ids }, FieldNames: ['CampaignId'], TextAdFieldNames: ['Href'] }, 2, undefined, 'v501')).Ads || []) : [];
      const toLitnet = new Set(ads.filter((x) => /litnet\.com/i.test(x.TextAd?.Href || '')).map((x) => x.CampaignId));
      for (const k of camps) {
        const cur = k.UnifiedCampaign.TrackingParams || '';
        if (!toLitnet.has(k.Id) && !/utm_litref=/i.test(cur)) continue; // реклама не на Литнет — метка не нужна
        const params = withLitref(cur, 'utm_litref=' + code);
        let ok = true, err = [];
        if (params !== cur) {
          try {
            const u = await call(s, 'campaigns', 'update', { Campaigns: [{ Id: k.Id, UnifiedCampaign: { TrackingParams: params } }] }, 0, undefined, 'v501');
            err = (u.UpdateResults || []).flatMap((x) => (x.Errors || []).map((e) => e.Details || e.Message)); ok = !err.length;
          } catch (e) { ok = false; err = [e.message || String(e)]; }
          // в «Что меняли» Директа — как любая правка
          await a.store.put('d_log', { id: 'l' + Date.now().toString(36) + k.Id, at: now, by: 'app', do: 'tracking', cid: k.Id, text: `Кампания «${k.Name}»: метка Литнета utm_litref=${code}`, why: 'новая метка «Мой Литнет» — меняем только метку, кампания не переобучается', ok, errors: err, warnings: [] });
        }
        if (ok) direct[k.Id] = code; else errors.push(`Директ, «${k.Name}»: ${err.join('; ')}`);
      }
    } catch (e) { errors.push('Директ: ' + (e.message || e)); }
  }
  await a.store.saveSettings({ litTag: { code, at: now, until: addDays(now.slice(0, 10), LITTAG_DAYS), site, direct, errors: errors.join('; ').slice(0, 400) } });
  return { site, direct, errors };
}

acts['lt.new'] = () => {
  openSheet('Новая метка Литнета', `<p class="small">Литнет → коммерческий кабинет → «Мой Литнет» → создайте ссылку и скопируйте её или её UTM-метку. Вставьте сюда — подойдёт и ссылка, и «utm_litref=…».</p>
    <label>Ссылка или метка</label><input name="t" required placeholder="utm_litref=…" autocomplete="off">
    <p class="small muted" style="margin:8px 0 0">Встанет во все ссылки сайта на Литнет и в «Параметры URL» кампаний Директа, которые ведут на Литнет. Объявления и бюджеты не меняются.</p>`, async (fd) => {
    const code = parseLitTag(fd.get('t'));
    if (!code) { toast('Не вижу метку — вставьте ссылку из «Мой Литнет» или «utm_litref=…»'); return false; }
    const r = await applyLitTag(code);
    const n = Object.keys(r.direct).length;
    toast(r.errors.length ? `Метка сохранена, но не везде: ${r.errors[0]}` : `Готово: utm_litref=${code} — ${[r.site ? 'сайт' : '', n ? `Директ (${n})` : ''].filter(Boolean).join(' и ') || 'сохранено'}`);
  }, { submitText: 'Поставить везде' });
  return false;
};

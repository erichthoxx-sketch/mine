// Ссылка на профиль автора с меткой — для «Литнет платит» и таргетологов (они просят ссылку на профиль).
// Адрес профиля — settings.litnetProfile; готовые ссылки с меткой — в общем списке меток settings.direct.utms (kind: 'profile'),
// поэтому в «Директе» → Читатели → Метки сами видны переходы, покупки и окупаемость по каждой ссылке.
import { esc, acts, openSheet, toast, uid, ask, opt, N, copyRich } from '../../../js/ui.js';
import { buildUtm } from '../../../direct/js/mcalc.js';
import { ic } from '../../../js/icons.js';

const app = () => window.__app;
const SOURCE = 'litnet', MEDIUM = 'litnet_platit';
const profileUtms = (s) => (s.direct?.utms || []).filter((x) => x.kind === 'profile');
const isLitnet = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)litnet\.com$/.test(x.hostname); } catch { return false; } };

export function profileLinkCard(c) {
  const s = c.settings, list = profileUtms(s), prof = s.litnetProfile || '';
  return `<div class="card prof-card"><div class="row between"><h2 style="margin:0">Ссылка на профиль для таргетологов</h2>${prof ? '<button class="small-btn" data-act="prof.new">+ Метка</button>' : ''}</div>
    <p class="small muted" style="margin:4px 0 10px">«Литнет платит» и таргетологи просят ссылку на профиль. Дайте каждому свою — с меткой: в «Директе» → Читатели → Метки будет видно, сколько читателей и покупок она привела.</p>
    <div class="row prof-row"><span class="small muted">Профиль:</span>${prof ? `<a class="small" href="${esc(prof)}" target="_blank" rel="noopener">${esc(prof.replace(/^https:\/\//, ''))}</a>` : '<span class="small">не указан</span>'}<button class="link" data-act="prof.set">${prof ? 'изменить' : 'указать'}</button></div>
    ${list.length ? `<div class="list" style="margin-top:8px">${list.map((x) => `<div class="item"><div class="row between"><b>${esc(x.campaign || x.label)}</b><span class="row" style="gap:6px"><button class="dl" data-act="prof.copy" data-id="${esc(x.id)}">${ic('copy')}Скопировать</button><button class="link danger" data-act="prof.del" data-id="${esc(x.id)}">Убрать</button></span></div>
      <div class="small muted" style="word-break:break-all">${esc(x.url)}</div></div>`).join('')}</div>` : prof ? '<p class="small muted" style="margin:8px 0 0">Ссылок с меткой пока нет — нажмите «+ Метка».</p>' : ''}
  </div>`;
}

acts['prof.set'] = () => {
  const s = app().ctx().settings;
  openSheet('Ваш профиль на Литнете', `<label style="margin-top:0">Адрес страницы автора</label><input name="u" type="url" value="${esc(s.litnetProfile || '')}" placeholder="https://litnet.com/ru/..." required>
    <p class="small muted">Откройте свою страницу на Литнете и скопируйте адрес из строки браузера.</p>`, async (fd) => {
    const u = String(fd.get('u') || '').trim().replace(/[?#].*$/, '');
    if (!isLitnet(u)) { toast('Нужна ссылка на страницу Литнета: https://litnet.com/…'); return false; }
    await app().store.saveSettings({ litnetProfile: u }); toast('Профиль сохранён');
  }, { submitText: 'Сохранить' });
  return false;
};

acts['prof.new'] = () => {
  const c = app().ctx(), s = c.settings;
  const targets = (c.data.w_links || []).filter((x) => x.kind === 'target' && x.name).map((x) => x.name);
  openSheet('Ссылка на профиль с меткой', `<label style="margin-top:0">Для кого / какая кампания</label>
    ${targets.length ? `<select name="who"><option value="">— вписать ниже —</option>${targets.map((t) => opt(t, t, '')).join('')}<option value="Литнет платит">Литнет платит</option></select>` : ''}
    <input name="name" placeholder="Литнет платит, ноябрь" style="margin-top:8px">
    <label>Сколько заплатили, ₽ (необязательно)</label><input name="cost" inputmode="decimal">`, async (fd) => {
    const name = String(fd.get('name') || '').trim() || String(fd.get('who') || '').trim();
    if (!name) { toast('Напишите, для кого ссылка'); return false; }
    const url = buildUtm(s.litnetProfile, { source: SOURCE, medium: MEDIUM, campaign: name });
    if (!url) { toast('Сначала укажите адрес профиля'); return false; }
    const utms = s.direct?.utms || [];
    if (utms.some((x) => x.url === url)) { toast('Такая ссылка уже есть'); return false; }
    await app().store.saveSettings({ direct: { ...(s.direct || {}), utms: [...utms, { id: uid(), kind: 'profile', label: `Профиль: ${name}`, url, source: SOURCE, medium: MEDIUM, campaign: name, cost: N(fd.get('cost')) || 0, at: c.today }] } });
    copyRich(url).then(() => toast('Ссылка готова и скопирована')).catch(() => toast('Ссылка готова'));
  }, { submitText: 'Сделать ссылку' });
  return false;
};

acts['prof.copy'] = (d) => {
  const x = profileUtms(app().ctx().settings).find((u) => u.id === d.id);
  if (x) copyRich(x.url).then(() => toast('Скопировано')).catch(() => toast(x.url));
  return false;
};

acts['prof.del'] = async (d) => {
  const s = app().ctx().settings;
  if (!(await ask('Убрать эту ссылку из списка? Переходы по ней на Литнете продолжат работать.', 'Убрать'))) return false;
  await app().store.saveSettings({ direct: { ...(s.direct || {}), utms: (s.direct?.utms || []).filter((x) => x.id !== d.id) } });
  return false;
};

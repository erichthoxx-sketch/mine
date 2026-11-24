import { acts, esc, openSheet } from '../../../js/ui.js';
import { fmtShort, num, rub } from '../../../js/format.js';
import { isDemo, logOf } from '../demo.js';
import { campaignRecommendations } from '../recommendations.js';
import { applyRecommendation } from '../recommendation-actions.js';
import { pultModel } from './pult.js';

let applying = false;
function model(a, cid) {
  const pult = pultModel(a);
  return campaignRecommendations({ row: pult.rows.find((r) => r.camp.id === cid),
    main: pult.main, stats: pult.stats, today: pult.c.today, log: logOf(a) || [] });
}

acts['dg.recommend'] = ({ cid }) => {
  const a = window.__app;
  if (applying) return false;
  const stamp = a.snap('stats')?.at, initial = a.ctx().settings, user = a.store.user?.uid;
  const { items, note, next } = model(a, Number(cid));
  if (!items.length) {
    openSheet('Предложения по кампании', `<p>${esc(note)}${next ? ' Вернитесь к проверке ' + fmtShort(next) + '.' : ''}</p>`);
    return false;
  }
  const live = !isDemo() && !initial.direct?.sandbox && !!initial.directToken;
  const cards = items.map((x) => `<label class="item d-check" style="display:flex;gap:12px;align-items:flex-start">
    ${live ? `<input type="checkbox" name="proposal" value="${esc(x.key)}">` : ''}
    <span><b>${esc(x.title)}</b><span class="small muted" style="display:block">
      ${fmtShort(x.from)}–${fmtShort(x.to)} · ${rub(x.cost, 0)} · ${num(x.clicks)} кликов · ${num(x.count)} целевых визитов
    </span><span class="small" style="display:block">${esc(x.reason)} ${esc(x.effect)}</span>
    <span class="small muted" style="display:block">Проверка ${fmtShort(x.reviewDate)} · цель «${esc(x.metric)}»</span></span>
  </label>`).join('');
  const submit = async (fd, form) => {
    const keys = new Set(fd.getAll('proposal'));
    const status = form.querySelector('[data-recommend-status]');
    if (!keys.size) { status.textContent = 'Отметьте хотя бы одно изменение.'; return false; }
    const fresh = model(a, Number(cid)).items;
    const selected = items.filter((x) => keys.has(x.key));
    const current = a.ctx().settings;
    if (isDemo() || user !== a.store.user?.uid || initial.directToken !== current.directToken ||
        initial.direct?.proxy !== current.direct?.proxy || initial.direct?.clientLogin !== current.direct?.clientLogin ||
        current.direct?.sandbox || stamp !== a.snap('stats')?.at ||
        selected.some((x) => !fresh.some((y) => JSON.stringify(x) === JSON.stringify(y)))) {
      status.textContent = 'Данные изменились. Откройте предложения заново.';
      return false;
    }
    const run = async () => {
      const results = [];
      for (const x of selected) {
        try { results.push(await applyRecommendation(a, x, initial)); }
        catch (e) { results.push({ title: x.title, status: e.message }); }
      }
      return results;
    };
    status.textContent = 'Применяю и проверяю в Яндексе…';
    applying = true;
    try {
      const results = navigator.locks
        ? await navigator.locks.request('direct-recommendations:' + user, { ifAvailable: true }, (lock) => lock ? run() : null)
        : await run();
      if (!results) { status.textContent = 'Изменения уже применяются в другой вкладке.'; return false; }
      openSheet('Результат в Яндексе', `<div class="list">${results.map((x) => `<div class="item"><b>${esc(x.title)}</b><div class="small">${esc(x.status)}</div></div>`).join('')}</div>
        <div class="row"><button type="button" data-act="dg.journal">Журнал решений</button></div>`);
    } catch (e) { status.textContent = e.message; }
    finally { applying = false; a.rerender(); }
    return false;
  };
  openSheet('Предложения по кампании', `${live ? '' : '<p class="small muted">Предпросмотр. Изменения доступны в рабочем кабинете.</p>'}
    <div class="list">${cards}</div><p class="small" role="status" data-recommend-status></p>`, live ? submit : null, { submitText: 'Применить выбранное' });
  return false;
};

acts['dg.journal'] = () => {
  document.getElementById('sheet').close();
  const a = window.__app;
  a.go('/experiments');
  return false;
};

// Яндекс Метрика в «Директе»: подключение по шагам, выбор счётчика и целей.
// С целями Директ сам считает конверсии (например, покупки) по кампаниям и фразам, а Метрика показывает,
// что люди делают на странице книги (сразу уходят или читают). Только чтение — в Метрике приложение ничего не меняет.
import { esc, acts, forms, toast } from '../../../js/ui.js';
import { ic } from '../../../js/icons.js';
import { metrika, proxyVersion, authorizeUrl } from '../api.js';
import { demo } from '../demo.js';

const app = () => window.__app;
const saveD = (patch) => app().store.saveSettings({ direct: { ...(app().ctx().settings.direct || {}), ...patch } });
const ext = (url, label) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
const st = { counters: null, goals: null, err: '', busy: false };

// цели, похожие на покупку, — отмечаем сами (владелица может поправить)
export const looksLikeBuy = (name) => /покуп|оплат|купил|заказ|purchase|order|payment|buy/i.test(name || '');
// пример для режима «посмотреть на примере»
export const DEMO_METRIKA = { counterId: 555, counterName: 'Лана Фрейтаг — Литнет', goals: [{ id: 9001, name: 'Покупка книги' }, { id: 9002, name: 'Добавление в библиотеку' }], main: [9001] };
export const metrikaOf = (c) => (demo.on ? DEMO_METRIKA : c.settings.direct?.metrika || null);

export function metrikaCard(c) {
  const d = c.settings.direct || {}, m = d.metrika;
  if (demo.on) return '';
  if (m?.counterId) {
    const main = (m.goals || []).filter((g) => (m.main || []).map(String).includes(String(g.id)));
    return `<div class="card"><div class="row between"><h2 style="margin:0">Яндекс Метрика</h2><span class="d-st good">● подключена</span></div>
      <p class="small">Счётчик <b>${esc(m.counterName || m.counterId)}</b> · ${m.goals?.length ? `целей: ${m.goals.length}` : 'цели не выбраны'}${main.length ? ` · главная: ${main.map((g) => `«${esc(g.name)}»`).join(', ')}` : ''}</p>
      <p class="small muted">Конверсии по этим целям Директ считает сам — они появятся на Обзоре, в кампаниях и в подсказках после ↻ «Обновить».</p>
      <div class="row"><button data-act="mk.find">Сменить счётчик или цели</button><button class="link danger" data-act="mk.off">Отключить</button></div>
      ${pickHtml()}</div>`;
  }
  const v = d.proxyV;
  return `<div class="card"><h2>Яндекс Метрика</h2>
    <p class="small">У вас на Литнете стоит счётчик Метрики автора. Если подключить его сюда, приложение увидит не только клики, но и <b>покупки</b> (по целям счётчика): какие кампании и фразы приводят читателей, а какие только тратят деньги. Это займёт около 5 минут.</p>
    <ol class="small st-how">
      <li>Откройте ${ext('https://oauth.yandex.ru/', 'oauth.yandex.ru')} → ваше приложение «Директ Ланы» → <b>«Редактировать»</b>. В «Доступ к данным» найдите <b>Яндекс Метрика</b> и отметьте <b>«Получение статистики, чтение параметров своих и доверенных счётчиков»</b> → «Сохранить изменения».</li>
      <li>Обновите переходник: Cloudflare → Workers & Pages → <b>direct</b> → <b>Edit code</b> → удалите всё и вставьте <button type="button" class="dl" data-act="st.worker">${ic('copy')} новый код переходника</button> → <b>Deploy</b>.
        <div class="small ${v >= 2 ? 'up' : 'muted'}">${v >= 2 ? 'Переходник обновлён ✓' : v === 1 ? 'Сейчас стоит старая версия переходника.' : ''} <button class="link" data-act="mk.ver">Проверить</button></div></li>
      <li>Войдите заново, чтобы ключ получил доступ к Метрике: <button class="link" data-act="mk.login"${d.clientId ? '' : ' disabled'}>Войти через Яндекс</button> — и вставьте новый ключ в шаге «Вход через Яндекс» (Учёба → Настройка) или ниже в «Вставить ключ вручную».</li>
      <li><button class="primary" data-act="mk.find">Найти мои счётчики</button></li>
    </ol>
    ${st.err ? `<p class="small down">${esc(st.err)}</p>` : ''}
    ${pickHtml()}</div>`;
}

// выбор счётчика и целей (после «Найти мои счётчики»)
function pickHtml() {
  if (st.busy) return '<p class="small muted">Спрашиваю Метрику…</p>';
  if (st.err && st.counters == null) return '';
  if (st.counters == null) return '';
  if (!st.counters.length) return '<p class="small">Метрика не нашла счётчиков в этом аккаунте Яндекса. Если счётчик автора в другом аккаунте — откройте ему доступ на чтение для этого аккаунта (в Метрике: Настройки → Доступы).</p>';
  const m = app().ctx().settings.direct?.metrika || {};
  return `<form data-form="mk.save" class="mk-pick">
    <label for="mkc">Счётчик</label><select id="mkc" name="counter">${st.counters.map((x) => `<option value="${x.id}"${String(x.id) === String(st.cid || m.counterId) ? ' selected' : ''}>${esc(x.name || x.site || x.id)}${x.site ? ` — ${esc(x.site)}` : ''} (№${x.id})</option>`).join('')}</select>
    ${st.goals == null ? '<p class="small muted">Загружаю цели…</p>' : st.goals.length ? `<label style="margin-top:12px">Цели — что считать результатом (до 10)</label>
      <p class="hint">Отметьте цели, которые важны. Звёздочкой — <b>главная</b> (обычно покупка): по ней приложение считает цену покупки и советует.</p>
      <div class="mk-goals">${st.goals.map((g) => { const on = m.goals ? m.goals.some((x) => String(x.id) === String(g.id)) : looksLikeBuy(g.name); const main = m.main ? m.main.map(String).includes(String(g.id)) : looksLikeBuy(g.name); return `<div class="mk-goal"><label class="d-check"><input type="checkbox" name="g" value="${g.id}"${on ? ' checked' : ''}> ${esc(g.name)}</label><label class="mk-star" title="Главная цель"><input type="checkbox" name="main" value="${g.id}"${main ? ' checked' : ''}><span>★</span></label></div>`; }).join('')}</div>`
    : '<p class="small">В этом счётчике нет целей. Без целей приложение покажет только поведение на странице (отказы, время), а покупки — нет.</p>'}
    <div class="row d-save"><button class="primary" type="submit">Сохранить</button></div></form>`;
}

async function loadGoals(cid) {
  st.cid = cid; st.goals = null; app().rerender();
  try { st.goals = ((await metrika(app().ctx().settings, `management/v1/counter/${cid}/goals`)).goals || []).map((g) => ({ id: g.id, name: g.name, type: g.type })); } catch (e) { st.err = e.message; st.goals = []; }
  app().rerender();
}
acts['mk.find'] = async () => {
  st.busy = true; st.err = ''; app().rerender();
  try {
    const r = await metrika(app().ctx().settings, 'management/v1/counters', { per_page: 100 });
    st.counters = (r.counters || []).map((x) => ({ id: x.id, name: x.name, site: x.site || x.site2?.site || '' }));
  } catch (e) { st.err = e.message; st.counters = null; }
  st.busy = false; app().rerender();
  const m = app().ctx().settings.direct?.metrika;
  if (st.counters?.length) await loadGoals(m?.counterId && st.counters.some((x) => String(x.id) === String(m.counterId)) ? m.counterId : st.counters[0].id);
  return false;
};
// выбор другого счётчика — подгружаем его цели
document.addEventListener('change', (e) => { if (e.target?.id === 'mkc') loadGoals(e.target.value); });
forms['mk.save'] = async (fd) => {
  const cid = fd.get('counter'), c = st.counters.find((x) => String(x.id) === String(cid));
  const ids = fd.getAll('g').map(String).slice(0, 10), main = fd.getAll('main').map(String).filter((id) => ids.includes(id));
  const goals = (st.goals || []).filter((g) => ids.includes(String(g.id))).map((g) => ({ id: g.id, name: g.name }));
  await saveD({ metrika: { counterId: Number(cid), counterName: c?.name || c?.site || String(cid), goals, main: main.length ? main.map(Number) : goals.slice(0, 1).map((g) => g.id) } });
  st.counters = null; st.goals = null;
  toast('Метрика подключена — загружаю покупки по целям'); app().reload?.({ quiet: true });
};
acts['mk.off'] = async () => { await saveD({ metrika: null }); toast('Метрика отключена'); };
acts['mk.ver'] = async () => { const v = await proxyVersion(app().ctx().settings); await saveD({ proxyV: v }); toast(v >= 2 ? 'Переходник новой версии ✓' : v ? 'Переходник старой версии — вставьте новый код и нажмите Deploy' : 'Переходник не ответил'); };
acts['mk.login'] = () => { window.open(authorizeUrl(app().ctx().settings.direct.clientId), '_blank', 'noopener'); return false; };

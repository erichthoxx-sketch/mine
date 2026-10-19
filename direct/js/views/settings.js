// Настройки: подключение (переходник → приложение Яндекса → вход), предохранители, тестовый бюджет
import { esc, acts, forms, toast, ask, N } from '../../../js/ui.js';
import { rub } from '../../../js/format.js';
import { ic } from '../../../js/icons.js';
import { authorizeUrl, proxyVersion } from '../api.js';
import { setupCard } from './setup.js';
import { metrikaCard } from './metrika.js';
import { DEFAULT_MAX_BID, DEFAULT_TEST_BUDGET } from '../dcalc.js';

const app = () => window.__app;
const saveD = (patch) => app().store.saveSettings({ direct: { ...(app().ctx().settings.direct || {}), ...patch } });

export function settingsView(a) {
  const s = a.ctx().settings, d = s.direct || {}, on = !!s.directToken;
  const exp = s.directTokenExp ? new Date(s.directTokenExp) : null;
  const left = exp ? Math.round((exp - Date.now()) / 86400000) : null;
  return {
    html: `${setupCard(a.ctx())}
    ${on ? `<div class="card"><div class="row between"><h2 style="margin:0">Ключ Яндекса</h2><span class="d-st good">● подключён</span></div>
      <p class="small">${left != null ? `Действует ещё ${left} дн.` : 'Сохранён.'} ${left != null && left < 14 ? '<b>Скоро истечёт — войдите заново.</b>' : ''}</p>
      <div class="row"><button data-act="d.login"${d.clientId ? '' : ' disabled'}>Войти заново</button><button class="link danger" data-act="d.off">Отключить</button></div></div>` : ''}
    ${proxyCard(d)}
    ${on ? metrikaCard(a.ctx()) : ''}
    <div class="card"><details><summary class="small">Вставить ключ Яндекса вручную</summary><form data-form="d.token"><input name="t" type="password" autocomplete="off" placeholder="OAuth-токен Яндекса"><div class="row"><button type="submit">Сохранить ключ</button></div></form></details></div>
    <div class="card"><h2>Тест и предохранители</h2>
      <form data-form="d.opts" class="settings-form">
        <div class="f2"><div><label>Тестовый бюджет, ₽</label><input name="testBudget" inputmode="decimal" value="${esc(d.testBudget ?? DEFAULT_TEST_BUDGET)}"></div><div><label>Тест с даты</label><input type="date" name="testFrom" value="${esc(d.testFrom || '')}"></div></div>
        <label>Предел ставки за клик, ₽</label><input name="maxBid" inputmode="decimal" value="${esc(d.maxBid ?? DEFAULT_MAX_BID)}">
        <p class="hint">Дороже приложение (и ИИ через него) ставку не поставит. Бюджет и дневной лимит меняются только в кабинете Директа.</p>
        <label class="d-check"><input type="checkbox" name="sandbox" ${d.sandbox ? 'checked' : ''}> Песочница Директа (тренировка без денег)</label>
        <details class="d-more"><summary class="small">Для агентского аккаунта</summary><label>Логин клиента (Client-Login)</label><input name="clientLogin" value="${esc(d.clientLogin || '')}"></details>
        <div class="row d-save"><button class="primary" type="submit">Сохранить</button></div>
      </form></div>`,
  };
}
// новая версия переходника: шаги обновления (версию проверяем сами один раз за открытие)
export const PROXY_LATEST = 3;
let verChecked = false;
function proxyCard(d) {
  if (!d.proxy) return '';
  if (!verChecked) { verChecked = true; proxyVersion(app().ctx().settings).then((v) => { if (v && v !== d.proxyV) saveD({ proxyV: v }); }); }
  if (!d.proxyV || d.proxyV >= PROXY_LATEST) return '';
  return `<div class="card"><div class="row between"><h2 style="margin:0">Обновить переходник</h2><span class="d-st">версия ${d.proxyV} → ${PROXY_LATEST}</span></div>
    <p class="small">Новая версия умеет открывать страницы конкурсов — «Мастерская» сама подтянет условия по ссылке. Займёт минуту:</p>
    <ol class="small st-how">
      <li>Нажмите <button type="button" class="dl" data-act="st.worker">${ic('copy')} Скопировать новый код</button></li>
      <li>Откройте ${'<a href="https://dash.cloudflare.com/" target="_blank" rel="noopener">Cloudflare</a>'} → слева <b>Compute → Workers & Pages</b> → <b>direct</b> → справа вверху <b>Edit code</b>.</li>
      <li>В окне с кодом нажмите Ctrl+A (на Mac — Cmd+A), затем Ctrl+V — старый код заменится новым. Нажмите синюю кнопку <b>Deploy</b>.</li>
      <li>Вернитесь сюда и нажмите <button type="button" class="link" data-act="d.ver">Проверить</button>.</li>
    </ol></div>`;
}
acts['d.ver'] = async () => { const v = await proxyVersion(app().ctx().settings); await saveD({ proxyV: v }); toast(v >= PROXY_LATEST ? 'Переходник обновлён ✓' : v ? 'Пока старая версия — вставьте новый код и нажмите Deploy' : 'Переходник не ответил'); };
forms['d.opts'] = async (fd) => {
  const tb = N(fd.get('testBudget')), mb = N(fd.get('maxBid'));
  await saveD({ testBudget: tb > 0 ? tb : DEFAULT_TEST_BUDGET, testFrom: fd.get('testFrom') || '', maxBid: mb > 0 ? mb : DEFAULT_MAX_BID, sandbox: fd.get('sandbox') === 'on', clientLogin: (fd.get('clientLogin') || '').trim() });
  toast('Сохранено');
};
forms['d.token'] = async (fd) => {
  const t = fd.get('t').trim();
  if (t.length < 20) { toast('Это не похоже на ключ'); return; }
  await app().store.saveSettings({ directToken: t, directTokenExp: null });
  app().ui.demo = false; toast('Ключ сохранён'); app().reload?.({ quiet: true });
};
acts['d.login'] = () => { window.open(authorizeUrl(app().ctx().settings.direct.clientId), '_blank', 'noopener'); return false; };
acts['d.off'] = async () => {
  if (!(await ask('Отключить Директ? Кампании в Директе продолжат работать, просто приложение перестанет их видеть.', 'Отключить'))) return;
  await app().store.saveSettings({ directToken: '', directTokenExp: null });
  toast('Директ отключён');
};

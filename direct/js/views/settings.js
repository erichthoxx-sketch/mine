// Настройки: подключение (переходник → приложение Яндекса → вход), предохранители, тестовый бюджет
import { esc, acts, forms, toast, ask, N } from '../../../js/ui.js';
import { rub } from '../../../js/format.js';
import { authorizeUrl } from '../api.js';
import { setupCard } from './setup.js';
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
    <div class="card"><details><summary class="small">Вставить ключ Яндекса вручную</summary><form data-form="d.token"><input name="t" type="password" autocomplete="off" placeholder="OAuth-токен Яндекса"><div class="row"><button type="submit">Сохранить ключ</button></div></form></details></div>
    <div class="card"><h2>Тест и предохранители</h2>
      <form data-form="d.opts" class="settings-form">
        <div class="f2"><div><label>Тестовый бюджет, ₽</label><input name="testBudget" inputmode="decimal" value="${esc(d.testBudget ?? DEFAULT_TEST_BUDGET)}"></div><div><label>Тест с даты</label><input type="date" name="testFrom" value="${esc(d.testFrom || '')}"></div></div>
        <label>Предел ставки за клик, ₽</label><input name="maxBid" inputmode="decimal" value="${esc(d.maxBid ?? DEFAULT_MAX_BID)}">
        <p class="hint">Дороже приложение (и ИИ через него) ставку не поставит. Бюджет и дневной лимит меняются только в кабинете Директа.</p>
        <label class="row"><input type="checkbox" name="sandbox" ${d.sandbox ? 'checked' : ''}> Песочница Директа (тренировка без денег)</label>
        <details><summary class="small">Для агентского аккаунта</summary><label>Логин клиента (Client-Login)</label><input name="clientLogin" value="${esc(d.clientLogin || '')}"></details>
        <div class="row"><button class="primary" type="submit">Сохранить</button></div>
      </form>
      <p class="small muted">Сейчас: тест ${rub(Number(d.testBudget) || DEFAULT_TEST_BUDGET, 0)}, ставка не выше ${rub(Number(d.maxBid) || DEFAULT_MAX_BID, 0)}${d.sandbox ? ', песочница' : ''}.</p></div>`,
  };
}
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
acts['d.login'] = () => { location.href = authorizeUrl(app().ctx().settings.direct.clientId); return false; };
acts['d.off'] = async () => {
  if (!(await ask('Отключить Директ? Кампании в Директе продолжат работать, просто приложение перестанет их видеть.', 'Отключить'))) return;
  await app().store.saveSettings({ directToken: '', directTokenExp: null });
  toast('Директ отключён');
};

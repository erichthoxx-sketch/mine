// ИИ-помощник: «пакет» со всеми данными для любой нейросети и разбор её ответа в понятные действия с галочками
import { esc, acts, forms, changes, toast, download } from '../../../js/ui.js';
import { addDays, outageSet } from '../../../js/calc.js';
import { ic } from '../../../js/icons.js';
import { aiPackage, parsePlan, describe, totals, DEFAULT_MAX_BID, DEFAULT_TEST_BUDGET, PLAN_TAG } from '../dcalc.js';
import { namesOf } from '../sync.js';
import { logOf } from '../demo.js';
import { runAction } from './common.js';
import { metrikaOf } from './metrika.js';
import { PROVIDERS, askModel, splitPlan } from '../agent.js';
import { snap, putSnap, demo } from '../demo.js';

const app = () => window.__app;
const plan = { text: '', actions: [], errors: [], pick: [], done: {} };

// Всё, что нужно ИИ, — компактно: кампании, фразы со статистикой, объявления, запросы, расход по дням, что уже меняли
export function packageText(a, question = '') {
  const c = a.ctx(), main = a.snap('main') || {}, stats = a.snap('stats') || {}, d = c.settings.direct || {}, t = c.today;
  const daily = (stats.daily || []).filter((x) => x.date >= addDays(t, -29));
  const state = {
    campaigns: (main.campaigns || []).filter((x) => x.state !== 'ARCHIVED').map((x) => ({ ...x, last7: totals(daily, addDays(t, -6), t, x.id), last30: totals(daily, addDays(t, -29), t, x.id) })),
    groups: main.groups || [],
    keywords: (main.keywords || []).map((k) => ({ ...k, stats30: stats.kw?.[k.id] || null })),
    ads: (main.ads || []).filter((x) => x.state !== 'ARCHIVED'),
    searchQueries30: (stats.queries || []).slice(0, 150),
    dailySpend30: daily.map(({ date, cid, impr, clicks, cost }) => ({ date, cid, impr, clicks, cost })),
    ...(metrikaOf(c)?.counterId ? {
      metrika: { counter: metrikaOf(c).counterName, goals: metrikaOf(c).goals, mainGoals: metrikaOf(c).main },
      conversionsDaily30: (stats.conv || []).filter((x) => x.date >= addDays(t, -29)),
      keywordConversions30: stats.kwConv || {},
      pageBehavior30: stats.mrows || [],
    } : {}),
    outageDays: [...outageSet(c.data.days || [])].filter((x) => x >= addDays(t, -29)).sort(),
    recentChanges: logOf(a).slice().sort((x, y) => y.at.localeCompare(x.at)).slice(0, 20).map((x) => ({ at: x.at.slice(0, 10), what: x.text, why: x.why, ok: x.ok })),
  };
  return aiPackage(state, { today: t, maxBid: Number(d.maxBid) || DEFAULT_MAX_BID, budget: { test: Number(d.testBudget) || DEFAULT_TEST_BUDGET, from: d.testFrom || null }, question });
}

// ---------- ИИ-таргетолог: подключить Claude или ChatGPT ----------
const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#+\s*(.+)$/gm, '<b>$1</b>').replace(/\n/g, '<br>');
const when = (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
let running = false;

function agentCard(a) {
  const s = a.ctx().settings, ai = s.ai || {}, on = ai.on && (s.aiKeys || {})[ai.provider], last = snap(a, 'ai');
  if (!on || a.ui.agEdit) {
    const pv = a.ui.agProv || ai.provider || 'claude', P = PROVIDERS[pv];
    return `<div class="card"><h2>ИИ-таргетолог</h2>
      <p class="small">Подключите нейросеть — она сама разберёт ваши кампании (каждый день или по кнопке) и предложит план: что улучшить, что подождать и почему. Изменения в Директе — только те, что вы отметите галочкой.</p>
      <form data-form="ag.save" class="settings-form">
        <div class="chips">${Object.entries(PROVIDERS).map(([k, x]) => `<button type="button" class="chip ${pv === k ? 'on' : ''}" data-act="ag.prov" data-k="${k}">${x.name}${k === 'claude' ? ' · рекомендуется' : ''}</button>`).join('')}</div>
        <label>Ключ API ${P.name}</label><input name="key" type="password" autocomplete="off" placeholder="${pv === 'claude' ? 'sk-ant-…' : 'sk-…'}" value="${esc((s.aiKeys || {})[pv] || '')}" required>
        <p class="hint">Ключ берут в кабинете разработчика: <a href="${P.keyUrl}" target="_blank" rel="noopener">${P.keyUrl.replace('https://', '')}</a>. Это не подписка на чат, а оплата за использование — обычно десятки рублей за один разбор. Ключ хранится в ваших данных, как ключ Todoist.</p>
        <details class="d-more"><summary class="small">Модель</summary><input name="model" value="${esc(ai.provider === pv && ai.model ? ai.model : P.model)}"></details>
        <label class="d-check"><input type="checkbox" name="daily"${ai.daily !== false ? ' checked' : ''}> ИИ разбирает сам раз в день, когда я открываю приложение</label>
        <div class="row d-save"><button class="primary" type="submit">Подключить</button>${a.ui.agEdit ? '<button type="button" class="link" data-act="ag.cancel">Отмена</button>' : ''}</div>
      </form></div>`;
  }
  const P = PROVIDERS[ai.provider], other = Object.keys(PROVIDERS).find((k) => k !== ai.provider);
  return `<div class="card"><div class="row between"><h2 style="margin:0">ИИ-таргетолог</h2><span class="d-st good">● ${P.name} подключён</span></div>
    <p class="small muted">${last ? `Последний разбор: ${when(last.at)} (${esc(PROVIDERS[last.provider]?.name || '')})` : 'Разборов ещё не было.'}${ai.daily !== false ? ' · разбирает сам раз в день' : ''}</p>
    <div class="row"><button class="primary" data-act="ag.run"${running || !a.snap('main') ? ' disabled' : ''}>${running ? 'Разбираю…' : 'Разобрать сейчас'}</button>
      <button class="link" data-act="ag.switch" data-k="${other}">Сменить на ${PROVIDERS[other].name}</button><button class="link" data-act="ag.edit">Настроить</button><button class="link danger" data-act="ag.off">Отключить</button></div></div>`;
}
acts['ag.prov'] = (d) => { app().ui.agProv = d.k; };
acts['ag.edit'] = () => { app().ui.agEdit = true; app().ui.agProv = app().ctx().settings.ai?.provider; };
acts['ag.cancel'] = () => { app().ui.agEdit = false; };
forms['ag.save'] = async (fd) => {
  const s = app().ctx().settings, pv = app().ui.agProv || s.ai?.provider || 'claude', key = fd.get('key').trim();
  if (key.length < 20) { toast('Это не похоже на ключ — скопируйте его целиком'); return; }
  await app().store.saveSettings({ ai: { on: true, provider: pv, model: (fd.get('model') || '').trim() || PROVIDERS[pv].model, daily: fd.get('daily') === 'on' }, aiKeys: { ...(s.aiKeys || {}), [pv]: key } });
  app().ui.agEdit = false; toast(`${PROVIDERS[pv].name} подключён`);
};
acts['ag.switch'] = async (d) => {
  const s = app().ctx().settings;
  if (!(s.aiKeys || {})[d.k]) { app().ui.agEdit = true; app().ui.agProv = d.k; return; }
  await app().store.saveSettings({ ai: { ...(s.ai || {}), provider: d.k, model: PROVIDERS[d.k].model } });
  toast(`Теперь разбирает ${PROVIDERS[d.k].name}`);
};
acts['ag.off'] = async () => { await app().store.saveSettings({ ai: { ...(app().ctx().settings.ai || {}), on: false } }); toast('ИИ отключён. Ключ сохранён — включить снова можно одной кнопкой.'); };
acts['ag.run'] = () => { runAgent(app()); return false; };

// Разбор нейросетью: данные → ответ → план с галочками (применяет только владелица)
export async function runAgent(a, { quiet = false } = {}) {
  if (running) return;
  const s = a.ctx().settings;
  running = true; a.rerender();
  try {
    const text = await askModel(s, packageText(a, 'Проведи регулярный разбор: что улучшить, что подождать и почему.'));
    const r = splitPlan(text, { maxBid: Number(s.direct?.maxBid) || DEFAULT_MAX_BID });
    await putSnap(a, [{ id: 'ai', at: new Date().toISOString(), provider: s.ai.provider, model: s.ai.model, analysis: r.analysis, text, ...(demo.on ? { demo: true } : {}) }]);
    Object.assign(plan, { text, actions: r.actions, errors: r.errors, pick: r.actions.map(() => true), done: {}, from: 'agent' });
    if (!quiet) toast(r.actions.length ? `Разбор готов: предложено действий — ${r.actions.length}` : 'Разбор готов: менять ничего не нужно');
  } catch (e) { if (!quiet) toast(e.message || String(e)); else console.warn(e); } finally { running = false; a.rerender(); }
}
// Раз в день, если включено: только разбор и план — без изменений в кабинете
export function maybeDailyAgent(a) {
  const s = a.ctx().settings, ai = s.ai || {}, last = snap(a, 'ai');
  if (!ai.on || ai.daily === false || !(s.aiKeys || {})[ai.provider] || !a.snap('main') || demo.on) return;
  if (last && Date.now() - Date.parse(last.at) < 20 * 3600000) return;
  runAgent(a, { quiet: true });
}

function planCard(a) {
  const names = namesOf(a.snap('main')), last = snap(a, 'ai');
  if (!plan.actions.length && !plan.errors.length && last?.text && !plan.text) {
    const r = splitPlan(last.text, { maxBid: Number(a.ctx().settings.direct?.maxBid) || DEFAULT_MAX_BID });
    Object.assign(plan, { text: last.text, actions: r.actions, errors: r.errors, pick: r.actions.map(() => true), done: {}, from: 'agent' });
  }
  const analysis = plan.from === 'agent' && last?.analysis ? last.analysis : '';
  if (!analysis && !plan.actions.length && !plan.errors.length) return '';
  return `<div class="card"><h2>${plan.from === 'agent' ? 'Разбор и план' : 'План из ответа ИИ'}</h2>
    ${analysis ? `<div class="small ag-text">${md(analysis)}</div>` : ''}
    ${plan.errors.length ? `<div class="alert">${plan.errors.map(esc).join('<br>')}</div>` : ''}
    ${plan.actions.length ? `<p class="small muted">Отметьте, что применить. Без вашей кнопки в кабинете ничего не меняется.</p><div class="list">${plan.actions.map((x, i) => {
      const r = plan.done[i];
      return `<label class="item row d-pick"><input type="checkbox" data-chg="ai.pick" data-i="${i}" ${plan.pick[i] ? 'checked' : ''} ${r ? 'disabled' : ''}><span><b>${esc(describe(x, names))}</b>${x.why ? `<span class="sub">${esc(x.why)}</span>` : ''}${r ? `<span class="sub ${r.ok ? 'up' : 'down'}">${r.ok ? '✓ применено' : '✗ ' + esc(r.err)}</span>` : ''}</span></label>`;
    }).join('')}</div>
    <div class="row"><button class="primary" data-act="ai.apply"${plan.pick.some((p, i) => p && !plan.done[i]) ? '' : ' disabled'}>Применить отмеченное</button><button class="link" data-act="ai.clear">Скрыть</button></div>` : ''}</div>`;
}

export function aiView(a) {
  const has = !!a.snap('main');
  return {
    html: `${agentCard(a)}${planCard(a)}
    <div class="card"><details class="d-more"${a.ctx().settings.ai?.on ? '' : ' open'}><summary><b>Вручную через любой чат</b></summary>
      <p class="small">Приложение соберёт все данные Директа в один текст — вставьте его в любой чат с нейросетью, а её ответ — ниже.</p>
      <label for="aiQ">Ваш вопрос (можно пусто)</label><textarea id="aiQ" rows="2" placeholder="Например: что убрать, чтобы клики были дешевле?"></textarea>
      <div class="row dl-row"><button class="dl" data-act="ai.copy"${has ? '' : ' disabled'}>${ic('copy')} Скопировать для ИИ</button><button class="dl" data-act="ai.file"${has ? '' : ' disabled'}>${ic('download')} Скачать файлом</button></div>
      <form data-form="ai.parse"><label>Ответ нейросети</label><textarea name="v" rows="4" placeholder="Вставьте ответ целиком — приложение найдёт в нём план (блок ${esc(PLAN_TAG)})">${plan.from === 'agent' ? '' : esc(plan.text)}</textarea><div class="row"><button type="submit">Разобрать</button></div></form></details></div>
    <div class="card"><h2>Как это устроено</h2><p class="small">Нейросеть видит только данные, которые ей передаёт приложение, и сама в кабинет не заходит. Изменения делает приложение — и только после вашей галочки. Бюджет не меняет никто, кроме вас: лимит ставится в кабинете Директа. Ставку дороже предела из Настроек приложение не примет. Все изменения записываются в «Историю».</p></div>`,
  };
}
const q = () => document.getElementById('aiQ')?.value.trim() || '';
acts['ai.copy'] = async () => {
  try { await navigator.clipboard.writeText(packageText(app(), q())); toast('Скопировано — вставьте в чат с ИИ'); } catch { toast('Не получилось скопировать — нажмите «Скачать файлом»'); }
  return false;
};
acts['ai.file'] = async () => { await download(`direkt_dlya_ii_${app().ctx().today}.md`, packageText(app(), q()), 'text/markdown'); return false; };
forms['ai.parse'] = (fd) => {
  const r = parsePlan(fd.get('v'), { maxBid: Number(app().ctx().settings.direct?.maxBid) || DEFAULT_MAX_BID });
  Object.assign(plan, { text: fd.get('v'), actions: r.actions, errors: r.errors, pick: r.actions.map(() => true), done: {}, from: 'manual' });
  if (r.actions.length) toast(`Нашла действий: ${r.actions.length}`);
  app().rerender();
};
changes['ai.pick'] = (v, el, on) => { plan.pick[el.dataset.i] = on; app().rerender(); };
acts['ai.clear'] = () => { Object.assign(plan, { text: ' ', actions: [], errors: [], pick: [], done: {}, from: '' }); };
acts['ai.apply'] = async () => {
  for (let i = 0; i < plan.actions.length; i++) {
    if (!plan.pick[i] || plan.done[i]) continue;
    try {
      const r = await runAction(plan.actions[i], { by: 'ai', confirm: false });
      plan.done[i] = r.errors.length ? { ok: false, err: r.errors.join('; ') } : { ok: true };
    } catch (e) { plan.done[i] = { ok: false, err: e.message || String(e) }; }
  }
  const bad = Object.values(plan.done).filter((x) => !x.ok).length;
  toast(bad ? `Готово, но ${bad} не применилось — причины в списке` : 'Всё применено');
};

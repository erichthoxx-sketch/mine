// ИИ-помощник: «пакет» со всеми данными для любой нейросети и разбор её ответа в понятные действия с галочками
import { esc, acts, forms, changes, toast, download } from '../../../js/ui.js';
import { addDays, outageSet } from '../../../js/calc.js';
import { ic } from '../../../js/icons.js';
import { aiPackage, parsePlan, describe, totals, DEFAULT_MAX_BID, DEFAULT_TEST_BUDGET, PLAN_TAG } from '../dcalc.js';
import { namesOf } from '../sync.js';
import { logOf } from '../demo.js';
import { runAction } from './common.js';
import { metrikaOf } from './metrika.js';

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

export function aiView(a) {
  const names = namesOf(a.snap('main'));
  const has = !!a.snap('main');
  return {
    html: `<div class="card"><h2>1. Спросить ИИ</h2>
      <p class="small">Приложение соберёт все данные Директа в один текст. Вставьте его в Claude, ChatGPT или другую нейросеть — она разберёт кампании и пришлёт план изменений.</p>
      <label for="aiQ">Ваш вопрос (можно пусто)</label><textarea id="aiQ" rows="2" placeholder="Например: что убрать, чтобы клики были дешевле?"></textarea>
      <div class="row dl-row"><button class="dl" data-act="ai.copy"${has ? '' : ' disabled'}>${ic('copy')} Скопировать для ИИ</button><button class="dl" data-act="ai.file"${has ? '' : ' disabled'}>${ic('download')} Скачать файлом</button></div></div>
    <div class="card"><h2>2. Вставьте ответ ИИ</h2>
      <p class="small muted">Весь ответ целиком — приложение само найдёт в нём план (блок ${esc(PLAN_TAG)}) и покажет каждое действие. Применится только то, что вы отметите.</p>
      <form data-form="ai.parse"><textarea name="v" rows="5" placeholder="Вставьте сюда ответ нейросети">${esc(plan.text)}</textarea><div class="row"><button type="submit">Разобрать</button></div></form>
      ${plan.errors.length ? `<div class="alert">${plan.errors.map(esc).join('<br>')}</div>` : ''}
      ${plan.actions.length ? `<div class="list">${plan.actions.map((x, i) => {
        const r = plan.done[i];
        return `<label class="item row d-pick"><input type="checkbox" data-chg="ai.pick" data-i="${i}" ${plan.pick[i] ? 'checked' : ''} ${r ? 'disabled' : ''}><span><b>${esc(describe(x, names))}</b>${x.why ? `<span class="sub">${esc(x.why)}</span>` : ''}${r ? `<span class="sub ${r.ok ? 'up' : 'down'}">${r.ok ? '✓ применено' : '✗ ' + esc(r.err)}</span>` : ''}</span></label>`;
      }).join('')}</div>
      <div class="row"><button class="primary" data-act="ai.apply"${plan.pick.some((p, i) => p && !plan.done[i]) ? '' : ' disabled'}>Применить отмеченное</button><button class="link" data-act="ai.clear">Очистить</button></div>` : ''}</div>
    <div class="card"><h2>Как это устроено</h2><p class="small">ИИ видит только то, что вы ему вставили, и сам в кабинет не заходит. Изменения делает приложение — и только после вашей галочки. Бюджет не меняет никто, кроме вас: дневной лимит ставится в кабинете Директа. Все изменения записываются в «Историю».</p></div>`,
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
  Object.assign(plan, { text: fd.get('v'), actions: r.actions, errors: r.errors, pick: r.actions.map(() => true), done: {} });
  if (r.actions.length) toast(`Нашла действий: ${r.actions.length}`);
  app().rerender();
};
changes['ai.pick'] = (v, el, on) => { plan.pick[el.dataset.i] = on; app().rerender(); };
acts['ai.clear'] = () => { Object.assign(plan, { text: '', actions: [], errors: [], pick: [], done: {} }); };
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

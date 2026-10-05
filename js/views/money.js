import { esc, acts, forms, openSheet, opt, toast, N, changes } from '../ui.js';
import { rub, fmtMonth, fmtMonthShort, pct, num } from '../format.js';
import { monthFinance, monthKey, monthsBetween, byMonth, buildPlan, goalRows, daysInMonth, taxRows, monthEnd, npdDeadline, rocketRows } from '../calc.js';
import { fmtDate } from '../format.js';
import { goalChart } from '../charts.js';

const app = () => window.__app;
const fin = (c, k) => monthFinance(k, { sales: c.sales, legacyDays: c.legacyDays, spend: c.spend, discounts: c.discounts, months: c.monthsMap, settings: c.settings });

export function money(a) {
  const c = a.ctx(), ui = a.ui;
  if (!c.hasData) return { html: '<div class="card"><p>Сначала загрузите выгрузку продаж на вкладке «Данные».</p></div>' };
  const cur = monthKey(c.dataEnd); // последний месяц, по которому есть данные
  const keys = monthsBetween(monthKey(c.firstDate), monthKey(c.today)).reverse();
  const sel = ui.month && keys.includes(ui.month) ? ui.month : cur;
  const f = fin(c, sel);
  const s = c.settings;
  const plan = buildPlan({ startMonth: s.goalStart, startAmount: Number(s.goalAmount), growth: Number(s.goalGrowth) / 100, count: Number(s.goalMonths) || 13, overrides: s.planOverrides || {} });
  const factBy = Object.fromEntries(byMonth(c.series).map((g) => [g.key, g.royalty]));
  const rows = goalRows(plan, factBy, cur).map((r) => ({ ...r, label: fmtMonth(r.month), short: fmtMonthShort(r.month) }));
  const curRow = rows.find((r) => r.partial);
  const dom = Number(c.dataEnd.slice(8, 10));
  const forecast = curRow && monthKey(c.dataEnd) === cur && dom ? (curRow.fact / dom) * daysInMonth(cur) : null;

  const html = `
  ${taxCard(c, sel, keys)}
  <div class="card"><div class="row between"><h2 style="margin:0">Итоги месяца</h2><select id="mSel" data-chg="money.month" style="width:auto">${keys.map((k) => opt(k, fmtMonth(k), sel)).join('')}</select></div>
    <table style="margin-top:8px">
      <tr><td><b>Доход до вычетов</b> <span class="muted small">(роялти)</span></td><td><b>${rub(f.royalty)}</b></td></tr>
      <tr><td>− Комиссия Rocket <span class="muted small">${f.rocketIndex != null ? 'индекс ' + num(f.rocketIndex, 1) : 'нет цифр'}</span></td><td>${rub(f.rocketFee)}</td></tr>
      <tr><td>= После Rocket</td><td>${rub(f.afterRocket)}</td></tr>
      <tr><td>− Реклама «Литнет платит» <span class="muted small">${rub(f.litnetSpend)}${f.litnetDiscount ? ' − скидка ' + rub(f.litnetDiscount) : ''}</span></td><td>${rub(f.litnetSpend - f.litnetDiscount)}</td></tr>
      <tr><td>− Моя реклама (свой таргет, другое)</td><td>${rub(f.ownSpend)}</td></tr>
      <tr><td>− Налог <span class="muted small">${s.taxRate}% от ${s.taxBase === 'royalty' ? 'роялти' : 'полной цены книг'} (${rub(f.taxBase)})</span></td><td>${rub(f.tax)}</td></tr>
      <tr class="total"><td>Чистый доход</td><td class="${f.net >= 0 ? 'up' : 'down'}">${rub(f.net)}</td></tr>
    </table>
    <div class="row" style="margin-top:10px"><button class="primary" data-act="month.edit" data-m="${sel}">Расходы на рекламу за ${fmtMonth(sel)}</button></div>
    ${f.rocketFee ? '' : '<div class="hint">Цифры Rocket за прошедший месяц записываются на вкладке «Реклама». Пока их нет, чистый доход немного завышен.</div>'}
  </div>
  <div class="card"><h2>По месяцам</h2><div class="scroll"><table><tr><th>Месяц</th><th>Роялти</th><th>Rocket</th><th>Реклама</th><th>Налог</th><th>Чистый</th></tr>
    ${keys.map((k) => { const x = fin(c, k); return `<tr><td>${fmtMonthShort(k)}</td><td>${rub(x.royalty, 0)}</td><td>${rub(x.rocketFee, 0)}</td><td>${rub(x.adCost, 0)}</td><td>${rub(x.tax, 0)}</td><td class="${x.net >= 0 ? '' : 'down'}"><b>${rub(x.net, 0)}</b></td></tr>`; }).join('')}</table></div></div>
  <div class="card"><div class="row between"><h2>Цели</h2><button class="primary" data-act="goal.all">Изменить цели</button></div>
    <p class="small muted">Старт: ${fmtMonth(s.goalStart)} — ${rub(s.goalAmount, 0)}, дальше +${s.goalGrowth}% в месяц; свои цели по месяцам — кнопка «Изменить цели». Факт — доход до вычетов (роялти).</p>
    <div class="chart" id="goalChart"></div>
    <div class="legend"><span><i style="background:var(--bar)"></i>факт (светлый — месяц ещё идёт)</span><span><i class="ln"></i>план</span><span><i class="ln3"></i>среднее за 3 месяца</span></div>
    ${forecast != null ? `<div class="alert ${forecast >= curRow.plan ? 'ok' : ''}">${fmtMonth(cur)}: пока ${rub(curRow.fact, 0)}, при таком темпе к концу месяца ≈ ${rub(forecast, 0)} (план ${rub(curRow.plan, 0)}).</div>` : ''}
    <div class="scroll"><table><tr><th>Месяц</th><th>План</th><th>Факт</th><th>±</th><th>Среднее 3 мес.</th><th></th></tr>
    ${rows.map((r) => `<tr><td>${fmtMonthShort(r.month)}</td><td>${rub(r.plan, 0)}${s.planOverrides?.[r.month] != null && s.planOverrides[r.month] !== '' ? '*' : ''}</td><td>${r.fact == null ? '—' : rub(r.fact, 0)}</td><td class="${r.diff == null ? '' : r.diff >= 0 ? 'up' : 'down'}">${r.diff == null ? '' : rub(r.diff, 0)}</td><td>${r.ma3 == null ? '—' : rub(r.ma3, 0)}</td><td><button class="link" data-act="goal.edit" data-m="${r.month}">✎</button></td></tr>`).join('')}</table></div>
    <div class="hint">* план изменён вручную. Среднее за 3 месяца считается по полным и текущему месяцам.</div></div>`;
  return { html, after: () => goalChart(document.getElementById('goalChart'), { rows, fmtVal: (v) => rub(v, 0) }) };
}

changes['money.month'] = (v) => { app().ui.month = v; app().rerender(); };

acts['month.edit'] = (d) => {
  const c = app().ctx(), m = c.monthsMap[d.m] || {};
  const auto = c.spend[d.m]?.litnet || 0;
  openSheet(`Месяц: ${fmtMonth(d.m)}`, `
    <h3>Rocket</h3>
    <div class="f2"><div><label>Индекс Rocket</label><input name="rocketIndex" inputmode="decimal" value="${m.rocketIndex ?? ''}"></div><div><label>Комиссия за месяц, ₽</label><input name="rocketFee" inputmode="decimal" value="${m.rocketFee ?? ''}"></div></div>
    <div class="hint">Индекс — не выше ${c.settings.rocketCap} ₽ за продажу. Комиссия — итог из кабинета («Комиссия Rocket»), она списывается из роялти.</div>
    <h3>Расходы на рекламу</h3>
    <label>«Литнет платит»: фактический расход за месяц, ₽</label><input name="litnetSpend" inputmode="decimal" value="${m.litnetSpend ?? ''}" placeholder="по отчётам: ${num(auto, 2)}">
    <div class="hint">Оставьте пустым — возьмётся сумма по недельным отчётам (${rub(auto)}). Впишите, если знаете точную цифру за календарный месяц.</div>
    <label>Прочие мои расходы на рекламу, ₽</label><input name="extraAdSpend" inputmode="decimal" value="${m.extraAdSpend ?? ''}">
    <div class="hint">То, что не внесено в кампании: например, платные баннеры.</div>`, async (fd) => {
    const idx = N(fd.get('rocketIndex'));
    if (idx != null && !Number.isNaN(idx) && idx > c.settings.rocketCap) toast(`Индекс ${idx} выше обычного потолка ${c.settings.rocketCap} ₽ — проверьте цифру`);
    const val = (n) => { const v = N(fd.get(n)); return v == null || Number.isNaN(v) ? null : v; };
    await app().store.put('months', { ...m, id: d.m, month: d.m, rocketIndex: val('rocketIndex'), rocketFee: val('rocketFee'), litnetSpend: val('litnetSpend'), extraAdSpend: val('extraAdSpend') });
    toast('Сохранено');
  });
};

acts['goal.edit'] = (d) => {
  const s = app().ctx().settings;
  const cur = s.planOverrides?.[d.m] ?? '';
  openSheet(`План: ${fmtMonth(d.m)}`, `<label>План на месяц, ₽</label><input name="v" inputmode="decimal" value="${cur}" placeholder="по формуле роста"><div class="hint">Пусто — вернуть расчёт по росту ${s.goalGrowth}% в месяц.</div>`, async (fd) => {
    const v = N(fd.get('v'));
    const o = { ...(s.planOverrides || {}) };
    if (v == null || Number.isNaN(v)) delete o[d.m]; else o[d.m] = v;
    await app().store.saveSettings({ planOverrides: o });
  });
};

// Все цели разом: формула роста + ручные суммы по месяцам
acts['goal.all'] = () => {
  const s = app().ctx().settings;
  const plan = buildPlan({ startMonth: s.goalStart, startAmount: Number(s.goalAmount), growth: Number(s.goalGrowth) / 100, count: Number(s.goalMonths) || 13, overrides: {} });
  const ov = s.planOverrides || {};
  openSheet('Цели по месяцам', `
    <p class="small muted">Впишите свою цель в любой месяц. Пустое поле — цель считается по формуле роста (серое число).</p>
    <div class="f2"><div><label for="gs">Первый месяц</label><input id="gs" type="month" name="goalStart" value="${s.goalStart}"></div>
    <div><label for="ga">Цель первого месяца, ₽</label><input id="ga" name="goalAmount" inputmode="decimal" value="${s.goalAmount}"></div></div>
    <div class="f2"><div><label for="gg">Рост в месяц, %</label><input id="gg" name="goalGrowth" inputmode="decimal" value="${s.goalGrowth}"></div>
    <div><label for="gm">Месяцев в плане</label><input id="gm" name="goalMonths" inputmode="numeric" value="${Number(s.goalMonths) || 13}"></div></div>
    <h3>Мои цели</h3>
    <div class="scroll"><table>${plan.map((p) => `<tr><td><label for="p_${p.month}" style="margin:0">${fmtMonth(p.month)}</label></td><td><input id="p_${p.month}" name="p_${p.month}" inputmode="decimal" value="${ov[p.month] ?? ''}" placeholder="${num(p.auto)}" style="max-width:150px"></td></tr>`).join('')}</table></div>
    <label class="check"><input type="checkbox" name="reset">Сбросить все мои цели к формуле</label>`, async (fd) => {
    const n = (k) => { const v = N(fd.get(k)); return v == null || Number.isNaN(v) ? undefined : v; };
    const o = fd.get('reset') ? {} : { ...ov };
    if (!fd.get('reset')) for (const p of plan) { const v = n('p_' + p.month); if (v === undefined) delete o[p.month]; else o[p.month] = v; }
    const patch = { goalStart: fd.get('goalStart') || s.goalStart, goalAmount: n('goalAmount') ?? s.goalAmount, goalGrowth: n('goalGrowth') ?? s.goalGrowth, goalMonths: Math.min(36, Math.max(1, Math.round(n('goalMonths') ?? 13))), planOverrides: o };
    await app().store.saveSettings(patch);
    toast('Цели сохранены');
  });
};

// ---------- налог к уплате ----------
function taxCard(c, sel, keys) {
  const s = c.settings;
  const t = taxRows([...keys].reverse(), (k) => fin(c, k), c.monthsMap, c.dataEnd);
  const r = t.rows.find((x) => x.month === sel);
  const going = !r.closed;
  return `<div class="card tax"><div class="row between"><h2 style="margin:0">Налог к уплате</h2>${t.unpaid ? `<span class="badge bad">не оплачено: ${rub(t.unpaid, 0)}</span>` : '<span class="badge good">долгов нет</span>'}</div>
    <div class="small muted" style="margin-top:6px">${fmtMonth(sel)}${going ? ' — месяц ещё идёт, сумма вырастет' : ''}</div>
    <div class="tax-sum">${rub(r.tax)}</div>
    <div class="small muted">${s.taxRate}% от ${s.taxBase === 'royalty' ? 'роялти' : 'полной цены, которую заплатили читатели'}: ${rub(r.base)}</div>
    ${!r.paid && r.tax ? `<div class="small" style="margin-top:4px">Оплатить до <b>${fmtDate(npdDeadline(sel))}</b></div>` : ''}
    <div class="row" style="margin-top:10px">${going ? '<span class="small muted">Чек за этот месяц — после его окончания, когда сумма станет окончательной.</span>' : `<button data-act="tax.check" data-m="${sel}">🧾 Какой чек пробить</button>`}${r.paid ? `<span class="badge good">✔ оплачен${r.paidAt ? ' ' + fmtDate(r.paidAt) : ''}</span><button class="link" data-act="tax.unpay" data-m="${sel}">отменить</button>` : going ? '' : `<button class="primary" data-act="tax.pay" data-m="${sel}">Отметить оплаченным</button>`}</div>
    ${t.unpaidMonths.filter((k) => k !== sel || going).length ? `<div class="unpaid"><div class="small" style="font-weight:800;margin-bottom:6px">Не оплачено:</div>${t.rows.filter((x) => t.unpaidMonths.includes(x.month)).map((x) => `<div class="row between" style="padding:6px 0"><span>${fmtMonth(x.month)} — <b>${rub(x.tax, 0)}</b><br><span class="small muted">оплатить до ${fmtDate(npdDeadline(x.month))}</span></span><span class="row"><button data-act="tax.check" data-m="${x.month}">🧾 Чек</button><button class="primary" data-act="tax.pay" data-m="${x.month}">Оплачено ✓</button></span></div>`).join('')}</div>` : ''}
    <details style="margin-top:10px"><summary>По всем месяцам</summary><div class="scroll"><table><tr><th>Месяц</th><th>С суммы</th><th>Налог</th><th>Статус</th><th>Чек</th></tr>
    ${[...t.rows].reverse().map((x) => `<tr><td>${fmtMonthShort(x.month)}</td><td>${rub(x.base, 0)}</td><td><b>${rub(x.tax, 0)}</b></td><td>${x.paid ? `<span class="up">✔ ${x.paidAt ? fmtDate(x.paidAt) : 'оплачен'}</span>` : !x.closed ? '<span class="muted">идёт</span>' : x.tax ? `<button class="link" data-act="tax.pay" data-m="${x.month}">оплатила</button>` : '—'}</td><td>${x.closed && x.tax ? `<button class="link" data-act="tax.check" data-m="${x.month}">🧾</button>` : ''}</td></tr>`).join('')}</table></div></details>
    <div class="hint">Ставку и с чего считать налог можно поменять в «Данные» → «Настройки».</div></div>`;
}
acts['tax.pay'] = async (d) => {
  const c = app().ctx(), m = c.monthsMap[d.m] || {};
  await app().store.put('months', { ...m, id: d.m, month: d.m, taxPaid: true, taxPaidAt: c.today });
  toast(`Налог за ${fmtMonth(d.m)} отмечен оплаченным`);
};
acts['tax.unpay'] = async (d) => {
  const c = app().ctx(), m = c.monthsMap[d.m] || {};
  await app().store.put('months', { ...m, id: d.m, month: d.m, taxPaid: false, taxPaidAt: '' });
};

// Подсказка для «Мой налог»: какие поля заполнить
acts['tax.check'] = (d) => {
  const c = app().ctx(), f = fin(c, d.m), s = c.settings;
  const sumTxt = f.taxBase.toFixed(2).replace('.', ',');
  const name = `Продажа электронных книг читателям через Литнет (агентский договор), ${fmtMonth(d.m)}`;
  const going = monthEnd(d.m) > c.dataEnd;
  if (going) { toast('Чек пробивают после окончания месяца, когда сумма станет окончательной'); return; }
  const field = (label, value, copy) => `<div class="item"><div class="small muted">${label}</div><div class="row between"><b style="overflow-wrap:anywhere">${esc(value)}</b>${copy ? `<button type="button" class="link" data-act="copy" data-text="${esc(copy)}">копировать</button>` : ''}</div></div>`;
  openSheet(`Чек в «Мой налог» — ${fmtMonth(d.m)}`, `
    ${going ? '<div class="alert">Месяц ещё идёт — сумма вырастет. Чек лучше пробить после конца месяца, когда загрузите полную выгрузку Литнета.</div>' : ''}
    <p class="small">Приложение «Мой налог» → <b>«Новая продажа»</b> (+ внизу), заполните так:</p>
    <div class="list">
      ${field('Наименование', name, name)}
      ${field('Сумма', rub(f.taxBase), sumTxt)}
      ${field('Покупатель', 'Физическое лицо')}
      ${field('Дата продажи', fmtDate(going ? c.dataEnd : monthEnd(d.m)) + (going ? ' (пока)' : ' — последний день месяца'))}
    </div>
    <p class="small">Налог с этого чека: <b>${rub(f.tax)}</b> (${s.taxRate}% от суммы). Оплатить до <b>${fmtDate(npdDeadline(d.m))}</b>. Чек пробить — до 9-го числа следующего месяца.</p>
    <p class="hint">Почему сумма больше, чем пришло на карту: по агентскому договору Литнет продаёт ваши книги читателям от вашего имени, поэтому доход — вся цена, которую заплатили читатели (${rub(f.taxBase)}), а не ${rub(f.royalty)} после комиссии. Покупатели — физлица, поэтому ставка 4 %. «Мой налог» может показать сумму налога чуть меньше — это значит, что работает налоговый вычет 10 000 ₽ для самозанятых, всё правильно.</p>
    <p class="hint">Это подсказка по ответу юриста и закону о самозанятых (422-ФЗ), а не официальная консультация.</p>`, null);
};
acts.copy = async (d) => {
  try { await navigator.clipboard.writeText(d.text); toast('Скопировано'); } catch { toast('Не получилось скопировать — выделите текст вручную'); }
};

// ---------- Rocket ----------
export function rocketCard(c, keys) {
  const r = rocketRows([...keys].reverse(), (k) => fin(c, k), c.monthsMap, c.today);
  const cur = r.rows.find((x) => !x.closed);
  const shown = [...r.rows].reverse().filter((x) => x.royalty > 0 || x.fee != null);
  return `<div class="card"><div class="row between"><h2 style="margin:0">Литнет Rocket</h2>${r.missing.length ? `<span class="badge">нет цифр: ${r.missing.length} мес.</span>` : ''}</div>
    <p class="small muted" style="margin:6px 0 0">Комиссию Литнет списывает из роялти сам. Здесь вы просто записываете цифры из кабинета Rocket за прошедший месяц — чтобы видеть, сколько продаж принесла реклама Литнета и во сколько она обошлась.</p>
    ${r.missing.length ? `<div class="unpaid"><div class="small" style="font-weight:800;margin-bottom:6px">Нет цифр за:</div>${r.rows.filter((x) => r.missing.includes(x.month)).map((x) => `<div class="row between" style="padding:6px 0"><span>${fmtMonth(x.month)}<br><span class="small muted">итог в кабинете — после ${fmtDate(x.chargeBy)}</span></span><button class="primary" data-act="rocket.edit" data-m="${x.month}">Записать</button></div>`).join('')}</div>` : ''}
    ${cur ? `<p class="small muted" style="margin:10px 0 0">${fmtMonth(cur.month)} ещё идёт — цифры за него запишите после ${fmtDate(cur.chargeBy)}, когда Литнет спишет комиссию и они перестанут меняться.</p>` : ''}
    ${shown.some((x) => x.fee != null) ? `<div class="scroll" style="margin-top:10px"><table><tr><th>Месяц</th><th>Индекс</th><th>Комиссия</th><th>≈ продаж через Rocket</th><th>Доля от роялти</th><th></th></tr>
      ${shown.filter((x) => x.closed).map((x) => `<tr><td>${fmtMonthShort(x.month)}</td><td>${x.index == null ? '—' : num(x.index, 1)}</td><td>${x.fee == null ? '<span class="muted">—</span>' : rub(x.fee, 0)}</td><td>${x.sales ?? '—'}</td><td>${x.share == null ? '—' : pct(x.share, 1)}</td><td><button class="link" data-act="rocket.edit" data-m="${x.month}">✎</button></td></tr>`).join('')}</table></div>
      <div class="hint">≈ продаж через Rocket = комиссия ÷ индекс: сколько продаж принесла реклама Литнета. Доля — сколько роялти ушло на комиссию.</div>` : ''}
  </div>`;
}
acts['rocket.edit'] = (d) => {
  const c = app().ctx(), m = c.monthsMap[d.m] || {};
  openSheet(`Rocket — ${fmtMonth(d.m)}`, `<p class="small muted">Цифры из кабинета Rocket за ${fmtMonth(d.m)} (фильтр «прошлый месяц»): «Индекс» и «Комиссия Rocket».</p>
    <div class="f2"><div><label for="ri">Индекс Rocket</label><input id="ri" name="rocketIndex" inputmode="decimal" value="${m.rocketIndex ?? ''}" placeholder="например 34,9"></div>
    <div><label for="rf">Комиссия, ₽</label><input id="rf" name="rocketFee" inputmode="decimal" value="${m.rocketFee ?? ''}" placeholder="например 3 730"></div></div>
    <div class="hint">Если продаж через Rocket не было — комиссия 0.</div>`, async (fd) => {
    const val = (n) => { const v = N(fd.get(n)); return v == null || Number.isNaN(v) ? null : v; };
    const idx = val('rocketIndex');
    if (idx != null && idx > c.settings.rocketCap) toast(`Индекс ${idx} выше обычного потолка ${c.settings.rocketCap} ₽ — проверьте цифру`);
    await app().store.put('months', { ...m, id: d.m, month: d.m, rocketIndex: idx, rocketFee: val('rocketFee') });
    toast('Цифры Rocket записаны');
  });
};

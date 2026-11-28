const DAYS = 86_400_000;
const UNITS = ["RUB", "USD", "CAPS"];
const calendar = new Intl.DateTimeFormat("sv-SE", {timeZone:"Europe/Moscow", dateStyle:"short"});
const time = new Intl.DateTimeFormat("ru-RU", {
  timeZone:"Europe/Moscow", day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit"
});
const periodLabel = new Intl.DateTimeFormat("ru-RU", {timeZone:"UTC", day:"numeric", month:"short"});
const monthLabel = new Intl.DateTimeFormat("ru-RU", {timeZone:"UTC", month:"short", year:"2-digit"});
const number = new Intl.NumberFormat("ru-RU");
const currencies = {
  RUB:new Intl.NumberFormat("ru-RU", {style:"currency", currency:"RUB", maximumFractionDigits:4}),
  USD:new Intl.NumberFormat("ru-RU", {style:"currency", currency:"USD", maximumFractionDigits:6})
};
const money = value => Number.isFinite(value) && value >= 0;
const day = value => Number.isFinite(Date.parse(value)) ? calendar.format(new Date(value)) : "";
const date = value => Number.isFinite(Date.parse(value)) ? time.format(new Date(value)) : "Дата неизвестна";

export function formatExpense(value, unit) {
  return unit === "CAPS" ? number.format(value) + " Caps" : currencies[unit].format(value);
}

export function savedEstimate(estimate) {
  if (!estimate) return;
  const [currency, amount] = money(estimate.estimateUsd) ? ["USD", estimate.estimateUsd] : ["RUB", estimate.estimateRub];
  if (!money(amount)) return;
  const breakdown=estimate.costBreakdown;
  const inputRate=breakdown?.currency===currency && estimate.inputTokens>0 ? breakdown.input/estimate.inputTokens : undefined;
  const outputRate=breakdown?.currency===currency && estimate.outputTokenLimit>0 ? breakdown.output/estimate.outputTokenLimit : undefined;
  return {currency,amount,...(money(inputRate)&&money(outputRate)?{inputRate,outputRate}:{})};
}

export function expenseFromMessage(message, chat, projectName, index) {
  if (message?.role !== "assistant") return;
  const provider = message.apiProvider || (
    message.apimiraRequestId || money(message.apimiraCostUsd) ? "apimira" :
    money(message.bothubCostRub) || money(message.bothubCostCaps) ? "bothub" :
    money(message.costRub) ? "aitunnel" : /bothub/i.test(message.provider) ? "bothub" : /apimira/i.test(message.provider) ? "apimira" : ""
  );
  if (!provider) return;
  const requestIds = [...new Set([message.apimiraRequestId, message.apiRequestId, message.providerRequestId]
    .filter(value => typeof value === "string" && /^[a-z0-9_-]{1,100}$/i.test(value)))];
  const amounts = {
    USD:message.apimiraCostUsd,
    RUB:provider === "bothub" ? message.bothubCostRub : message.costRub,
    CAPS:message.bothubCostCaps
  };
  const charges = Object.fromEntries(UNITS.filter(unit => money(amounts[unit])).map(unit => [unit, amounts[unit]]));
  const legacyAnswer=message.content?.trim() && !/^(ошибка|ответ остановлен|генерация ответа|отправка batch|batch не запущен)/i.test(message.content) &&
    /bothub|apimira/i.test(message.provider);
  if (!message.apiAccepted && !message.jobId && !requestIds.length && !message.apiUsage && !Object.keys(charges).length && !legacyAnswer) return;
  return {
    id:message.jobId ? "job:" + message.jobId : message.expenseId || "chat:" + chat.id + ":" + index,
    provider, requestIds, charges,
    projectId:chat.projectId || "", projectName, chatId:chat.id, title:chat.title || "Запрос",
    model:message.provider || "",
    at:message.at, quote:message.costEstimate,
    inputTokens:message.apimiraTokens?.input ?? message.apiUsage?.prompt_tokens,
    outputTokens:message.apimiraTokens?.output ?? message.apiUsage?.completion_tokens
  };
}

export function mergeExpenses(previous, updates) {
  const groups = new Set();
  const known = new Map();
  for (const entry of [...(Array.isArray(previous) ? previous : []), ...updates]) {
    if (typeof entry?.id !== "string" || typeof entry.provider !== "string") continue;
    const aliases = new Set([entry.id, ...(Array.isArray(entry.requestIds) ? entry.requestIds : [])]
      .map(id => entry.provider + ":" + id));
    const matches = new Set([...aliases].map(alias => known.get(alias)).filter(Boolean));
    let merged = entry;
    for (const group of matches) {
      groups.delete(group);
      for (const alias of group.aliases) aliases.add(alias);
      const match = group.row;
      // An account transaction becomes a Freitag expense only through an exact shared ID.
      // A later provider refresh must preserve the chat/project metadata and the submission date.
      if (merged.unlinked && !match.unlinked) merged={...merged,...match,
        charges:{...match.charges,...merged.charges},requestIds:[...new Set([...(match.requestIds||[]),...(merged.requestIds||[])])]};
      const unlinked=!!(match.unlinked && merged.unlinked);
      merged = {...match, ...merged, id:match.unlinked && !unlinked ? merged.id : match.id, unlinked, at:merged.at || match.at, quote:merged.quote || match.quote,
        model:merged.model || match.model, projectName:merged.projectName || match.projectName,
        inputTokens:merged.inputTokens ?? match.inputTokens, outputTokens:merged.outputTokens ?? match.outputTokens,
        charges:{...match.charges, ...merged.charges},
        requestIds:[...new Set([...(match.requestIds || []), ...(merged.requestIds || [])])]};
    }
    const row = Object.fromEntries(Object.entries(merged).filter(([,value]) => value !== undefined));
    const group = {row, aliases};
    for (const alias of aliases) known.set(alias, group);
    groups.add(group);
  }
  return [...groups].map(group => group.row);
}

export function restoreExpenses({expenses, chats, projects}) {
  const titles = new Map(projects.map(project => [project.id, project.name]));
  const updates = chats.flatMap(chat => (chat.messages || []).map((message, index) =>
    expenseFromMessage(message, chat, titles.get(chat.projectId), index)).filter(Boolean));
  return mergeExpenses(expenses, updates);
}

export function expenseReport(expenses, filters, now = new Date()) {
  const today = calendar.format(now);
  const end = Date.parse(today + "T00:00:00Z");
  const allTime = filters.period === "all";
  const length = [7, 30, 90].includes(Number(filters.period)) ? Number(filters.period) : 30;
  const start = new Date(end - (length - 1) * DAYS).toISOString().slice(0, 10);
  const matching = expenses.filter(row => {
    const when = day(row.at);
    return (allTime || (when >= start && when <= today)) &&
      (!filters.provider || row.provider === filters.provider) &&
      (!filters.project || (row.projectId || "none") === filters.project);
  }).sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  const rows=matching.filter(row=>!row.unlinked);
  const unmatched=filters.project?[]:matching.filter(row=>row.unlinked);
  const totals = {};
  const bins = new Map();
  let confirmed = 0;
  if (!allTime) {
    for (let i = length - 1; i >= 0; i--) bins.set(new Date(end - i * DAYS).toISOString().slice(0, 10), {});
  }
  for (const row of rows) {
    const when = day(row.at);
    const bucket = allTime ? when.slice(0, 7) : when;
    const costs = UNITS.filter(unit => money(row.charges?.[unit]));
    if (costs.length) confirmed++;
    if (costs.length && bucket && !bins.has(bucket)) bins.set(bucket, {});
    for (const unit of costs) {
      const value = row.charges[unit];
      totals[unit] = (totals[unit] || 0) + value;
      if (!bucket) continue;
      const values = bins.get(bucket);
      values[unit] = (values[unit] || 0) + value;
    }
  }
  const units = UNITS.filter(unit => money(totals[unit]));
  const unit = units.includes(filters.unit) ? filters.unit : units[0];
  const points = [...bins].sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => {
    const label = (allTime ? monthLabel : periodLabel).format(new Date(key + (allTime ? "-01" : "") + "T00:00:00Z"));
    return {label, value:values[unit] || 0};
  });
  return {rows, unmatched, totals, units, unit, points, confirmed};
}

export function usageEstimate(row) {
  if (!Number.isSafeInteger(row.inputTokens)||!Number.isSafeInteger(row.outputTokens)) return;
  const quote=row.quote;
  if (money(quote?.inputRate) && money(quote?.outputRate)) return {currency:quote.currency,
    amount:row.inputTokens*quote.inputRate+row.outputTokens*quote.outputRate};
  if(row.provider==="bothub" && /opus|sonnet/i.test(row.model||"")){
    const [input,output]=/sonnet/i.test(row.model)?[235.71,1178.57]:[471.43,2357.14];
    return {currency:"RUB",amount:(row.inputTokens*input+row.outputTokens*output)/1e6};
  }
}

export function canReconcileExpense(row) {
  return ["apimira", "bothub"].includes(row.provider) && !row.unlinked && row.requestIds?.length &&
    !Object.values(row.charges || {}).some(money);
}

export function expensesHtml(report, filters, {esc, projects, chats, providers, refreshing, issue}) {
  const {rows, unmatched=[], totals, units, unit, points, confirmed} = report;
  const missing = rows.length - confirmed;
  const option = (value, label, current) =>
    '<option value="' + esc(value) + '"' + (value === current ? " selected" : "") + ">" + esc(label) + "</option>";
  const picker = (id, label, choices, current) =>
    '<label>' + label + '<select class="f-select" id="' + id + '">' +
    choices.map(([value, text]) => option(value, text, current)).join("") + "</select></label>";
  const projectOptions = new Map([["", "Все книги"], ["none", "Без книги"], ...projects.map(p => [p.id, p.name])]);
  for (const row of rows) {
    if (row.projectId && !projectOptions.has(row.projectId)) projectOptions.set(row.projectId, row.projectName || "Удалённый проект");
  }
  const unlinkedTotals=UNITS.filter(unit=>unmatched.some(row=>money(row.charges?.[unit]))).map(unit=>
    formatExpense(unmatched.reduce((sum,row)=>sum+(row.charges?.[unit]||0),0),unit));
  const max = Math.max(0, ...points.map(point => point.value));
  const axis = points.length > 2 ? [points[0], points[Math.floor(points.length / 2)], points.at(-1)] : points;
  const chart = max ? '<figure class="f-spend-chart"><figcaption>Списания ' + (filters.period === "all" ? "по месяцам" : "по дням") +
    '</figcaption><div class="f-spend-plot"><div class="f-spend-scale" aria-hidden="true"><span>' +
    esc(formatExpense(max, unit)) + '</span><span>0</span></div><div class="f-spend-bars">' + points.map(({label, value}) => {
      const detail = label + " · " + formatExpense(value, unit);
      return '<span class="f-spend-slot" title="' + esc(detail) + '" style="--bar:' +
        (value ? Math.max(2, 100 * value / max) : 0) + '%"><span class="f-spend-bar"></span></span>';
    }).join("") + '</div></div><div class="f-spend-axis" aria-hidden="true">' +
    axis.map(point => "<span>" + esc(point.label) + "</span>").join("") + "</div></figure>" : "";
  return '<div class="f-content f-spend-page"><header class="f-heading"><div><h1 class="f-title">Траты</h1>' +
    '<p class="f-subtitle">Списания сверяются с провайдерами автоматически</p></div>' +
    '<button type="button" class="f-btn" data-action="refresh-expenses"' + (refreshing ? " disabled" : "") + ">" +
    (refreshing ? "Сверяю списания…" : "Сверить списания") + "</button></header>" +
    (issue ? '<p role="status" class="f-muted">'+esc(issue)+"</p>" : "") +
    '<div class="f-spend-filters">' +
    picker("f-expense-period", "Период", [["7","7 дней"],["30","30 дней"],["90","90 дней"],["all","Всё время"]], filters.period) +
    picker("f-expense-project", "Книга", [...projectOptions], filters.project) +
    picker("f-expense-provider", "Провайдер", [["","Все провайдеры"], ...Object.entries(providers)], filters.provider) +
    "</div>" +
    (rows.length ? '<section class="f-spend-overview"><div class="f-spend-totals">' + units.map(key =>
      '<button type="button" data-action="expense-unit" data-id="' + key + '" aria-pressed="' + (key === unit) +
      '"><span>' + ({RUB:"Рубли", USD:"Доллары", CAPS:"Caps BotHub"})[key] + "</span><strong>" +
      esc(formatExpense(totals[key], key)) + "</strong></button>").join("") +
      '<div><span>Запросы с чеком</span><strong>' + number.format(confirmed) + "</strong></div></div>" +
      chart + (missing ? '<p class="f-muted f-spend-missing">Без подтверждённой суммы · ' +
      number.format(missing) + "</p>" : "") + "</section>" : "") +
    (rows.length ? '<section class="f-spend-history"><h2>Запросы</h2><ul>' + rows.map(row => {
      const paid = UNITS.filter(key => money(row.charges?.[key])).map(key => formatExpense(row.charges[key], key));
      const calculated=paid.length?null:usageEstimate(row);
      const provider = providers[row.provider] || row.provider;
      const stats = [row.projectName, row.model?.includes(provider) ? row.model : [provider, row.model].filter(Boolean).join(" · "),
        Number.isSafeInteger(row.inputTokens) ? number.format(row.inputTokens) + " вход" : "",
        Number.isSafeInteger(row.outputTokens) ? number.format(row.outputTokens) + " выход" : ""].filter(Boolean);
      const estimate = UNITS.includes(row.quote?.currency) && money(row.quote?.amount) ?
        "Оценка ≈ " + formatExpense(row.quote.amount, row.quote.currency) : "";
      const difference = estimate ? (row.charges?.[row.quote.currency] ?? 0) - row.quote.amount : 0;
      return '<li><div class="f-spend-row-main"><time>' + esc(date(row.at)) + '</time>' +
        (chats.has(row.chatId) ? '<button type="button" class="f-inline-btn" data-action="select-chat" data-id="' +
          esc(row.chatId) + '">' + esc(row.title) + "</button>" : "<strong>" + esc(row.title) + "</strong>") +
        '<span class="f-muted">' + esc(stats.join(" · ")) + "</span></div>" +
        '<div class="f-spend-row-money"><strong>' + esc(paid.join(" · ") || (calculated?"≈ "+formatExpense(calculated.amount,calculated.currency)+" по токенам":row.requestIds?.length?"Ожидаем сумму провайдера":"Сумма неизвестна")) + "</strong>" +
        (estimate ? '<span class="f-muted">' + esc(estimate) + "</span>" : "") +
        (difference >= .000001 ? '<span>+' + esc(formatExpense(difference,row.quote.currency)) + " к оценке</span>" : "") +
        (canReconcileExpense(row) ? '<button type="button" class="f-inline-btn" data-action="expense-receipt" data-id="' +
          esc(row.id) + '"' + (refreshing ? " disabled" : "") + '>Проверить чек</button>' : "") + "</div></li>";
    }).join("") + "</ul></section>" :
      '<div class="f-empty"><strong>За этот период записей нет</strong>Списания появятся после запросов из Freitag AI.</div>') +
    (unmatched.length ? '<details class="f-settings-fold f-spend-history"'+(!confirmed?" open":"")+'><summary>Операции API без привязки к чату · '+esc(unlinkedTotals.join(" · "))+' ('+number.format(unmatched.length)+')</summary>'+
      '<p class="f-muted">Провайдер подтвердил эти суммы. Они попадут в итог Freitag при совпадении номера запроса.</p><ul>'+
      unmatched.map(row=>'<li><div class="f-spend-row-main"><strong>'+esc(providers[row.provider]||row.provider)+'</strong><time>'+esc(date(row.at))+'</time></div><strong>'+
        esc(UNITS.filter(unit=>money(row.charges?.[unit])).map(unit=>formatExpense(row.charges[unit],unit)).join(" · "))+'</strong></li>').join("")+'</ul></details>':"")+
    "</div>";
}

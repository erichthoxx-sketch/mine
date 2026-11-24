import { formatExpense, savedEstimate } from "./expenses.js";

const node = (name, text, className) => {
  const element = document.createElement(name);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ru-RU") : "";

function openSheet(title) {
  const dialog = node("dialog", "", "f-dialog f-workflow-dialog");
  dialog.setAttribute("aria-label", title);
  const header = node("header", "", "f-spread");
  const heading = node("h2", title);
  const close = node("button", "Закрыть", "f-btn");
  close.type = "button";
  close.onclick = () => dialog.close();
  header.append(heading, close);
  const content = node("div", "", "f-workflow-content");
  dialog.append(header, content);
  dialog.addEventListener("close", () => dialog.remove(), {once:true});
  document.body.append(dialog);
  dialog.showModal();
  return {dialog, content};
}

export function openRequestEstimate({estimate, model, memory, effort, recent, previewOnly, background, toolCalls}) {
  const {dialog, content} = openSheet("Контекст и цена");
  dialog.classList.add("f-quote-dialog");
  const cost = savedEstimate(estimate);
  const fmt = value => formatExpense(value, cost.currency);
  const number = value => value.toLocaleString("ru-RU");
  const summary = node("div", "", "f-quote-summary");
  summary.append(node("span", model), node("strong", cost ? "≈ " + fmt(cost.amount) : "Оценка недоступна"),
    node("p", "Контекст и ответ до " + number(estimate.outputTokenLimit) + " токенов", "f-muted"));
  content.append(summary);
  const breakdown = estimate.costBreakdown?.currency === cost?.currency ? estimate.costBreakdown : null;
  const figures = node("dl", "", "f-quote-figures");
  const line = (list, label, value) => {
    if (value) list.append(node("dt", label), node("dd", value));
  };
  const input = Number.isSafeInteger(estimate.inputTokens) ? "≈ " + number(estimate.inputTokens) + " токенов" : "";
  line(figures, "Вход", [input, Number.isFinite(breakdown?.input) ? fmt(breakdown.input) : ""].filter(Boolean).join(" · "));
  line(figures, "Ответ до лимита", Number.isFinite(breakdown?.output) ? fmt(breakdown.output) : "");
  line(figures, "Рассуждения", effort);
  if (cost) {
    const balance = estimate.balanceUsd ?? estimate.balanceRub;
    if (Number.isFinite(balance)) line(figures, "Доступный баланс", fmt(balance));
    if (Number.isFinite(estimate.budgetRub)) line(figures, "Остаток бюджета ключа", fmt(estimate.budgetRub));
    if (Number.isFinite(recent?.charges?.[cost.currency]))
      line(figures, "Предыдущее списание по этой книге", fmt(recent.charges[cost.currency]));
  }
  if (figures.childElementCount) content.append(figures);
  const pricing = estimate.tariff ? estimate.tariff + ". " : "";
  content.append(node("p", pricing + "Итог зависит от фактического числа токенов и тарифа аккаунта." +
    (toolCalls ? " Инструменты могут вызвать модель повторно." : ""), "f-quote-hint f-muted"));
  const details = node("div", "", "f-quote-source");
  const source = estimate.source;
  if (source?.chapters?.length) {
    details.append(node("p", "Мастерская · канон, главы " + source.chapters.join(", ")));
    if (date(source.updatedAt)) details.append(node("p", "Снимок от " + date(source.updatedAt), "f-muted"));
    if (source.references?.length) details.append(node("p", "Отрывки · " + source.references.map(ref =>
      "глава " + ref.chapter + (ref.scene ? ", сцена " + ref.scene : "")).join(" · "), "f-muted"));
  }
  for (const item of memory.sources || []) details.append(node("p",[item.label,item.period,date(item.updatedAt)].filter(Boolean).join(" · ")));
  if (memory.materials.length) details.append(node("p", "Материалы · " + memory.materials.join(", ")));
  if (memory.decisions.length) details.append(node("p", "Память · " + memory.decisions.join(", ")));
  if (details.childElementCount) content.append(details);
  if (!estimate.ready) content.append(node("p", "Для этой оценки не хватает баланса или бюджета ключа.", "f-quote-alert"));
  if (!previewOnly && estimate.ready) {
    const controls = node("div", "", "f-quote-actions");
    const cancel = node("button", "Отмена", "f-btn");
    cancel.type = "button";
    cancel.onclick = () => dialog.close();
    const send = node("button", background ? "Написать в фоне" : "Подтвердить запрос", "f-btn primary");
    send.type = "button";
    send.onclick = () => dialog.close("confirmed");
    controls.append(cancel, send);
    content.append(controls);
  }
  return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirmed"), {once:true}));
}

export function openStoryMap({load, pin, chapter:initial = 0}) {
  const {dialog, content} = openSheet("Карта романа");
  const form = node("form", "", "f-workflow-search");
  const chapter = node("select", "", "f-select");
  chapter.setAttribute("aria-label", "Глава романа");
  const query = node("input", "", "f-text-field");
  query.type = "search";
  query.maxLength = 100;
  query.placeholder = "Фраза из рукописи";
  query.setAttribute("aria-label", "Фраза из рукописи");
  const submit = node("button", "Найти", "f-btn primary");
  form.append(chapter, query, submit);
  const status = node("p", "", "f-muted");
  status.setAttribute("role", "status");
  const results = node("div", "", "f-workflow-list");
  content.append(form, status, results);
  let order = 0;
  async function show(number, phrase = "") {
    const version = ++order;
    status.textContent = "Читаю снимок Мастерской…";
    results.replaceChildren();
    try {
      const data = await load(number, phrase);
      if (version !== order || !dialog.open) return;
      chapter.replaceChildren(new Option("Весь роман", "0"), ...data.chapters.map(row =>
        new Option("Глава " + row.chapter + " · " + row.title, String(row.chapter))));
      chapter.value = String(number);
      const total = data.chapters.length + " глав · снимок от " + date(data.updatedAt) + ".";
      status.textContent = total + (data.matches ? data.matches.length ? "" : " Совпадений нет." : " Выбери главу или введи фразу.");
      for (const entry of data.matches || []) {
        const card = node("article", "", "f-workflow-card");
        const label = "Глава " + entry.chapter + " · сцена " + entry.scene;
        card.append(node("h3", label + (entry.heading ? " · " + entry.heading : "")),
          node("p", entry.snippet, "f-workflow-snippet"));
        const button = node("button", "Закрепить решение", "f-btn");
        button.type = "button";
        button.onclick = () => { dialog.close(); pin(entry, data.updatedAt); };
        card.append(button);
        results.append(card);
      }
    } catch (error) { if (version === order && dialog.open) status.textContent = error.message; }
  }
  form.onsubmit = event => { event.preventDefault(); void show(Number(chapter.value), query.value.trim()); };
  chapter.onchange = () => void show(Number(chapter.value), query.value.trim());
  void show(initial);
}

const JOB_STATUS = {queued:"Принято",running:"Пишется",completed:"Готово",incomplete:"Есть фрагмент",failed:"Остановлено"};
export function openChapterJobs({list, read, save}) {
  const {dialog, content} = openSheet("Фоновые главы");
  const status = node("p", "", "f-muted");
  status.setAttribute("role", "status");
  const rows = node("div", "", "f-workflow-list");
  const detail = node("div", "", "f-workflow-detail");
  const refresh = node("button", "Обновить список", "f-btn");
  refresh.type = "button";
  refresh.onclick = () => void load();
  content.append(refresh, status, rows, detail);
  let timer, selected = null;
  dialog.addEventListener("close", () => clearTimeout(timer), {once:true});
  async function show(item) {
    selected = item;
    detail.replaceChildren(node("p", "Загружаю главу…", "f-muted"));
    try {
      const job = await read(item);
      if (!dialog.open || selected !== item) return;
      const label = node("h3", JOB_STATUS[job.status] || job.status);
      detail.replaceChildren(label);
      if (job.error) detail.append(node("p", job.error, "f-muted"));
      if (job.text) {
        const text = node("textarea", "", "f-textarea f-job-text");
        text.readOnly = true;
        text.setAttribute("aria-label", "Текст главы");
        text.value = job.text;
        const button = node("button", "Сохранить в чате", "f-btn primary");
        button.type = "button";
        button.onclick = async () => { if (await save(job, item)) dialog.close(); };
        detail.append(text, button);
      } else if (!job.error) detail.append(node("p", "Текст появится по мере написания.", "f-muted"));
    } catch (error) { if (dialog.open && selected === item) detail.replaceChildren(node("p", error.message, "f-muted")); }
  }
  async function load() {
    clearTimeout(timer);
    refresh.disabled = true;
    status.textContent = "Получаю список глав…";
    try {
      const {jobs, unavailable} = await list();
      if (!dialog.open) return;
      status.textContent = (jobs.length ? "Результаты доступны здесь 30 дней." : "Фоновых глав пока нет.") +
        (unavailable ? " Один из шлюзов сейчас недоступен." : "");
      rows.replaceChildren(...jobs.map(item => {
        const row = node("article", "", "f-workflow-card f-spread");
        const summary = node("div");
        summary.append(node("h3", (JOB_STATUS[item.status] || item.status) + " · " + (item.projectName || "Без проекта")),
          node("p", item.excerpt, "f-muted"));
        const button = node("button", "Открыть", "f-btn");
        button.type = "button";
        button.onclick = () => void show(item);
        row.append(summary, button);
        return row;
      }));
      if (selected && ["queued", "running"].includes(selected.status)) {
        const fresh = jobs.find(job => job.id === selected.id && job.gateway === selected.gateway);
        if (fresh) await show(fresh);
      }
      if (jobs.some(job => ["queued", "running"].includes(job.status))) timer = setTimeout(load, 6000);
    } catch (error) { if (dialog.open) status.textContent = error.message; }
    finally { refresh.disabled = false; }
  }
  void load();
}

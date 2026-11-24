// Project memory is independent of the provider and the current chat.
// Keep the full records in storage and bound only the excerpts sent to a model.
const normalize = text => text.toLowerCase().replace(/ё/g, "е");
const textOf = value => typeof value === "string" ? value.trim() : "";
const failedReply = /^(?:Ошибка Claude:|Ошибка Ollama:|Ответ остановлен\.|Отправка Batch:|Batch не запущен:)/;
const singleLine = name => textOf(name).replace(/\s+/g, " ").slice(0, 100);

function bestExcerpt(text, terms, size, title = "") {
  if (!text) return {text:"", score:0};
  const label = normalize(title), normalized = normalize(text);
  let best = {text:text.slice(0, size), score:0};
  for (let start = 0; start < text.length && terms.length; start += Math.max(100, size - 90)) {
    const excerpt = normalized.slice(start, start + size);
    let score = 0, first = size, last = 0;
    for (const term of terms) {
      const at = excerpt.indexOf(term);
      if (at < 0) continue;
      score += 2 + Number(label.includes(term));
      first = Math.min(first, at);
      last = Math.max(last, at + term.length);
    }
    if (score > best.score) {
      const middle = start + Math.floor((first + last) / 2);
      const from = Math.max(0, Math.min(text.length - size, middle - Math.floor(size / 2)));
      best = {text:text.slice(from, from + size).trim(), score};
    }
  }
  return best;
}

export function projectMemoryContext({project, chats = [], docs = [], feedback = [], current, recent = [], task, terms = [], budget}) {
  if (!project?.id || budget < 150) return "";
  const included = new Set([textOf(task), ...recent.map(m => textOf(m.content))]);
  const sections = [];
  let remaining = budget;
  const add = (label, items, maximum) => {
    if (!items.length || remaining <= label.length + 20) return;
    const available = Math.min(remaining, maximum) - label.length - 4;
    const entries = [];
    let used = 0;
    for (const item of items) {
      if (included.has(item.source) || item.text.length + used + 2 > available) continue;
      entries.push(item.text);
      included.add(item.source);
      used += item.text.length + 2;
    }
    if (entries.length) {
      const block = label + "\n" + entries.join("\n\n");
      sections.push(block);
      remaining -= block.length + 2;
    }
  };

  const map = textOf(project.storyMap);
  if (map) {
    // Preserve the whole map in storage. Send its beginning and the most
    // relevant part if it grows beyond the prompt budget.
    const size = Math.min(1200, Math.floor(budget * .3));
    const first = map.slice(0, Math.floor(size / 2));
    const tail = bestExcerpt(map.slice(first.length), terms, size - first.length - 5);
    const excerpt = map.length <= size ? map : tail.score ? first + "\n[…]\n" + tail.text : map.slice(0, size);
    add("Сюжетная карта автора", [{source:map, text:excerpt}], size + 50);
  }

  const size = Math.min(520, Math.floor(budget * .2));
  const pins = (Array.isArray(project.memoryNotes) ? project.memoryNotes : []).slice().reverse()
    .map(note => {
      const source = textOf(note?.text);
      const title = singleLine(note?.title);
      const excerpt = bestExcerpt(source, terms, size, title);
      return {source, ...excerpt, text:[title, excerpt.text].filter(Boolean).join("\n")};
    })
    .filter(item => item.source && !included.has(item.source))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  add("Утвержденные решения автора", pins, Math.floor(budget * .3) + 85);

  const examples = feedback.filter(f => f.projectId === project.id && textOf(f.reason) &&
    ["good", "bad"].includes(f.kind)).slice(-2).reverse().map(f => {
    const reason = textOf(f.reason).slice(0, 210);
    const sample = f.kind === "good" ? textOf(f.finalText || f.answer).slice(0, 230) : "";
    return {source:f.id, text:(f.kind === "good" ? "Подходит. " : "Избегать. ") + reason + (sample ? "\nОбразец: "+sample : "")};
  });
  add("Авторские предпочтения по стилю", examples, Math.floor(budget * .2) + 60);

  if (remaining < 230 || !terms.length) return sections.join("\n\n");
  const sources = [];
  for (const doc of docs) {
    if (doc.projectId === project.id && doc.includeInContext !== false)
      sources.push({title:"Материал «" + singleLine(doc.name) + "»", source:textOf(doc.text), group:doc});
  }
  for (const chat of chats) {
    if (chat.projectId !== project.id) continue;
    for (const message of chat.messages || []) {
      const source = textOf(message.content);
      if (!["user", "assistant"].includes(message.role) || !source || message.receiving || failedReply.test(source))
        continue;
      const role = message.role === "user" ? "автор" : "ответ модели";
      const same = chat.id === current;
      sources.push({title:(same ? "Этот чат" : "Чат «" + singleLine(chat.title) + "»") + " · " + role, source, group:chat});
    }
  }
  const excerptSize = Math.min(620, Math.floor(budget * .16));
  const ranked = sources.filter(item => item.source && !included.has(item.source)).map(item => {
    const excerpt = bestExcerpt(item.source, terms, excerptSize, item.title);
    return {...item, ...excerpt, text:item.title + "\n" + excerpt.text};
  }).filter(item => item.score).sort((a, b) => b.score - a.score);
  const used = new Set();
  const matches = [];
  for (const item of ranked) {
    if (used.has(item.group)) continue;
    matches.push(item);
    used.add(item.group);
    if (matches.length === 2) break;
  }
  add("Выписки из рабочего архива для сверки. Утвержденный канон и текущие указания автора имеют приоритет.",
    matches, Math.min(1500, remaining));
  return sections.join("\n\n");
}

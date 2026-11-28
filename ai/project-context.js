// Project memory is independent of the provider and the current chat.
// Keep the full records in storage and bound only the excerpts sent to a model.
const normalize = text => text.toLowerCase().replace(/ё/g, "е");
const textOf = value => typeof value === "string" ? value.trim() : "";
const failedReply = /^(?:Ошибка (?:Claude|Ollama):|Ответ остановлен\.|Отправка Batch:|Batch не запущен:|Глава (?:отправлена через|обрабатывается через) BotHub Batch|BotHub Batch завершился без главы:)/;
const singleLine = name => textOf(name).replace(/\s+/g, " ").slice(0, 100);

export function materialMode(doc) {
  return doc.includeInContext === false ? "archive" : doc.priority === true ? "priority" : "auto";
}

export function isServiceReply(message) {
  return message.role === "assistant" && (message.noText === true || failedReply.test(textOf(message.content)));
}

function feedbackFor(entry, message, chatId) {
  if (entry.chatId !== chatId) return false;
  return entry.messageAt && message.at ? entry.messageAt === message.at : entry.answer === message.content.slice(0,18000);
}

export function rejectedReply(message, chatId, feedback) {
  return feedback.find(entry => entry.kind === "bad" && feedbackFor(entry,message,chatId));
}

export function feedbackForContext(feedback = [], projectId) {
  const entries=feedback.filter(f=>f.projectId===projectId);
  const rejected=entries.filter(f=>f.kind==="bad");
  return entries.filter(f=>f.kind!=="good" || !f.chatId || !rejected.some(b=>b.chatId===f.chatId &&
    (b.messageAt && f.messageAt ? b.messageAt===f.messageAt : f.answer && b.answer===f.answer)));
}

export function usableReply(message, chatId, feedback = []) {
  if (message.role !== "assistant") return message.role === "user";
  if (!textOf(message.content) || message.receiving || message.incomplete || isServiceReply(message) ||
      /\n\n\[(?:Генерация не завершена:|Ответ остановлен\.|Ошибка (?:Claude|Ollama):)/.test(message.content))
    return false;
  return !rejectedReply(message,chatId,feedback);
}

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

export function projectMemoryContext({project, chats = [], docs = [], feedback = [], current, recent = [], task, terms = [], budget, onUse}) {
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
      onUse?.(item);
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
    add("Сюжетная карта автора", [{source:map, text:excerpt, kind:"map"}], size + 50);
  }

  const size = Math.min(520, Math.floor(budget * .2));
  const pins = (Array.isArray(project.memoryNotes) ? project.memoryNotes : []).slice().reverse()
    .map(note => {
      const source = textOf(note?.text);
      const title = singleLine(note?.title);
      const excerpt = bestExcerpt(source, terms, size, title);
      const anchor = note?.anchor;
      const location = Number.isSafeInteger(anchor?.chapter) ?
        "Источник решения: глава " + anchor.chapter + (anchor.scene ? ", сцена " + anchor.scene : "") : "";
      return {source, ...excerpt, decision:title, text:[title, location, excerpt.text].filter(Boolean).join("\n")};
    })
    .filter(item => item.source && !included.has(item.source))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  add("Утвержденные решения автора", pins, Math.floor(budget * .3) + 85);

  const examples = feedbackForContext(feedback,project.id).filter(f => textOf(f.reason) &&
    ["good", "bad"].includes(f.kind)).slice(-2).reverse().map(f => {
    const reason = textOf(f.reason).slice(0, 210);
    const sample = f.kind === "good" ? textOf(f.finalText || f.answer).slice(0, 230) : "";
    return {source:f.id, kind:"style", text:(f.kind === "good" ? "Подходит. " : "Избегать. ") + reason + (sample ? "\nОбразец: "+sample : "")};
  });
  add("Авторские предпочтения по стилю", examples, Math.floor(budget * .2) + 60);

  if (remaining < 230) return sections.join("\n\n");
  const sources = [];
  const query = normalize(textOf(task));
  for (const doc of docs) {
    if (doc.projectId !== project.id || materialMode(doc) === "archive") continue;
    const name = singleLine(doc.name);
    const title = normalize(name).replace(/\.(?:docx|txt|md|json)$/i, "").trim();
    const named = title.length >= 3 && query.includes(title);
    sources.push({title:"Материал «" + name + "»", source:textOf(doc.text), group:doc, material:name,
      priority:named ? 2 : materialMode(doc) === "priority" ? 1 : 0});
  }
  for (const chat of chats) {
    if (chat.projectId !== project.id) continue;
    for (const message of chat.messages || []) {
      let source = textOf(message.content);
      if (!source || !usableReply(message, chat.id, feedback))
        continue;
      const role = message.role === "user" ? "автор" : "ответ модели";
      const same = chat.id === current;
      if (!same && message.role === "assistant") {
        const approved=feedback.findLast(f=>f.kind==="good" && feedbackFor(f,message,chat.id));
        if (!approved) continue;
        source=textOf(approved.finalText)||source;
      }
      sources.push({title:(same ? "Этот чат" : "Чат «" + singleLine(chat.title) + "»") + " · " + role, source, group:chat,
        archiveChat:singleLine(chat.title), priority:0});
    }
  }
  const excerptSize = Math.min(620, Math.floor(budget * .16));
  const ranked = sources.filter(item => item.source && !included.has(item.source)).map(item => {
    const excerpt = bestExcerpt(item.source, terms, excerptSize, item.title);
    return {...item, ...excerpt, text:item.title + "\n" + excerpt.text};
  }).filter(item => item.score || item.priority).sort((a, b) => b.priority - a.priority ||
    b.score - a.score || Number(!!b.material) - Number(!!a.material));
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

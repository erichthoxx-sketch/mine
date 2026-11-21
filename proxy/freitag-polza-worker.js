// Freitag AI → Polza.ai Claude Opus. Separate deployment: never edit the existing books MCP Worker.
// Only an authenticated Firebase owner can generate; all paid-provider secrets stay on Cloudflare.
const PROJECT = "dohody-6d6dd";
const MODEL = "anthropic/claude-opus-5.5";
const ORIGINS = new Set(["https://erichthoxx-sketch.github.io", "https://freitag-ai-test.pages.dev", "http://localhost:8765", "http://127.0.0.1:8765"]);
let jwksCache = null;
let jwksUntil = 0;

const headers = req => {
  const h = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin" };
  const origin = req.headers.get("Origin");
  if (ORIGINS.has(origin)) Object.assign(h, {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600"
  });
  return h;
};
const json = (req, status, data) => new Response(JSON.stringify(data), {
  status, headers: { ...headers(req), "Content-Type": "application/json; charset=utf-8" }
});
const fail = (req, status, error) => json(req, status, { error });
const utf8 = x => new TextEncoder().encode(x);
const decode = str => {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "=".repeat((4 - s.length % 4) % 4)), ch => ch.charCodeAt(0));
};

async function verifyOwner(req, env) {
  const auth = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") || "");
  if (!auth || !env.OWNER_UID) return false;
  try {
    const pieces = auth[1].split(".");
    if (pieces.length !== 3) return false;
    const header = JSON.parse(new TextDecoder().decode(decode(pieces[0])));
    const payload = JSON.parse(new TextDecoder().decode(decode(pieces[1])));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || !header.kid || payload.aud !== PROJECT ||
        payload.iss !== "https://securetoken.google.com/" + PROJECT ||
        payload.sub !== env.OWNER_UID || payload.user_id !== env.OWNER_UID ||
        !Number.isFinite(payload.iat) || !Number.isFinite(payload.exp) ||
        payload.iat > now + 30 || payload.exp <= now) return false;
    if (!jwksCache || Date.now() >= jwksUntil) {
      const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
      if (!response.ok) return false;
      const data = await response.json();
      jwksCache = data.keys || [];
      jwksUntil = Date.now() + 15 * 60 * 1000;
    }
    const jwk = jwksCache.find(k => k.kid === header.kid && k.kty === "RSA");
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key,
      decode(pieces[2]), utf8(pieces[0] + "." + pieces[1]));
  } catch { return false; }
}

async function mcpTool(env, name, args) {
  if (!env.BOOKS_MCP_URL || !env.MCP_READ_KEY) throw Error("Коннектор Мастерской не настроен.");
  const response = await fetch(env.BOOKS_MCP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.MCP_READ_KEY },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name, arguments: args } })
  });
  if (!response.ok) throw Error("Коннектор Мастерской недоступен.");
  const data = await response.json();
  if (data.error || data.result?.isError) throw Error("Мастерская не смогла прочитать " + name + ".");
  const result = data.result?.content?.find(x => x.type === "text")?.text;
  if (typeof result !== "string") throw Error("Мастерская вернула пустой ответ.");
  return result;
}

async function getBookMaterial(env, id, mode = "dialog") {
  if (!/^[a-z0-9_-]{1,100}$/i.test(id)) throw Error("Неверный ID книги.");
  // Canon check uses a smaller, affordable context; literary drafting uses
  // more of the book. Neither ever sends the entire archive by accident.
  const budgets = {
    dialog: { context: 15000, chapter: 8000 },
    canon: { context: 28000, chapter: 14000 },
    plot: { context: 48000, chapter: 20000 },
    edit: { context: 34000, chapter: 20000 },
    draft: { context: 65000, chapter: 28000 }
  };
  const budget = budgets[mode] || budgets.dialog;
  // Prefer the owner's existing Cloudflare KV namespace binding. No MCP
  // secret is needed and no existing Worker or its credentials are modified.
  if (env.BOOKS) {
    const book = await env.BOOKS.get("book:" + id, { type: "json" });
    if (!book || !Array.isArray(book.chapters) || typeof book.context !== "string")
      throw Error("Книга не найдена в снимках Мастерской. Обнови синхронизацию.");
    const updated = Date.parse(book.updatedAt || "");
    const maxAge = Number(env.MAX_SNAPSHOT_HOURS || 168) * 3600000;
    if (!Number.isFinite(updated) || Date.now() - updated > maxAge ||
        updated > Date.now() + 60000)
      throw Error("Снимок книги устарел. Обнови контекст нейросетей в Мастерской.");
    const last = book.chapters.slice(-2);
    return [
      "АКТУАЛЬНЫЙ СНИМОК МАСТЕРСКОЙ (только чтение):",
      "Обновлен: " + book.updatedAt,
      book.context.slice(0, budget.context),
      "ПОСЛЕДНИЕ ГЛАВЫ (текст из сохраненного снимка):",
      ...last.map((ch, i) => "Глава " + (book.chapters.length - last.length + i + 1) +
        " — " + (ch.title || "") + "\n" + String(ch.text || "").slice(0, budget.chapter))
    ].join("\n\n").slice(0, 180000);
  }
  // Current snapshots in MCP are read-only. The client never receives the MCP access key.
  const [context, listRaw] = await Promise.all([
    mcpTool(env, "get_book_context", { book_id: id }),
    mcpTool(env, "list_chapters", { book_id: id })
  ]);
  let list;
  try { list = JSON.parse(listRaw); } catch { throw Error("Некорректный список глав."); }
  if (!Array.isArray(list.chapters)) throw Error("Список глав не найден.");
  const updated = Date.parse(list.updatedAt || "");
  const maxAge = Number(env.MAX_SNAPSHOT_HOURS || 168) * 3600000;
  if (!Number.isFinite(updated) || Date.now() - updated > maxAge || updated > Date.now() + 60000)
    throw Error("Снимок книги устарел. Обнови контекст нейросетей в Мастерской.");
  const last = list.chapters.slice(-2);
  const chapters = await Promise.all(last.map(c =>
    mcpTool(env, "read_chapter", { book_id: id, chapter: c.chapter, offset: 0, limit: budget.chapter })
      .then(t => JSON.parse(t))
  ));
  return [
    "АКТУАЛЬНЫЙ СНИМОК МАСТЕРСКОЙ (только чтение):",
    "Обновлен: " + list.updatedAt,
    context.slice(0, budget.context),
    "ПОСЛЕДНИЕ ГЛАВЫ, НЕПРОИЗВОЛЬНЫЙ ПЕРЕСКАЗ ЗАПРЕЩЕН:",
    ...chapters.map(ch => "Глава " + ch.chapter + " — " + ch.title + "\n" +
      ch.text + (ch.nextOffset !== null ? "\n[Глава длиннее 30 тыс. знаков; требуется дочитать]" : ""))
  ].join("\n\n").slice(0, 180000);
}

async function generate(req, env) {
  if (!await verifyOwner(req, env)) return fail(req, 401, "Требуется вход владельца в Мастерскую.");
  if (!env.POLZA_API_KEY) return fail(req, 503, "В Cloudflare не задан секрет POLZA_API_KEY.");
  const raw = await req.text();
  if (utf8(raw).length > 340000) return fail(req, 413, "Слишком большой запрос.");
  let input;
  try { input = JSON.parse(raw); } catch { return fail(req, 400, "Неверный JSON."); }
  const entries = input.messages;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 16 ||
      entries.some(x => !["system", "user", "assistant"].includes(x?.role) ||
        typeof x.content !== "string" || x.content.length > 130000) ||
      entries.reduce((n, x) => n + x.content.length, 0) > 180000)
    return fail(req, 400, "Неверный формат сообщений.");
  const messages = entries.map(x => ({ role: x.role, content: x.content }));
  if (input.bookId) {
    try {
      const material = await getBookMaterial(env, input.bookId, input.mode);
      messages.unshift({ role: "system", content: material });
    } catch (e) { return fail(req, 424, e.message); }
  }
  const isDraft = input.mode === "draft";
  const body = {
    model: MODEL, messages, stream: true,
    max_tokens: isDraft ? 8500 : input.mode === "canon" ? 1300 : 1800
  };
  let upstream;
  try {
    upstream = await fetch("https://polza.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.POLZA_API_KEY,
        "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch { return fail(req, 502, "Нет связи с Polza.ai."); }
  if (!upstream.ok) {
    // Preserve the status: 402 is billing/temporary reservation, not 502.
    // Never expose upstream raw bodies (they may contain input fragments).
    let traceId = null;
    try {
      const payload = await upstream.json();
      const rawId = payload?.trace_id || payload?.error?.trace_id;
      if (typeof rawId === "string" && /^[a-zA-Z0-9-]{6,100}$/.test(rawId))
        traceId = rawId;
    } catch {}
    if (upstream.status === 402) return json(req, 402, {
      error: "Polza.ai: не хватает доступного баланса или резерва для этого запроса. Мы уменьшили повторяющийся контекст; если ошибка повторится, проверь лимит в Polza.",
      ...(traceId ? { trace_id: traceId } : {})
    });
    if (upstream.status === 429) return fail(req, 429, "Polza.ai: ограничение частоты запросов.");
    return json(req, upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502, {
      error: "Polza.ai вернула HTTP " + upstream.status + ".",
      ...(traceId ? { trace_id: traceId } : {})
    });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { ...headers(req), "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no" }
  });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin");
    if (origin && !ORIGINS.has(origin)) return fail(req, 403, "Источник запрещен.");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
    const path = new URL(req.url).pathname;
    if (path === "/health" && req.method === "GET")
      return json(req, 200, { ok: true, provider: "Polza.ai", model: MODEL,
        configured: !!env.POLZA_API_KEY && !!env.OWNER_UID,
        booksConnected: !!env.BOOKS || (!!env.BOOKS_MCP_URL && !!env.MCP_READ_KEY) });
    if (path === "/chat" && req.method === "POST") return generate(req, env);
    return fail(req, 404, "Адрес не найден.");
  }
};

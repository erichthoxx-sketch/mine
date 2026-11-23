// Отдельный MCP Worker. Читает один уже синхронизированный снимок Мастерской.
const ID = /^[a-z0-9_-]{1,100}$/i;
const KEY = /^[a-f0-9]{64}$/;
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_REQUEST = 16 * 1024;
const encode = new TextEncoder();
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const SSE_HEADERS = { ...HEADERS, 'Content-Type': 'text/event-stream' };
const json = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const empty = (status, headers) => new Response(null, { status, headers: { ...HEADERS, ...headers } });
const problem = (status, message) => json({ error: message }, status);
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const event = (name, data) => `event: ${name}\ndata: ${data}\n\n`;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

async function authorized(req, key) {
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(req.headers.get('Authorization') || '');
  if (typeof key !== 'string' || !KEY.test(key) || !match || !KEY.test(match[1])) return false;
  const hashes = await Promise.all([key, match[1]].map((value) => crypto.subtle.digest('SHA-256', encode.encode(value))));
  const [actual, given] = hashes.map((hash) => new Uint8Array(hash));
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ given[i];
  return difference === 0;
}

const bookId = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,100}$' };
const offset = { type: 'integer', minimum: 0, maximum: 900000, default: 0 };
const limit = { type: 'integer', minimum: 1, maximum: 24000, default: 12000 };
const tool = (name, description, properties, required, read) => [name, {
  definition: { name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  read
}];
const bookProperties = { book_id: bookId };
const pageProperties = { ...bookProperties, offset, limit };
const title = (book) => ({ book: book.title, updatedAt: book.updatedAt });

function excerpt(text, start = offset.default, size = limit.default) {
  start = Math.min(start, text.length);
  let end = Math.min(start + size, text.length);
  // Не разрезаем пару UTF-16 на границе следующей страницы.
  if (end > 0 && /[\uDC00-\uDFFF]/.test(text[end] || '') && /[\uD800-\uDBFF]/.test(text[end - 1])) end++;
  return { offset: start, totalChars: text.length, nextOffset: end < text.length ? end : null, text: text.slice(start, end) };
}

function search(book, { query }) {
  const matches = [];
  // Экранированный литерал сохраняет исходные смещения UTF-16 при поиске без учета регистра.
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  for (const [index, chapter] of book.chapters.entries()) {
    pattern.lastIndex = 0;
    for (let count = 0, match; count < 5 && (match = pattern.exec(chapter.text)); count++) {
      const at = match.index;
      matches.push({ chapter: index + 1, title: chapter.title, offset: at,
        snippet: chapter.text.slice(Math.max(0, at - 130), at + match[0].length + 150) });
      if (matches.length === 18) return { query, matches };
    }
  }
  return { query, matches };
}

const TOOLS = new Map([
  tool('list_books', 'Показать книгу, которую владелица подключила к этому ассистенту.', {}, [], (book) =>
    book ? [{ id: book.id, title: book.title, updatedAt: book.updatedAt, chapters: book.chapters.length }] : []),
  tool('get_book_context', 'Прочитать канон, синопсис, план и персонажей из снимка книги. Для продолжения используйте nextOffset.',
    pageProperties, ['book_id'], (book, args) => ({ ...title(book), ...excerpt(book.context, args.offset, args.limit) })),
  tool('list_chapters', 'Показать порядок, заголовки и размеры глав выбранной книги.', bookProperties, ['book_id'], (book) =>
    ({ ...title(book), chapters: book.chapters.map((ch, i) => ({ chapter: i + 1, title: ch.title, chars: ch.text.length })) })),
  tool('read_chapter', 'Прочитать фрагмент главы по номеру из list_chapters. Для продолжения используйте nextOffset.',
    { ...pageProperties, chapter: { type: 'integer', minimum: 1, maximum: 250 } }, ['book_id', 'chapter'], (book, args) => {
      const chapter = book.chapters[args.chapter - 1];
      if (!chapter) return toolError('Главы нет. Проверьте номер через list_chapters.');
      return { ...title(book), chapter: args.chapter, title: chapter.title, ...excerpt(chapter.text, args.offset, args.limit) };
    }),
  tool('search_book', 'Найти фразу в написанных главах и показать короткие фрагменты с совпадениями.',
    { ...bookProperties, query: { type: 'string', minLength: 2, maxLength: 200 } }, ['book_id', 'query'], search)
]);

function validArguments(args, schema) {
  if (!object(args) || schema.required.some((key) => !Object.hasOwn(args, key))) return false;
  return Object.entries(args).every(([key, value]) => {
    if (!Object.hasOwn(schema.properties, key)) return false;
    const field = schema.properties[key];
    if (field.type === 'integer') return Number.isInteger(value) && value >= field.minimum && value <= field.maximum;
    if (typeof value !== 'string') return false;
    if (key === 'book_id') return ID.test(value);
    return value.trim().length >= field.minLength && value.length <= field.maxLength;
  });
}

const toolError = (text) => ({ isError: true, content: [{ type: 'text', text }] });
async function callTool(env, params) {
  const entry = TOOLS.get(params?.name);
  if (!entry) return toolError('Инструмент недоступен.');
  const args = params.arguments === undefined ? {} : params.arguments;
  if (!validArguments(args, entry.definition.inputSchema)) return toolError('Аргументы не соответствуют схеме инструмента.');
  const id = env.GPTUNNEL_BOOK_ID;
  if (args.book_id !== undefined && args.book_id !== id) return toolError('Книга недоступна.');
  // В KV возможны другие книги и служебные данные. Разрешенное имя ключа задается только настройкой Worker.
  const book = await env.BOOKS.get(`book:${id}`, { type: 'json' });
  const snapshot = book?.id === id ? book : null;
  if (!snapshot && params.name !== 'list_books') return toolError('Книга недоступна.');
  const result = entry.read(snapshot, args.query === undefined ? args : { ...args, query: args.query.trim() });
  return result.isError ? result : { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

async function dispatch(message, env, legacy = false) {
  const { id, method, params } = object(message) ? message : {};
  if (message?.jsonrpc !== '2.0' || typeof method !== 'string' ||
      (id !== undefined && typeof id !== 'string' && !Number.isFinite(id))) {
    return rpcError(null, -32600, 'Invalid Request');
  }
  // Уведомления не запускают чтение хранилища и не получают ответа JSON-RPC.
  if (id === undefined) return null;
  const result = (value) => ({ jsonrpc: '2.0', id, result: value });
  try {
    switch (method) {
      case 'initialize':
        return result({ protocolVersion: legacy ? '2024-11-05' :
          (VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0]),
        capabilities: { tools: {} }, serverInfo: { name: 'masterskaya-gptunnel-books', version: '1.0.0' } });
      case 'ping': return result({});
      case 'tools/list': return result({ tools: Array.from(TOOLS.values(), (item) => item.definition) });
      case 'tools/call': return result(await callTool(env, params));
      default: return rpcError(id, -32601, 'Method not found');
    }
  } catch {
    return rpcError(id, -32603, 'Internal error');
  }
}

async function readMessage(req) {
  if (!req.body || !/^application\/json(?:\s*;|$)/i.test(req.headers.get('Content-Type') || '')) return { status: 415 };
  const reader = req.body.getReader();
  const buffer = new Uint8Array(MAX_REQUEST);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > buffer.length) {
        await reader.cancel();
        return { status: 413 };
      }
      buffer.set(value, length);
      length += value.length;
    }
    return { message: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))) };
  } catch {
    return { status: 400 };
  } finally {
    reader.releaseLock();
  }
}

async function respond(req, env, legacy) {
  const { message, status } = await readMessage(req);
  if (status === 400) return { status, reply: rpcError(null, -32700, 'Parse error') };
  if (status) return { status };
  // В старых версиях MCP клиент может отправить несколько сообщений в одном POST.
  if (Array.isArray(message) && (legacy || req.headers.get('MCP-Protocol-Version') === '2025-03-26')) {
    if (!message.length || message.length > 10) return { status: 400, reply: rpcError(null, -32600, 'Invalid Request') };
    const replies = [];
    for (const item of message) {
      const reply = await dispatch(item, env, legacy);
      if (reply) replies.push(reply);
    }
    return { status: replies.length ? 200 : 202, reply: replies.length ? replies : null };
  }
  const reply = await dispatch(message, env, legacy);
  return { status: reply?.error?.code === -32600 ? 400 : reply ? 200 : 202, reply };
}

export class GptunnelSseSession {
  constructor(state, env) {
    this.env = env;
    this.sessionId = state.id.toString();
    this.stream = null;
  }

  async fetch(req) {
    if (req.method === 'GET') {
      if (this.stream) return empty(409);
      const stream = new ReadableStream({
        start: (controller) => {
          this.stream = controller;
          controller.enqueue(encode.encode(event('endpoint', `/sse/message?sessionId=${this.sessionId}`)));
        },
        cancel: () => { this.stream = null; }
      });
      return new Response(stream, { headers: SSE_HEADERS });
    }
    if (!this.stream) return empty(404);
    const { status, reply } = await respond(req, this.env, true);
    if (status >= 400) return reply ? json(reply, status) : empty(status);
    if (reply) {
      if (!this.stream) return empty(404);
      if (this.stream.desiredSize <= 0) return empty(429);
      this.stream.enqueue(encode.encode(event('message', JSON.stringify(reply))));
    }
    return empty(202);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!['/mcp', '/sse', '/sse/message'].includes(url.pathname)) return problem(404, 'Not found');
    const origin = req.headers.get('Origin');
    if (origin && origin !== url.origin) return problem(403, 'Origin not allowed');
    if (!(await authorized(req, env.GPTUNNEL_WORKSHOP_KEY))) {
      return empty(401, { 'WWW-Authenticate': 'Bearer realm="masterskaya-gptunnel"' });
    }
    if (!env.BOOKS || typeof env.GPTUNNEL_BOOK_ID !== 'string' || !ID.test(env.GPTUNNEL_BOOK_ID)) return empty(503);
    const method = url.pathname === '/sse' ? 'GET' : 'POST';
    if (req.method !== method) return empty(405, { Allow: method });
    if (url.pathname === '/mcp') {
      const version = req.headers.get('MCP-Protocol-Version');
      if (version && !VERSIONS.includes(version)) return problem(400, 'Unsupported MCP protocol version');
      const { status, reply } = await respond(req, env, false);
      if (!reply) return empty(status);
      const accept = (req.headers.get('Accept') || '').toLowerCase();
      if (status === 200 && accept.includes('text/event-stream') && !accept.includes('application/json')) {
        return new Response(event('message', JSON.stringify(reply)), { headers: SSE_HEADERS });
      }
      return json(reply, status);
    }
    const sessions = env.MCP_SESSIONS;
    if (!sessions) return empty(503);
    try {
      if (url.pathname === '/sse') return await sessions.get(sessions.newUniqueId()).fetch(req);
      const id = url.searchParams.get('sessionId');
      if (!id || !/^[a-f0-9]{64}$/.test(id)) return empty(404);
      return await sessions.get(sessions.idFromString(id)).fetch(req);
    } catch {
      return empty(500);
    }
  }
};

// Freitag AI → ModelProxy / BotHub Claude Opus 5.5. Test gateway; never edit the existing Books MCP Worker.
// Only an authenticated Firebase owner can generate; all paid-provider secrets stay on Cloudflare.
const PROJECT = "dohody-6d6dd";
const MODEL = "claude-opus-5-5";
// Only these BotHub model IDs can be selected from Freitag AI.
const BOTHUB_MODELS = Object.freeze(["claude-sonnet-5.5", "claude-opus-5.5"]);
const PROVIDERS = Object.freeze({
  modelproxy: Object.freeze({
    name: "ModelProxy", model: MODEL, secret: "MODELPROXY_API_KEY",
    endpoint: "https://api.modelproxy.org/v1/chat/completions"
  }),
  bothub: Object.freeze({
    name: "BotHub", model: "claude-sonnet-5.5", secret: "BOTHUB_API_KEY",
    endpoint: "https://openai.bothub.chat/v1/chat/completions"
  }),
  apimira: Object.freeze({
    name: "ApiMira", model: "anthropic/claude-opus-5.5", secret: "APIMIRA_API_KEY",
    endpoint: "https://apimira.com/v1/chat/completions"
  })
});
const ORIGINS = new Set(["https://erichthoxx-sketch.github.io", "https://freitag-ai-test.pages.dev", "http://localhost:8765", "http://127.0.0.1:8765"]);
const allowedOrigin = origin => {
  if (!origin) return true;
  if (ORIGINS.has(origin)) return true;
  // Cloudflare Pages assigns unique preview hosts for each deployment.
  // All such hosts must be allowed for this test project, but not arbitrary Pages apps.
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && /^[a-z0-9-]+\.freitag-ai-test\.pages\.dev$/i.test(u.hostname);
  } catch { return false; }
};
let jwksCache = null;
let jwksUntil = 0;

const headers = req => {
  const h = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin" };
  const origin = req.headers.get("Origin");
  if (allowedOrigin(origin)) Object.assign(h, {
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

async function getBookMaterial(env, id, mode = "dialog", requiredRevision = "") {
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
    if (requiredRevision && book.updatedAt !== requiredRevision)
      throw Error("Обновление Google Docs еще не видно в Cloudflare. Платный запрос остановлен; повтори отправку.");
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
  if (requiredRevision)
    throw Error("Для автоматического чтения книги нужен Cloudflare KV binding BOOKS.");
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

// Read-only manuscript tools. These use exactly the same owner's KV book
// snapshots as the Masterskaya MCP worker, and only the book explicitly selected
// in Freitag AI. The model cannot select other book IDs or call write/finance tools.
const BOOK_TOOLS = Object.freeze([
  {type:"function",function:{name:"get_book_context",
    description:"Прочитать утвержденный канон, персонажей и сюжетную легенду выбранного романа.",
    parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"list_chapters",
    description:"Получить названия и номера всех глав выбранного романа перед чтением.",
    parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"read_chapter",
    description:"Прочитать точный текст выбранной главы, можно по частям через offset.",
    parameters:{type:"object",properties:{
      chapter:{type:"integer",minimum:1},offset:{type:"integer",minimum:0},
      limit:{type:"integer",minimum:1000,maximum:16000}
    },required:["chapter"],additionalProperties:false}}},
  {type:"function",function:{name:"search_book",
    description:"Найти факт, имя или фразу в написанных главах романа.",
    parameters:{type:"object",properties:{
      query:{type:"string",minLength:2,maxLength:120}
    },required:["query"],additionalProperties:false}}}
]);
const MAX_BOOK_TOOL_ROUNDS=3;
function runBookTool(book,name,args){
  if (!book || !Array.isArray(book.chapters)) throw Error("Нет обновленной книги.");
  if (!args || typeof args!=="object" || Array.isArray(args)) throw Error("Неверные аргументы.");
  if (name==="get_book_context"){
    return JSON.stringify({title:book.title,updatedAt:book.updatedAt,
      context:String(book.context||"").slice(0,30000)});
  }
  if (name==="list_chapters"){
    return JSON.stringify({title:book.title,updatedAt:book.updatedAt,
      chapters:book.chapters.map((c,i)=>({chapter:i+1,title:c.title,characters:c.text.length}))});
  }
  if (name==="read_chapter"){
    const n=Number(args.chapter),offset=args.offset===undefined?0:Number(args.offset);
    if(!Number.isInteger(n)||n<1||n>book.chapters.length ||
       !Number.isInteger(offset)||offset<0)throw Error("Неверный номер главы или offset.");
    const chapter=book.chapters[n-1];
    const limit=Math.min(16000,Math.max(1000,Number.isInteger(args.limit)?args.limit:12000));
    return JSON.stringify({chapter:n,title:chapter.title,offset,
      totalChars:chapter.text.length,
      nextOffset:offset+limit<chapter.text.length?offset+limit:null,
      text:chapter.text.slice(offset,offset+limit)});
  }
  if (name==="search_book"){
    const q=String(args.query||"").trim();
    if(q.length<2||q.length>120)throw Error("Уточни фразу для поиска.");
    const result=[],needle=q.toLocaleLowerCase("ru");
    for(let i=0;i<book.chapters.length && result.length<12;i++){
      const chapter=book.chapters[i],text=chapter.text;
      const lower=text.toLocaleLowerCase("ru");
      let from=0,found=0;
      while(found<3&&result.length<12){
        const at=lower.indexOf(needle,from);
        if(at<0)break;
        result.push({chapter:i+1,title:chapter.title,
          offset:at,excerpt:text.slice(Math.max(0,at-180),Math.min(text.length,at+needle.length+220))});
        from=at+needle.length;found++;
      }
    }
    return JSON.stringify({query:q,found:result});
  }
  throw Error("Действие не разрешено.");
}
const toolResultSSE=text=> new ReadableStream({
  start(controller){
    const encoder=new TextEncoder();
    const data={choices:[{index:0,delta:{content:text},finish_reason:null}]};
    controller.enqueue(encoder.encode("data: "+JSON.stringify(data)+"\n\n"));
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.close();
  }
});
const visibleCompletion=message=>{
  if(typeof message?.content==="string")return message.content;
  if(Array.isArray(message?.content))return message.content.map(x=>x?.text||"").join("");
  return "";
};
async function bookToolsCompletion(req,env,provider,model,messages,book,maxTokens){
  const history=[{
    role:"system",
    content:"У тебя есть инструменты Мастерской для чтения выбранного романа. "+
      "Если требуется проверить факт или прежнюю сцену, вызови list_chapters, "+
      "read_chapter или search_book. Не придумывай содержание непрочитанных глав. "+
      "Инструменты только для чтения одной выбранной книги."
  },...messages];
  let rounds=0;
  while(rounds<=MAX_BOOK_TOOL_ROUNDS){
    let upstream;
    try{
      upstream=await fetch(provider.endpoint,{
        method:"POST",
        headers:{Authorization:"Bearer "+env[provider.secret],"Content-Type":"application/json"},
        body:JSON.stringify({model,messages:history,stream:false,max_tokens:maxTokens,
          tools:BOOK_TOOLS,tool_choice:"auto"}),
        signal:AbortSignal.timeout(160000)
      });
    }catch{return fail(req,502,provider.name+": нет связи или истекло время ответа.");}
    if(!upstream.ok){
      if(upstream.status===402)return fail(req,402,provider.name+": недостаточно баланса или доступного резерва.");
      if(upstream.status===429)return fail(req,429,provider.name+": превышен лимит запросов.");
      return fail(req,upstream.status>=400&&upstream.status<500?upstream.status:502,
        provider.name+" вернул HTTP "+upstream.status+".");
    }
    let data;
    try{data=await upstream.json();}
    catch{return fail(req,502,"API провайдера вернул неожиданный формат ответа.");}
    const message=data?.choices?.[0]?.message;
    if(!message||!Array.isArray(message.tool_calls)||!message.tool_calls.length){
      const text=visibleCompletion(message);
      if(!text)return fail(req,502,provider.name+": модель не вернула текст.");
      return new Response(toolResultSSE(text),{status:200,
        headers:{...headers(req),"Content-Type":"text/event-stream; charset=utf-8"}});
    }
    if(++rounds>MAX_BOOK_TOOL_ROUNDS || message.tool_calls.length>4)
      return fail(req,424,"Слишком много вызовов инструментов. Уточни запрос и повтори.");
    if(message.tool_calls.some(call=>typeof call?.id!=="string" ||
        !["get_book_context","list_chapters","read_chapter","search_book"].includes(call.function?.name)))
      return fail(req,424,"Модель запросила недопустимый инструмент.");
    history.push({role:"assistant",content:message.content||null,tool_calls:message.tool_calls});
    for(const call of message.tool_calls){
      let response;
      try{
        const args=JSON.parse(call.function.arguments||"{}");
        response=runBookTool(book,call.function.name,args);
      }catch(e){response=JSON.stringify({error:e.message});}
      history.push({role:"tool",tool_call_id:call.id,content:response.slice(0,35000)});
    }
  }
  return fail(req,424,"Превышен лимит обращений к книге.");
}

// Owner-only automatic refresh. The client reads a fresh Google Doc with its
// own Google OAuth session and publishes only the chosen book into the SAME KV
// namespace as the existing read-only MCP server. No API keys or Google tokens
// are stored here, and the original manuscript is never changed.
async function refreshBook(req, env) {
  if (!await verifyOwner(req, env))
    return fail(req, 401, "Требуется вход владельца в Мастерскую.");
  if (!env.BOOKS || typeof env.BOOKS.put !== "function")
    return fail(req, 503, "Cloudflare KV BOOKS не привязан к Freitag AI.");
  const raw = await req.text();
  if (utf8(raw).length > 8_000_000)
    return fail(req, 413, "Рукопись слишком велика для одного обновления.");
  let incoming;
  try { incoming = JSON.parse(raw); }
  catch { return fail(req, 400, "Неверный формат рукописи."); }
  const id = incoming?.id, title = incoming?.title, context = incoming?.context;
  const chapters = incoming?.chapters;
  if (typeof id !== "string" || !/^[a-z0-9_-]{1,100}$/i.test(id) ||
      typeof title !== "string" || !title.trim() || title.length > 300 ||
      typeof context !== "string" || !context.trim() || context.length > 300_000 ||
      !Array.isArray(chapters) || chapters.length < 1 || chapters.length > 300 ||
      chapters.some(ch => !ch || typeof ch.title !== "string" ||
        !ch.title.trim() || ch.title.length > 250 ||
        typeof ch.text !== "string" || ch.text.length > 400_000) ||
      !chapters.some(ch => ch.text.trim()))
    return fail(req, 400, "Снимок книги неполон или содержит недопустимые поля.");
  const sourceAt = Date.parse(incoming.generatedAt || "");
  if (!Number.isFinite(sourceAt) || Math.abs(Date.now() - sourceAt) > 5 * 60_000)
    return fail(req, 409, "Снимок Google Docs уже устарел. Обнови страницу и повтори.");
  const updatedAt = new Date().toISOString();
  const clean = {
    id, title: title.trim(), context,
    chapters: chapters.map(ch => ({ title: ch.title, text: ch.text })),
    updatedAt
  };
  try {
    await env.BOOKS.put("book:" + id, JSON.stringify(clean), {
      metadata: { id, title: clean.title, updatedAt, chapters: chapters.length }
    });
  } catch { return fail(req, 502, "Не удалось сохранить обновленный канон в Cloudflare."); }
  return json(req, 200, {
    ok: true, title: clean.title, updatedAt, chapterCount: chapters.length,
    lastChapters: chapters.slice(-4).map((ch, i) => ({
      slot: chapters.length - Math.min(4, chapters.length) + i + 1,
      title: ch.title.slice(0, 100)
    }))
  });
}

// Free read-only preflight: allows the author to verify which manuscript chapters
// are actually in the Cloudflare snapshot BEFORE sending any paid model request.
async function snapshotStatus(req, env) {
  if (!await verifyOwner(req, env))
    return fail(req, 401, "Требуется вход владельца в Мастерскую.");
  const id = new URL(req.url).searchParams.get("bookId") || "";
  if (!/^[a-z0-9_-]{1,100}$/i.test(id))
    return fail(req, 400, "Неверный ID книги.");
  if (!env.BOOKS)
    return fail(req, 503, "Для бесплатной проверки снимка нужен KV binding BOOKS.");
  const book = await env.BOOKS.get("book:" + id, { type: "json" });
  if (!book || !Array.isArray(book.chapters) || typeof book.updatedAt !== "string")
    return fail(req, 404, "Снимок книги не найден. Обнови книгу в Мастерской.");
  const age = Date.now() - Date.parse(book.updatedAt);
  const maxAge = Number(env.MAX_SNAPSHOT_HOURS || 168) * 3600000;
  if (!Number.isFinite(age) || age > maxAge || age < -60000)
    return fail(req, 409, "Снимок рукописи устарел. Обнови книгу в Мастерской.");
  return json(req, 200, {
    ok: true, title: book.title || "", updatedAt: book.updatedAt,
    chapterCount: book.chapters.length,
    lastChapters: book.chapters.slice(-4).map((ch, i) => ({
      slot: book.chapters.length - Math.min(4, book.chapters.length) + i + 1,
      title: String(ch.title || "").slice(0, 100)
    }))
  });
}

async function generate(req, env) {
  if (!await verifyOwner(req, env)) return fail(req, 401, "Требуется вход владельца в Мастерскую.");
  const raw = await req.text();
  if (utf8(raw).length > 340000) return fail(req, 413, "Слишком большой запрос.");
  let input;
  try { input = JSON.parse(raw); } catch { return fail(req, 400, "Неверный JSON."); }
  // Whitelisted provider IDs; never accept arbitrary endpoints/models from the browser.
  const providerId=input.provider||"modelproxy";
  const provider = PROVIDERS[providerId];
  if (!provider) return fail(req, 400, "Неизвестный API-провайдер.");
  if (!env[provider.secret]) return fail(req, 503, "В Cloudflare не задан секрет " + provider.secret + ".");
  const entries = input.messages;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 16 ||
      entries.some(x => !["system", "user", "assistant"].includes(x?.role) ||
        typeof x.content !== "string" || x.content.length > 130000) ||
      entries.reduce((n, x) => n + x.content.length, 0) > 180000)
    return fail(req, 400, "Неверный формат сообщений.");
  const model = input.provider === "bothub" ? (input.model || provider.model) : provider.model;
  if (input.provider === "bothub" && !BOTHUB_MODELS.includes(model))
    return fail(req, 400, "Эта модель BotHub не разрешена.");
  if(input.provider==="apimira" && model!=="anthropic/claude-opus-5.5")
    return fail(req,400,"Эта модель ApiMira не разрешена.");
  const messages = entries.map(x => ({ role: x.role, content: x.content }));
  if (input.bookId) {
    try {
      const material = await getBookMaterial(env, input.bookId, input.mode,
        typeof input.sourceRevision === "string" ? input.sourceRevision : "");
      messages.unshift({ role: "system", content: material });
    } catch (e) { return fail(req, 424, e.message); }
  }
  const isDraft = input.mode === "draft";
  const maxTokens=isDraft?4500:input.mode==="canon"?750:900;
  // Tool calling makes this a real read-only book connector, not merely a
  // summary of two chapters. A fresh revision was already checked above.
  if(input.bookId && env.BOOKS && providerId!=="modelproxy"){
    const book=await env.BOOKS.get("book:"+input.bookId,{type:"json"});
    if(!book || (input.sourceRevision && book.updatedAt!==input.sourceRevision))
      return fail(req,424,"Не удалось подтвердить свежую рукопись.");
    return await bookToolsCompletion(req,env,provider,model,messages,book,maxTokens);
  }
  const body = {
    model, messages, stream: true,
    max_tokens: maxTokens
  };
  let upstream;
  try {
    upstream = await fetch(provider.endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + env[provider.secret],
        "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch { return fail(req, 502, "Нет связи с " + provider.name + "."); }
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
      error: provider.name + ": не хватает доступного баланса или резерва для этого запроса. Проверь баланс и лимит.",
      ...(traceId ? { trace_id: traceId } : {})
    });
    if (upstream.status === 429) return fail(req, 429, provider.name + ": ограничение частоты запросов.");
    return json(req, upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502, {
      error: provider.name + " вернул HTTP " + upstream.status + ".",
      ...(traceId ? { trace_id: traceId } : {})
    });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { ...headers(req), "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no" }
  });
}

// Owner-only preflight checks the actual key/model catalog without generating text.
async function bothubPreflight(req, env) {
  if (!await verifyOwner(req, env)) return fail(req, 401, "Требуется вход владельца в Мастерскую.");
  const params=new URL(req.url).searchParams;
  const provider=params.get("provider")==="apimira"?"apimira":"bothub";
  const model=params.get("model")||(provider==="apimira"?"anthropic/claude-opus-5.5":"claude-sonnet-5.5");
  if(provider==="bothub"&&!BOTHUB_MODELS.includes(model))
    return fail(req,400,"Неизвестная модель BotHub.");
  if(provider==="apimira"&&model!=="anthropic/claude-opus-5.5")
    return fail(req,400,"Неизвестная модель ApiMira.");
  const key=provider==="apimira"?env.APIMIRA_API_KEY:env.BOTHUB_API_KEY;
  if(!key)return fail(req,503,provider==="apimira"?"ApiMira API не настроен.":"BotHub API не настроен.");
  let upstream;
  try {
    upstream = await fetch(provider==="apimira"?"https://apimira.com/v1/models":"https://openai.bothub.chat/v1/models", {
      headers: { Authorization: "Bearer " + key },
      signal: AbortSignal.timeout(8000)
    });
  } catch { return fail(req, 502, "Провайдер не ответил на проверку каталога моделей."); }
  if (!upstream.ok) {
    if (upstream.status === 401 || upstream.status === 403)
      return fail(req, 401, "API-провайдер отклонил ключ. Проверь его в Cloudflare.");
    return fail(req, 502, "Не удалось проверить каталог моделей (HTTP " + upstream.status + ").");
  }
  let data;
  try { data = await upstream.json(); }
  catch { return fail(req, 502, "Провайдер вернул некорректный список моделей."); }
  if (!Array.isArray(data.data)) return fail(req, 502, "Провайдер не вернул список моделей.");
  const item = data.data.find(x => x?.id === model);
  return json(req, 200, { ok: !!item, model,
    message: item ? "Модель доступна по API-ключу. Платная генерация не запускалась." :
      "Модель отсутствует в списке, доступном этому API-ключу." });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin");
    if (origin && !allowedOrigin(origin)) return fail(req, 403, "Источник запрещен.");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
    try {
      const path = new URL(req.url).pathname;
      if (path === "/health" && req.method === "GET")
        return json(req, 200, { ok: true, provider: "ModelProxy", model: MODEL,
          configured: !!env.MODELPROXY_API_KEY && !!env.OWNER_UID,
          bothubConfigured: !!env.BOTHUB_API_KEY && !!env.OWNER_UID,
          apimiraConfigured: !!env.APIMIRA_API_KEY && !!env.OWNER_UID,
          bookToolsSupported: !!env.BOOKS,
          availableProviders: {
            modelproxy: !!env.MODELPROXY_API_KEY && !!env.OWNER_UID,
            bothub: !!env.BOTHUB_API_KEY && !!env.OWNER_UID,
            apimira: !!env.APIMIRA_API_KEY && !!env.OWNER_UID
          },
          booksConnected: !!env.BOOKS || (!!env.BOOKS_MCP_URL && !!env.MCP_READ_KEY),
          autoSyncSupported: !!env.BOOKS && typeof env.BOOKS.put === "function" });
      if (path === "/refresh-book" && req.method === "POST") return await refreshBook(req, env);
      if (path === "/preflight" && req.method === "GET") return await bothubPreflight(req, env);
      if (path === "/snapshot" && req.method === "GET") return await snapshotStatus(req, env);
      if (path === "/chat" && req.method === "POST") return await generate(req, env);
      return fail(req, 404, "Адрес не найден.");
    } catch (error) {
      // Never log user input or secrets. Return a CORS-visible error instead of
      // a generic Cloudflare exception which browsers surface as "Failed to fetch".
      console.error("gateway_exception", error?.name || "unknown");
      return fail(req, 500, "Сбой шлюза при обработке запроса. Запрос к Opus мог не выполниться.");
    }
  }
};

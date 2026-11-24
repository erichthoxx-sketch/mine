// Same-origin API bridge for Freitag AI on Cloudflare Pages.
// BotHub uses its existing service binding. Both Workers verify Firebase ownership.
export async function forwardFreitagRequest(context, separate = false) {
  const route = context.params.route;
  const method = context.request.method;
  const allowed = (route === "health" && method === "GET") ||
        (route === "snapshot" && method === "GET") ||
        (route === "preflight" && method === "GET") ||
        (route === "mcp-tools" && method === "GET") ||
        (route === "batch-models" && method === "GET") ||
        (route === "batch-start" && method === "POST") ||
        (route === "batch-status" && method === "GET") ||
        (route === "chat" && method === "POST") ||
        (route === "quote" && method === "POST") ||
        (route === "refresh-book" && method === "POST") ||
        (separate && route === "receipt" && method === "GET");
  if (!allowed || (separate && !["health", "preflight", "mcp-tools", "chat", "quote", "receipt"].includes(route))) {
    return Response.json({ error: "Метод не поддерживается." }, { status: 405 });
  }
  const upstream = context.env.FREITAG_GATEWAY;
  if (!separate && (!upstream || typeof upstream.fetch !== "function")) {
    return Response.json({
      error: "Тестовой Freitag AI требуется Service binding FREITAG_GATEWAY → freitag-opus-gateway в Cloudflare Pages. Ключи заново вводить не нужно."
    }, { status: 503 });
  }
  const headers = new Headers();
  // Authorization is a short-lived Firebase ID token; Worker validates it.
  const token = context.request.headers.get("Authorization");
  if (token) headers.set("Authorization", token);
  if (route === "chat") headers.set("Accept", "text/event-stream");
  if (method === "POST") headers.set("Content-Type", "application/json");
  // Pass the query string through for read-only snapshot status. Never include credentials in URLs.
  const query = ["snapshot", "preflight", "batch-status", "receipt"].includes(route) ? new URL(context.request.url).search : "";
  const target = (separate ? "https://freitag-api-gateway.erichtho-xx.workers.dev/" :
    "https://freitag-opus-gateway.erichtho-xx.workers.dev/") + route + query;
  try {
    const request = new Request(target, {
      method, headers, signal:context.request.signal, ...(separate ? { redirect:"error" } : {}),
      ...(method === "POST" ? { body: context.request.body, duplex: "half" } : {})
    });
    const result = separate ? await fetch(request) : await upstream.fetch(request);
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", result.headers.get("Content-Type") ||
      (route === "chat" && result.ok ? "text/event-stream; charset=utf-8" : "application/json; charset=utf-8"));
    responseHeaders.set("Cache-Control", "no-store, no-transform");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    const requestId = separate && result.headers.get("X-Freitag-Request-Id");
    if (requestId && /^[A-Za-z0-9_-]{1,100}$/.test(requestId)) responseHeaders.set("X-Freitag-Request-Id", requestId);
    return new Response(result.body, { status: result.status, headers: responseHeaders });
  } catch (e) {
    console.error("freitag_pages_bridge", e?.name || "unknown");
    return Response.json({error:separate ? "Отдельный шлюз провайдеров недоступен." :
      "Не удалось вызвать freitag-opus-gateway через Service binding. Проверь его состояние и журнал ошибок."},
      {status:502,headers:{"Cache-Control":"no-store"}});
  }
}

export function onRequest(context) { return forwardFreitagRequest(context); }

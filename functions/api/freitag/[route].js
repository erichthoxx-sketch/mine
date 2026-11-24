// Same-origin API bridge for Freitag AI on Cloudflare Pages.
// Service binding only. No API keys or manuscript content in the repository.
// The existing freitag-opus-gateway Worker still verifies Firebase ownership.
export async function onRequest(context) {
  const route = context.params.route;
  const method = context.request.method;
  if (!((route === "health" && method === "GET") ||
        (route === "snapshot" && method === "GET") ||
        (route === "preflight" && method === "GET") ||
        (route === "mcp-tools" && method === "GET") ||
        (route === "batch-models" && method === "GET") ||
        (route === "batch-start" && method === "POST") ||
        (route === "batch-status" && method === "GET") ||
        (route === "chat" && method === "POST") ||
        (route === "quote" && method === "POST") ||
        (route === "story-map" && method === "GET") ||
        (route === "receipt" && method === "GET") ||
        (route === "chapter-jobs" && (method === "GET" || method === "POST")) ||
        (route === "refresh-book" && method === "POST"))) {
    return Response.json({ error: "Метод не поддерживается." }, { status: 405 });
  }
  const upstream = context.env.FREITAG_GATEWAY;
  if (!upstream || typeof upstream.fetch !== "function") {
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
  const query = ["snapshot", "preflight", "batch-status", "story-map", "chapter-jobs", "receipt"].includes(route) ? new URL(context.request.url).search : "";
  const target = "https://freitag-opus-gateway.erichtho-xx.workers.dev/" + route + query;
  try {
    const result = await upstream.fetch(new Request(target, {
      method, headers, signal:context.request.signal,
      ...(method === "POST" ? { body: context.request.body, duplex: "half" } : {})
    }));
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", result.headers.get("Content-Type") ||
      (route === "chat" && result.ok ? "text/event-stream; charset=utf-8" : "application/json; charset=utf-8"));
    responseHeaders.set("Cache-Control", "no-store, no-transform");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    const requestId=result.headers.get("X-Freitag-Request-Id");
    if(requestId)responseHeaders.set("X-Freitag-Request-Id",requestId);
    return new Response(result.body, { status: result.status, headers: responseHeaders });
  } catch (e) {
    console.error("freitag_pages_bridge", e?.name || "unknown");
    return Response.json({error:"Не удалось вызвать freitag-opus-gateway через Service binding. Проверь его состояние и журнал ошибок."},
      {status:502,headers:{"Cache-Control":"no-store"}});
  }
}

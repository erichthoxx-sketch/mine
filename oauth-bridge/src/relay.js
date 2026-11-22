// Read-only JSON-RPC proxy policy for the ChatGPT-facing OAuth Worker.
// The upstream MCP Worker contains marketing, advertising and income tools;
// this bridge intentionally exposes ONLY manuscript-related operations.
export const ALLOWED_TOOLS = Object.freeze([
  "list_books", "get_book_context", "list_chapters", "read_chapter", "search_book"
]);
const ALLOWED = new Set(ALLOWED_TOOLS);
const MAX_REQUEST_BYTES = 128 * 1024;

const failure = (id, code, message) => ({
  jsonrpc: "2.0", id: id ?? null, error: { code, message }
});
export function checkRpc(raw) {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > MAX_REQUEST_BYTES)
    return { error: failure(null, -32600, "Request too large") };
  let message;
  try { message = JSON.parse(raw); } catch {
    return { error: failure(null, -32700, "Parse error") };
  }
  if (!message || Array.isArray(message) || message.jsonrpc !== "2.0" ||
      typeof message.method !== "string" || message.method.length > 80)
    return { error: failure(message?.id, -32600, "Invalid Request") };
  const allowedMethods = ["initialize", "notifications/initialized", "ping", "tools/list", "tools/call"];
  if (!allowedMethods.includes(message.method))
    return { error: failure(message.id, -32601, "Method not found") };
  if (message.method === "tools/call") {
    const name = message.params?.name;
    if (typeof name !== "string" || !ALLOWED.has(name))
      return { error: failure(message.id, -32601, "Tool unavailable") };
    const args = message.params?.arguments;
    if (args !== undefined && (args === null || typeof args !== "object" || Array.isArray(args)))
      return { error: failure(message.id, -32602, "Invalid tool arguments") };
  }
  return { message };
}
export function filterRpcResponse(request, response) {
  if (request.method !== "tools/list") return response;
  if (!response || response.jsonrpc !== "2.0" || !Array.isArray(response.result?.tools))
    throw Error("Malformed upstream tool list");
  return {
    ...response,
    result: {
      ...response.result,
      tools: response.result.tools.filter(tool => tool && ALLOWED.has(tool.name))
    }
  };
}
export async function proxyMcp(request, env, props, fetcher = fetch) {
  if (!env?.OWNER_GITHUB_ID || !env?.MCP_READ_KEY || env.MCP_READ_KEY.length < 32 ||
      String(props?.githubId) !== String(env.OWNER_GITHUB_ID))
    return new Response("Forbidden", { status: 403 });
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const declared = Number(request.headers.get("Content-Length") || "0");
  if (declared > MAX_REQUEST_BYTES)
    return new Response("Request too large", { status: 413 });
  const raw = await request.text();
  const parsed = checkRpc(raw);
  if (parsed.error)
    return Response.json(parsed.error, { status: 400 });
  const input = parsed.message;
  if (!Object.prototype.hasOwnProperty.call(input, "id"))
    return new Response(null, { status: 202 });
  // Immutable backend URL: no user-controlled URL or credential can be forwarded.
  let upstream;
  try {
    upstream = await fetcher("https://masterskaya-ai.erichtho-xx.workers.dev/mcp", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.MCP_READ_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    return Response.json(failure(input.id, -32603, "Upstream unavailable"),
      { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  if (!upstream.ok)
    return Response.json(failure(input.id, -32603, "Upstream failed"),
      { status: 502, headers: { "Cache-Control": "no-store" } });
  let response;
  try { response = await upstream.json(); }
  catch { return Response.json(failure(input.id, -32603, "Bad upstream response"), { status: 502 }); }
  try { response = filterRpcResponse(input, response); }
  catch { return Response.json(failure(input.id, -32603, "Malformed upstream response"), { status: 502 }); }
  return Response.json(response, {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

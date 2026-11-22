// ChatGPT-only OAuth 2.1 access to the EXISTING read-only Masterskaya MCP.
// New Worker. No modifications to masterskaya-ai, Freitag AI, or its secrets.
// Cloudflare's maintained OAuth provider handles discovery, CIMD / DCR,
// PKCE, token storage, refresh and OAuth protected-resource challenges.
import { env } from "cloudflare:workers";
import OAuthProvider, { AuthorizationError, CimdFetchError,
  authorizationErrorRedirect } from "@cloudflare/workers-oauth-provider";
import { proxyMcp } from "./relay.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
  "&#" + c.charCodeAt(0) + ";");
const deny = (message, status = 400) => new Response(message, {
  status, headers: { "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});
const callback = "https://masterskaya-chatgpt-oauth.erichtho-xx.workers.dev/github/callback";
const githubTokenEndpoint = "https://github.com/login/oauth/access_token";
const githubUserEndpoint = "https://api.github.com/user";
const githubAuthorizeEndpoint = "https://github.com/login/oauth/authorize";

function consentHtml(details, handle) {
  const origin = esc(details.clientDomain || "Unverified client");
  const name = esc(details.clientName || "MCP client");
  const redirectHost = esc(details.redirectHost);
  const scopes = details.scope.map(scope =>
    '<label><input type="checkbox" name="scope" checked value="' + esc(scope) +
    '"> ' + esc(scope) + '</label>').join("");
  return '<!doctype html><html lang="ru"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Доступ к Мастерской</title><style>' +
    'body{font:16px/1.5 system-ui,sans-serif;max-width:560px;padding:24px;margin:8vh auto;color:#222}' +
    'form{border:1px solid #ddd;border-radius:14px;padding:24px}' +
    'button{padding:10px 18px;margin:12px 8px 0 0}label{display:block;margin:8px 0}' +
    '</style><h1>Мастерская · доступ только к книгам</h1>' +
    '<p>Клиент: <strong>' + name + '</strong> (' + origin + ')</p>' +
    '<p>Адрес возврата: <strong>' + redirectHost + '</strong>. ' +
    'Продолжай только если сама начала подключение в ChatGPT.</p>' +
    '<p>Доступ только на чтение: книги, канон, главы и поиск по ним. ' +
    'Реклама, доходы, Директ и изменения рукописей недоступны.</p>' +
    '<form method="post" action="/authorize">' +
    '<input type="hidden" name="handle" value="' + esc(handle) + '">' +
    scopes + '<button name="decision" value="approve">Разрешить через GitHub</button>' +
    '<button name="decision" value="deny">Отмена</button></form></html>';
}
const isChatGptRedirect = details =>
  details?.redirectHost === "chatgpt.com" && !details.redirectIsLoopback;
const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const pkceChallenge = async verifier =>
  base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
function configOk(bindings) {
  return typeof bindings.GITHUB_CLIENT_ID === "string" && !!bindings.GITHUB_CLIENT_ID &&
    typeof bindings.GITHUB_CLIENT_SECRET === "string" && !!bindings.GITHUB_CLIENT_SECRET &&
    /^\d+$/.test(String(bindings.OWNER_GITHUB_ID || "")) &&
    !!bindings.MCP_READ_KEY && bindings.MCP_READ_KEY.length >= 32;
}
async function beginGithubSignIn(req, bindings, approved) {
  const oauth = bindings.OAUTH_PROVIDER;
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const { state, headers } = await oauth.beginUpstream(approved.request, {
    data: { verifier }, headers: approved.headers
  });
  const target = new URL(githubAuthorizeEndpoint);
  target.searchParams.set("client_id", bindings.GITHUB_CLIENT_ID);
  target.searchParams.set("redirect_uri", callback);
  target.searchParams.set("state", state);
  target.searchParams.set("scope", "read:user");
  target.searchParams.set("code_challenge_method", "S256");
  target.searchParams.set("code_challenge", await pkceChallenge(verifier));
  headers.set("Location", target.href);
  return new Response(null, { status: 302, headers });
}
async function authorize(req, bindings) {
  const oauth = bindings.OAUTH_PROVIDER;
  if (!configOk(bindings)) return deny("OAuth Worker not configured", 503);
  if (req.method === "GET") {
    const request = await oauth.parseAuthRequest(req);
    const details = await oauth.describeConsent(request);
    // This is a *private ChatGPT connector*, not a public OAuth service.
    // Do not let another registered client obtain a grant to these manuscripts.
    if (!isChatGptRedirect(details))
      return deny("Only the chatgpt.com OAuth redirect is allowed", 403);
    const consent = await oauth.beginConsent(request);
    consent.headers.set("Content-Type", "text/html; charset=utf-8");
    consent.headers.set("Cache-Control", "no-store");
    return new Response(consentHtml(details, consent.handle), { headers: consent.headers });
  }
  if (req.method === "POST") {
    const form = await req.formData();
    const handle = String(form.get("handle") || "");
    if (form.get("decision") !== "approve") {
      const denied = await oauth.denyConsent(req, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    const scope = form.getAll("scope").map(String);
    if (!scope.includes("books:read")) return deny("Required scope not selected");
    const approved = await oauth.approveConsent(req, handle, { scope });
    const details = await oauth.describeConsent(approved.request);
    if (!isChatGptRedirect(details)) return deny("Unapproved redirect", 403);
    return beginGithubSignIn(req, bindings, approved);
  }
  return deny("Method not allowed", 405);
}
async function githubCallback(req, bindings) {
  if (!configOk(bindings)) return deny("OAuth Worker not configured", 503);
  if (req.method !== "GET") return deny("Method not allowed", 405);
  const oauth = bindings.OAUTH_PROVIDER;
  const { request, data, headers } = await oauth.finishUpstream(req);
  const params = new URL(req.url).searchParams;
  if (params.get("error")) {
    headers.set("Location", authorizationErrorRedirect(request, "access_denied"));
    return new Response(null, { status: 302, headers });
  }
  const code = params.get("code");
  if (!code || typeof data?.verifier !== "string") return deny("Missing authorization code");
  const tokenResponse = await fetch(githubTokenEndpoint, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: bindings.GITHUB_CLIENT_ID,
      client_secret: bindings.GITHUB_CLIENT_SECRET,
      code, code_verifier: data.verifier, redirect_uri: callback
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!tokenResponse.ok) return deny("GitHub authorization failed", 502);
  const token = await tokenResponse.json();
  if (typeof token.access_token !== "string") return deny("GitHub did not authorize", 401);
  const userResponse = await fetch(githubUserEndpoint, {
    headers: { "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token.access_token,
      "User-Agent": "masterskaya-private-mcp-oauth" },
    signal: AbortSignal.timeout(10000)
  });
  if (!userResponse.ok) return deny("GitHub identity unavailable", 502);
  const user = await userResponse.json();
  if (String(user.id) !== String(bindings.OWNER_GITHUB_ID))
    return deny("This GitHub account is not allowed to read Masterskaya", 403);
  // Never put the GitHub access token into MCP token props.
  const { redirectTo } = await oauth.completeAuthorization({
    request, userId: String(user.id), metadata: {},
    scope: request.scope, props: { githubId: String(user.id) }
  });
  headers.set("Location", redirectTo);
  return new Response(null, { status: 302, headers });
}
const defaultHandler = {
  async fetch(req, bindings) {
    try {
      const path = new URL(req.url).pathname;
      if (path === "/authorize") return await authorize(req, bindings);
      if (path === "/github/callback") return await githubCallback(req, bindings);
      return deny("Not found", 404);
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo)
        return Response.redirect(error.redirectTo, 302);
      if (error instanceof AuthorizationError || error instanceof CimdFetchError)
        return deny("OAuth request could not be validated", 400);
      // No credentials, codes or manuscript fragments in logs / error bodies.
      console.error("private_oauth_error", error?.name || "unknown");
      return deny("Authentication temporarily unavailable", 500);
    }
  }
};
const apiHandler = {
  fetch(req, bindings, ctx) {
    return proxyMcp(req, bindings, ctx?.props);
  }
};

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler,
  defaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  clientIdMetadataDocumentEnabled: true,
  scopesSupported: ["books:read", "offline_access"],
  requiredScopes: ["books:read"],
  resourceMetadata: {
    resource: env.MCP_RESOURCE,
    authorization_servers: [new URL(env.MCP_RESOURCE).origin]
  }
});

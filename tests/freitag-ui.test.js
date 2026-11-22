import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const load=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("Freitag AI navigation and branding remain accessible",async()=>{
  const html=await load("../ai/index.html");
  assert.match(html,/<main class="f-main" id="panel"><\/main>/);
  for(const item of ['data-nav="chat"','data-nav="projects"','data-nav="knowledge"','data-nav="settings"']){
    assert.equal(html.split(item).length-1,2,item+" must exist in desktop and mobile navigation");
  }
  assert.match(html,/class="f-monogram"/);
  assert.match(html,/Рабочее пространство автора/);
});

test("Freitag AI uses the original Masterskaya bear, not placeholder F",async()=>{
  const [html,app,css,build]=await Promise.all([
    load("../ai/index.html"),load("../ai/app.js"),
    load("../ai/style.css"),load("../scripts/build-apps.sh")
  ]);
  assert.match(html,/class="f-monogram"[^>]*><img src="\.\.\/workshop\/bear\.svg"/);
  assert.match(app,/class="f-welcome-mark"[^>]*><img src="\.\.\/workshop\/bear\.svg"/);
  assert.match(css,/\.f-monogram img/);
  assert.match(css,/\.f-welcome-mark img/);
  assert.match(build,/writer\/bear\.svg/);
  assert.doesNotMatch(html,/aria-hidden="true">F\.<\/span>/);
  assert.doesNotMatch(app,/aria-hidden=\\"true\\">F\.<\/span>/);
});

test("book can be changed without desktop sidebar and empty chat accepts text",async()=>{
  const app=await load("../ai/app.js");
  assert.match(app,/id="f-chat-project"/);
  assert.match(app,/f-chat-welcome/);
  assert.match(app,/f-mobile-history/);
  assert.match(app,/aria-label="История разговоров"/);
  assert.match(app,/if\(e.target.id==="f-chat-project"\|\|e.target.id==="f-doc-project"/);
  assert.match(app,/const c=ensureChat\(\),msg=text.trim\(\);/);
  assert.match(app,/if\(a==="new-chat"\)\{state.activeChatId=null;pendingMode=null/);
  assert.match(app,/f-sidebar-project/);
});

test("typing newline does not send, Ctrl or Cmd Enter does",async()=>{
  const app=await load("../ai/app.js");
  assert.match(app,/e.key==="Enter"&&\(e.ctrlKey\|\|e.metaKey\)/);
  assert.doesNotMatch(app,/e.key==="Enter"&&!e.shiftKey/);
  assert.match(app,/else pendingMode=e.target.value/);
});

test("response copy, clear settings, backups and ModelProxy protection remain present",async()=>{
  const app=await load("../ai/app.js");
  for(const text of ['data-action="copy-answer"','data-action="feedback-good"',
    'data-action="feedback-bad"','data-action="cloud-save"','data-action="cloud-load"',
    'id="f-import"','id="f-provider"','id="f-worker"','id="f-endpoint"','id="f-model"',
    'id="f-context"','id="f-global"','id="f-theme"',
    'id="f-test-status"','id="f-chat-form"','data-action="export"']){
    assert.ok(app.includes(text), "Missing behavior or form field: "+text);
  }
  assert.match(app,/health.provider!=="ModelProxy"/);
  assert.match(app,/refreshLinkedBook\(\{/);
  assert.match(app,/sourceRevision/);
  assert.match(app,/indexedDB.open\("freitag-ai-v1",1\)/);
});

test("unsent chapter prompts survive navigation and are cleared only after submission",async()=>{
  const app=await load("../ai/app.js");
  assert.match(app,/drafts:\{\}/);
  assert.match(app,/const draftKey=/);
  assert.match(app,/const rememberDraft=/);
  assert.match(app,/if\(e.target.id==="f-message-input"\)rememberDraft\(e.target.value\)/);
  assert.match(app,/esc\(state.drafts\?\.\[draftKey\(\)\]\|\|""\)/);
  assert.match(app,/delete state.drafts\[previousDraft\]/);
});

test("design has true dark theme, reduced-motion and responsive layouts",async()=>{
  const css=await load("../ai/style.css");
  for(const selector of ['html.app-freitag[data-theme="dark"]','.f-chat-welcome',
    '.f-compose-surface','.f-settings-fold','.f-chat-more-menu',
    '.f-mobile-nav','.f-chat-book',':focus-visible',
    '@media(max-width:760px)','@media(max-width:470px)','prefers-reduced-motion']){
    assert.ok(css.includes(selector),"Expected UI selector "+selector);
  }
});

test("BotHub offers a compact, persistent model choice without exposing the key in the browser",async()=>{
  const app=await load("../ai/app.js");
  assert.match(app,/id="f-bothub-model"/);
  assert.match(app,/claude-sonnet-5\.5/);
  assert.match(app,/claude-opus-5\.5/);
  assert.match(app,/state\.settings\.bothubModel=bothubModel/);
  assert.match(app,/activeBotHubModel\(\)/);
  assert.match(app,/\/preflight\?model=/);
  assert.doesNotMatch(app,/name="BOTHUB_API_KEY"/);
});

test("fresh book must be loaded from Google Docs on every paid send, not from cached MCP snapshot",async()=>{
  const live=await load("../ai/live-context.js");
  const app=await load("../ai/app.js");
  const worker=await load("../proxy/freitag-modelproxy-worker.js");
  assert.match(live,/await master\.refresh\(\)/);
  assert.match(live,/await bookSnapshot\(current\)/);
  assert.match(live,/gateway \+ "\/refresh-book"/);
  assert.match(app,/await ensureDriveAccess\(selectedBookId\)/);
  assert.match(app,/await refreshLinkedBook\(/);
  assert.match(worker,/path === "\/refresh-book"/);
  assert.match(worker,/requiredRevision && book\.updatedAt !== requiredRevision/);
  assert.doesNotMatch(app,/gateway\+"\/snapshot\?bookId="/);
});

test("model picked in chat/settings persists immediately, never silently uses Ollama",async()=>{
  const [app,css]=await Promise.all([load("../ai/app.js"),load("../ai/style.css")]);
  assert.match(app,/id="f-chat-model"/);
  assert.match(app,/chatModelOptions\(\)/);
  assert.match(app,/value==="bothub:claude-opus-5\.5"/);
  assert.match(app,/if\(e\.target\.id==="f-chat-model"\)/);
  assert.match(app,/if\(e\.target\.id==="f-provider"\|\|e\.target\.id==="f-bothub-model"\)/);
  assert.match(app,/async function activateModel\(provider, model\)/);
  assert.match(app,/state\.settings\.provider=provider;/);
  assert.match(app,/await save\(\);\s*renderHeader\(\);/);
  assert.match(app,/model:state\.settings\.provider==="bothub"\?activeBotHubModel\(\)/);
  assert.match(css,/\.f-chat-model-select/);
});
test("compact chat retains editable writing space and does not duplicate desktop new chat",async()=>{
  const [app,css]=await Promise.all([load("../ai/app.js"),load("../ai/style.css")]);
  assert.match(app,/has-messages/);
  assert.match(app,/id="f-message-input" rows="3"/);
  assert.match(css,/\.f-chat\.has-messages\{min-height:0\}/);
  assert.match(css,/\.f-btn-new\{display:none\}/);
  assert.match(css,/\.f-compose \.f-textarea\{min-height:72px;max-height:38dvh/);
  assert.doesNotMatch(app,/id="f-sidebar-project"/);
});

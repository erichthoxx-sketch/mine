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

test("book can be changed without desktop sidebar and empty chat accepts text",async()=>{
  const app=await load("../ai/app.js");
  assert.match(app,/id="f-chat-project"/);
  assert.match(app,/f-chat-welcome/);
  assert.match(app,/if\(e.target.id==="f-sidebar-project"\|\|e.target.id==="f-chat-project"/);
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
  assert.match(app,/gateway\+"\/snapshot\?bookId="/);
  assert.match(app,/indexedDB.open\("freitag-ai-v1",1\)/);
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

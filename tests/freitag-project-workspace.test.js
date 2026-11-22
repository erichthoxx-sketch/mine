import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {renderMarkdown} from "../ai/markdown.js";
import {projectHomeHtml} from "../ai/project-view.js";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("Markdown displays paragraphs, bold text, lists and code without HTML execution",()=>{
  const html=renderMarkdown("**Главное**\n\nПервый абзац.\n\n- канон\n- сцена\n\n\x60nextOffset: null\x60");
  assert.match(html,/<strong>Главное<\/strong>/);
  assert.match(html,/<p>Первый абзац\.<\/p>/);
  assert.match(html,/<ul>\s*<li>канон<\/li>\s*<li>сцена<\/li>\s*<\/ul>/);
  assert.match(html,/<code>nextOffset: null<\/code>/);
  const injected=renderMarkdown('<img src=x onerror="alert(1)">\n\n<a href="javascript:alert(1)">click</a>');
  assert.doesNotMatch(injected,/<img\b|<a href="javascript:/i);
  assert.match(injected,/&lt;img/);
});
test("Project view exposes editable author instructions, MCP source and new chat",()=>{
  const html=projectHomeHtml({id:"x",name:"Книга <3",instruction:"Пиши свободно",
    masterBookId:"bookid",description:"Мой роман",voice:"",canon:"",scene:""},
    [{id:"c1",projectId:"x",title:"Глава 15",updated:"2026-11-22"}],[],
    v=>v);
  assert.match(html,/data-action="new-project-chat"/);
  assert.match(html,/id="f-project-instructions"/);
  assert.match(html,/Пиши свободно/);
  assert.match(html,/MCP вызывается автоматически/);
  assert.match(html,/Обновить Google Docs/);
  assert.match(html,/Книга &lt;3/);
});
test("Paid chats use MCP on send without Google Drive OAuth popups or hidden prompts",async()=>{
  const [app,worker]=await Promise.all([read("../ai/app.js"),read("../proxy/freitag-modelproxy-worker.js")]);
  const send=app.slice(app.indexOf("async function sendMessage("),app.indexOf("function download(",app.indexOf("async function sendMessage(")));
  assert.ok(!send.includes("ensureDriveAccess("));
  assert.ok(!send.includes("refreshLinkedBook("));
  assert.ok(!send.includes("confirm("));
  assert.match(send,/await master\.idToken\(\)/);
  assert.match(send,/const messages=isPaidProvider\?modelproxyMessages/);
  assert.match(app,/function renderProjectHome/);
  assert.match(app,/renderMarkdown\(m\.content\)/);
  assert.match(app,/p\.instruction=String\(fd\.get\("instruction"\)/);
  const instructions=app.slice(app.indexOf("function modelproxyMessages(c){"),app.indexOf("function buildMessages(c){"));
  assert.doesNotMatch(instructions,/mode\.instruction/);
  assert.doesNotMatch(instructions,/ТЕКУЩАЯ СЦЕНА\/ПОСЛЕДНИЕ СОБЫТИЯ/);
  assert.match(instructions,/userInstruction\(p\.instruction\)/);
  assert.doesNotMatch(worker,/const editorialStyle=/);
  assert.match(worker,/if\(input\.sourceRevision\)/);
  assert.match(worker,/mcpToolsCompletion/);
});

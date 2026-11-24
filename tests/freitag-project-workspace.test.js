import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {renderMarkdown} from "../ai/markdown.js";
import {projectHomeHtml} from "../ai/project-view.js";
import {projectMemoryContext} from "../ai/project-context.js";
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

test("Project memory keeps the author's decisions and finds relevant text across the same book",()=>{
  const project={id:"book",storyMap:"Хронология с начала романа.",
    memoryNotes:[{title:"Ключ",text:"Марта прячет медальон. Глеб пока об этом не знает."}]};
  const full="Другие события. ".repeat(400)+" Архивная находка. Медальон лежал в фамильной шкатулке. "+ "Другая сцена. ".repeat(400);
  const options={project,task:"Вспомни про медальон",terms:["медальон"],budget:4000,current:"current",
    recent:[{role:"user",content:"Медальон уже в запросе"}],
    chats:[
      {id:"current",projectId:"book",title:"Сегодня",messages:[{role:"user",content:"Медальон уже в запросе"}]},
      {id:"old",projectId:"book",title:"Ранние сцены",messages:[{role:"assistant",content:full}]},
      {id:"other",projectId:"other-book",title:"Чужая книга",messages:[{role:"user",content:"Медальон. Секрет другого романа."}]}
    ],
    docs:[{projectId:"book",name:"Опись",text:"Медальон достался героине от бабушки."},
      {projectId:"book",name:"Архивная копия",text:"Медальон из отключённого материала.",includeInContext:false}],
    feedback:[
      {id:"style",projectId:"book",kind:"good",reason:"Держать авторскую интонацию.",finalText:"Ровный авторский голос."},
      {id:"other-style",projectId:"other-book",kind:"good",reason:"Стиль другого проекта."}
    ]};
  const result=projectMemoryContext(options);
  assert.match(result,/Сюжетная карта автора\nХронология с начала романа/);
  assert.match(result,/Утвержденные решения автора[\s\S]*Глеб пока об этом не знает/);
  assert.match(result,/Ровный авторский голос/);
  assert.match(result,/решения автора[\s\S]*Выписки из рабочего архива[\s\S]*Ранние сцены[\s\S]*фамильной шкатулке/i);
  assert.match(result,/Медальон достался героине от бабушки/);
  assert.doesNotMatch(result,/Секрет другого романа|Стиль другого проекта|Медальон уже в запросе|отключённого материала/);
  assert.ok(result.length<=4000);
  assert.ok(projectMemoryContext({...options,budget:600}).length<=600);
  assert.equal(options.chats[1].messages[0].content,full);
});
test("Paid chats use MCP on send without Google Drive OAuth popups or hidden prompts",async()=>{
  const [app,worker]=await Promise.all([read("../ai/app.js"),read("../proxy/freitag-modelproxy-worker.js")]);
  const send=app.slice(app.indexOf("async function sendMessage("),app.indexOf("function download(",app.indexOf("async function sendMessage(")));
  assert.ok(!send.includes("ensureDriveAccess("));
  assert.ok(!send.includes("refreshLinkedBook("));
  assert.match(send,/if\(isPaidProvider\)[\s\S]*?\/quote[\s\S]*?await openRequestEstimate\(/);
  assert.match(send,/await master\.idToken\(\)/);
  assert.match(send,/messages:lightweight\?/);
  assert.match(app,/function renderProjectHome/);
  assert.match(app,/renderMarkdown\(m\.content\)/);
  assert.match(app,/p\.instruction=String\(fd\.get\("instruction"\)/);
  const instructions=app.slice(app.indexOf("function modelproxyMessages("),app.indexOf("function buildMessages(c){"));
  assert.doesNotMatch(instructions,/mode\.instruction/);
  assert.doesNotMatch(instructions,/ТЕКУЩАЯ СЦЕНА\/ПОСЛЕДНИЕ СОБЫТИЯ/);
  assert.match(instructions,/userInstruction\(p\?\.instruction\)/);
  assert.doesNotMatch(worker,/const editorialStyle=/);
  assert.match(worker,/if\(input\.sourceRevision && !separateGateway\)/);
  assert.match(worker,/mcpToolsCompletion/);
});

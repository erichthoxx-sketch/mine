// Live-browser smoke for isolated Freitag AI UI. Runs with mock Ollama ONLY.
// Never sends manuscript content or API keys. Fixtures are generated in a fresh browser profile.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const BASE = process.env.FREITAG_PREVIEW_URL || "http://127.0.0.1:8765/ai/";
const OUT = "docs/freitag-ui-preview";
await mkdir(OUT,{recursive:true});
async function capture(page,name){
  await page.evaluate(()=>{
    document.querySelector("#f-flash")?.setAttribute("hidden","");
    window.scrollTo(0,0);
  });
  const viewport=page.viewportSize();
  await page.mouse.move(viewport.width-4,Math.min(220,viewport.height-4));
  await page.waitForTimeout(80);
  await page.screenshot({path:OUT+"/"+name,fullPage:true});
}
const browser = await chromium.launch({headless:true,args:["--no-sandbox"]});
const errors=[];

async function pageAt(width,height){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("http://localhost:11434/**",async route=>{
    const u=new URL(route.request().url());
    const headers={
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Headers":"Content-Type",
      "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
      "Content-Type":"application/json"
    };
    if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers});
    if(u.pathname.endsWith("/api/tags"))
      return route.fulfill({status:200,headers,body:JSON.stringify({models:[{name:"qwen3:4b-instruct"}]})});
    if(u.pathname.endsWith("/api/chat"))
      return route.fulfill({status:200,headers:{
        ...headers,"Content-Type":"application/x-ndjson"
      },body:JSON.stringify({message:{role:"assistant",content:"Тестовый ответ. Данные вымышлены."},done:false})+
        "\n"+JSON.stringify({done:true})+"\n"});
    return route.fulfill({status:404,headers,body:"{}"});
  });
  await page.goto(BASE,{waitUntil:"domcontentloaded"});
  await page.locator("#f-chat-form").waitFor({timeout:12000});
  return page;
}

try{
  const desktop=await pageAt(1440,900);
  assert.equal(await desktop.locator("#f-chat-project").count(),1);
  assert.equal(await desktop.locator("button[data-nav=projects]").count(),2);
  await capture(desktop,"desktop.png");

  // New lines must remain new lines, and changing the writing mode must not clear text.
  const editor=desktop.locator("#f-message-input");
  await editor.fill("Черновик для проверки сохранения");
  await editor.press("Enter");
  await editor.type("Вторая строка");
  assert.match(await editor.inputValue(),/Черновик.*\nВторая строка/s);
  await desktop.locator("#f-writing-mode").selectOption("plot");
  assert.match(await editor.inputValue(),/Вторая строка/);
  await desktop.waitForTimeout(900);
  await desktop.reload({waitUntil:"domcontentloaded"});
  await desktop.locator("#f-chat-form").waitFor();
  assert.match(await desktop.locator("#f-message-input").inputValue(),/Вторая строка/);

  // A mock response tests actual browser message plumbing without calling paid APIs.
  await desktop.locator("#f-message-input").fill("Привет! Проверка интерфейса.");
  await desktop.locator("#f-chat-form button[type=submit]").click();
  await desktop.locator(".f-msg.assistant .f-msg-text").filter({hasText:"Тестовый ответ"}).waitFor({timeout:12000});
  await capture(desktop,"conversation.png");
  assert.equal(await desktop.locator("#f-message-input").inputValue(),"");
  assert.equal(await desktop.getByRole("button",{name:"Копировать"}).count(),1);
  await desktop.getByRole("button",{name:"Настройки",exact:true}).first().click();
  await desktop.locator("#f-provider").waitFor();
  await capture(desktop,"settings.png");
  await desktop.getByText("Резервные копии и мои данные").click();
  assert.equal(await desktop.locator("#f-import").count(),1);
  // The dark theme must really apply after saving settings, not just appear in the menu.
  await desktop.locator("#f-theme").selectOption("dark");
  await desktop.locator('#f-settings button[type="submit"]').click();
  await desktop.waitForFunction(() => document.documentElement.getAttribute("data-theme")==="dark");
  await capture(desktop,"dark.png");
  await desktop.locator("#f-theme").selectOption("light");
  await desktop.locator('#f-settings button[type="submit"]').click();
  await desktop.waitForFunction(() => document.documentElement.getAttribute("data-theme")==="light");

  // The book library and local materials must be usable without any external account.
  await desktop.locator('.f-nav button[data-nav="projects"]').click();
  await desktop.getByRole("button",{name:/Новая книга/}).click();
  await desktop.locator('dialog input[name="name"]').fill("Тестовая книга");
  await desktop.locator('dialog button[value="save"]').click();
  await desktop.locator("#panel").getByText("Тестовая книга").waitFor({timeout:6000});
  assert.match(await desktop.locator("#panel").innerText(),/Тестовая книга/);
  await capture(desktop,"books.png");

  await desktop.locator('.f-nav button[data-nav="knowledge"]').click();
  await desktop.locator("#f-doc-project").selectOption({label:"Тестовая книга"});
  await desktop.getByRole("button",{name:/Добавить заметку/}).click();
  await desktop.locator('dialog input[name="name"]').fill("Тестовый отрывок");
  await desktop.locator('dialog textarea[name="text"]').fill("Проверка материалов. Тестовый текст, не рукопись автора.");
  await desktop.locator('dialog button[value="save"]').click();
  await desktop.locator("#panel").getByText("Тестовый отрывок").waitFor({timeout:6000});
  assert.match(await desktop.locator("#panel").innerText(),/Тестовый отрывок/);
  await capture(desktop,"materials.png");

  const mobile=await pageAt(390,844);
  assert.equal(await mobile.locator("#f-chat-project").count(),1);
  await capture(mobile,"mobile.png");
  // The book menu must work on phones even though the desktop sidebar is hidden.
  await mobile.locator('.f-mobile-nav button[data-nav="projects"]').click();
  await mobile.getByRole("button",{name:/Новая книга/}).first().click();
  await mobile.locator('dialog input[name="name"]').fill("Тестовая книга");
  await mobile.locator('dialog button[value="save"]').click();
  await mobile.locator('.f-mobile-nav button[data-nav="chat"]').click();
  await mobile.locator("#f-chat-project").selectOption({label:"Тестовая книга"});
  await capture(mobile,"mobile-book.png");
  assert.match(await mobile.locator("#f-chat-project").inputValue(),/\S/);
  await mobile.locator("#f-message-input").fill("Тестовый роман: новый абзац");
  await mobile.waitForTimeout(850);
  await mobile.reload({waitUntil:"domcontentloaded"});
  await mobile.locator("#f-chat-form").waitFor();
  assert.equal(await mobile.locator("#f-message-input").inputValue(),"Тестовый роман: новый абзац");

  // Send in the active book; the phone must be able to reopen that conversation.
  await mobile.locator("#f-message-input").fill("Проверка истории на телефоне.");
  await mobile.locator("#f-chat-form button[type=submit]").click();
  await mobile.locator(".f-msg.assistant .f-msg-text").filter({hasText:"Тестовый ответ"}).waitFor({timeout:12000});
  await mobile.locator('.f-mobile-history summary').click();
  assert.equal(await mobile.locator('.f-mobile-history-panel button[data-action="select-chat"]').count(),1);
  await capture(mobile,"mobile-history.png");
  await mobile.locator('.f-mobile-history-panel button[data-action="select-chat"]').click();
  assert.match(await mobile.locator(".f-msg.user .f-msg-text").innerText(),/Проверка истории/);

  const overflow=await mobile.evaluate(()=>({
    scrollWidth:document.documentElement.scrollWidth,
    clientWidth:document.documentElement.clientWidth
  }));
  assert.ok(overflow.scrollWidth<=overflow.clientWidth+1,"Mobile has horizontal overflow: "+JSON.stringify(overflow));
  assert.deepEqual(errors,[],"No uncaught page exceptions expected");
  console.log("Freitag AI REAL BROWSER: desktop/mobile, new book, chat, mock reply, drafts, settings PASS");
}finally{
  await browser.close();
}

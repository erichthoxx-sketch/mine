// Все запросы браузера перехватываются. Книги и ответы модели вымышлены.
import assert from "node:assert/strict";
import {mkdir, readFile} from "node:fs/promises";
import {chromium} from "playwright";

const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
const origin = "https://fixture.freitag-ai-test.pages.dev";
const appRoot = new URL("../",import.meta.url);
const instruction = "\n  Тестовая общая инструкция. ".repeat(600)+"  ";
const project = "\n  Указания для тестовой книги. ".repeat(400)+"  ";
const prompt = "  \nЗадание для проверки. ".repeat(1700)+"  ";
const ending = "Последняя строка.";
const rest = "Вымышленный текст. ".repeat(1400)+ending;
const screenshots = process.env.FREITAG_SCREENSHOT_DIR;
if(screenshots)await mkdir(screenshots,{recursive:true});

try {
  for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:"block"});
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
    await page.route("**/*",async route=>{
      const u=new URL(route.request().url());
      if(u.hostname==="fonts.googleapis.com")return route.fulfill({contentType:"text/css",body:""});
      if(u.origin!==origin)throw Error("Неожиданный сетевой запрос: "+u.origin);
      const api={
        "/health":{ok:true,model:"claude-opus-5-5",provider:"ModelProxy",apimiraConfigured:true,aitunnelConfigured:true,chapterProtocol:2},
        "/preflight":u.searchParams.get("provider")==="aitunnel"?{ok:true,balanceRub:200,budgetRub:160}:{ok:true,balanceUsd:3.45},
        "/mcp-tools":{ok:true,toolCount:4,tools:["list_books","get_book_context","list_chapters","read_chapter"]},
        "/snapshot":{ok:true,chapterCount:15,updatedAt:"2026-11-22T17:00:00Z",
          lastChapters:[{slot:14,title:"Тестовая глава 14"},{slot:15,title:"Тестовая глава 15"}]}
      };
      if(u.pathname.startsWith("/api/freitag/")){
        const data=api[u.pathname.replace("/api/freitag","")];
        assert.ok(data,"unexpected API route "+u.pathname);
        assert.equal(route.request().method(),"GET");
        if(u.pathname.endsWith("/snapshot")){
          assert.equal(u.searchParams.get("bookId"),"fixture");
          assert.equal(route.request().headers().authorization,"Bearer test");
        }
        return route.fulfill({json:data});
      }
      if(u.pathname==="/ai/master-sync.js")return route.fulfill({contentType:"text/javascript",body:
        'export const master={ready:true,user:{},books:[{id:"fixture",title:"Тестовая книга"}],init:async()=>{},refresh:async()=>{},canonicalText:()=>"",idToken:async()=>"test"};'});
      let path=u.pathname==="/ai/"?"ai/index.html":u.pathname.slice(1);
      if(path==="workshop/bear.svg")path="writer/bear.svg";
      assert.match(path,/^(ai|writer|js|css)\//);
      const types={html:"text/html",js:"text/javascript",css:"text/css",svg:"image/svg+xml",webmanifest:"application/manifest+json"};
      return route.fulfill({contentType:types[path.split(".").at(-1)],body:await readFile(new URL(path,appRoot))});
    });
    await page.addInitScript(()=>{
      const fetcher=window.fetch;
      window.submitted=[];
      window.quoted=[];
      window.fetch=(url,opts)=>{
        if(String(url).endsWith("/api/freitag/quote")){
          window.quoted.push(JSON.parse(opts.body));
          return Promise.resolve(Response.json({ok:true,ready:true,estimateRub:136,outputTokenLimit:14000,
            balanceRub:200,budgetRub:160,fingerprint:"fixture-estimate"}));
        }
        if(!String(url).endsWith("/api/freitag/chat"))return fetcher(url,opts);
        if(window.rejectSource)return Promise.resolve(Response.json({
          code:"BOOK_SOURCE",error:"Мастерская не нашла одну из фраз."
        },{status:424}));
        window.submitted.push(JSON.parse(opts.body));
        const bytes=new TextEncoder();
        return Promise.resolve(new Response(new ReadableStream({start(controller){
          const data=value=>controller.enqueue(bytes.encode("data: "+JSON.stringify(value)+"\r\n\r\n"));
          window.fragment=text=>data({choices:[{delta:{content:text}}]});
          window.finish=(reason,cost)=>{
            if(reason){
              data({choices:[{delta:{},finish_reason:reason}]});
              if(cost!==undefined)data({choices:[],usage:{cost_rub:cost}});
              controller.enqueue(bytes.encode("data: [DONE]\r\n\r\n"));
            }
            controller.close();
          };
          window.fragment("Начало. ");
        }}),{headers:{"Content-Type":"text/event-stream"}}));
      };
    });
    await page.goto(origin+"/ai/");
    const nav=async name=>page.locator('[data-nav="'+name+'"]:visible').first().click();
    await nav("settings");
    await page.locator("#f-provider").selectOption("apimira");
    await page.locator('[data-action="test-connection"]').click();
    await page.locator("#f-test-status").filter({hasText:"$3.4500"}).waitFor();
    await page.locator("#f-global").fill(instruction);
    await page.locator('#f-settings button[type="submit"]').click();
    await nav("projects");
    await page.locator('[data-action="master-import"]').click();
    await page.locator("#f-project-instruction").fill(project);
    await page.getByRole("button",{name:"Проверить источник бесплатно"}).click();
    await page.getByRole("status").filter({hasText:"Глав в снимке: 15"}).waitFor();
    assert.match(await page.locator("#f-book-check").innerText(),/Тестовая глава 15/);
    assert.equal(await page.locator("#f-project-instruction").inputValue(),project);
    assert.deepEqual(await page.evaluate(()=>window.submitted),[]);
    if(screenshots)await page.screenshot({path:screenshots+"/project-"+width+".png",fullPage:true});
    await page.locator('#f-project-instructions button[type="submit"]').click();
    await page.locator('[data-action="new-project-chat"]').click();
    await page.locator('.f-source-tag.linked').filter({hasText:"Мастерская"}).waitFor();
    await page.getByRole("button",{name:"Развернуть"}).click();
    await page.locator("#f-field-draft").fill(prompt);
    await page.getByRole("button",{name:"Готово"}).click();
    assert.equal(await page.locator("#f-message-input").inputValue(),prompt);
    await page.getByRole("button",{name:"Развернуть"}).click();
    await page.locator("#f-field-draft").fill("Несохраненная правка");
    await page.getByRole("button",{name:"Отмена"}).click();
    assert.equal(await page.locator("#f-message-input").inputValue(),prompt);
    const tools=page.locator("#f-chat-tools summary");
    const context=page.getByRole("button",{name:"Найти фразу в книге",exact:true});
    await page.locator("#f-message-input").fill("Тест выбора источников");
    await tools.click();
    await context.click();
    await page.locator("#f-field-query").fill("синяя папка");
    await page.getByRole("button",{name:"Сохранить в задании"}).click();
    assert.equal(await page.locator("#f-message-input").inputValue(),
      "Тест выбора источников\n\nПоиск по книге: синяя папка");
    await tools.click();
    await context.click();
    assert.equal(await page.locator("#f-field-query").inputValue(),"синяя папка");
    await page.locator("#f-field-query").fill("письмо о ключе");
    await page.getByRole("button",{name:"Сохранить в задании"}).click();
    assert.equal(await page.locator("#f-message-input").inputValue(),
      "Тест выбора источников\n\nПоиск по книге: письмо о ключе");
    await page.evaluate(()=>{window.rejectSource=true;});
    await page.locator('#f-chat-form button[type="submit"]').click();
    await page.getByText("Мастерская не нашла одну из фраз.",{exact:true}).waitFor();
    await page.locator('#f-chat-form button[type="submit"]').waitFor();
    assert.equal(await page.locator("#f-message-input").inputValue(),
      "Тест выбора источников\n\nПоиск по книге: письмо о ключе");
    assert.equal(await page.locator(".f-msg").count(),0);
    await page.evaluate(()=>{window.rejectSource=false;});
    assert.deepEqual(await page.evaluate(()=>window.submitted),[]);
    await page.locator("#f-message-input").fill(prompt);
    const submitBounds=await page.locator('#f-chat-form button[type="submit"]').boundingBox();
    const navBounds=await page.locator(".f-mobile-nav").boundingBox();
    assert.ok(submitBounds.y+submitBounds.height<=(navBounds?.y??900),"Send button must remain above the bottom navigation");
    if(screenshots)await page.screenshot({path:screenshots+"/chat-"+width+".png",fullPage:true});
    await page.locator('#f-chat-form button[type="submit"]').click();
    await page.locator(".assistant .f-msg-text").filter({hasText:"Начало."}).waitFor();
    const requests=await page.evaluate(()=>window.submitted);
    assert.equal(requests.length,1);
    const request=requests[0];
    assert.equal(request.provider,"apimira");
    assert.equal(request.bookId,"fixture");
    assert.equal(request.outputTokenLimit,14000);
    assert.deepEqual(request.messages,[{role:"system",content:instruction+"\n\n"+project},{role:"user",content:prompt}]);
    await page.evaluate(text=>window.fragment(text),rest);
    await page.locator(".assistant .f-msg-text").filter({hasText:ending}).waitFor();
    if(width===390){
      // Закрытие во время потока. Ждем именно записи в IndexedDB.
      await page.evaluate(end=>new Promise((resolve,reject)=>{
        const deadline=Date.now()+10000;
        function check(){
          const open=indexedDB.open("freitag-ai-v1");
          open.onsuccess=()=>{
            const db=open.result,get=db.transaction("data").objectStore("data").get("state");
            get.onsuccess=()=>{
              db.close();
              if(get.result?.chats[0]?.messages.at(-1)?.content?.endsWith(end))resolve();
              else if(Date.now()<deadline)setTimeout(check,50);
              else reject(Error("Полученная часть главы не сохранена"));
            };
          };
        }
        check();
      }),ending);
    }else{
      await page.evaluate(()=>window.finish("stop"));
      await page.locator('.assistant [data-action="copy-answer"]').waitFor();
    }
    await page.reload();
    await page.locator(".assistant .f-msg-text").filter({hasText:ending}).waitFor();
    assert.equal(await page.locator(".assistant .f-msg-text").first().innerText(),"Начало. "+rest);
    const task=page.locator(".f-prompt").first();
    assert.equal(await task.getAttribute("open"),null);
    await task.locator("summary").click();
    assert.equal(await task.locator(".f-msg-text").textContent(),prompt);
    await task.locator("summary").click();
    const [file]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Скачать TXT"}).click()]);
    assert.match(file.suggestedFilename(),/\.txt$/);
    assert.equal(await readFile(await file.path(),"utf8"),"Начало. "+rest);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await page.getByText("Получен фрагмент. Завершение главы не подтверждено.").count(),width===390?1:0);
    assert.deepEqual(await page.evaluate(()=>window.submitted),[]);
    if(width===1440){
      for(const reason of ["length",null,"content_filter"]){
        await page.locator("#f-message-input").fill("Второй тест");
        await page.locator('#f-chat-form button[type="submit"]').click();
        await page.waitForFunction(n=>window.submitted.length===n,["length",null,"content_filter"].indexOf(reason)+1);
        await page.locator(".assistant .f-msg-text").last().filter({hasText:"Начало."}).waitFor();
        await page.evaluate(r=>window.finish(r),reason);
        await page.locator(".assistant").last().filter({hasText:"Генерация не завершена"}).waitFor();
      }
      await nav("settings");
      await page.locator("#f-provider").selectOption("aitunnel");
      await page.locator('[data-action="test-connection"]').click();
      await page.locator("#f-test-status").filter({hasText:"Остаток бюджета ключа"}).waitFor();
      await nav("chat");
      await page.locator("#f-message-input").fill(prompt);
      const submit=page.locator('#f-chat-form button[type="submit"]');
      const [dialog]=await Promise.all([page.waitForEvent("dialog").then(async item=>{
        const message=item.message();await item.dismiss();return message;
      }),submit.click()]);
      assert.match(dialog,/136.*14000|136.*14.000/);
      assert.equal(await page.locator("#f-message-input").inputValue(),prompt);
      assert.equal(await page.evaluate(()=>window.submitted.length),3);
      page.once("dialog",item=>item.accept());
      await submit.click();
      await page.waitForFunction(()=>window.submitted.length===4);
      const paid=await page.evaluate(()=>window.submitted.at(-1));
      assert.equal(paid.provider,"aitunnel");
      assert.equal(paid.messages.at(-1).content,prompt);
      assert.deepEqual(paid.aitunnelQuote,{fingerprint:"fixture-estimate",estimateRub:136});
      await page.evaluate(()=>window.finish("stop",123.45));
      await page.getByText(/Списано AITUNNEL: 123,45/).waitFor();
      console.log("Проверены отмена до оплаты, подтверждение и сумма AITUNNEL в чате");
    }
    assert.deepEqual(errors,[]);
    await page.close();
    console.log("Проверено получение и сохранение главы при ширине "+width+" px");
  }
} finally {await browser.close();}

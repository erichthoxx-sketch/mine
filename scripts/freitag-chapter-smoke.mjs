// Все запросы браузера перехватываются. Книги и ответы модели вымышлены.
import assert from "node:assert/strict";
import {mkdir, readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {chromium} from "playwright";

const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
const workingOrigin = "https://codex-freitag-aitunnel.freitag-ai-test.pages.dev";
const appRoot = new URL("../",import.meta.url);
const instruction = "\n  Тестовая общая инструкция. ".repeat(600)+"  ";
const project = "\n  Указания для тестовой книги. ".repeat(400)+"  ";
const prompt = "  \nЗадание для проверки. ".repeat(1700)+"  ";
const ending = "Последняя строка.";
const rest = "Вымышленный текст. ".repeat(1400)+ending;
const screenshots = process.env.FREITAG_SCREENSHOT_DIR;
if(screenshots)await mkdir(screenshots,{recursive:true});
const Zip=runInNewContext(await readFile(new URL("js/vendor/jszip.min.js",appRoot),"utf8")+"; JSZip",{setImmediate,clearImmediate,setTimeout,clearTimeout});
const word=new Zip();
word.file("word/document.xml",'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
  '<w:p><w:r><w:t>Первая строка.</w:t></w:r></w:p><w:p><w:r><w:t>Вторая строка.</w:t><w:br/><w:t>Конец главы.</w:t></w:r></w:p>'+
  '</w:body></w:document>');
const wordBytes=Buffer.from(await word.generateAsync({type:"uint8array"}));

try {
  for(const width of [1440,390]){
    const working=width===1440;
    const origin=working?workingOrigin:"https://fixture.freitag-ai-test.pages.dev";
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
        "/preflight":u.searchParams.get("provider")==="aitunnel"?{ok:true,balanceRub:200,budgetRub:160}:{ok:true,balanceUsd:3.45,inputUsd:1.25,outputUsd:5.20},
        "/receipt":{ok:true,costUsd:.013,inputTokens:3200,outputTokens:1700},
        "/mcp-tools":{ok:true,toolCount:4,tools:["list_books","get_book_context","list_chapters","read_chapter"]},
        "/snapshot":{ok:true,chapterCount:15,updatedAt:"2026-11-22T17:00:00Z",
          lastChapters:[{slot:14,title:"Тестовая глава 14"},{slot:15,title:"Тестовая глава 15"}]}
      };
      if(u.pathname.startsWith("/api/freitag/")){
        const data=api[u.pathname.replace(/^\/api\/freitag(?:\/providers)?/,"")];
        assert.ok(data,"unexpected API route "+u.pathname);
        assert.equal(route.request().method(),"GET");
        if(u.pathname.endsWith("/snapshot")){
          assert.equal(u.searchParams.get("bookId"),"fixture");
          assert.equal(route.request().headers().authorization,"Bearer test");
        }
        return route.fulfill({json:data});
      }
      if(u.pathname==="/ai/master-sync.js")return route.fulfill({contentType:"text/javascript",body:`
        const store={
          status:async()=>({current:window.testCloud?.manifest||null}),
          save:async(value,expected)=>{
            if((window.testCloud?.manifest.id||null)!==expected)throw Error("Unexpected archive version");
            const manifest={id:"fixture-current",savedAt:"2026-11-23T10:00:00Z"};
            window.testCloud={value:structuredClone(value),manifest,currentId:manifest.id,usedPrevious:false};
            return manifest;
          },
          load:async()=>structuredClone(window.testCloud)
        };
        export const master={ready:true,user:{uid:"fixture"},books:[{id:"fixture",title:"Тестовая книга"}],
          init:async()=>{},refresh:async()=>{},canonicalText:()=>"",idToken:async()=>"test",
          openFullArchive:async()=>({uid:"fixture",store})};
      `});
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
        if(/\/api\/freitag\/providers\/quote$/.test(String(url))){
          const body=JSON.parse(opts.body);
          window.quoted.push(body);
          if(window.rejectSource)return Promise.resolve(Response.json({
            code:"BOOK_SOURCE",error:"Мастерская не нашла одну из фраз."
          },{status:424}));
          if(body.provider==="apimira")return Promise.resolve(Response.json({ok:true,ready:true,estimateUsd:.20,
            outputTokenLimit:body.outputTokenLimit,budgetUsd:.50,fingerprint:"fixture-apimira",source:{chapters:[14,15]}}));
          return Promise.resolve(Response.json({ok:true,ready:true,estimateRub:136,outputTokenLimit:14000,
            balanceRub:200,budgetRub:160,fingerprint:"fixture-estimate"}));
        }
        if(!/\/api\/freitag(?:\/providers)?\/chat$/.test(String(url)))return fetcher(url,opts);
        if(window.rejectSource)return Promise.resolve(Response.json({
          code:"BOOK_SOURCE",error:"Мастерская не нашла одну из фраз."
        },{status:424}));
        const body=JSON.parse(opts.body);
        if(body.provider==="bothub" ? String(url).includes("/providers/") : !String(url).includes("/providers/"))
          throw Error("Неверный шлюз для "+body.provider);
        window.submitted.push(body);
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
        }}),{headers:{"Content-Type":"text/event-stream",...(body.provider==="apimira"?{"X-Freitag-Request-Id":"fixture-charge"}:{})}}));
      };
    });
    await page.goto(origin+"/ai/");
    assert.equal(await page.locator("#f-workspace-mode").innerText(),
      working?"Рабочая версия":"Тестовая копия · чаты отдельно");
    const workingLink=page.locator("#f-working-link");
    assert.equal(await workingLink.getAttribute("href"),workingOrigin+"/ai/");
    assert.equal(await workingLink.isVisible(),!working);
    assert.equal(await page.locator("#f-workshop-link").isVisible(),working);
    const nav=async name=>page.locator('[data-nav="'+name+'"]:visible').first().click();
    await nav("settings");
    await page.locator("#f-provider").selectOption("apimira");
    await page.locator('[data-action="test-connection"]').click();
    await page.locator("#f-test-status").filter({hasText:/Баланс ApiMira 3,45/}).waitFor();
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
    await page.getByRole("button",{name:"Материалы проекта"}).click();
    await page.locator("#f-upload").setInputFiles({name:"Рукопись.docx",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",buffer:wordBytes});
    const manuscript=page.getByRole("button",{name:"Рукопись.docx"});
    await manuscript.click();
    assert.equal(await page.getByRole("textbox",{name:"Текст материала"}).inputValue(),"Первая строка.\nВторая строка.\nКонец главы.");
    await page.getByRole("button",{name:"Закрыть",exact:true}).click();
    await page.getByRole("checkbox",{name:"Подбирать отрывки из Рукопись.docx"}).uncheck();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    if(screenshots)await page.screenshot({path:screenshots+"/materials-"+width+".png",fullPage:true});
    await nav("projects");
    await page.getByRole("button",{name:"Открыть проект",exact:true}).click();
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
    await Promise.all([page.waitForEvent("dialog").then(async dialog=>{
      const message=dialog.message();await dialog.accept();assert.match(message,/ApiMira.*оценка.*0,20[\s\S]*главы 14, 15/);
    }),page.locator('#f-chat-form button[type="submit"]').click()]);
    await page.locator(".assistant .f-msg-text").filter({hasText:"Начало."}).waitFor();
    const requests=await page.evaluate(()=>window.submitted);
    assert.equal(requests.length,1);
    const request=requests[0];
    assert.equal(request.provider,"apimira");
    assert.equal(request.bookId,"fixture");
    assert.equal(request.outputTokenLimit,14000);
    assert.deepEqual(request.apimiraQuote,{fingerprint:"fixture-apimira",estimateUsd:.20});
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
        await page.locator("#f-message-input").fill(reason==="length"?"Второй тест. Не менее 18 000 знаков.":"Второй тест");
        page.once("dialog",dialog=>dialog.accept());
        await page.locator('#f-chat-form button[type="submit"]').click();
        await page.waitForFunction(n=>window.submitted.length===n,["length",null,"content_filter"].indexOf(reason)+1);
        await page.locator(".assistant .f-msg-text").last().filter({hasText:"Начало."}).waitFor();
        await page.evaluate(r=>window.finish(r),reason);
        await page.locator(".assistant").last().filter({hasText:"Генерация не завершена"}).waitFor();
        if(reason==="length"){
          const stats=await page.locator(".assistant").last().locator(".f-draft-delivery").innerText();
          assert.match(stats,/Задано 18\s000/);
          assert.match(stats,/Не хватает 17\s993/);
          assert.match(stats,/Достигнут лимит 14\s000 токенов/);
        }
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

      await page.getByRole("button",{name:"В память проекта",exact:true}).last().click();
      await page.locator("#f-field-title").fill("Происхождение медальона");
      await page.locator("#f-field-text").fill("Марта унаследовала медальон от бабушки.");
      await page.locator('dialog button[value="save"]').click();
      await nav("projects");
      await page.getByRole("button",{name:"Открыть проект",exact:true}).click();
      await page.getByText("Происхождение медальона",{exact:true}).waitFor();
      await page.getByText("Сюжетная карта",{exact:true}).click();
      await page.locator("#f-project-story-map").fill("Сюжет от пролога до текущей главы");
      await page.locator('#f-project-instructions button[type="submit"]').click();
      await page.getByText("Твои инструкции сохранены в проекте.",{exact:true}).waitFor();
      await page.reload();
      await nav("projects");
      await page.getByRole("button",{name:"Открыть проект",exact:true}).click();
      for(const provider of ["bothub", "apimira"]){
        await page.locator('[data-action="new-project-chat"]').click();
        await page.locator("#f-quick-model").selectOption(provider==="bothub"?"bothub:claude-opus-5.5":"apimira");
        const limit=page.locator("#f-chapter-limit");
        if(provider==="bothub"){
          assert.equal(await limit.inputValue(),"14000");
          await limit.selectOption("20000");
          await limit.selectOption("32000");
        }else{
          assert.equal(await limit.inputValue(),"32000");
          page.once("dialog",dialog=>dialog.accept());
        }
        await page.locator("#f-message-input").fill("Продолжи сцену с медальоном");
        const count=await page.evaluate(()=>window.submitted.length);
        await page.locator('#f-chat-form button[type="submit"]').click();
        await page.waitForFunction(n=>window.submitted.length===n,count+1);
        const payload=await page.evaluate(()=>window.submitted.at(-1));
        assert.equal(payload.provider,provider);
        assert.equal(payload.outputTokenLimit,32000);
        assert.equal(payload.bookId,"fixture");
        assert.match(payload.messages[0].content,/Сюжет от пролога до текущей главы/);
        assert.match(payload.messages[0].content,/Марта унаследовала медальон от бабушки/);
        assert.equal(payload.messages.at(-1).content,"Продолжи сцену с медальоном");
        await page.evaluate(()=>window.finish("stop"));
        await page.locator('#f-chat-form button[type="submit"]').waitFor();
        await nav("projects");
        await page.getByRole("button",{name:"Открыть проект",exact:true}).click();
      }
      console.log("Память проекта доступна в новых чатах BotHub и ApiMira");
      await nav("settings");
      await page.getByText("Резервные копии и мои данные",{exact:true}).click();
      const [backup]=await Promise.all([page.waitForEvent("download"),
        page.getByRole("button",{name:"Скачать архив JSON",exact:true}).click()]);
      const archive=JSON.parse(await readFile(await backup.path(),"utf8"));
      assert.equal(archive.data.projects[0].storyMap,"Сюжет от пролога до текущей главы");
      assert.equal(archive.data.projects[0].memoryNotes[0].text,"Марта унаследовала медальон от бабушки.");
      assert.equal(archive.data.chats.length,3);
      assert.ok(archive.data.chats.some(c=>c.messages.some(m=>m.content==="Начало. "+rest)));

      const modelCalls=await page.evaluate(()=>window.submitted.length);
      await page.getByRole("button",{name:"Включить облачную копию",exact:true}).click();
      await page.locator("#f-cloud-status").filter({hasText:"Проверенная копия в Firebase"}).waitFor();
      const cloud=await page.evaluate(()=>window.testCloud.value);
      assert.deepEqual(cloud.data.chats,archive.data.chats);
      assert.deepEqual(cloud.data.projects,archive.data.projects);
      assert.deepEqual(cloud.data.docs,archive.data.docs);
      assert.equal(cloud.data.docs.find(d=>d.name==="Рукопись.docx")?.includeInContext,false);
      assert.equal(cloud.data.settings.globalInstruction,instruction);
      assert.equal(cloud.data.settings.workerUrl,undefined);
      assert.equal(cloud.data.settings.endpoint,undefined);
      await page.locator("#f-global").fill("Редакция только на этом компьютере.");
      await page.getByRole("button",{name:"Сохранить настройки",exact:true}).click();
      await page.getByText("Резервные копии и мои данные",{exact:true}).click();
      page.once("dialog",dialog=>dialog.accept());
      await page.getByRole("button",{name:"Восстановить из облака",exact:true}).click();
      await page.locator("#f-flash").filter({hasText:"Восстановлена копия от"}).waitFor();
      assert.equal(await page.locator("#f-global").inputValue(),instruction);
      await page.getByText("Резервные копии и мои данные",{exact:true}).click();
      page.once("dialog",dialog=>dialog.accept());
      await page.getByRole("button",{name:"Вернуть данные до восстановления",exact:true}).click();
      await page.locator("#f-flash").filter({hasText:"Локальный архив возвращён"}).waitFor();
      assert.equal(await page.locator("#f-global").inputValue(),"Редакция только на этом компьютере.");
      assert.equal(await page.evaluate(()=>window.submitted.length),modelCalls);
      console.log("Полный архив, восстановление и возврат локальных данных проверены на тестовом Firebase");
    }
    assert.deepEqual(errors,[]);
    await page.close();
    console.log("Проверено получение и сохранение главы при ширине "+width+" px");
  }
} finally {await browser.close();}

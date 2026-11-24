// Все запросы браузера перехватываются. Книги и ответы модели вымышлены.
import assert from "node:assert/strict";
import {mkdir, readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright";

const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
const workingOrigin = "https://codex-freitag-aitunnel.freitag-ai-test.pages.dev";
const providerOrigin = "https://freitag-api-gateway.erichtho-xx.workers.dev";
const appRoot = new URL("../",import.meta.url);
const assetRoot = process.env.FREITAG_TEST_BUILD ? pathToFileURL(process.env.FREITAG_TEST_BUILD+"/") : appRoot;
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
    const backgroundJobs=[];let handoffInfo={ok:true,enabled:false};
    page.on("pageerror",e=>errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
    const fixtureRoute=async route=>{
      const u=new URL(route.request().url());
      if(u.hostname==="fonts.googleapis.com")return route.fulfill({contentType:"text/css",body:""});
      const providerRoute=u.origin===providerOrigin;
      if(u.origin!==origin&&!providerRoute)throw Error("Неожиданный сетевой запрос: "+u.origin);
      const cors=providerRoute?{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"Authorization, Content-Type"}:{};
      const api={
        "/health":{ok:true,model:"claude-opus-5-5",provider:"ModelProxy",providerGateway:providerRoute,apimiraConfigured:true,aitunnelConfigured:true,chapterProtocol:2},
        "/preflight":u.searchParams.get("provider")==="aitunnel"?{ok:true,balanceRub:200,budgetRub:160}:{ok:true,balanceUsd:3.45,inputUsd:1.25,outputUsd:5.20},
        "/receipt":providerRoute?{ok:true,costUsd:.013,inputTokens:3200,outputTokens:1700}:{ok:true,costRub:42,costCaps:7200},
        "/mcp-tools":{ok:true,toolCount:4,tools:["list_books","get_book_context","list_chapters","read_chapter"]},
        "/snapshot":{ok:true,chapterCount:15,outlineAvailable:true,updatedAt:"2026-11-22T17:00:00Z",
          lastChapters:[{slot:14,title:"Тестовая глава 14"},{slot:15,title:"Тестовая глава 15"}]}
      };
      if(providerRoute||u.pathname.startsWith("/api/freitag/")){
        if(route.request().method()==="OPTIONS")return route.fulfill({status:204,
          headers:{...cors,"Access-Control-Allow-Methods":"GET, POST, OPTIONS"}});
        const endpoint=providerRoute?u.pathname:u.pathname.replace("/api/freitag","");
        if(endpoint==="/billing-history")return route.fulfill({json:{ok:true,rows:[],nextPage:null},headers:cors});
        if(endpoint==="/project-access"){
          assert.equal(route.request().headers().authorization,"Bearer test");
          if(route.request().method()==="POST"){
            const body=route.request().postDataJSON();
            if(body.action==="revoke")handoffInfo={ok:true,enabled:false};
            else{
              assert.ok(body.packet.documents.some(d=>d.id==="project"));
              assert.ok(body.packet.documents.every(d=>!d.title.includes("Другой проект")));
              handoffInfo={ok:true,enabled:true,version:crypto.randomUUID(),updatedAt:new Date().toISOString()};
              return route.fulfill({json:{...handoffInfo,...(body.action==="grant"?{token:"fixture-key"}:{})},headers:cors});
            }
          }
          return route.fulfill({json:handoffInfo,headers:cors});
        }
        if(endpoint==="/context"){
          assert.equal(u.origin,origin);
          assert.equal(route.request().headers().authorization,"Bearer test");
          return route.fulfill({json:{ok:true,sources:[{kind:"income",label:"Доходы",period:"2026-11-23 — 2026-11-23",
            updatedAt:"2026-11-24T06:00:00Z",text:"{\"royalty\":321}"}]},headers:cors});
        }
        if(endpoint==="/story-map")return route.fulfill({json:{ok:true,updatedAt:"2026-11-24T06:00:00Z",
          chapters:[{chapter:1,title:"Пролог"},{chapter:2,title:"Глава 2"}],
          ...(u.searchParams.has("q")?{matches:[{chapter:1,scene:2,offset:120,snippet:"Синяя папка лежит в столе."}]}:{})},headers:cors});
        if(endpoint==="/chapter-jobs"){
          if(route.request().method()==="POST"){
            const body=route.request().postDataJSON();
            assert.equal(body.contextQuote,"fixture-bothub");
            const job={...body.job,bookId:body.bookId,provider:body.provider,limit:body.outputTokenLimit,
              prompt:body.messages.at(-1).content,text:"Глава пережила закрытие вкладки.",
              status:"completed",finishReason:"stop",createdAt:"2026-11-24T06:00:00Z"};
            backgroundJobs.push(job);
            return route.fulfill({status:202,json:{ok:true,job:{id:job.id}},headers:cors});
          }
          const id=u.searchParams.get("id"),items=providerRoute?[]:backgroundJobs;
          return route.fulfill({json:id?{ok:true,job:items.find(job=>job.id===id)}:
            {ok:true,jobs:items.map(({prompt,text,...job})=>({...job,excerpt:prompt,characters:text.length}))},headers:cors});
        }
        const data=api[endpoint];
        assert.ok(data,"unexpected API route "+u.pathname);
        assert.equal(route.request().method(),"GET");
        if(u.pathname.endsWith("/snapshot")){
          assert.equal(u.searchParams.get("bookId"),"fixture");
          assert.equal(route.request().headers().authorization,"Bearer test");
        }
        return route.fulfill({json:data,headers:cors});
      }
      if(/^\/(?:vtest\/)?ai\/master-sync\.js$/.test(u.pathname))return route.fulfill({contentType:"text/javascript",body:`
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
      if(path==="workshop/bear.svg"&&assetRoot===appRoot)path="writer/bear.svg";
      assert.match(path,/^(?:vtest\/)?(ai|writer|workshop|vendor|js|css)\//);
      const types={html:"text/html",js:"text/javascript",css:"text/css",svg:"image/svg+xml",webmanifest:"application/manifest+json"};
      return route.fulfill({contentType:types[path.split(".").at(-1)],body:await readFile(new URL(path,assetRoot))});
    };
    await page.route("**/*",fixtureRoute);
    await page.addInitScript(apiOrigin=>{
      const fetcher=window.fetch;
      window.submitted=[];
      window.quoted=[];
      window.fetch=(url,opts)=>{
        if(String(url)===apiOrigin+"/quote"||String(url)===location.origin+"/api/freitag/quote"){
          const body=JSON.parse(opts.body);
          window.quoted.push(body);
          if(window.rejectSource)return Promise.resolve(Response.json({
            code:"BOOK_SOURCE",error:"Мастерская не нашла одну из фраз."
          },{status:424}));
          if(body.provider==="apimira")return Promise.resolve(Response.json({ok:true,ready:true,estimateUsd:.20,
            costBreakdown:{currency:"USD",input:.08,output:.12},inputTokens:1200,
            outputTokenLimit:body.outputTokenLimit||900,fingerprint:"fixture-apimira",source:{chapters:[14,15]}}));
          if(body.provider==="bothub")return Promise.resolve(Response.json({ok:true,ready:true,estimateRub:40,approximate:true,
            tariff:"Публичный тариф",tariffDate:"2026-11-24",inputTokens:1000,outputTokenLimit:body.outputTokenLimit||900,
            fingerprint:"fixture-bothub",source:{chapters:[14,15],references:[{chapter:1,scene:2}]}}));
          return Promise.resolve(Response.json({ok:true,ready:true,estimateRub:136,outputTokenLimit:14000,
            balanceRub:200,budgetRub:160,fingerprint:"fixture-estimate"}));
        }
        const providerRoute=String(url)===apiOrigin+"/chat";
        const workingRoute=String(url)===location.origin+"/api/freitag/chat";
        if(!providerRoute&&!workingRoute)return fetcher(url,opts);
        if(window.rejectSource)return Promise.resolve(Response.json({
          code:"BOOK_SOURCE",error:"Мастерская не нашла одну из фраз."
        },{status:424}));
        const body=JSON.parse(opts.body);
        if(body.provider==="bothub" ? !workingRoute : !providerRoute)
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
        }}),{headers:{"Content-Type":"text/event-stream","X-Freitag-Request-Id":crypto.randomUUID()}}));
      };
    },providerOrigin);
    await page.goto(origin+"/ai/");
    assert.equal(await page.locator("#f-workspace-mode").innerText(),
      working?"Рабочая версия":"Тестовая копия · чаты отдельно");
    const workingLink=page.locator("#f-working-link");
    assert.equal(await workingLink.getAttribute("href"),workingOrigin+"/ai/");
    assert.equal(await workingLink.isVisible(),!working);
    assert.equal(await page.locator("#f-workshop-link").isVisible(),working);
    const nav=async name=>page.locator('[data-nav="'+name+'"]:visible').first().click();
    const quote=page.getByRole("dialog",{name:"Контекст и цена",exact:true});
    const approve=()=>quote.getByRole("button",{name:"Подтвердить запрос",exact:true}).click();
    await nav("settings");
    await page.locator("#f-provider").selectOption("apimira");
    await page.locator('[data-action="test-connection"]').click();
    await page.locator("#f-test-status").filter({hasText:/Баланс ApiMira 3,45/}).waitFor();
    await page.locator("#f-global").fill(instruction);
    await page.locator('#f-settings button[type="submit"]').click();
    await nav("projects");
    await page.locator('[data-action="master-import"]').click();
    await page.locator("#f-project-instruction").fill(project);
    await page.getByRole("button",{name:"Передать проект",exact:true}).click();
    const transfer=page.getByRole("dialog",{name:"Передать проект"});
    await transfer.getByRole("button",{name:"Включить доступ на чтение"}).click();
    await transfer.locator("input").last().waitFor();
    assert.equal(await transfer.locator("input").last().inputValue(),"Bearer fixture-key");
    await transfer.getByRole("button",{name:"Отозвать доступ"}).click();
    await transfer.getByRole("button",{name:"Включить доступ на чтение"}).waitFor();
    await transfer.getByRole("button",{name:"Закрыть"}).click();
    await page.getByRole("button",{name:"Проверить источник бесплатно"}).click();
    await page.getByRole("status").filter({hasText:"Глав в снимке: 15"}).waitFor();
    assert.match(await page.locator("#f-book-check").innerText(),/Утверждённый каркас есть в снимке[\s\S]*Тестовая глава 15/);
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
    await page.locator("#f-upload").setInputFiles({name:"Набросок.txt",mimeType:"text/plain",buffer:Buffer.from("Старинный алтарь")});
    await page.getByRole("searchbox",{name:"Поиск по названию"}).fill("рукопись");
    assert.equal(await page.getByRole("button",{name:"Набросок.txt"}).count(),0);
    await page.getByRole("searchbox",{name:"Поиск по названию"}).fill("");
    await page.getByRole("button",{name:"Набросок.txt"}).waitFor();
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
    await page.locator('#f-chat-form button[type="submit"]').click();
    assert.match(await quote.innerText(),/ApiMira[\s\S]*0,20[\s\S]*Средний[\s\S]*главы 14, 15/);
    assert.equal(await page.evaluate(()=>window.submitted.length),0);
    if(screenshots)await page.screenshot({path:screenshots+"/quote-"+width+".png",fullPage:true});
    await approve();
    await page.locator(".assistant .f-msg-text").filter({hasText:"Начало."}).waitFor();
    const requests=await page.evaluate(()=>window.submitted);
    assert.equal(requests.length,1);
    const request=requests[0];
    assert.equal(request.provider,"apimira");
    assert.equal(request.bookId,"fixture");
    assert.equal(request.outputTokenLimit,14000);
    assert.equal(request.reasoningEffort,"medium");
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
        await page.locator('#f-chat-form button[type="submit"]').click();
        await approve();
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
      await submit.click();
      assert.match(await quote.innerText(),/136[\s\S]*14\s000/);
      await quote.getByRole("button",{name:"Отмена",exact:true}).click();
      assert.equal(await page.locator("#f-message-input").inputValue(),prompt);
      assert.equal(await page.evaluate(()=>window.submitted.length),3);
      await submit.click();
      await approve();
      await page.waitForFunction(()=>window.submitted.length===4);
      const paid=await page.evaluate(()=>window.submitted.at(-1));
      assert.equal(paid.provider,"aitunnel");
      assert.equal(paid.messages.at(-1).content,prompt);
      assert.deepEqual(paid.aitunnelQuote,{fingerprint:"fixture-estimate",estimateRub:136});
      await page.evaluate(()=>window.finish("stop",123.45));
      await page.getByText(/Списано AITUNNEL: 123,45/).waitFor();
      console.log("Проверены отмена до оплаты, подтверждение и сумма AITUNNEL в чате");
      await nav("expenses");
      await page.getByRole("heading",{name:"Траты",exact:true}).waitFor();
      await page.getByRole("button",{name:/Рубли.*123,45/}).waitFor();
      await page.getByRole("button",{name:/Доллары/}).click();
      await page.locator(".f-spend-chart").waitFor();
      await page.locator("#f-expense-provider").selectOption("aitunnel");
      assert.equal(await page.locator(".f-spend-history li").count(),1);
      assert.match(await page.locator(".f-spend-history li").innerText(),/123,45[\s\S]*Оценка ≈ 136/);
      await page.locator("#f-expense-provider").selectOption("");
      if(screenshots)await page.screenshot({path:screenshots+"/expenses-"+width+".png",fullPage:true});
      await nav("chat");

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
          await page.locator("#f-chapter-effort").selectOption("high");
        }else{
          assert.equal(await limit.inputValue(),"32000");
        }
        await page.locator("#f-message-input").fill("Продолжи сцену с медальоном");
        const count=await page.evaluate(()=>window.submitted.length);
        await page.locator('#f-chat-form button[type="submit"]').click();
        await approve();
        await page.waitForFunction(n=>window.submitted.length===n,count+1);
        const payload=await page.evaluate(()=>window.submitted.at(-1));
        assert.equal(payload.provider,provider);
        assert.equal(payload.outputTokenLimit,32000);
        assert.equal(payload.reasoningEffort,"high");
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
      assert.deepEqual(cloud.data.expenses,archive.data.expenses);
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

      await nav("projects");
      await page.getByRole("button",{name:"Открыть проект",exact:true}).click();
      await page.getByRole("button",{name:"Карта романа",exact:true}).click();
      await page.getByRole("option",{name:/Пролог/}).waitFor({state:"attached"});
      await page.getByRole("searchbox",{name:"Фраза из рукописи"}).fill("синяя папка");
      await page.getByRole("button",{name:"Найти",exact:true}).click();
      const map=page.getByRole("dialog");
      await map.getByRole("heading",{name:/Глава 1 · сцена 2/}).waitFor();
      await map.getByRole("button",{name:"Закрепить решение",exact:true}).click();
      await page.getByRole("dialog").getByRole("button",{name:"Сохранить",exact:true}).click();
      await page.getByRole("button",{name:"Глава 1 · сцена 2",exact:true}).waitFor();
      await page.locator('[data-action="new-project-chat"]').click();
      await page.locator("#f-quick-model").selectOption("bothub:claude-opus-5.5");
      for(const model of ["apimira","bothub:claude-opus-5.5"]){
        await page.locator("#f-quick-model").selectOption(model);
        await page.locator("#f-message-input").fill("Сколько было продаж за вчера?");
        if(!await page.locator("#f-chat-tools").evaluate(e=>e.open))await page.locator("#f-chat-tools summary").click();
        await page.getByRole("button",{name:"Контекст и цена",exact:true}).click();
        await quote.getByText(/Доходы · 2026-11-23/).waitFor();
        await quote.getByRole("button",{name:"Закрыть",exact:true}).click();
        await page.locator("#f-chat-tools summary").click();
      }
      await page.locator("#f-message-input").fill("Продолжи сцену с синей папкой.");
      await page.locator("#f-chat-tools summary").click();
      await page.getByRole("button",{name:"Контекст и цена",exact:true}).click();
      assert.match(await quote.innerText(),/BotHub[\s\S]*глава 1, сцена 2/);
      await quote.getByRole("button",{name:"Закрыть",exact:true}).click();
      assert.equal(backgroundJobs.length,0);
      assert.equal(await page.evaluate(()=>window.submitted.length),modelCalls);
      await page.getByRole("button",{name:"Написать в фоне",exact:true}).click();
      await quote.getByRole("button",{name:"Написать в фоне",exact:true}).click();
      await page.getByRole("dialog").getByRole("heading",{name:/Готово · Тестовая книга/}).waitFor();
      assert.equal(backgroundJobs.length,1);
      const secondDevice=await browser.newPage({viewport:{width:390,height:900},serviceWorkers:"block"});
      await secondDevice.route("**/*",fixtureRoute);
      await secondDevice.goto(origin+"/ai/");
      await secondDevice.locator("#f-chat-tools summary").click();
      await secondDevice.locator('#f-chat-tools [data-action="open-chapter-jobs"]').click();
      await secondDevice.getByRole("dialog").getByRole("button",{name:"Открыть",exact:true}).click();
      assert.equal(await secondDevice.getByRole("textbox",{name:"Текст главы"}).inputValue(),"Глава пережила закрытие вкладки.");
      await secondDevice.getByRole("button",{name:"Сохранить в чате",exact:true}).click();
      await secondDevice.getByText("Глава пережила закрытие вкладки.",{exact:true}).waitFor();
      await secondDevice.close();
      console.log("Карта, бесплатный просмотр контекста и восстановление главы с другого устройства проверены");
    }else{
      await nav("expenses");
      // Entering the page is sufficient for automatic reconciliation.
      await page.getByRole("button",{name:/Доллары.*0,013/}).waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(screenshots)await page.screenshot({path:screenshots+"/expenses-"+width+".png",fullPage:true});
    }
    assert.deepEqual(errors,[]);
    await page.close();
    console.log("Проверено получение и сохранение главы при ширине "+width+" px");
  }
} finally {await browser.close();}

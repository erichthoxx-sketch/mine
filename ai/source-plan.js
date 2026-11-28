// Both the client and the authenticated gateway use the same routing rules.
const literary = /глав|рукопис|роман|персонаж|геро|сюжет|сцен|канон|каркас|пролог|эпилог/i;
const writing = /(?:напиш|допиш|продолж|перепиш|сочин|отредактируй|доработай)[^\n]{0,65}(?:глав|сцен|роман|рукопис|эпизод|текст|диалог)/i;
export const isSimpleGreeting = text => /^(?:привет(?:ик)?|здравствуй(?:те)?|доброе утро|добрый (?:день|вечер)|hello|hi|спасибо)[!?.\s]*$/i.test(String(text).trim());
export const isAcknowledgement = text => /^(?:да|нет|ок(?:ей)?|ага|хорошо)[!?.\s]*$/i.test(String(text).trim());

// A pasted chapter can be longer than the author's entire assignment.
// Extract cues for retrieval only. The author message itself stays verbatim.
export function chapterCues(task) {
  const raw=String(task||"");
  const heading=/^\s*(?:#{1,4}\s*)?(?:(поток(?:\s+по\s+главе)?|сюжетные\s+ориентиры|события\s+главы|задание(?:\s+(?:на|для)\s+глав[уы])?|что\s+должно\s+произойти)\s*[:：]|((?:текст\s+)?предыдущ(?:ая|ей)\s+глав[аы](?:\s+\d+)?|глава\s+\d+\s*[,—–-]?\s*предыдущая)\s*[:：]?)\s*/gimu;
  let start=0, end=raw.length, found=false;
  for (const m of raw.matchAll(heading)) {
    if (m[1]) {start=m.index+m[0].length;end=raw.length;found=true;}
    else if (end===raw.length) {end=m.index;found=true;}
  }
  if (!found || end<=start) return "";
  let text=raw.slice(start,end).trim();
  // Long author templates often introduce the specific plot a second time.
  const declarations=[...text.matchAll(/^(?:мы\s+)?пишем\s+главу\s*\d+[^\n]*/gimu)];
  const last=declarations.at(-1);
  if (last && last.index>0 && text.length-last.index>80) text=text.slice(last.index);
  if (text.length<=1900) return text;
  return text.slice(0,450).trimEnd()+"\n[…]\n"+text.slice(-1430).trimStart();
}
const selectors = [
  ["status", /(?:какие|провер|покажи|статус|состояние).{0,35}(?:источник|коннектор|подключени)/i],
  ["income", /продаж|продал|продан|роялти|выруч|доход|заработ|гонорар/i],
  ["cohorts", /когорт|кохорт/i], ["reads", /прочтени|прочитан|дочитыва|удержани.{0,20}(?:читател|глав|част)/i],
  ["metrika", /метрик|utm|источник.{0,12}трафик|посещаемост/i],
  ["direct", /директ|рекламн.{0,12}кампан|кампани[ияюей]|поисков.{0,10}запрос|ставк.{0,10}клик|\b(?:ctr|cpc)\b/i],
  ["marketing", /маркетинг|продвижени|аннотаци|отзыв|конкурс|реклам|блог/i]
];
export function sourcePlan({task, previous = "", bookId = "", mode = "dialog"}) {
  let question = String(task).trim();
  if (!question || isSimpleGreeting(question) || (!previous && isAcknowledgement(question)))
    return {kinds:[], draft:false, question:""};
  // Only a short elliptical follow-up may inherit the previous author's topic.
  if (question.length < 110 && (isAcknowledgement(question) || /^(?:а (?:за|по|в|если|сколько|что|как|тогда|вчера|сегодня)|а эта|а этот|и за|сравни с|а прошл|а сегодня|а вчера)/i.test(question)))
    question = (previous ? previous.slice(0,450) + "\n" : "") + question;
  const instruction = question.split(/\n\s*\n/)[0].slice(0,1000);
  if (mode === "draft" && (writing.test(instruction) || /(?:мы пишем|пишем|работаем над)\s+(?:новой?\s+)?(?:глав|сцен)/i.test(instruction) || question.length > 1800))
    return {kinds:[],draft:true,question:instruction};
  let kinds = selectors.filter(([,pattern]) => pattern.test(instruction)).map(([name]) => name);
  if (!kinds.includes("direct") && /реклам/i.test(instruction) && /бюджет|трат|расход|эффектив|окупаем|клик|кампан/i.test(instruction)) kinds.push("direct");
  if ((/по (?:тексту|сцене|канону)|в главе\s*\d/i.test(instruction)) && bookId && kinds.length) kinds.push("book");
  if (kinds.includes("direct") && !/маркетинг|продвижени|аннотаци|отзыв|конкурс|блог/i.test(instruction))
    kinds = kinds.filter(name => name !== "marketing");
  if (kinds.includes("cohorts") && !/и\s+метрик/i.test(instruction)) kinds = kinds.filter(name => name !== "metrika");
  if (/списани|стоимост.{0,15}(?:запрос|генераци)|трат[ыах].{0,15}(?:api|модел)/i.test(instruction) && !/продаж|роялти|выруч/i.test(instruction))
    kinds = kinds.filter(name => name !== "income");
  if (kinds.length) return {kinds, draft:false, question:instruction};
  const fact=/^(?:кто|где|когда|откуда|куда|зачем|почему|в какой|в котор|како[йея]|что (?:произошло|случилось|известно)|проверь канон|найди|напомни)/i.test(instruction);
  if (mode === "draft" && !(fact && (bookId || literary.test(instruction)))) return {kinds:[],draft:true,question:instruction};
  if (bookId || literary.test(instruction) || /книг/i.test(instruction)) return {kinds:["book"],draft:false,question:instruction};
  return {kinds:[],draft:false,question:instruction};
}

export function sourcePeriod(question, now = new Date()) {
  if (question.includes("\n")) {
    const last=sourcePeriod(question.split("\n").at(-1),now);
    if(last.from)return last;
  }
  const today = new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Moscow",dateStyle:"short"}).format(now);
  const shift = (day,n) => new Date(Date.parse(day+"T00:00:00Z")+n*86400000).toISOString().slice(0,10);
  const dates = [...question.matchAll(/\b(\d{4}-\d\d-\d\d|\d\d?\.\d\d?\.\d{4})\b/g)].map(([raw]) => {
    const [d,m,y]=raw.split(".");
    return y ? y+"-"+m.padStart(2,"0")+"-"+d.padStart(2,"0") : raw;
  });
  if (dates.some(date=> !Number.isFinite(Date.parse(date+"T00:00:00Z")) || shift(date,0)!==date)) throw Error("Проверь даты периода.");
  if (dates.length) {
    const [from,to=from]=dates.slice(-2);
    if (from>to) throw Error("Начало периода указано позже конца.");
    return {from,to};
  }
  const months=["январ[ьяею]","феврал[ьяею]","март[аеу]?","апрел[ьяею]","ма[йяею]","июн[ьяею]","июл[ьяею]","август[аеу]?",
    "сентябр[ьяею]","октябр[ьяею]","ноябр[ьяею]","декабр[ьяею]"];
  const monthPattern="("+months.join("|")+")";
  const named=[...question.toLowerCase().matchAll(new RegExp("(?<![а-яё])(?:(\\d{1,2})\\s+)?"+monthPattern+"(?:\\s+(20\\d{2}))?(?![а-яё])","gu"))];
  if (named.length) {
    const monthDate=(match,last)=>{
      const month=months.findIndex(root=>new RegExp("^"+root).test(match[2]))+1;
      const year=Number(match[3]||today.slice(0,4));
      const day=Number(match[1]||(last?new Date(Date.UTC(year,month,0)).getUTCDate():1));
      const value=year+"-"+String(month).padStart(2,"0")+"-"+String(day).padStart(2,"0");
      if(!Number.isFinite(Date.parse(value)) || shift(value,0)!==value)throw Error("Проверь дату периода.");
      return value;
    };
    const to=monthDate(named.at(-1),true);
    let from=monthDate(named[0],false);
    const firstDay=question.slice(0,named[0].index).match(/(?:^|\s)(\d{1,2})\s*(?:по|[–—-])\s*$/i)?.[1];
    if(firstDay)from=monthDate([null,firstDay,named[0][2],named[0][3]],false);
    if(from>to)throw Error("Проверь начало и конец периода.");
    return {from,to};
  }
  const relative=[...question.matchAll(/сегодня|вчера|позавчера|(?:прошл|предыдущ)[а-яё]*\s+(?:недел|месяц)[а-яё]*|(?:эту|этот|текущ[а-яё]*)\s+(?:недел|месяц)[а-яё]*|(?:последни[а-яё]*\s+|за\s+)(\d{1,3})\s*(?:дн|ден|сут)|(?:за\s+)(?:недел|месяц)[а-яё]*/gi)].at(-1);
  if (!relative) return {};
  const term=relative[0].toLowerCase();
  if (term.includes("вчера") || term==="сегодня") {const day=shift(today,term==="вчера"?-1:term==="позавчера"?-2:0);return {from:day,to:day};}
  if (relative[1]) return {from:shift(today,1-Math.max(1,Number(relative[1]))),to:today};
  const past=/прошл|предыдущ/.test(term);
  if (/месяц/.test(term)) {
    const start=today.slice(0,8)+"01";
    return past ? {from:shift(start,-1).slice(0,8)+"01",to:shift(start,-1)} :
      {from:/^за месяц/.test(term)?shift(today,-29):start,to:today};
  }
  const weekStart=shift(today,-((new Date(today+"T00:00:00Z").getUTCDay()+6)%7));
  return past?{from:shift(weekStart,-7),to:shift(weekStart,-1)}:{from:/^за недел/.test(term)?shift(today,-6):weekStart,to:today};
}

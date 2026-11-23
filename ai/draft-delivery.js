function requestedLength(prompt){
  const sizes=new Map();
  const spec=/(?<!\d)(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d{1,6})(?:[ \t]*(к|k|тыс(?:\.|яч(?:а|и)?)?))?[ \t]*(?:символ(?:ов|а)?|знак(?:ов|а)?)(?![а-яёa-z])(?:[ \t]+(с пробелами|без пробелов))?/giu;
  for(const match of prompt.matchAll(spec)){
    const before=prompt.slice(Math.max(0,match.index-28),match.index);
    if(/(?:до|не более|не больше|максимум|\d\s*[-–—])\s*$/i.test(before))continue;
    const target=Number(match[1].replace(/\s/gu,""))*(match[2]?1000:1);
    const withoutSpaces=match[3]?.toLowerCase()==="без пробелов";
    if(target>0)sizes.set(target+":"+withoutSpaces,{target,withoutSpaces});
  }
  return sizes.size===1?sizes.values().next().value:null;
}

export function draftDelivery(prompt,answer,finishReason,limit){
  const requested=requestedLength(prompt);
  const text=answer.trim();
  const characters=Array.from(requested?.withoutSpaces?text.replace(/\s/gu,""):text).length;
  return {characters,target:requested?.target||null,withoutSpaces:!!requested?.withoutSpaces,finishReason,limit};
}

export function draftDeliveryLabel(delivery){
  const {characters,target,withoutSpaces,finishReason,limit}=delivery;
  const number=n=>n.toLocaleString("ru-RU");
  const parts=[number(characters)+" знаков"+(withoutSpaces?" без пробелов":" с пробелами")];
  if(target){
    parts.push("Задано "+number(target));
    if(characters<target)parts.push("Не хватает "+number(target-characters));
  }
  if(finishReason==="length")parts.push(Number.isFinite(limit)?"Достигнут лимит "+number(limit)+" токенов":"Достигнут лимит токенов");
  if(finishReason==="stop")parts.push("Модель завершила ответ");
  return parts.join(" · ");
}

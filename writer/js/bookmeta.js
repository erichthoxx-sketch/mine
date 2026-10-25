// Авторские метаданные — общие для Мастерской, Директа и конкурентного анализа.
// Названия жанров — из открытого справочника Литнета; не объявляем эти значения официальной связью с Литнетом.
export const BOOK_GENRES = [
  'Современный любовный роман','Остросюжетный любовный роман',
  'Криминальный любовный роман','Романы о неверности',
  'Короткий любовный роман','Исторический любовный роман',
  'Служебный роман','Романтическая комедия','Мистический любовный роман',
  'Студенческий роман','Подростковая проза','Женский роман',
  'Психологический триллер','Криминальный триллер',
  'Криминальный детектив','Женский детектив','Современная проза',
  'Романтическая эротика','Жесткая эротика','Неформат',
];
export function uniqueWords(text,max=20){
  const parts=(Array.isArray(text)?text.join(','):String(text||'')).split(/[,;\n]+/);
  const out=[],seen=new Set();
  for(const part of parts){
    const v=part.trim().replace(/^#+/,'').replace(/\s+/g,' ').slice(0,80);
    const k=v.toLowerCase().replace(/ё/g,'е');
    if(v&&!seen.has(k)){out.push(v);seen.add(k);}
    if(out.length>=max)break;
  }
  return out;
}
export function bookGenres(b={}){
  return uniqueWords(Array.isArray(b.genres)?b.genres:b.genre||'',2);
}
export function bookTags(b={}){
  return uniqueWords(b.tags||[],20);
}
export function marketingTopics(b={}){
  const explicit=[...bookGenres(b),...bookTags(b)];
  // «Легенда» — единственный источник свободной формулировки тропов, если теги еще не заполнены.
  const ideaGenre=String(b.legend?.idea?.genre||'').trim();
  const promo=String(b.promo?.annotation||b.svc?.annotation||'').trim();
  return [...explicit,ideaGenre,promo].filter(Boolean).join(', ');
}

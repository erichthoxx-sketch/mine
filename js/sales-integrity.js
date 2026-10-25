import { incomeSeries, sumSeries, booksBreakdown, byMonth } from './calc.js';
// Единый слой контроля финансовых строк для всех экранов.
// Source CSV и предварительный ручной ввод никогда не суммируются дважды.
const cents = value => Math.round(Number(value || 0) * 100);
const norm = s => String(s || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');
const group = s => [s.date, norm(s.book || s.bookId), s.kind === 'sub' ? 'sub' : 'sale', norm(s.platform || 'Литнет')].join('|');
const litnet = s => norm(s.platform || 'Литнет') === 'литнет';
const validSale = s => !!s && /^\d{4}-\d{2}-\d{2}$/.test(String(s.date || ''))
  && !!String(s.book || s.bookId || '').trim()
  && ['sale', 'sub'].includes(s.kind)
  && Number.isFinite(s.qty) && Number.isInteger(s.qty) && s.qty >= 0
  && Number.isFinite(s.price) && s.price >= 0 && Number.isFinite(s.royalty);

export function financialLedger(rows = []) {
  const raw = Array.isArray(rows) ? rows : [];
  const valid = raw.filter(validSale);
  const invalid = raw.length - valid.length;
  const grouped = new Map();
  for (const s of valid) {
    const key = group(s);
    if (!grouped.has(key)) grouped.set(key, { manual: [], imported: [] });
    grouped.get(key)[s.manual ? 'manual' : 'imported'].push(s);
  }
  const sales = [], warnings = [];
  for (const [key, set] of grouped) {
    if (!set.manual.length || !set.imported.length || !litnet(set.manual[0])) {
      sales.push(...set.manual, ...set.imported);
      continue;
    }
    const manualRoyalty = set.manual.reduce((sum,s)=>sum+cents(s.royalty),0);
    const importRoyalty = set.imported.reduce((sum,s)=>sum+cents(s.royalty),0);
    const manualQty = set.manual.reduce((sum,s)=>sum+Number(s.qty || 0),0);
    const importQty = set.imported.reduce((sum,s)=>sum+Number(s.qty || 0),0);
    if (importRoyalty >= manualRoyalty && importQty >= manualQty) {
      sales.push(...set.imported); // точные строки CSV вместо ручной оценки
    } else {
      sales.push(...set.manual); // возможно неполная выгрузка, оценку сохраняем
      warnings.push({ type:'manual-conflict', key, manualRoyalty:manualRoyalty / 100,
        importRoyalty:importRoyalty / 100, manualQty, importQty });
    }
  }
  if(invalid) warnings.push({type:'invalid-rows',count:invalid});
  const byId=new Map();
  for(const s of raw)byId.set(s.id,(byId.get(s.id)||0)+1);
  const duplicates=[...byId].filter(([id,n])=>id && n>1);
  if(duplicates.length) warnings.push({type:'duplicate-ids',count:duplicates.length});
  return { sales, warnings, totalRows:raw.length, countedRows:sales.length };
}

// Инварианты вычисляются независимо: строка = сумма по книгам = сумма за день = сумма за месяц.
export function financialReconcile(sales = [], from, to) {
  const inPeriod = sales.filter(s => validSale(s) && s.date >= from && s.date <= to);
  const totalCents = inPeriod.reduce((sum,s)=>sum+cents(s.royalty),0);
  const qty = inPeriod.reduce((sum,s)=>sum+Number(s.qty||0),0);
  const map = new Map(), days = new Map();
  for(const s of inPeriod){
    const book=String(s.bookId||s.book);
    map.set(book,(map.get(book)||0)+cents(s.royalty));
    days.set(s.date,(days.get(s.date)||0)+cents(s.royalty));
  }
  const booksCents=[...map.values()].reduce((s,x)=>s+x,0);
  const daysCents=[...days.values()].reduce((s,x)=>s+x,0);
  const series = incomeSeries(inPeriod, [], from, to);
  const chartCents = cents(sumSeries(series));
  const cardsCents = cents(booksBreakdown(inPeriod, from, to).reduce((n,b)=>n+b.royalty,0));
  const monthCents = cents(byMonth(series).reduce((n,m)=>n+m.royalty,0));
  const seriesQty = series.reduce((n,d)=>n+d.qty,0);
  return { total:totalCents/100, qty, booksTotal:cardsCents/100, daysTotal:chartCents/100,
    ok:totalCents===booksCents && totalCents===daysCents &&
       totalCents===chartCents && totalCents===cardsCents && totalCents===monthCents &&
       qty===seriesQty };
}

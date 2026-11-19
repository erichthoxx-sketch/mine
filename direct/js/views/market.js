// «Рынок» (#/market): не витрина топа, а разбор — что отличает книги, которые читают, и где её место (13.11.2026: «рассчитывала на глубокую аналитику»).
// Порядок сверху вниз: выводы → портрет книги топа → карта тропов → цена и объём → подача → движение за неделю → сам топ. Расчёты — js/market.js.
import { esc, acts, changes, toast, openSheet, more } from '../../../js/ui.js';
import { num, fmtDate } from '../../../js/format.js';
import { marketInsights, myRanks, tropeForecast, rivalBoard, adviceForMe } from '../../../js/market.js';
import { litgorodPlan, dupSummary } from '../../../js/litgorod.js';
import { scanMarket, marketSnap, marketState, srcsOf, okSrc, MARKET_DEFAULT } from '../marketscan.js';
import { marketWorldView } from './marketworld.js';

const pc = (v) => Math.round(v * 100) + ' %';
const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' млн' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.', ',') + ' тыс.' : String(Math.round(n)));
const x1 = (v) => '×' + v.toFixed(1).replace('.', ',');
const bookRow = (b, right) => `<div class="item"><div class="row between" style="gap:12px;align-items:flex-start"><div style="min-width:0"><a href="${esc(b.url)}" target="_blank" rel="noopener"><b>${esc(b.title)}</b></a>
  <div class="small muted">${[b.author, b.tropes.slice(0, 4).join(', ').toLowerCase(), b.price > 0 ? Math.round(b.price) + ' ₽' : b.price === 0 ? 'бесплатно' : '', b.pages ? b.pages + ' стр.' : ''].filter(Boolean).map(esc).join(' · ')}</div></div>
  <span class="small" style="white-space:nowrap">${right}</span></div></div>`;
const VERD = { niche: ['ниша: читают охотно, книг мало', 'up'], hot: ['читают охотно, но тесно', ''], tired: ['перегрето', 'down'], weak: ['интерес ниже обычного', 'muted'], even: ['как в среднем', 'muted'] };
let lastM = null;
// Прогноз тропов на 4 недели: что поднимется, что на пике, что уходит — и почему
function forecastCard(snap, src, isMine) {
  const F = tropeForecast(snap, { src });
  const head = `<h2 style="margin:0 0 4px">Сценарий тропов на 4 недели</h2>`;
  if (!F.ready) return `<div class="card">${head}<p class="small muted" style="margin:0">Прогноз строится по ходу топа день за днём. ${F.needDays ? `Нужно ещё ${F.needDays} ${F.needDays === 1 ? 'день' : F.needDays < 5 ? 'дня' : 'дней'} срезов` : `Нужно ещё ${F.need} ${F.need === 1 ? 'срез' : F.need >= 2 && F.need <= 4 ? 'среза' : 'срезов'}`} — приложение снимает их само раз в сутки.</p></div>`;
  const row = (x, right) => `<div class="mk-fc" data-act="mk.trope" data-t="${esc(x.name)}" role="button" tabindex="0"><div class="row between" style="gap:10px;align-items:baseline"><b>${esc(x.name)}${isMine(x.name) ? ' <span class="mk-me">ваш</span>' : ''}</b><span class="small" style="white-space:nowrap">${right}</span></div>
    ${x.why.length ? `<div class="small muted">${x.why.slice(0, 3).map(esc).join(' · ')}</div>` : ''}</div>`;
  const pp = (v) => Math.round(v * 100) + ' %';
  const grp = (t, list, fn) => (list.length ? sub(t) + list.map((x) => row(x, fn(x))).join('') : '');
  return `<div class="card">${head}<p class="small muted" style="margin:0 0 6px">Математический сценарий доли тропов в наблюдаемых топах через 4 недели (не прогноз реальных продаж). Основа: ход доли тропа по ${F.slices} срезам за ${F.span} дн., какие тропы у книг, только что вошедших в топ (${F.fresh}), как быстро такие книги набирают читателей и насколько охотно их добавляют. Уверенность — ${F.conf}. Это экстраполяция небольшого числа открытых подборок, а не гарантированный прогноз.</p>
    ${grp('Поднимутся', F.up, (x) => `${pp(x.share)} → <b class="up">≈ ${pp(x.proj)}</b>`)}
    ${grp('На пике — тесно', F.peak, (x) => `${pp(x.share)} топа`)}
    ${grp('Уходят', F.down, (x) => `${pp(x.share)} → <b class="down">≈ ${pp(x.proj)}</b>`)}
    ${!F.up.length && !F.down.length ? '<p class="small muted" style="margin:8px 0 0">Пока ровно: ни один троп заметно не растёт и не уходит.</p>' : ''}</div>`;
}
// место по дням: чем выше линия — тем ближе к первому месту; точки — дни выхода глав
const rankChart = (hist, rel) => { if (hist.length < 2) return ''; const w = 320, h = 54, mx = Math.max(...hist.map((x) => x.n)), mn = Math.min(...hist.map((x) => x.n)), span = Math.max(1, mx - mn);
  const t0 = Date.parse(hist[0].d), t1 = Math.max(t0 + 864e5, Date.parse(hist[hist.length - 1].d)), X = (d) => 4 + (Date.parse(d) - t0) / (t1 - t0) * (w - 8), Y = (n) => 6 + (n - mn) / span * (h - 12);
  const dots = hist.filter((x) => rel.has(x.d)).map((x) => `<path d="M${X(x.d).toFixed(1)} ${Y(x.n).toFixed(1)}h0" class="mk-rel" vector-effect="non-scaling-stroke"><title>вышла глава</title></path>`).join('');
  return `<svg class="mk-rk" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${hist.map((x) => `${X(x.d).toFixed(1)},${Y(x.n).toFixed(1)}`).join(' ')}"/>${dots}</svg>`; };
const spark = (h) => { if (!h || h.length < 3) return ''; const mx = Math.max(...h, 0.01), w = 56, hh = 14; return `<svg class="mk-sp" viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" points="${h.map((v, i) => `${(i / (h.length - 1) * (w - 2) + 1).toFixed(1)},${(hh - 1 - v / mx * (hh - 2)).toFixed(1)}`).join(' ')}"/></svg>`; };
const sub = (t) => `<div class="mk-sub">${t}</div>`;

// Разделы: Литнет (Обзор · Тропы · Цена и подача · Конкуренты · Мои книги · Литгород) и Мир. Выбор запоминается на устройстве.
const LS = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* без памяти */ } } };
const SECTIONS = [['overview', 'Обзор'], ['tropes', 'Тропы'], ['price', 'Цена и подача'], ['rivals', 'Конкуренты'], ['mine', 'Мои книги'], ['lg', 'Литгород']];
const how = (t) => `<p class="small muted mk-how">${t}</p>`;
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const dm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

// линия библиотек автора по срезам (для «Конкурентов»)
const libLine = (series) => { const s = series.filter((x) => x.on); if (s.length < 2) return ''; const w = 120, h = 30, mx = Math.max(...s.map((x) => x.lib)), mn = Math.min(...s.map((x) => x.lib)), span = Math.max(1, mx - mn);
  return `<svg class="mk-ll" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" points="${s.map((x, i) => `${(2 + i / (s.length - 1) * (w - 4)).toFixed(1)},${(h - 3 - (x.lib - mn) / span * (h - 6)).toFixed(1)}`).join(' ')}"/></svg>`; };

export function marketView(a) {
  const c = a.ctx(), plat = a.ui.mkP || LS.get('mkP', 'litnet'), sec = a.ui.mkS || LS.get('mkS', 'overview');
  const ptabs = `<div class="lg-tabs mk-ptabs">${[['litnet', 'Литнет'], ['world', 'Мир']].map(([k, t]) => `<button class="${plat === k ? 'on' : ''}" data-act="mk.tab" data-p="${k}">${t}</button>`).join('')}</div>`;
  if (plat === 'world') return { html: `<section class="mk-page"><h2 style="margin:0 0 10px">Рынок</h2>${ptabs}${marketWorldView(a)}</section>` };
  const snap = marketSnap(a), srcs = srcsOf(c.settings), src = srcs.some((s) => s.url === a.ui.mkSrc) ? a.ui.mkSrc : null;
  const mine = [...new Set((c.data.w_books || []).flatMap((b) => b.tags || []))], isMine = (t) => mine.some((x) => x.toLowerCase() === t.toLowerCase());
  const priceOf = (title) => Number(((c.data.books || []).find((x) => String(x.title || '').toLowerCase() === String(title || '').toLowerCase())?.priceHistory || []).slice(-1)[0]?.price) || 0;
  const myPrices = (c.data.books || []).map((b) => Number((b.priceHistory || []).slice(-1)[0]?.price) || 0).filter(Boolean);
  const myBooks = (c.data.w_books || []).filter((b) => b.status === 'progress').map((b) => ({ id: b.id, title: b.title, tags: b.tags || [], ann: b.svc?.annotation || '', price: priceOf(b.title) }));
  let M = null; try { M = snap ? marketInsights(snap, { src, mine, myPrices, myBooks }) : null; } catch (e) { console.error(e); }
  lastM = M;
  const report = M ? snap?.coverage?.[M.date] : null, via = report ? [...new Set(Object.values(report.bySource || {}).map((x) => x.via).filter(Boolean))] : [];
  const status = M ? `Срез ${fmtDate(M.date)} · ${M.n} ${plural(M.n, 'книга', 'книги', 'книг')}${report ? ` · ${report.collected} из ${report.requested} подборок` : ''}${via.length ? ` · ${via.includes('proxy') ? 'через переходник' : 'через читалку'}` : ''}` : (snap?.tryAt ? `Последняя попытка ${fmtDate(snap.tryAt.slice(0, 10))}` : 'Срезов пока нет');
  const errLine = marketState.busy ? '' : (snap?.err || marketState.err) ? `<p class="small warnc" style="margin:4px 0 0">Не всё прочиталось: ${esc(snap?.err || marketState.err)}.${!c.settings.direct?.proxy ? ' Подключите переходник в настройках Директа — через него топы читаются надёжнее.' : ''}</p>` : '';
  const head = `<div class="row between" style="gap:12px;flex-wrap:wrap;align-items:center"><h2 style="margin:0">Рынок</h2>
      <div class="row" style="gap:8px"><select data-chg="mk.src" aria-label="Подборка" class="mk-sel"><option value="">Все подборки</option>${srcs.map((s) => `<option value="${esc(s.url)}"${src === s.url ? ' selected' : ''}>${esc(s.name.replace(/^Литнет · /, ''))}</option>`).join('')}<option value="+">+ Добавить подборку…</option></select>
      <button class="small-btn" data-act="mk.scan"${marketState.busy ? ' disabled' : ''}>${marketState.busy ? 'Читаю…' : 'Обновить'}</button></div></div>
    ${ptabs}<p class="small muted" style="margin:0">${esc(status)}${report ? ` <button class="link small" data-act="mk.cov">подробнее</button>` : ''}</p>${errLine}
    <div class="mk-stabs">${SECTIONS.map(([k, t]) => `<button class="${sec === k ? 'on' : ''}" data-act="mk.tab" data-s="${k}">${t}</button>`).join('')}</div>`;
  const empty = `<div class="card"><p class="muted" style="margin:0">${marketState.busy ? 'Читаю топы Литнета — это около двух минут.' : 'Срезов пока нет. Нажмите «Обновить» — первый снимется за пару минут, дальше приложение делает это само раз в сутки.'}</p></div>`;
  let body;
  try {
    if (sec === 'lg') body = lgSection(a, snap);
    else if (!M) body = empty;
    else if (sec === 'tropes') body = tropesSection(M, snap, src, isMine);
    else if (sec === 'price') body = priceSection(M);
    else if (sec === 'rivals') body = rivalsSection(a, snap, src, mine);
    else if (sec === 'mine') body = mineSection(a, M, snap, src, srcs);
    else body = overviewSection(a, M, snap, src, srcs, mine, isMine);
  } catch (e) { console.error(e); body = `<div class="card"><p class="warnc" style="margin:0">Этот раздел не собрался: ${esc(e.message)}</p></div>`; }
  return { html: `<section class="mk-page">${head}${body}</section>` };
}

// Карта тропов — одна картинка вместо списка: вправо — теснее (доля в топе), вверх — охотнее добавляют. Ваши тропы — тёмные и подписаны.
function quadrant(M, isMine) {
  const pts = M.tropeMap.filter((t) => t.interest != null && t.n >= 2);
  if (pts.length < 4) return '';
  const narrow = typeof window !== 'undefined' && window.innerWidth < 600, W = narrow ? 360 : 880, H = narrow ? 300 : 340, L = 14, R = 14, T = 18, B = 26;
  const xmax = Math.max(...pts.map((t) => t.share)) * 1.1, ly = (v) => Math.log2(Math.max(0.25, Math.min(4, v))), lys = pts.map((t) => ly(t.interest)), yhi = Math.max(0.35, ...lys) + 0.25, ylo = Math.min(-0.35, ...lys) - 0.25;
  const X = (v) => L + v / xmax * (W - L - R), Y = (v) => T + (yhi - ly(v)) / (yhi - ylo) * (H - T - B);
  const midX = X(median(pts.map((t) => t.share))), y1 = Y(1);
  const P = pts.map((t) => ({ t, mine: isMine(t.name), x: X(t.share), y: Y(t.interest), r: 4 + Math.sqrt(t.n) * (narrow ? 1.3 : 1.6) }));
  // подписи: сначала ваши, потом самые заметные; подпись, которая налезает на уже поставленную, пропускаем (троп виден по нажатию)
  const placed = [], hit = (b) => placed.some((p) => b.x1 < p.x2 && b.x2 > p.x1 && b.y1 < p.y2 && b.y2 > p.y1);
  const order = [...P.filter((p) => p.mine), ...P.filter((p) => !p.mine).sort((a, b) => Math.abs(ly(b.t.interest)) * b.t.share - Math.abs(ly(a.t.interest)) * a.t.share).slice(0, narrow ? 5 : 9)];
  const labels = [];
  for (const p of order) {
    const w = p.t.name.length * (p.mine ? 7 : 6.4) + 4;
    const tries = [[p.x + p.r + 4, p.y + 4, 'start'], [p.x - p.r - 4, p.y + 4, 'end'], [p.x - w / 2, p.y - p.r - 6, 'start'], [p.x - w / 2, p.y + p.r + 14, 'start']];
    for (const [tx, ty, an] of tries) {
      const x1 = an === 'end' ? tx - w : tx, b = { x1, x2: x1 + w, y1: ty - 11, y2: ty + 3 };
      if (b.x1 < 2 || b.x2 > W - 2 || hit(b)) continue;
      placed.push(b); labels.push(`<text class="mk-q-l${p.mine ? ' me' : ''}" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${an}">${esc(p.t.name)}</text>`); break;
    }
  }
  return `<svg class="mk-q" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Карта тропов">
    <rect class="mk-q-niche" x="${L}" y="${T}" width="${(midX - L).toFixed(1)}" height="${(y1 - T).toFixed(1)}" rx="10"/>
    <line class="mk-q-ax" x1="${midX.toFixed(1)}" x2="${midX.toFixed(1)}" y1="${T}" y2="${H - B}"/><line class="mk-q-ax" x1="${L}" x2="${W - R}" y1="${y1.toFixed(1)}" y2="${y1.toFixed(1)}"/>
    <text class="mk-q-c" x="${L + 8}" y="${T + 16}">ниша</text><text class="mk-q-c" x="${W - R - 8}" y="${T + 16}" text-anchor="end">читают, но тесно</text>
    <text class="mk-q-c" x="${L + 8}" y="${H - B - 8}">слабый спрос</text><text class="mk-q-c" x="${W - R - 8}" y="${H - B - 8}" text-anchor="end">перегрето</text>
    ${[...P].sort((a, b) => a.mine - b.mine).map((p) => `<circle class="mk-q-d${p.mine ? ' me' : ''}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}" data-act="mk.trope" data-t="${esc(p.t.name)}" role="button"><title>${esc(p.t.name)}: ${pc(p.t.share)} топа, интерес ${x1(p.t.interest)}</title></circle>`).join('')}
    ${labels.join('')}
    <text class="mk-q-a" x="${L}" y="${H - 6}">меньше книг</text><text class="mk-q-a" x="${W - R}" y="${H - 6}" text-anchor="end">больше книг в топе →</text></svg>`;
}
const median = (a) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : 0; };

function overviewSection(a, M, snap, src, srcs, mine, isMine) {
  const c = a.ctx();
  const ranks = myRanks(snap, { names: Object.fromEntries(srcs.map((x) => [x.url, x.name.replace(/^Литнет · /, '')])) }).filter((r) => !src || r.src === src);
  const rivals = rivalBoard(snap, { watch: c.settings.direct?.market?.watch || [], myTropes: mine, me: c.settings.pseudonym || '', src }).rivals;
  let lg = []; try { lg = lgPlan(a, snap); } catch { /* без Литгорода */ }
  const tips = adviceForMe({ M, ranks, rivals, lg, forecast: tropeForecast(snap, { src }) });
  const advice = `<div class="card mk-for"><h2 style="margin:0 0 10px">Для вас</h2>
    ${tips.length ? `<div class="mk-tips">${tips.map((t) => `<div class="mk-tip t-${t.tone || 'n'}"><i></i><div><div class="small muted">${esc(t.book)}</div><div>${esc(t.text)}</div></div></div>`).join('')}</div>`
      : `<p class="small muted" style="margin:0">${(c.data.w_books || []).some((b) => b.status === 'progress' && (b.tags || []).length) ? 'Сейчас по вашим книгам ничего срочного — рынок ровный.' : 'Отметьте тропы своих книг в «Мастерской» (книга → «О книге»), и здесь появятся советы именно по ним.'}</p>`}</div>`;
  const map = quadrant(M, isMine);
  return `${advice}
    ${map ? `<div class="card"><div class="row between" style="gap:10px;align-items:baseline"><h2 style="margin:0">Где ваши тропы</h2><span class="small muted">нажмите на кружок — его книги</span></div>${map}
      ${how('Вправо — больше книг с этим тропом в топе (теснее). Вверх — их охотнее добавляют в библиотеку. Зелёный угол — ниша: читают охотно, а книг мало. Ваши тропы — тёмные. Размер кружка — число книг.')}</div>` : ''}
    <div class="card"><h2 style="margin:0 0 10px">Книга из топа — какая она</h2>
      <div class="tiles"><div><div class="k">Цена</div><div class="v">${M.price.median != null ? Math.round(M.price.median) + ' ₽' : '—'}</div><div class="s">со скидкой ${pc(M.price.off)}</div></div>
        <div><div class="k">Объём</div><div class="v">${M.formula.pages ? Math.round(M.formula.pages) + ' стр.' : '—'}</div><div class="s">пишутся ${pc(M.progress)}</div></div>
        <div><div class="k">В библиотеках</div><div class="v">${short(M.formula.lib)}</div><div class="s">эксклюзив ${pc(M.excl)}</div></div>
        <div><div class="k">Добавляют из 100</div><div class="v">${M.formula.conv != null ? (M.formula.conv * 100).toFixed(1).replace('.', ',') : '—'}</div><div class="s">открывших книгу</div></div></div></div>
    ${M.movers.length ? `<div class="card"><h2 style="margin:0 0 4px">Растут быстрее всех</h2><div class="list">${more('mk-mv', M.movers.map((b) => bookRow(b, `<b class="up">+${num(b.perDay)}</b> в день`)), 3)}</div></div>` : ''}
    <div class="card"><h2 style="margin:0 0 6px">Топ сейчас</h2><div class="list">${more('mk-top', M.top.map((b) => bookRow(b, `${short(b.lib)} в библ.`)), 5)}</div></div>`;
}

function tropesSection(M, snap, src, isMine) {
  const arrow = (t) => (t.delta == null || Math.abs(t.delta) < 0.05 ? '' : t.delta > 0 ? ` <span class="up">▲${Math.round(t.delta * 100)}</span>` : ` <span class="down">▼${Math.round(-t.delta * 100)}</span>`);
  const maxT = Math.max(...M.tropeMap.map((t) => t.share), 0.01);
  return `${M.tropeMap.length ? `<div class="card"><h2 style="margin:0 0 4px">Карта тропов</h2>${how('Полоса — сколько книг топа с этим тропом (теснота). «Интерес» — как охотно такие книги добавляют в библиотеку против обычного по топу: выше ×1 — охотнее. Лучшее место для новой книги — высокий интерес при небольшой доле. Нажмите на троп — его книги.')}
      ${more('mk-tr', M.tropeMap.map((t) => `<div class="mk-b mk-tr" data-act="mk.trope" data-t="${esc(t.name)}" role="button" tabindex="0"><div class="row between small" style="gap:4px 10px;flex-wrap:wrap"><span><b>${esc(t.name)}</b>${isMine(t.name) ? ' <span class="mk-me">ваш</span>' : ''} <span class="${VERD[t.verdict][1]}">· ${VERD[t.verdict][0]}</span></span><span style="white-space:nowrap">${spark(t.hist)}${pc(t.share)}${arrow(t)}${t.interest != null ? ` · интерес <b>${x1(t.interest)}</b>` : ''}</span></div><div class="progress"><i style="width:${(t.share / maxT * 100).toFixed(1)}%"></i></div></div>`), 10)}
      ${M.pairs.length ? sub('Чаще всего вместе') + `<p class="small" style="margin:0">${M.pairs.map((p) => `${esc(p.name.toLowerCase())} <span class="muted">(${p.n})</span>`).join(' · ')}</p>` : ''}</div>` : ''}
    ${forecastCard(snap, src, isMine)}`;
}

function priceSection(M) {
  const bRow = (b) => `<div class="mk-b"><div class="row between small" style="gap:4px 10px;flex-wrap:wrap"><span><b>${esc(b.name)}</b></span><span class="muted">${b.n} ${plural(b.n, 'книга', 'книги', 'книг')} · в библ. обычно ${short(b.lib)}${b.interest ? ` · интерес ${x1(b.interest)}` : ''}</span></div><div class="progress"><i style="width:${(b.share * 100).toFixed(1)}%"></i></div></div>`;
  return `<div class="card"><h2 style="margin:0 0 4px">Цена и объём</h2>${how('Сколько книг топа в каждой вилке и как охотно их добавляют. Если в вилке мало книг, а интерес выше ×1 — там свободнее.')}
      ${sub('Цена')}${M.prices.map(bRow).join('')}${sub('Объём сейчас')}${M.sizes.map(bRow).join('')}</div>
    <div class="card"><h2 style="margin:0 0 8px">Как подают книгу</h2>
      <p style="margin:6px 0">Аннотация начинается с реплики героя у <b>${pc(M.pitch.dialogue)}</b> книг топа${M.pitch.emoji >= 0.1 ? `, со значками-эмодзи — у ${pc(M.pitch.emoji)}` : ''}.</p>
      ${M.pitch.titleWords.length ? `<p style="margin:6px 0">Слова, которые повторяются в названиях: ${M.pitch.titleWords.map((w) => `«${esc(w.word)}» <span class="muted">(${w.n})</span>`).join(', ')}.</p>` : ''}
      ${how('Это то, что читательница видит в списке до клика: название, первая строка аннотации, цена. Сравните со своей карточкой на Литнете.')}</div>`;
}

function rivalsSection(a, snap, src, mine) {
  const c = a.ctx(), watch = c.settings.direct?.market?.watch || [];
  const R = rivalBoard(snap, { watch, myTropes: mine, me: c.settings.pseudonym || '', src });
  const card = (r) => `<div class="item mk-rv"><div class="row between" style="gap:12px;align-items:flex-start"><div style="min-width:0">
      <b>${esc(r.name)}</b>${r.watched ? ' <span class="mk-me">слежу</span>' : ''}
      <div class="small muted">${r.n} ${plural(r.n, 'книга', 'книги', 'книг')} в топе · лучшее место ${r.best} · ${short(r.lib)} в библ.${r.perDay != null ? ` · <span class="${r.perDay > 0 ? 'up' : ''}">+${num(Math.max(0, r.perDay))} в день</span>` : ''}</div>
      ${r.common.length ? `<div class="small">общие с вами тропы: ${r.common.map((t) => esc(t.toLowerCase())).join(', ')}</div>` : r.tropes.length ? `<div class="small muted">${r.tropes.map((t) => esc(t.toLowerCase())).join(', ')}</div>` : ''}
      ${r.events.map((e) => `<div class="small"><span class="${e.kind === 'new' ? 'up' : e.kind === 'sale' ? 'down' : 'muted'}">●</span> «${esc(e.title)}» — ${esc(e.text)}</div>`).join('')}
      <div class="small muted">${r.books.slice(0, 3).map((b) => `<a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.title)}</a> — ${b.n}${b.off ? `, скидка ${b.off} %` : ''}`).join(' · ')}</div></div>
    <div class="mk-rv-r">${libLine(r.series)}<button class="link small" data-act="mk.watch" data-n="${esc(r.name)}">${r.watched ? 'Не следить' : 'Следить'}</button></div></div></div>`;
  return `<div class="card"><div class="row between" style="gap:10px;align-items:center"><h2 style="margin:0">Конкуренты</h2><button class="link small" data-act="mk.watchAdd">+ Следить за автором</button></div>
    ${how(`Сами нашлись авторы, которые пишут на ваши тропы, и те, у кого несколько книг в топе; сверху — те, за кем вы следите. Линия справа — их библиотеки по срезам (${R.dates.length} ${plural(R.dates.length, 'срез', 'среза', 'срезов')}): чем дольше наблюдаем, тем она длиннее. Новые книги, скидки и смена цены отмечаются точкой.`)}
    ${R.rivals.length ? `<div class="list">${more('mk-rv', R.rivals.map(card), 6)}</div>` : '<p class="muted small">В срезе пока нет авторов с вашими тропами или с несколькими книгами — добавьте подборку своего поджанра.</p>'}
    ${!mine.length ? '<p class="small muted">Отметьте тропы своих книг в «Мастерской» (книга → «О книге» → тропы) — тогда конкуренты подберутся точнее.</p>' : ''}</div>`;
}

function mineSection(a, M, snap, src, srcs) {
  const c = a.ctx();
  const ranks = myRanks(snap, { names: Object.fromEntries(srcs.map((x) => [x.url, x.name.replace(/^Литнет · /, '')])) }).filter((r) => !src || r.src === src);
  const relOf = (title) => { const b = (c.data.w_books || []).find((x) => String(x.title || '').toLowerCase() === String(title || '').toLowerCase()); const out = new Set();
    for (const ch of Object.values(b?.pub || {})) for (const v of Object.values(ch || {})) if (v?.date && !v.planned) out.add(String(v.date).slice(0, 10)); return out; };
  const rk = ranks.length ? `<div class="card"><h2 style="margin:0 0 4px">Ваши книги в топах</h2>${how('Место каждый день: чем выше линия, тем ближе к первому месту. Точки — дни выхода глав. Ищу книги до 12-й страницы топа.')}
      ${ranks.map((r) => { const d = r.was != null ? r.was - r.now : null; return `<div class="mk-rank"><div class="row between" style="gap:10px;align-items:baseline"><div style="min-width:0"><b>${esc(r.title)}</b> <span class="small muted">· ${esc(r.srcName)}</span></div>
        <div style="white-space:nowrap"><span class="mk-place">${r.now}</span><span class="small muted"> место</span>${d ? ` <span class="small ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>` : ''}</div></div>
        ${rankChart(r.hist, relOf(r.title))}<div class="small muted">${[r.was != null ? `неделю назад — ${r.was}` : 'неделю назад — ещё не было среза', `лучшее — ${r.best}`, r.lib ? `${short(r.lib)} в библ.` : ''].filter(Boolean).join(' · ')}</div></div>`; }).join('')}</div>`
    : `<div class="card"><h2 style="margin:0 0 4px">Ваши книги в топах</h2><p class="small muted" style="margin:0">${c.settings.pseudonym ? `В первых 12 страницах наблюдаемых топов книг автора «${esc(c.settings.pseudonym)}» сейчас нет.` : 'Впишите псевдоним в настройках «Мастерской» — тогда я найду ваши книги в топах.'}</p></div>`;
  const fit = M.fit.map((f) => `<div class="card"><div class="mk-cap">Ваша книга и рынок</div><h2 style="margin:0 0 10px">${esc(f.title)}</h2>
      <div class="mk-chips">${f.tropes.map((t) => `<button class="mk-chip" data-act="mk.trope" data-t="${esc(t.name)}"><b>${esc(t.name)}</b><span class="${(VERD[t.verdict] || [])[1] || 'muted'}">${t.verdict === 'few' || t.verdict === 'none' ? 'в топе редкость' : VERD[t.verdict][0]}</span><span class="muted">${t.n ? `${pc(t.share)} топа${t.interest != null ? ` · интерес ${x1(t.interest)}` : ''}` : 'в топе нет'}</span></button>`).join('')}</div>
      ${f.lines.map((n) => `<p style="margin:8px 0 0">${esc(n)}</p>`).join('')}
      ${f.near.length ? sub('Ближайшие по тропам книги топа') + `<div class="list">${more('mk-near-' + f.id, f.near.map((b) => bookRow(b, `${short(b.lib)} в библ.`)), 3)}</div>` : ''}</div>`).join('');
  return rk + (fit || '<div class="card"><p class="small muted" style="margin:0">Книг «В процессе» с тропами нет — отметьте тропы книги в «Мастерской», и здесь появится, как она смотрится на фоне топа.</p></div>');
}

// Литгород: какие книги дублировать и когда (расчёты — js/litgorod.js)
function lgPlan(a, snap) {
  const c = a.ctx(), me = String(c.settings.pseudonym || '').toLowerCase().trim(), excl = [];
  if (snap && me) { const dates = Object.keys(snap.days || {}).sort(), d = snap.days?.[dates[dates.length - 1]] || {};
    for (const rows of Object.values(d)) for (const r of rows) { const b = snap.books?.[r.id]; if (r.e && b && String(b.a || '').toLowerCase().trim() === me) excl.push(b.t); } }
  const priceOf = (title) => Number(((c.data.books || []).find((x) => String(x.title || '').toLowerCase() === String(title || '').toLowerCase())?.priceHistory || []).slice(-1)[0]?.price) || 0;
  return litgorodPlan({ wbooks: c.data.w_books || [], sales: c.data.sales || [], today: c.today, excl, dup: c.settings.direct?.market?.dup || {}, priceOf });
}
function lgSection(a, snap) {
  const plan = lgPlan(a, snap), S = dupSummary(plan);
  const K = { go: ['Пора', 'up'], soon: ['Скоро', ''], wait: ['Подождать', 'muted'], later: ['После завершения', 'muted'], done: ['Уже там', ''], no: ['Нельзя', 'down'] };
  const rub0 = (v) => num(Math.round(v)) + ' ₽';
  const eff = (x) => { const e = x.effect; if (!e) return ''; if (!e.ready) return `<div class="small muted">Выложена ${fmtDate(e.at)} — что это дало, посчитаю через ${14 - e.after} ${plural(14 - e.after, 'день', 'дня', 'дней')}.</div>`;
    return `<div class="small">После выкладки (${e.span} дн.): Литнет ${rub0(e.then)} в неделю против ${rub0(e.before)} до${e.change != null ? ` — <span class="${e.change >= -0.1 ? 'up' : 'down'}">${e.change >= 0 ? '+' : '−'}${Math.round(Math.abs(e.change) * 100)} %</span>` : ''}${e.lgWeek != null ? ` · Литгород ${rub0(e.lgWeek)} в неделю` : ' · продаж Литгорода в выгрузке нет'}.</div>`; };
  const row = (x) => `<div class="item mk-lg"><div class="row between" style="gap:12px;align-items:flex-start"><div style="min-width:0"><b>${esc(x.title)}</b> <span class="small ${K[x.k][1]}">· ${K[x.k][0]}</span>
      <div class="small" style="margin-top:2px">${esc(x.text)}</div>${eff(x)}
      ${x.minPrice && (x.k === 'go' || x.k === 'soon') ? `<div class="small muted">Цена на Литгороде — не ниже ${x.minPrice} ₽ (на Литнете ${Math.round(x.price)} ₽, правило 5 %).</div>` : ''}</div>
    <div style="flex:none">${x.k === 'done' && x.at ? `<button class="link small" data-act="mk.lgUndo" data-id="${esc(x.id)}">Отменить</button>` : x.k !== 'no' ? `<button class="small-btn" data-act="mk.lgDone" data-id="${esc(x.id)}">${x.k === 'done' ? 'Указать дату' : 'Выложила'}</button>` : ''}</div></div></div>`;
  return `<div class="card"><h2 style="margin:0 0 4px">Литгород: что дублировать и когда</h2>
      ${how('Совет по каждой книге — из её продаж на Литнете: на пике вторая площадка может отнять у Литнета покупателей, после пика даёт вторую волну. Отметьте «Выложила» — через 2 недели я покажу, что стало с Литнетом и что принёс Литгород, и следующие советы будут опираться на вашу историю.')}
      ${plan.length ? `<div class="list">${plan.map(row).join('')}</div>` : '<p class="small muted">Книг «В процессе» и «Завершена» в «Мастерской» пока нет.</p>'}
      ${S ? `<p style="margin:10px 0 0">По ${S.n} ${plural(S.n, 'выложенной книге', 'выложенным книгам', 'выложенным книгам')}: Литнет после выкладки в среднем ${S.change >= 0 ? '+' : '−'}${Math.round(Math.abs(S.change) * 100)} %${S.lgWeek != null ? `, Литгород приносит ≈ ${rub0(S.lgWeek)} в неделю на книгу` : ''}.</p>` : ''}</div>
    <div class="card"><h2 style="margin:0 0 6px">Правила Литнета при дублировании</h2>
      <p class="small" style="margin:4px 0">Бесплатно в другом месте — не больше бесплатной части на Литнете.</p>
      <p class="small" style="margin:4px 0">Цена на Литнете не выше, чем на других площадках, больше чем на 5 %.</p>
      <p class="small" style="margin:4px 0">Книга на подписке: в другом месте — не больше текста, чем уже выложено на Литнете.</p>
      ${how('Из правил Литнета (litnet.com/info/rules). Продажи Литгорода попадут в расчёт, если загрузить его выгрузку в «Доходы».')}</div>`;
}

acts['mk.scan'] = async () => { const a = window.__app; const p = scanMarket(a); a.rerender(); const r = await p; if (r) toast(r.got ? `Срез снят: подборок ${r.got}${r.err ? ' · ' + r.err : ''}` : 'Не получилось прочитать топы: ' + (r.err || 'нет ответа')); };
// книги одного тропа: чем они отличаются от топа и как оформлены карточки
acts['mk.trope'] = (d) => { const M = lastM; if (!M) return false;
  const list = M.all.filter((b) => b.tropes.includes(d.t)).sort((x, y) => (y.conv ?? 0) - (x.conv ?? 0)); if (!list.length) { toast(`Книг с тропом «${d.t}» в топе сейчас нет`); return false; }
  const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const t = M.tropeMap.find((x) => x.name === d.t), paid = list.filter((b) => b.price > 0), pr = med(paid.map((b) => b.price)), pg = med(list.map((b) => b.pages || null));
  const dlg = list.filter((b) => /^\s*[—–-]\s*\S/.test(b.ann)).length;
  const withT = {}; for (const b of list) for (const x of b.tropes) if (x !== d.t) withT[x] = (withT[x] || 0) + 1;
  const pals = Object.entries(withT).sort((x, y) => y[1] - x[1]).slice(0, 4);
  openSheet(`${d.t} · ${list.length} ${list.length === 1 ? 'книга' : list.length < 5 ? 'книги' : 'книг'} в топе`, `
    <div class="tiles" style="margin-bottom:12px"><div><div class="k">Интерес</div><div class="v">${t?.interest != null ? x1(t.interest) : '—'}</div><div class="s">к обычному по топу</div></div>
      <div><div class="k">Цена</div><div class="v">${pr != null ? Math.round(pr) + ' ₽' : '—'}</div><div class="s">бесплатных ${list.length - paid.length}</div></div>
      <div><div class="k">Объём</div><div class="v">${pg ? pg + ' стр.' : '—'}</div><div class="s">пишутся ${list.filter((b) => !b.done).length}</div></div>
      <div><div class="k">В библиотеках</div><div class="v">${short(med(list.map((b) => b.lib)) || 0)}</div><div class="s">с реплики начинают ${dlg}</div></div></div>
    ${pals.length ? `<p class="small" style="margin:0 0 10px"><span class="muted">Чаще всего вместе с:</span> ${pals.map(([n, k]) => `${esc(n.toLowerCase())} <span class="muted">(${k})</span>`).join(' · ')}</p>` : ''}
    <div class="mk-sub" style="margin-top:0">Книги по накопленному отношению библиотек к просмотрам</div>
    <div class="list">${list.map((b) => `<div class="item"><div class="row between" style="gap:12px;align-items:flex-start"><div style="min-width:0"><a href="${esc(b.url)}" target="_blank" rel="noopener"><b>${esc(b.title)}</b></a>
      <div class="small muted">${[b.author, b.price > 0 ? Math.round(b.price) + ' ₽' : 'бесплатно', b.pages ? b.pages + ' стр.' : '', 'место ' + b.n].filter(Boolean).map(esc).join(' · ')}</div>
      ${b.ann ? `<div class="small mk-ann">${esc(b.ann.slice(0, 150))}${b.ann.length > 150 ? '…' : ''}</div>` : ''}</div>
      <span class="small" style="white-space:nowrap">${short(b.lib)}${b.conv != null ? `<br><span class="muted">${(b.conv * 100).toFixed(1).replace('.', ',')} на 100 просмотров</span>` : ''}</span></div></div>`).join('')}</div>`, null);
  return false; };
const saveWatch = async (list) => { const a = window.__app, d = a.ctx().settings.direct || {}; await a.store.saveSettings({ direct: { ...d, market: { ...(d.market || {}), watch: list } } }); };
acts['mk.watch'] = async (d) => { const a = window.__app, list = a.ctx().settings.direct?.market?.watch || [];
  if (list.includes(d.n)) { await saveWatch(list.filter((x) => x !== d.n)); toast(`Больше не слежу: ${d.n}`, { undo: () => saveWatch(list) }); return; }
  if (list.length >= 10) { toast('Следить можно за 10 авторами — уберите кого-нибудь'); return false; }
  await saveWatch([...list, d.n]); toast(`Слежу: ${d.n}`); };
acts['mk.watchAdd'] = () => { openSheet('Следить за автором', `<p class="small">Имя — как на Литнете. Приложение отметит её новые книги, скидки и смену цены, когда они в топах.</p><label>Автор</label><input name="n" required list="mk-au" autocomplete="off">
  <datalist id="mk-au">${[...new Set((lastM?.all || []).map((b) => b.author).filter(Boolean))].sort().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`, async (fd) => {
  const n = String(fd.get('n') || '').trim(), list = window.__app.ctx().settings.direct?.market?.watch || []; if (!n || list.includes(n)) return; if (list.length >= 10) { toast('Следить можно за 10 авторами'); return false; } await saveWatch([...list, n]); }, { submitText: 'Следить' }); return false; };
changes['mk.src'] = (v) => { if (v === '+') { addSrc(); return; } window.__app.ui.mkSrc = v || ''; window.__app.rerender(); };
function addSrc() {
  openSheet('Добавить подборку Литнета', `<p class="small">Откройте на Литнете нужный топ (жанр или поджанр) и вставьте сюда адрес страницы — например, https://litnet.com/ru/top/lyubovnye-romany.</p>
    <label>Адрес страницы топа</label><input name="u" required placeholder="https://litnet.com/ru/top/…" autocomplete="off"><label>Как назвать</label><input name="n" placeholder="Служебный роман">`, async (fd) => {
    const a = window.__app, u = String(fd.get('u') || '').trim().split('?')[0].replace(/\/$/, '');
    if (!okSrc(u)) { toast('Нужен адрес топа Литнета вида https://litnet.com/ru/top/…'); return false; }
    const d = a.ctx().settings.direct || {}, list = srcsOf(a.ctx().settings).filter((s) => s.url !== u);
    await a.store.saveSettings({ direct: { ...d, market: { ...(d.market || {}), srcs: [...list, { name: String(fd.get('n') || '').trim() || u.split('/').pop(), url: u }].slice(0, 6) } } });
    scanMarket(a).then(() => a.rerender());
  }, { submitText: 'Добавить' });
}
acts['mk.reset'] = async () => { const a = window.__app, d = a.ctx().settings.direct || {}; await a.store.saveSettings({ direct: { ...d, market: { ...(d.market || {}), srcs: [] } } }); };

acts['mk.tab'] = (d) => { const a = window.__app; if (d.p) { a.ui.mkP = d.p; LS.set('mkP', d.p); } if (d.s) { a.ui.mkS = d.s; LS.set('mkS', d.s); } a.rerender(); return false; };
acts['mk.cov'] = () => { const a = window.__app, snap = marketSnap(a), dates = Object.keys(snap?.coverage || {}).sort(), r = snap?.coverage?.[dates[dates.length - 1]]; if (!r) return false;
  openSheet('Что прочиталось', `<p class="small">Собрано ${r.collected || 0} из ${r.requested || 0} подборок, ${r.pages || 0} страниц. Это открытые топы Литнета, а не весь рынок.</p>
    <div class="list">${Object.values(r.bySource || {}).map((x) => `<div class="item"><div class="row between" style="gap:10px"><b>${esc(x.name.replace(/^Литнет · /, ''))}</b><span class="small ${x.ok ? 'up' : 'warnc'}">${x.ok ? `${num(x.books)} книг` : 'не прочиталась'}</span></div>${x.error ? `<div class="small muted">${esc(x.error)}</div>` : ''}${x.via ? `<div class="small muted">${x.via === 'proxy' ? 'через переходник' : 'через читалку'}, страниц: ${x.pages}</div>` : ''}</div>`).join('')}</div>
    <p class="small muted">Библиотеки и просмотры — накопленные счётчики Литнета; чужие продажи и рекламу снаружи не видно никому.</p>`, null); return false; };
const saveDup = async (dup) => { const a = window.__app, d = a.ctx().settings.direct || {}; await a.store.saveSettings({ direct: { ...d, market: { ...(d.market || {}), dup } } }); };
acts['mk.lgDone'] = (d) => { const a = window.__app, c = a.ctx(), b = (c.data.w_books || []).find((x) => x.id === d.id); if (!b) return false;
  openSheet(`«${b.title}» на Литгороде`, `<label>Когда выложила</label><input type="date" name="at" value="${c.today}" max="${c.today}" required>`, async (fd) => {
    const at = String(fd.get('at') || c.today), dup = { ...(c.settings.direct?.market?.dup || {}), [b.id]: at };
    await saveDup(dup);
    if (!(b.platforms || []).includes('Литгород')) await a.store.put('w_books', { ...b, platforms: [...(b.platforms || []), 'Литгород'] });
    toast('Отметила — через 2 недели посчитаю, что это дало');
  }, { submitText: 'Сохранить' }); return false; };
acts['mk.lgUndo'] = async (d) => { const a = window.__app, prev = a.ctx().settings.direct?.market?.dup || {}, dup = { ...prev }; delete dup[d.id]; await saveDup(dup); toast('Отметка снята', { undo: () => saveDup(prev) }); };

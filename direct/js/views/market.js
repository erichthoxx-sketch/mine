// «Рынок» (#/market): не витрина топа, а разбор — что отличает книги, которые читают, и где её место (13.11.2026: «рассчитывала на глубокую аналитику»).
// Порядок сверху вниз: выводы → портрет книги топа → карта тропов → цена и объём → подача → движение за неделю → сам топ. Расчёты — js/market.js.
import { esc, acts, changes, toast, openSheet, more } from '../../../js/ui.js';
import { num, fmtDate } from '../../../js/format.js';
import { marketInsights, myRanks, watchReport, tropeForecast } from '../../../js/market.js';
import { scanMarket, marketSnap, marketState, srcsOf, okSrc, MARKET_DEFAULT } from '../marketscan.js';

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
  const head = `<h2 style="margin:0 0 4px">Прогноз тропов на месяц</h2>`;
  if (!F.ready) return `<div class="card">${head}<p class="small muted" style="margin:0">Прогноз строится по ходу топа день за днём. ${F.needDays ? `Нужно ещё ${F.needDays} ${F.needDays === 1 ? 'день' : F.needDays < 5 ? 'дня' : 'дней'} срезов` : `Нужно ещё ${F.need} ${F.need === 1 ? 'среза' : 'среза'}`} — приложение снимает их само раз в сутки.</p></div>`;
  const row = (x, right) => `<div class="mk-fc" data-act="mk.trope" data-t="${esc(x.name)}" role="button" tabindex="0"><div class="row between" style="gap:10px;align-items:baseline"><b>${esc(x.name)}${isMine(x.name) ? ' <span class="mk-me">ваш</span>' : ''}</b><span class="small" style="white-space:nowrap">${right}</span></div>
    ${x.why.length ? `<div class="small muted">${x.why.slice(0, 3).map(esc).join(' · ')}</div>` : ''}</div>`;
  const pp = (v) => Math.round(v * 100) + ' %';
  const grp = (t, list, fn) => (list.length ? sub(t) + list.map((x) => row(x, fn(x))).join('') : '');
  return `<div class="card">${head}<p class="small muted" style="margin:0 0 6px">Что, вероятно, будет в топе через 4 недели. Основа: ход доли тропа по ${F.slices} срезам за ${F.span} дн., какие тропы у книг, только что вошедших в топ (${F.fresh}), как быстро такие книги набирают читателей и насколько охотно их добавляют. Уверенность — ${F.conf}. Это прогноз, а не гарантия.</p>
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

export function marketView(a) {
  const c = a.ctx(), snap = marketSnap(a), srcs = srcsOf(c.settings), ui = a.ui, src = srcs.some((s) => s.url === ui.mkSrc) ? ui.mkSrc : null;
  const mine = [...new Set((c.data.w_books || []).flatMap((b) => b.tags || []))], isMine = (t) => mine.some((x) => x.toLowerCase() === t.toLowerCase());
  const myPrices = (c.data.books || []).map((b) => Number((b.priceHistory || []).slice(-1)[0]?.price) || 0).filter(Boolean);
  const priceOf = (title) => Number(((c.data.books || []).find((x) => String(x.title || '').toLowerCase() === String(title || '').toLowerCase())?.priceHistory || []).slice(-1)[0]?.price) || 0;
  const myBooks = (c.data.w_books || []).filter((b) => b.status === 'progress').map((b) => ({ id: b.id, title: b.title, tags: b.tags || [], ann: b.svc?.annotation || '', price: priceOf(b.title) }));
  const M = snap ? marketInsights(snap, { src, mine, myPrices, myBooks }) : null;
  lastM = M;
  const ranks = snap ? myRanks(snap, { names: Object.fromEntries(srcs.map((x) => [x.url, x.name.replace(/^Литнет · /, '')])) }).filter((r) => !src || r.src === src) : [];
  const watchList = c.settings.direct?.market?.watch || [], watched = snap ? watchReport(snap, watchList) : [];
  // дни выхода глав её книг — точками на линии места
  const relOf = (title) => { const b = (c.data.w_books || []).find((x) => String(x.title || '').toLowerCase() === String(title || '').toLowerCase()); const out = new Set();
    for (const ch of Object.values(b?.pub || {})) for (const v of Object.values(ch || {})) if (v?.date && !v.planned) out.add(String(v.date).slice(0, 10)); return out; };
  const head = `<div class="row between" style="gap:12px;flex-wrap:wrap;margin-bottom:4px"><h2 style="margin:0">Рынок</h2>
      <div class="row" style="gap:8px"><select data-chg="mk.src" aria-label="Подборка" class="mk-sel"><option value="">Все подборки</option>${srcs.map((s) => `<option value="${esc(s.url)}"${src === s.url ? ' selected' : ''}>${esc(s.name.replace(/^Литнет · /, ''))}</option>`).join('')}<option value="+">+ Добавить подборку…</option></select>
      <button class="small-btn" data-act="mk.scan"${marketState.busy ? ' disabled' : ''}>${marketState.busy ? 'Читаю…' : 'Обновить'}</button></div></div>
    <p class="small muted" style="margin:0 0 16px">Топы Литнета${M ? ` · ${M.n} книг · срез ${fmtDate(M.date)}` : ''}${snap?.err ? ` · ${esc(snap.err)}` : ''}</p>`;
  if (!M) return { html: head + `<div class="card"><p class="muted" style="margin:0">${marketState.busy ? 'Читаю топы — это около двух минут.' : 'Срезов пока нет. Нажмите «Обновить» — первый снимется за пару минут, дальше приложение делает это само раз в сутки.'}</p></div>` };
  const few = M.n < 30;
  const maxT = Math.max(...M.tropeMap.map((t) => t.share), 0.01);
  const arrow = (t) => (t.delta == null || Math.abs(t.delta) < 0.05 ? '' : t.delta > 0 ? ` <span class="up">▲${Math.round(t.delta * 100)}</span>` : ` <span class="down">▼${Math.round(-t.delta * 100)}</span>`);
  const bRow = (b) => `<div class="mk-b"><div class="row between small"><span><b>${esc(b.name)}</b></span><span class="muted">${b.n} ${b.n === 1 ? 'книга' : b.n < 5 ? 'книги' : 'книг'} · в библ. обычно ${short(b.lib)}${b.interest ? ` · интерес ${x1(b.interest)}` : ''}</span></div><div class="progress"><i style="width:${(b.share * 100).toFixed(1)}%"></i></div></div>`;
  const moves = [
    M.movers.length ? sub('Быстрее всех набирают читателей') + `<div class="list">${more('mk-mv', M.movers.map((b) => bookRow(b, `<b class="up">+${num(b.perDay)}</b> в день`)), 4)}</div>` : '',
    M.fresh.length ? sub('Новые в топе') + `<div class="list">${more('mk-new', M.fresh.map((b) => bookRow(b, `${short(b.lib)} в библ.`)), 4)}</div>` : '',
    M.gone.length ? sub('Выпали') + `<div class="list">${more('mk-gone', M.gone.map((b) => bookRow(b, `было место ${b.n}`)), 3)}</div>` : '',
    M.odd.length ? sub('В топе при малом числе читателей') + `<p class="small muted" style="margin:0 0 4px">Библиотек в десятки раз меньше, чем у соседей (обычно ${short(M.medLib)}). Слежу, сколько дней продержатся.</p><div class="list">${more('mk-odd', M.odd.map((b) => bookRow(b, `место ${b.n} · ${short(b.lib)}${b.days > 1 ? ` · ${b.days} дн.` : ''}`)), 4)}</div>` : '',
  ].filter(Boolean).join('');
  return { html: `<section class="mk-page">${head}
    <div class="card"><h2 style="margin:0 0 8px">Главное</h2>${M.notes.slice(0, 6).map((n) => `<p style="margin:6px 0">${esc(n)}</p>`).join('')}
      ${few ? '<p class="small muted" style="margin:10px 0 0">Книг в срезе пока мало — выводы осторожные. После следующего обновления их станет больше.</p>' : ''}
      <p class="small muted" style="margin:10px 0 0">${M.prevDate ? `Изменения — против ${fmtDate(M.prevDate)} (${M.gap} дн. назад).` : 'Это первый срез: изменения за неделю появятся, когда будет с чем сравнить.'}</p></div>

    ${ranks.length ? `<div class="card"><h2 style="margin:0 0 4px">Ваши книги в топах</h2><p class="small muted" style="margin:0 0 6px">Место каждый день. Точки — дни выхода глав. Ищу книги до 12-й страницы топа.</p>
      ${ranks.map((r) => { const d = r.was != null ? r.was - r.now : null; return `<div class="mk-rank"><div class="row between" style="gap:10px;align-items:baseline"><div style="min-width:0"><b>${esc(r.title)}</b> <span class="small muted">· ${esc(r.srcName)}</span></div>
        <div style="white-space:nowrap"><span class="mk-place">${r.now}</span><span class="small muted"> место</span>${d ? ` <span class="small ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</span>` : ''}</div></div>
        ${rankChart(r.hist, relOf(r.title))}<div class="small muted">${[r.was != null ? `неделю назад — ${r.was}` : 'неделю назад — ещё не было среза', `лучшее — ${r.best}`, r.lib ? `${short(r.lib)} в библ.` : ''].filter(Boolean).join(' · ')}</div></div>`; }).join('')}</div>`
      : (c.settings.pseudonym ? '' : '')}
    ${watched.length || M.authors.length ? `<div class="card"><div class="row between" style="gap:10px"><h2 style="margin:0">Соперницы</h2><button class="link small" data-act="mk.watchAdd">+ Следить за автором</button></div>
      ${watched.length ? `<p class="small muted" style="margin:4px 0 6px">Новые книги, скидки и цены — по срезам топов (вижу только книги, что сейчас в топе).</p><div class="list">${watched.map((w) => `<div class="item"><div class="row between" style="gap:10px"><b>${esc(w.name)}</b><button class="link small" data-act="mk.watch" data-n="${esc(w.name)}">Не следить</button></div>
        ${w.events.length ? w.events.map((e) => `<div class="small"><span class="${e.kind === 'new' ? 'up' : e.kind === 'sale' ? 'down' : ''}">●</span> «${esc(e.title)}» — ${esc(e.text)}</div>`).join('') : ''}
        <div class="small muted">${w.books.length ? w.books.map((b) => `${esc(b.title)} — место ${b.n}${b.off ? `, скидка ${b.off} %` : ''}`).join(' · ') : 'сейчас в топе нет'}</div></div>`).join('')}</div>`
        : `<p class="small muted" style="margin:4px 0 0">Выберите до 10 авторов — приложение будет отмечать их новые книги, скидки и смену цены. Можно нажать «Следить» у автора в блоке «Как подают книгу».</p>`}</div>` : ''}
    ${M.fit.map((f) => `<div class="card"><div class="mk-cap">Ваша книга и рынок</div><h2 style="margin:0 0 10px">${esc(f.title)}</h2>
      <div class="mk-chips">${f.tropes.map((t) => `<button class="mk-chip" data-act="mk.trope" data-t="${esc(t.name)}"><b>${esc(t.name)}</b><span class="${(VERD[t.verdict] || [])[1] || 'muted'}">${t.verdict === 'few' || t.verdict === 'none' ? 'в топе редкость' : VERD[t.verdict][0]}</span><span class="muted">${t.n ? `${pc(t.share)} топа${t.interest != null ? ` · интерес ${x1(t.interest)}` : ''}` : 'в топе нет'}</span></button>`).join('')}</div>
      ${f.lines.map((n) => `<p style="margin:8px 0 0">${esc(n)}</p>`).join('')}
      ${f.near.length ? sub('Ближайшие по тропам книги топа') + `<div class="list">${more('mk-near-' + f.id, f.near.map((b) => bookRow(b, `${short(b.lib)} в библ.`)), 3)}</div>` : ''}</div>`).join('')}

    <div class="card"><h2 style="margin:0 0 4px">Портрет книги из топа</h2><p class="small muted" style="margin:0 0 10px">Обычные значения по срезу — с чем сравнивать свою книгу.</p>
      <div class="tiles"><div><div class="k">Цена</div><div class="v">${M.price.median != null ? Math.round(M.price.median) + ' ₽' : '—'}</div><div class="s">со скидкой ${pc(M.price.off)}</div></div>
        <div><div class="k">Объём</div><div class="v">${M.formula.pages ? Math.round(M.formula.pages) + ' стр.' : '—'}</div><div class="s">пишутся ${pc(M.progress)}</div></div>
        <div><div class="k">В библиотеках</div><div class="v">${short(M.formula.lib)}</div><div class="s">эксклюзив ${pc(M.excl)}</div></div>
        <div><div class="k">Добавляют из 100 открывших</div><div class="v">${M.formula.conv != null ? (M.formula.conv * 100).toFixed(1).replace('.', ',') : '—'}</div><div class="s">лайк ставит каждая ${M.formula.likes ? Math.round(1 / M.formula.likes) + '-я' : '—'}</div></div></div></div>

    ${M.tropeMap.length ? `<div class="card"><h2 style="margin:0 0 4px">Карта тропов</h2><p class="small muted" style="margin:0 0 12px">Полоса — сколько книг топа с этим тропом (конкуренция). «Интерес» — насколько охотнее обычного такие книги добавляют в библиотеку. «Рост» — насколько быстрее обычного книги с тропом набирают библиотеки за неделю. Сверху — где интерес выше. Нажмите на троп — откроются его книги.</p>
      ${more('mk-tr', M.tropeMap.map((t) => `<div class="mk-b mk-tr" data-act="mk.trope" data-t="${esc(t.name)}" role="button" tabindex="0"><div class="row between small" style="gap:4px 10px;flex-wrap:wrap"><span><b>${esc(t.name)}</b>${isMine(t.name) ? ' <span class="mk-me">ваш</span>' : ''} <span class="${VERD[t.verdict][1]}">· ${VERD[t.verdict][0]}</span></span><span style="white-space:nowrap">${spark(t.hist)}${pc(t.share)}${arrow(t)}${t.interest != null ? ` · интерес <b>${x1(t.interest)}</b>` : ''}${t.grow != null ? ` · рост <b class="${t.grow >= 1.3 ? 'up' : t.grow <= 0.7 ? 'down' : ''}">${x1(t.grow)}</b>` : ''}</span></div><div class="progress"><i style="width:${(t.share / maxT * 100).toFixed(1)}%"></i></div></div>`), 8)}
      ${M.pairs.length ? sub('Чаще всего вместе') + `<p class="small" style="margin:0">${M.pairs.map((p) => `${esc(p.name.toLowerCase())} <span class="muted">(${p.n})</span>`).join(' · ')}</p>` : ''}</div>` : ''}

    ${forecastCard(snap, src, isMine)}
    <div class="card"><h2 style="margin:0 0 4px">Цена и объём</h2><p class="small muted" style="margin:0 0 6px">Сколько книг топа в каждой вилке и как их читают.</p>
      ${sub('Цена')}${M.prices.map(bRow).join('')}${sub('Объём сейчас')}${M.sizes.map(bRow).join('')}</div>

    <div class="card"><h2 style="margin:0 0 8px">Как подают книгу</h2>
      <p style="margin:6px 0">Аннотация начинается с реплики героя у <b>${pc(M.pitch.dialogue)}</b> книг топа${M.pitch.emoji >= 0.1 ? `, со значками-эмодзи — у ${pc(M.pitch.emoji)}` : ''}.</p>
      ${M.pitch.titleWords.length ? `<p style="margin:6px 0">Слова, которые повторяются в названиях: ${M.pitch.titleWords.map((w) => `«${esc(w.word)}» <span class="muted">(${w.n})</span>`).join(', ')}.</p>` : ''}
      ${M.authors.length ? sub('Авторы с несколькими книгами в топе') + `<div class="list">${more('mk-au', M.authors.map((x) => `<div class="item"><div class="row between" style="gap:12px"><b>${esc(x.name)}</b><span class="small" style="white-space:nowrap">${x.n} ${x.n < 5 ? 'книги' : 'книг'} · ${short(x.lib)} в библ. · <button class="link small" data-act="mk.watch" data-n="${esc(x.name)}">${watchList.includes(x.name) ? 'Не следить' : 'Следить'}</button></span></div><div class="small muted">${x.titles.map(esc).join(' · ')}</div></div>`), 3)}</div>` : ''}</div>

    ${moves ? `<div class="card"><h2 style="margin:0 0 2px">Движение за неделю</h2>${moves}</div>` : ''}

    <div class="card"><h2 style="margin:0 0 6px">Топ сейчас</h2><div class="list">${more('mk-top', M.top.map((b) => bookRow(b, `${short(b.lib)} в библ.`)), 5)}</div></div>
    <p class="small muted" style="margin:14px 0 0">Источник — открытые страницы топов Литнета, раз в сутки. Чужие продажи и рекламные бюджеты не видит никто — здесь только то, что видит любой читатель.${c.settings.direct?.market?.srcs?.length ? ' <button class="link" data-act="mk.reset">Вернуть подборки по умолчанию</button>' : ''}</p></section>` };
}
acts['mk.scan'] = async () => { const a = window.__app; const p = scanMarket(a); a.rerender(); const r = await p; if (r) toast(r.got ? `Срез снят: подборок ${r.got}${r.err ? ' · ' + r.err : ''}` : 'Не получилось прочитать топы: ' + (r.err || 'нет ответа')); };
// книги одного тропа: чем они отличаются от топа и как себя подают
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
    <div class="mk-sub" style="margin-top:0">Книги — сверху те, что добавляют охотнее</div>
    <div class="list">${list.map((b) => `<div class="item"><div class="row between" style="gap:12px;align-items:flex-start"><div style="min-width:0"><a href="${esc(b.url)}" target="_blank" rel="noopener"><b>${esc(b.title)}</b></a>
      <div class="small muted">${[b.author, b.price > 0 ? Math.round(b.price) + ' ₽' : 'бесплатно', b.pages ? b.pages + ' стр.' : '', 'место ' + b.n].filter(Boolean).map(esc).join(' · ')}</div>
      ${b.ann ? `<div class="small mk-ann">${esc(b.ann.slice(0, 150))}${b.ann.length > 150 ? '…' : ''}</div>` : ''}</div>
      <span class="small" style="white-space:nowrap">${short(b.lib)}${b.conv != null ? `<br><span class="muted">${(b.conv * 100).toFixed(1).replace('.', ',')} из 100</span>` : ''}</span></div></div>`).join('')}</div>`, null);
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

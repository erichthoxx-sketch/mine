// «Рынок» (#/market): не витрина топа, а разбор — что отличает книги, которые читают, и где её место (13.11.2026: «рассчитывала на глубокую аналитику»).
// Порядок сверху вниз: выводы → портрет книги топа → карта тропов → цена и объём → подача → движение за неделю → сам топ. Расчёты — js/market.js.
import { esc, acts, changes, toast, openSheet, more } from '../../../js/ui.js';
import { num, fmtDate } from '../../../js/format.js';
import { marketInsights } from '../../../js/market.js';
import { scanMarket, marketSnap, marketState, srcsOf, okSrc, MARKET_DEFAULT } from '../marketscan.js';

const pc = (v) => Math.round(v * 100) + ' %';
const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' млн' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.', ',') + ' тыс.' : String(Math.round(n)));
const x1 = (v) => '×' + v.toFixed(1).replace('.', ',');
const bookRow = (b, right) => `<div class="item"><div class="row between" style="gap:12px;align-items:flex-start"><div style="min-width:0"><a href="${esc(b.url)}" target="_blank" rel="noopener"><b>${esc(b.title)}</b></a>
  <div class="small muted">${[b.author, b.tropes.slice(0, 4).join(', ').toLowerCase(), b.price > 0 ? Math.round(b.price) + ' ₽' : b.price === 0 ? 'бесплатно' : '', b.pages ? b.pages + ' стр.' : ''].filter(Boolean).map(esc).join(' · ')}</div></div>
  <span class="small" style="white-space:nowrap">${right}</span></div></div>`;
const VERD = { niche: ['ниша: читают охотно, книг мало', 'up'], hot: ['читают охотно, но тесно', ''], tired: ['перегрето', 'down'], weak: ['интерес ниже обычного', 'muted'], even: ['как в среднем', 'muted'] };
let lastM = null;
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

    ${M.fit.map((f) => `<div class="card"><div class="mk-cap">Ваша книга и рынок</div><h2 style="margin:0 0 10px">${esc(f.title)}</h2>
      <div class="mk-chips">${f.tropes.map((t) => `<button class="mk-chip" data-act="mk.trope" data-t="${esc(t.name)}"><b>${esc(t.name)}</b><span class="${(VERD[t.verdict] || [])[1] || 'muted'}">${t.verdict === 'few' || t.verdict === 'none' ? 'в топе редкость' : VERD[t.verdict][0]}</span><span class="muted">${t.n ? `${pc(t.share)} топа${t.interest != null ? ` · интерес ${x1(t.interest)}` : ''}` : 'в топе нет'}</span></button>`).join('')}</div>
      ${f.lines.map((n) => `<p style="margin:8px 0 0">${esc(n)}</p>`).join('')}
      ${f.near.length ? sub('Ближайшие по тропам книги топа') + `<div class="list">${more('mk-near-' + f.id, f.near.map((b) => bookRow(b, `${short(b.lib)} в библ.`)), 3)}</div>` : ''}</div>`).join('')}

    <div class="card"><h2 style="margin:0 0 4px">Портрет книги из топа</h2><p class="small muted" style="margin:0 0 10px">Обычные значения по срезу — с чем сравнивать свою книгу.</p>
      <div class="tiles"><div><div class="k">Цена</div><div class="v">${M.price.median != null ? Math.round(M.price.median) + ' ₽' : '—'}</div><div class="s">со скидкой ${pc(M.price.off)}</div></div>
        <div><div class="k">Объём</div><div class="v">${M.formula.pages ? Math.round(M.formula.pages) + ' стр.' : '—'}</div><div class="s">пишутся ${pc(M.progress)}</div></div>
        <div><div class="k">В библиотеках</div><div class="v">${short(M.formula.lib)}</div><div class="s">эксклюзив ${pc(M.excl)}</div></div>
        <div><div class="k">Добавляют из 100 открывших</div><div class="v">${M.formula.conv != null ? (M.formula.conv * 100).toFixed(1).replace('.', ',') : '—'}</div><div class="s">лайк ставит каждая ${M.formula.likes ? Math.round(1 / M.formula.likes) + '-я' : '—'}</div></div></div></div>

    ${M.tropeMap.length ? `<div class="card"><h2 style="margin:0 0 4px">Карта тропов</h2><p class="small muted" style="margin:0 0 12px">Полоса — сколько книг топа с этим тропом (конкуренция). «Интерес» — насколько охотнее обычного такие книги добавляют в библиотеку. Сверху — где интерес выше. Нажмите на троп — откроются его книги.</p>
      ${more('mk-tr', M.tropeMap.map((t) => `<div class="mk-b mk-tr" data-act="mk.trope" data-t="${esc(t.name)}" role="button" tabindex="0"><div class="row between small" style="gap:4px 10px;flex-wrap:wrap"><span><b>${esc(t.name)}</b>${isMine(t.name) ? ' <span class="mk-me">ваш</span>' : ''} <span class="${VERD[t.verdict][1]}">· ${VERD[t.verdict][0]}</span></span><span style="white-space:nowrap">${spark(t.hist)}${pc(t.share)}${arrow(t)}${t.interest != null ? ` · интерес <b>${x1(t.interest)}</b>` : ''}</span></div><div class="progress"><i style="width:${(t.share / maxT * 100).toFixed(1)}%"></i></div></div>`), 8)}
      ${M.pairs.length ? sub('Чаще всего вместе') + `<p class="small" style="margin:0">${M.pairs.map((p) => `${esc(p.name.toLowerCase())} <span class="muted">(${p.n})</span>`).join(' · ')}</p>` : ''}</div>` : ''}

    <div class="card"><h2 style="margin:0 0 4px">Цена и объём</h2><p class="small muted" style="margin:0 0 6px">Сколько книг топа в каждой вилке и как их читают.</p>
      ${sub('Цена')}${M.prices.map(bRow).join('')}${sub('Объём сейчас')}${M.sizes.map(bRow).join('')}</div>

    <div class="card"><h2 style="margin:0 0 8px">Как подают книгу</h2>
      <p style="margin:6px 0">Аннотация начинается с реплики героя у <b>${pc(M.pitch.dialogue)}</b> книг топа${M.pitch.emoji >= 0.1 ? `, со значками-эмодзи — у ${pc(M.pitch.emoji)}` : ''}.</p>
      ${M.pitch.titleWords.length ? `<p style="margin:6px 0">Слова, которые повторяются в названиях: ${M.pitch.titleWords.map((w) => `«${esc(w.word)}» <span class="muted">(${w.n})</span>`).join(', ')}.</p>` : ''}
      ${M.authors.length ? sub('Авторы с несколькими книгами в топе') + `<div class="list">${more('mk-au', M.authors.map((x) => `<div class="item"><div class="row between" style="gap:12px"><b>${esc(x.name)}</b><span class="small" style="white-space:nowrap">${x.n} ${x.n < 5 ? 'книги' : 'книг'} · ${short(x.lib)} в библ.</span></div><div class="small muted">${x.titles.map(esc).join(' · ')}</div></div>`), 3)}</div>` : ''}</div>

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

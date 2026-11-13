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
const sub = (t) => `<div class="mk-sub">${t}</div>`;

export function marketView(a) {
  const c = a.ctx(), snap = marketSnap(a), srcs = srcsOf(c.settings), ui = a.ui, src = srcs.some((s) => s.url === ui.mkSrc) ? ui.mkSrc : null;
  const mine = [...new Set((c.data.w_books || []).flatMap((b) => b.tags || []))], isMine = (t) => mine.some((x) => x.toLowerCase() === t.toLowerCase());
  const myPrices = (c.data.books || []).map((b) => Number((b.priceHistory || []).slice(-1)[0]?.price) || 0).filter(Boolean);
  const M = snap ? marketInsights(snap, { src, mine, myPrices }) : null;
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

    <div class="card"><h2 style="margin:0 0 4px">Портрет книги из топа</h2><p class="small muted" style="margin:0 0 10px">Обычные значения по срезу — с чем сравнивать свою книгу.</p>
      <div class="tiles"><div><div class="k">Цена</div><div class="v">${M.price.median != null ? Math.round(M.price.median) + ' ₽' : '—'}</div><div class="s">со скидкой ${pc(M.price.off)}</div></div>
        <div><div class="k">Объём</div><div class="v">${M.formula.pages ? Math.round(M.formula.pages) + ' стр.' : '—'}</div><div class="s">пишутся ${pc(M.progress)}</div></div>
        <div><div class="k">В библиотеках</div><div class="v">${short(M.formula.lib)}</div><div class="s">эксклюзив ${pc(M.excl)}</div></div>
        <div><div class="k">Добавляют из 100 открывших</div><div class="v">${M.formula.conv != null ? (M.formula.conv * 100).toFixed(1).replace('.', ',') : '—'}</div><div class="s">лайк ставит каждая ${M.formula.likes ? Math.round(1 / M.formula.likes) + '-я' : '—'}</div></div></div></div>

    ${M.tropeMap.length ? `<div class="card"><h2 style="margin:0 0 4px">Карта тропов</h2><p class="small muted" style="margin:0 0 12px">Полоса — сколько книг топа с этим тропом (конкуренция). «Интерес» — насколько охотнее обычного такие книги добавляют в библиотеку. Сверху — где интерес выше.</p>
      ${more('mk-tr', M.tropeMap.map((t) => `<div class="mk-b"><div class="row between small" style="gap:4px 10px;flex-wrap:wrap"><span><b>${esc(t.name)}</b>${isMine(t.name) ? ' <span class="mk-me">ваш</span>' : ''} <span class="${VERD[t.verdict][1]}">· ${VERD[t.verdict][0]}</span></span><span style="white-space:nowrap">${pc(t.share)}${arrow(t)}${t.interest != null ? ` · интерес <b>${x1(t.interest)}</b>` : ''}</span></div><div class="progress"><i style="width:${(t.share / maxT * 100).toFixed(1)}%"></i></div></div>`), 8)}
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

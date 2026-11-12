// «Рынок» (#/market): что сейчас в топах Литнета — тропы, цены, кто растёт. Расчёты — js/market.js, сбор — ../marketscan.js
import { esc, acts, toast, openSheet } from '../../../js/ui.js';
import { num, fmtDate } from '../../../js/format.js';
import { marketInsights } from '../../../js/market.js';
import { scanMarket, marketSnap, marketState, srcsOf, okSrc, MARKET_DEFAULT } from '../marketscan.js';

const pc = (v) => Math.round(v * 100) + ' %';
const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' млн' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.', ',') + ' тыс.' : String(n));
const bookRow = (b, right) => `<div class="item"><div class="row between" style="gap:12px;align-items:flex-start"><div style="min-width:0"><a href="${esc(b.url)}" target="_blank" rel="noopener"><b>${esc(b.title)}</b></a>
  <div class="small muted">${[b.author, b.tropes.slice(0, 4).join(', ').toLowerCase(), b.price > 0 ? Math.round(b.price) + ' ₽' : b.price === 0 ? 'бесплатно' : '', b.pages ? b.pages + ' стр.' : '', b.done ? 'завершена' : 'пишется'].filter(Boolean).map(esc).join(' · ')}</div></div>
  <span class="small" style="white-space:nowrap">${right}</span></div></div>`;

export function marketView(a) {
  const c = a.ctx(), snap = marketSnap(a), srcs = srcsOf(c.settings), ui = a.ui, src = srcs.some((s) => s.url === ui.mkSrc) ? ui.mkSrc : null;
  const mine = [...new Set((c.data.w_books || []).flatMap((b) => b.tags || []))];
  const M = snap ? marketInsights(snap, { src, mine }) : null;
  const head = `<div class="row between" style="margin-bottom:6px"><h2 style="margin:0">Рынок</h2><button class="small-btn" data-act="mk.scan"${marketState.busy ? ' disabled' : ''}>${marketState.busy ? 'Читаю топы…' : 'Обновить'}</button></div>
    <p class="small muted" style="margin:0 0 14px">Что сейчас в топах Литнета: тропы, цены и кто быстрее всех набирает читателей. Срез снимается сам раз в сутки${snap?.at ? ` · последний — ${fmtDate(snap.at.slice(0, 10))}` : ''}${snap?.err ? ` · ${esc(snap.err)}` : ''}.</p>
    <div class="lg-tabs" style="margin-bottom:14px"><button class="${!src ? 'on' : ''}" data-act="mk.src" data-u="">Всё вместе</button>${srcs.map((s) => `<button class="${src === s.url ? 'on' : ''}" data-act="mk.src" data-u="${esc(s.url)}">${esc(s.name)}</button>`).join('')}<button data-act="mk.add" title="Добавить подборку Литнета">+</button></div>`;
  if (!M) return { html: head + `<div class="card"><p class="muted" style="margin:0">${marketState.busy ? 'Читаю топы — это около минуты.' : 'Срезов пока нет. Нажмите «Обновить» — первый снимется за минуту, дальше приложение делает это само.'}</p></div>` };
  const maxT = Math.max(...M.tropes.map((t) => t.share), 0.01);
  const arrow = (t) => (t.delta == null || Math.abs(t.delta) < 0.05 ? '' : t.delta > 0 ? ` <span class="up">▲ ${Math.round(t.delta * 100)}</span>` : ` <span class="down">▼ ${Math.round(-t.delta * 100)}</span>`);
  return { html: `${head}
    <div class="card"><h2 style="margin:0 0 8px">Главное</h2>${M.notes.map((n) => `<p style="margin:6px 0">${esc(n)}</p>`).join('')}
      ${!M.prevDate ? '<p class="small muted" style="margin:10px 0 0">Это первый срез. Взлёты, новички и изменения по тропам появятся через несколько дней, когда будет с чем сравнить.</p>' : `<p class="small muted" style="margin:10px 0 0">Сравнение с ${fmtDate(M.prevDate)} (${M.gap} дн. назад).</p>`}</div>
    <div class="tiles"><div><div class="k">Книг в срезе</div><div class="v">${M.n}</div><div class="s">пишутся ${pc(M.progress)}</div></div>
      <div><div class="k">Обычная цена</div><div class="v">${M.price.median != null ? Math.round(M.price.median) + ' ₽' : '—'}</div><div class="s">бесплатных ${pc(M.price.free)}</div></div>
      <div><div class="k">Со скидкой</div><div class="v">${pc(M.price.off)}</div><div class="s">из платных книг</div></div>
      <div><div class="k">Эксклюзив Литнета</div><div class="v">${pc(M.excl)}</div><div class="s">объём сейчас ≈ ${M.pages ? Math.round(M.pages) + ' стр.' : '—'}</div></div></div>
    <div class="card"><h2 style="margin:0 0 4px">Тропы в топе</h2><p class="small muted" style="margin:0 0 10px">Доля книг топа, где троп виден в названии или аннотации. Стрелка — изменение в процентных пунктах.</p>
      ${M.tropes.slice(0, 14).map((t) => `<div class="bar-row"><div class="row between small"><span><b>${esc(t.name)}</b>${mine.some((x) => x.toLowerCase() === t.name.toLowerCase()) ? ' <span class="muted">· ваш</span>' : ''}</span><span>${pc(t.share)}${arrow(t)}</span></div><div class="progress"><i style="width:${(t.share / maxT * 100).toFixed(1)}%"></i></div></div>`).join('')}</div>
    ${M.movers.length ? `<div class="card"><h2 style="margin:0 0 4px">Растут быстрее всех</h2><p class="small muted" style="margin:0 0 6px">Сколько читателей в день добавляют книгу в библиотеку — самый честный открытый признак спроса.</p><div class="list">${M.movers.map((b) => bookRow(b, `<b class="up">+${num(b.perDay)}</b> в день`)).join('')}</div></div>` : ''}
    ${M.odd.length ? `<div class="card"><h2 style="margin:0 0 4px">В топе при малом числе читателей</h2><p class="small muted" style="margin:0 0 6px">У этих книг библиотек в десятки раз меньше, чем у соседей по топу (обычно здесь ${short(Math.round(M.medLib))}). Чем держится место — снаружи не видно: свежесть, продажи за короткий срок или награды. Слежу, сколько дней они простоят.</p><div class="list">${M.odd.map((b) => bookRow(b, `место ${b.n} · ${short(b.lib)} в библ.${b.days > 1 ? ` · в топе ${b.days} дн.` : ''}`)).join('')}</div></div>` : ''}
    ${M.fresh.length ? `<div class="card"><h2 style="margin:0 0 6px">Новые в топе</h2><div class="list">${M.fresh.map((b) => bookRow(b, `в библиотеках ${short(b.lib)}`)).join('')}</div></div>` : ''}
    ${M.gone.length ? `<div class="card"><h2 style="margin:0 0 6px">Выпали из топа</h2><div class="list">${M.gone.map((b) => bookRow(b, `было место ${b.n}`)).join('')}</div></div>` : ''}
    <div class="card"><h2 style="margin:0 0 6px">Топ сейчас</h2><div class="list">${M.top.map((b) => bookRow(b, `${short(b.lib)} в библиотеках`)).join('')}</div></div>
    <p class="small muted" style="margin:14px 0 0">Источник — открытые страницы топов Литнета, одна страница на подборку раз в сутки. Чужие продажи и рекламные бюджеты не видит никто — здесь только то, что видит любой читатель.${srcs !== MARKET_DEFAULT ? ' <button class="link" data-act="mk.reset">Вернуть подборки по умолчанию</button>' : ''}</p>` };
}
acts['mk.scan'] = async () => { const a = window.__app; const p = scanMarket(a); a.rerender(); const r = await p; if (r) toast(r.got ? `Срез снят: подборок ${r.got}${r.err ? ' · ' + r.err : ''}` : 'Не получилось прочитать топы: ' + (r.err || 'нет ответа')); };
acts['mk.src'] = (d) => { window.__app.ui.mkSrc = d.u || ''; };
acts['mk.add'] = () => {
  openSheet('Добавить подборку Литнета', `<p class="small">Откройте на Литнете нужный топ (жанр или поджанр) и вставьте сюда адрес страницы — например, https://litnet.com/ru/top/lyubovnye-romany.</p>
    <label>Адрес страницы топа</label><input name="u" required placeholder="https://litnet.com/ru/top/…" autocomplete="off"><label>Как назвать</label><input name="n" placeholder="Литнет · современный любовный роман">`, async (fd) => {
    const a = window.__app, u = String(fd.get('u') || '').trim().split('?')[0].replace(/\/$/, '');
    if (!okSrc(u)) { toast('Нужен адрес топа Литнета вида https://litnet.com/ru/top/…'); return false; }
    const d = a.ctx().settings.direct || {}, list = srcsOf(a.ctx().settings).filter((s) => s.url !== u);
    await a.store.saveSettings({ direct: { ...d, market: { ...(d.market || {}), srcs: [...list, { name: String(fd.get('n') || '').trim() || 'Литнет · ' + u.split('/').pop(), url: u }].slice(0, 6) } } });
    scanMarket(a).then(() => a.rerender());
  }, { submitText: 'Добавить' });
  return false;
};
acts['mk.reset'] = async () => { const a = window.__app, d = a.ctx().settings.direct || {}; await a.store.saveSettings({ direct: { ...d, market: { ...(d.market || {}), srcs: [] } } }); };

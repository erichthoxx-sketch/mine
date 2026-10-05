import { esc, acts, changes, openSheet, opt, toast, uid, ask } from '../../../js/ui.js';
import { rub, fmtDate } from '../../../js/format.js';
import { incomeSeries, sumSeries, addDays, monthKey, campaignMetrics } from '../../../js/calc.js';
import { resizeImage } from '../../../js/img.js';
import * as drive from '../drive.js';

const app = () => window.__app;
export const MTYPES = { banner: 'Баннер', cover: 'Обложка', other: 'Другое' };

function salesCard(c, wb) {
  const d = c.data;
  const legacy = d.days.filter((x) => x.income != null);
  const incomeId = wb ? c.incomeIdOf(wb) : null;
  if (wb && !incomeId) return `<div class="card"><p class="small muted">Книга «${esc(wb.title)}» не связана с книгой в приложении доходов. Откройте книгу и выберите её в поле «Книга в приложении доходов».</p></div>`;
  if (!d.sales.length) return '<div class="card"><p class="small muted">Продаж пока нет — загрузите выгрузку Литнета в приложении доходов.</p></div>';
  const end = c.dataEnd;
  const s30 = incomeSeries(d.sales, legacy, addDays(end, -29), end, incomeId);
  const mtd = incomeSeries(d.sales, legacy, monthKey(end) + '-01', end, incomeId);
  const camps = d.campaigns.filter((k) => (!incomeId || !k.bookId || k.bookId === incomeId) && k.start && k.start <= end && (!k.end || k.end >= addDays(end, -30)));
  const ctx = { sales: d.sales, legacyDays: legacy, reports: d.reports, campaigns: d.campaigns, dataEnd: end, baseDays: c.settings.baseDays };
  return `<div class="card"><h2>Продажи${wb ? ': ' + esc(wb.title) : ''}</h2>
    <div class="grid3"><div><div class="small muted">за 30 дней</div><div class="big">${rub(sumSeries(s30), 0)}</div></div>
    <div><div class="small muted">в этом месяце</div><div class="big">${rub(sumSeries(mtd), 0)}</div></div>
    <div><div class="small muted">в день (30 дн.)</div><div class="big">${rub(sumSeries(s30) / 30, 0)}</div></div></div>
    <div class="small muted" style="margin-top:6px">данные по ${fmtDate(end)} · ${s30.reduce((a, x) => a + x.qty, 0)} шт. за 30 дней</div>
    ${camps.length ? `<h3>Реклама</h3>${camps.map((k) => { const m = campaignMetrics(k, ctx); return `<div class="item small"><b>${esc(k.name)}</b> · ${fmtDate(k.start)}–${fmtDate(k.end) || '…'}${m.payback == null ? '' : ` · <span class="${m.payback >= 0 ? 'up' : 'down'}">${m.payback >= 0 ? '▲ окупается' : '▼ не окупается'} ${rub(m.payback, 0)}/день</span>`}</div>`; }).join('')}` : ''}
    <div style="margin-top:10px"><a class="btn" href="../">Подробно в приложении доходов →</a></div></div>`;
}

export function marketingView(a) {
  const c = a.ctx(), sel = a.ui.mBook;
  const wb = sel ? c.wbooksById[sel] : null;
  const media = [...c.data.w_media].filter((m) => !sel || m.bookId === sel).sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
  const html = `<div class="chips"><button class="chip${!sel ? ' on' : ''}" data-act="mk.book" data-v="">Все книги</button>${c.wbooks.map((b) => `<button class="chip${sel === b.id ? ' on' : ''}" data-act="mk.book" data-v="${b.id}">${esc(b.title.slice(0, 26))}</button>`).join('')}</div>
  ${salesCard(c, wb)}
  <div class="row between" style="margin:16px 0 10px"><h2 style="margin:0">Баннеры и обложки</h2>
    <label class="btn primary">+ Загрузить<input type="file" accept="image/*" multiple data-chg="mk.upload" hidden></label></div>
  ${drive.isConnected() && c.settings.wMarketingFolder ? '' : '<p class="small muted">Оригиналы сохраняются в папку «Маркетинг» на Google Диске, когда Диск подключён и папка выбрана (⚙️ Настройки). Без этого сохранится только уменьшенная копия.</p>'}
  ${media.length ? `<div class="gallery">${media.map((m) => `<button class="g-item" data-act="mk.open" data-id="${m.id}"><img src="${m.thumb}" alt="${esc(m.name || '')}"><span class="tag on">${MTYPES[m.type] || MTYPES.other}</span></button>`).join('')}</div>` : '<div class="card"><p class="muted">Пока пусто. Загрузите баннеры для рекламы и обложки — они будут под рукой с телефона.</p></div>'}`;
  return { html };
}

// Сохранить картинку: уменьшенная копия — в базу (быстро и с телефона), оригинал — на Google Диск
export async function saveMedia(file, { type = 'banner', bookId = '', thumb } = {}) {
  const c = app().ctx();
  const item = { id: 'm' + uid(), name: file.name, type, bookId, thumb: thumb || await resizeImage(file, 600), createdAt: new Date().toISOString() };
  if (drive.isConnected() && c.settings.wMarketingFolder) {
    try { const f = await drive.uploadFile(file, file.name, c.settings.wMarketingFolder); item.driveId = f.id; item.webViewLink = f.webViewLink; } catch (e) { toast('На Диск не загрузилось: ' + e.message); }
  }
  await app().store.put('w_media', item);
  return item;
}
acts['mk.book'] = (d) => { app().ui.mBook = d.v; };
changes['mk.upload'] = async (v, el) => {
  const files = [...el.files]; el.value = '';
  if (!files.length) return;
  toast('Загружаю…');
  for (const f of files) { try { await saveMedia(f, { bookId: app().ui.mBook || '' }); } catch (e) { toast(e.message); } }
  toast(`Загружено: ${files.length}`);
};
acts['mk.open'] = (d) => {
  const c = app().ctx(), m = c.data.w_media.find((x) => x.id === d.id);
  openSheet(m.name || 'Картинка', `<img src="${m.thumb}" alt="" style="width:100%;border-radius:16px">
    ${m.webViewLink ? `<p><a class="btn" href="${esc(m.webViewLink)}" target="_blank" rel="noopener">Открыть оригинал на Google Диске</a></p>` : '<p class="small muted">Оригинал не на Диске — сохранена уменьшенная копия.</p>'}
    <div class="f2"><div><label for="mt">Тип</label><select id="mt" name="type">${Object.entries(MTYPES).map(([k, v]) => opt(k, v, m.type)).join('')}</select></div>
    <div><label for="mb">Книга</label><select id="mb" name="bookId"><option value="">—</option>${c.wbooks.map((b) => opt(b.id, b.title, m.bookId)).join('')}</select></div></div>
    <p><button type="button" class="link danger" data-act="mk.del" data-id="${m.id}">Убрать из галереи</button></p>`, async (fd) => {
    await app().store.put('w_media', { ...m, type: fd.get('type'), bookId: fd.get('bookId') || '' });
  });
};
acts['mk.del'] = async (d) => {
  if (!(await ask('Убрать картинку из галереи? Оригинал на Google Диске останется.', 'Убрать'))) return;
  await app().store.remove('w_media', d.id);
};

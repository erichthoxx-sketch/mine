// Мировой книжный рынок: RSS-заголовки и карта источников. Ссылки не равны API.
import { acts, esc, toast } from '../../../js/ui.js';
import { MARKET_INTEL_SOURCES, MARKET_INTEL_FEEDS } from '../marketintel.js';
import { intelSnap, intelState, scanMarketIntel } from '../marketnews.js';
const fmt = (s) => { if (!s) return 'дата не указана'; const d = new Date(s);
  return Number.isNaN(+d) ? 'дата не указана' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); };
const link = (u) => /^https:\/\//.test(String(u || '')) ? u : '#';
const newsItem = (x) => '<div class="item" style="padding:8px 0"><div class="row between" style="gap:12px;align-items:flex-start">' +
  '<a href="' + esc(link(x.url)) + '" target="_blank" rel="noopener noreferrer"><b>' + esc(x.title || 'Материал') + '</b></a>' +
  '<span class="small muted" style="white-space:nowrap">' + esc(fmt(x.date)) + '</span></div>' +
  '<div class="small muted">' + esc(x.source) + ' · ' + esc(x.lang || 'EN') +
  (x.description ? ' · ' + esc(x.description.slice(0, 120)) : '') + '</div></div>';
const resource = (s) => '<div class="item" style="padding:9px 0"><div class="row between" style="gap:10px">' +
  '<a href="' + esc(link(s.url)) + '" target="_blank" rel="noopener noreferrer"><b>' + esc(s.name) + '</b></a>' +
  '<span class="small muted">' + esc(s.mode) + '</span></div><div class="small muted">' + esc(s.note) + '</div></div>';
export function marketWorldView(a) {
  const snap = intelSnap(a), items = snap?.items || [], statuses = snap?.statuses || [], checked = snap?.attemptedAt,
    passed = statuses.filter((s) => s.ok).length, types = [...new Set(MARKET_INTEL_SOURCES.map((s) => s.group))];
  const error = statuses.some((s) => !s.ok) ? '<p class="small warnc">Не ответили: ' +
    statuses.filter((s) => !s.ok).map((s) => esc(s.name + ' — ' + s.error)).join(' · ') +
    '. Старые данные сохраняются, новые не выдумываются.</p>' : '';
  const news = items.length ? '<div class="list">' + items.slice(0, 10).map(newsItem).join('') + '</div>' +
    (items.length > 10 ? '<details><summary>Еще ' + (items.length - 10) + ' материалов</summary><div class="list">' +
      items.slice(10).map(newsItem).join('') + '</div></details>' : '') :
    '<p class="small muted">Заголовков пока нет. Нажми «Обновить новости». Amazon и Reddit отслеживаются отдельно: это публичные ссылки, а не RSS-ленты.</p>';
  const resourceList = types.map((group) => '<details' + (group === 'Международные продажи' || group === 'Голос читательниц' ? ' open' : '') + '>' +
    '<summary><b>' + esc(group) + '</b> <span class="small muted">(' +
    MARKET_INTEL_SOURCES.filter((s) => s.group === group).length + ')</span></summary><div class="list">' +
    MARKET_INTEL_SOURCES.filter((s) => s.group === group).map(resource).join('') + '</div></details>').join('');
  return '<section class="mk-global"><div class="card">' +
    '<div class="row between" style="gap:10px;align-items:center"><h2 style="margin:0">Мировой книжный рынок</h2>' +
    '<button class="small-btn" data-act="mk.world.scan"' + (intelState.busy ? ' disabled' : '') + '>' +
    (intelState.busy ? 'Проверяю…' : 'Обновить новости') + '</button></div>' +
    '<p class="small muted" style="margin:8px 0">Romance, dark romance, young adult, спорт, самиздат, издательства, экранизации и международные права. Литнет — отдельный блок ниже.</p>' +
    '<p class="small muted">Сохранено заголовков: ' + items.length + '. Ответило RSS-источников: ' + passed + ' из ' + MARKET_INTEL_FEEDS.length +
    (checked ? '. Последняя попытка ' + esc(fmt(checked)) : '. Еще не проверяли') +
    '. Автопроверка раз в день, только пока открыто приложение.</p>' + error + news + '</div>' +
    '<div class="card"><h2 style="margin:0 0 6px">Карта источников</h2>' +
    '<p class="small muted" style="margin:0 0 10px">Амазон: публичные рейтинги, не реальные продажи. Reddit: ссылки на обсуждения, без неразрешенного API-сбора. Источники с пометкой «ссылка» не обновляются автоматически.</p>' +
    resourceList + '</div></section>';
}
acts['mk.world.scan'] = async () => {
  const a = window.__app;
  if (intelState.busy) return false;
  const p = scanMarketIntel(a);
  a.rerender();
  try { const r = await p; if (r) toast(r.updated ? 'Мировой рынок: ' + r.updated + ' заголовков из ' + r.sources + ' лент' : 'Новостей не получено; посмотри карту источников или попробуй позже.'); }
  catch (e) { toast('Новости не получены: ' + (e.message || e)); }
  a.rerender(); return false;
};

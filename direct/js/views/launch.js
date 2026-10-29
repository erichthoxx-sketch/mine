// План запуска рекламы книги по фазам: подготовка → бесплатные главы (копим библиотеку) → подписка (продаём).
// Даты и ссылка берутся сами (Мастерская, сайт), цели — из Метрики. В Директе приложение само ничего не включает:
// кампанию запускает владелица в кабинете, здесь — что и когда сделать, конструктор черновика и цифры теста.
import { esc, forms, changes, toast, ask, N, opt } from '../../../js/ui.js';
import { rub, num, fmtShort } from '../../../js/format.js';
import { firstLaunchOf, launchMetrics, PHASES, pickLaunchBook } from '../launchcalc.js';
import { resolvedLaunch, switchLaunch } from './launchctx.js';
import { demo } from '../demo.js';
import { creatorCard } from './creator.js';

const app = () => window.__app;
const saveLaunch = async (patch) => {
  const a = app(), d = a.ctx().settings.direct || {};
  await a.store.saveSettings({ direct: { ...d, firstLaunch: { ...firstLaunchOf(a.ctx().settings), ...patch } } });
};
const money = (v) => rub(v, 0);
const SRC = { workshop: 'из Мастерской', site: 'с сайта', plan: 'вписано здесь' };
const MANUAL = ['creativeReady', 'limitVerified', 'goalVerified', 'buySwitched', 'limit2Verified'];
const phaseRange = (p, id) => (id === 'prep' ? (p.pubDate ? `до ${fmtShort(p.pubDate)}` : '') : id === 'free' ? (p.pubDate ? `${fmtShort(p.pubDate)}${p.subDate ? ' – ' + fmtShort(p.subDate) : ''}` : '') : p.subDate ? `с ${fmtShort(p.subDate)}` : 'дата не известна');

// Шкала фаз и «что сейчас» — общая для Обзора и плана
export function launchStrip(p) {
  const i = PHASES.findIndex((x) => x.id === p.phase);
  return `<div class="fl-phases">${PHASES.map((x, k) => `<div class="fl-ph ${k < i ? 'past' : k === i ? 'on' : ''}"><span class="fl-dot"></span><b>${x.name}</b><span class="small muted">${esc(phaseRange(p, x.id))}</span></div>`).join('')}</div>`;
}
const stepRow = (s) => `<div class="fl-check-item ${s.ok ? 'fl-check-done' : ''}">${MANUAL.includes(s.flag) ? `<input type="checkbox" data-chg="fl.check" data-k="${s.flag}"${s.ok ? ' checked' : ''}>` : `<span class="fl-check-icon" aria-hidden="true">${s.ok ? '✓' : '○'}</span>`}<span>${esc(s.text)}${!s.ok && s.how ? `<span class="sub">${esc(s.how)}</span>` : ''}</span></div>`;
const FLAG = { creative: 'creativeReady', limit: 'limitVerified', goal: 'goalVerified', switch: 'buySwitched', limit2: 'limit2Verified' };
export const phaseSteps = (p) => (p.steps[p.phase] || []).map((s) => ({ ...s, flag: FLAG[s.id] }));

// Настройка кампании под книгу — конкретно, на цифрах плана
function setupHtml(p) {
  const lib = p.lib?.name || 'Добавление в библиотеку', buy = p.buy?.name || 'Покупка книги', lv = p.libValue;
  return `<div class="list fl-how">
    <div class="item"><b>Тип и места</b><div class="small">Единая перфоманс-кампания: поиск и рекламная сеть вместе. На поиске — те, кто ищет такие книги; в сетях — обложка, которая цепляет глаз.</div></div>
    <div class="item"><b>Куда ведёт</b><div class="small">Страница книги на Литнете${p.bookUrl ? `: <span class="muted">${esc(p.bookUrl)}</span>` : ' (ссылка появится после создания книги)'}. Не на сайт: каждый лишний шаг теряет часть читателей.</div></div>
    <div class="item"><b>Стратегия и цели</b><div class="small">«Максимум конверсий», оплата за клики. Целевые действия: «${esc(lib)}» и «${esc(buy)}»${lv ? ` с ценностью: библиотека ≈ ${money(lv.value)}, покупка ≈ ${money(p.royalty)}` : ''}. До подписки купить нельзя — Директ учится на библиотеке; со старта подписки покупка становится главной, и учиться заново почти не приходится.${lv ? `<span class="sub">Ценность библиотеки = доход с покупки × доля добавивших, кто покупает (${lv.measured ? 'по вашей Метрике' : 'пока данных мало — осторожно 15 %'}: ${Math.round(lv.share * 100)} %).</span>` : '<span class="sub">Ценность посчитается сама, когда появится доход с покупки (из «Доходов» или впишите ниже).</span>'}</div></div>
    <div class="item"><b>Бюджет</b><div class="small">Всего ${money(p.money.budget)}: на бесплатные главы ${money(p.money.freeBudget)} (≈ ${money(p.money.freeWeek)} в неделю), на подписку ${money(p.money.paidBudget)} (≈ ${money(p.money.paidWeek)} в неделю, три недели). Ставьте недельный бюджет, а не дневной — Директу нужна свобода распределять.</div></div>
    <div class="item"><b>Объявления</b><div class="small">2–3 заголовка про главный конфликт и троп, а не про жанр вообще; обложка — для сетей. Обещание должно совпадать с книгой.</div></div>
    <div class="item"><b>Минус-слова сразу</b><div class="small">бесплатно, скачать, fb2, epub, txt, торрент, аудиокнига, фильм, сериал, краткое содержание — приложение потом само подскажет новые по запросам.</div></div>
    <div class="item"><b>Чего не делать</b><div class="small">Первые 7 дней не менять настройки (Директ учится), не поднимать ставки ради скорости, не судить по 2–3 дням.</div></div>
  </div>`;
}

export function launchView(a) {
  const c = a.ctx(), { fl, plan: p } = resolvedLaunch(a), stats = a.snap('stats') || {};
  const main = a.snap('main') || { campaigns: [] };
  const available = (main.campaigns || []).filter((x) => x.state !== 'ARCHIVED');
  const running = !!fl.actualStart, steps = phaseSteps(p), done = steps.filter((s) => s.ok).length;
  const xl = launchMetrics(fl, { daily: stats.daily || [], conv: stats.conv || [], today: c.today, goalId: p.lib?.id });
  const xb = launchMetrics(fl, { daily: stats.daily || [], conv: stats.conv || [], today: c.today, goalId: p.buy?.id });
  return { html: `
    ${demo.on ? '<div class="alert">Открыт пример данных: план можно заполнять, но кампании примера к нему не привязываются.</div>' : ''}
    <div class="card fl-panel">
      <div class="row between"><h2 style="margin:0">Запуск «${esc(p.book)}»</h2>${p.daysToNext != null && p.daysToNext >= 0 ? `<span class="small muted">${p.daysToNext === 0 ? 'сегодня' : `через ${num(p.daysToNext)} дн.`}: ${esc(p.next.text)}</span>` : ''}</div>
      ${launchStrip(p)}
      <h3 class="fl-now">Сейчас: ${p.phase === 'prep' ? 'готовим кампанию' : p.phase === 'free' ? 'копим добавления в библиотеку' : 'продаём подписку'} <span class="small muted">${done} из ${steps.length}</span></h3>
      <div class="fl-checklist">${steps.map(stepRow).join('')}</div>
    </div>
    <div class="card fl-panel"><details class="d-more"${p.phase === 'prep' ? ' open' : ''}><summary>Как настроить кампанию под книгу</summary>${setupHtml(p)}</details></div>
    <div class="card fl-panel"><details class="d-more"${!p.subDate || !p.bookUrl ? ' open' : ''}><summary>Даты, ссылка и деньги</summary>
      <p class="small muted">Первая глава — ${p.pubDate ? `${fmtShort(p.pubDate)} (${SRC[p.src.pub]})` : 'не задана'} · старт подписки — ${p.subDate ? `${fmtShort(p.subDate)} (${SRC[p.src.sub]})` : 'пока не известен: поставьте на сайте в книге «Дата старта подписки» или здесь'} · ссылка — ${p.bookUrl ? SRC[p.src.url] : 'нет'}${p.royalty ? ` · доход с покупки ≈ ${money(p.royalty)}` : ''}</p>
      <label for="flBook">Книга</label>
      <select id="flBook" data-chg="fl.book"><option value="">Актуальная — выбирается сама${fl.bookManual ? '' : `: ${esc(p.book)}`}</option>${(c.data.w_books || []).filter((b) => b.title && (b.status || 'progress') !== 'idea').map((b) => opt(b.title, b.title, fl.bookManual ? fl.book : '')).join('')}</select>
      <p class="small muted">Сама — самая новая книга, у которой первая глава уже вышла или выйдет в ближайшие 45 дней (по Мастерской). Прошлые планы сохраняются.</p>
      <form data-form="fl.plan" class="settings-form fl-form">
        <div class="f2"><div><label>Первая глава</label><input name="publicationDate" type="date" value="${esc(p.pubDate)}"></div>
          <div><label>Старт подписки</label><input name="subscriptionDate" type="date" value="${esc(p.subDate)}"></div></div>
        <div class="f2"><div><label>Бюджет теста, ₽</label><input name="budget" inputmode="decimal" value="${esc(fl.budget)}" required></div>
          <div><label>Доход с одной покупки, ₽</label><input name="royalty" inputmode="decimal" value="${esc(fl.royalty)}" placeholder="${p.royalty && !fl.royalty ? Math.round(p.royalty) + ' — из «Доходов»' : 'после выбора цены'}"></div></div>
        <label>Ссылка на книгу на Литнете</label><input name="bookUrl" type="url" value="${esc(fl.bookUrl)}" placeholder="${esc(p.bookUrl || 'https://litnet.com/ru/book/...')}">
        <div class="row d-save"><button type="submit" class="primary">Сохранить</button></div>
      </form></details></div>
    <div class="card fl-panel"><details class="d-more"${p.phase === 'prep' && !p.picked ? ' open' : ''}><summary>Черновик кампании${p.picked ? `: «${esc(p.picked.name)}»` : ''}</summary>
      ${creatorCard(a, fl, null)}
      <label for="flCampaign">Кампания этого запуска</label>
      <select id="flCampaign" data-chg="fl.campaign"><option value="">Не выбрана</option>${available.map((x) => opt(x.id, x.name + (x.state === 'ON' ? ' · включена' : ' · не запущена'), fl.campaignId)).join('')}</select>
      <p class="small"><a href="https://direct.yandex.ru/" target="_blank" rel="noopener">Открыть Яндекс Директ ↗</a> · <button class="link" data-act="d.reload">Обновить кампании</button></p>
    </details></div>
    <div class="card fl-panel"><h2>Цифры запуска</h2>
      ${!running ? `<p class="small">Когда включите кампанию в кабинете, отметьте день — с него считаются расход, библиотека и покупки именно этого запуска.</p>
        <form data-form="fl.launch" class="settings-form fl-form"><label>День начала показов</label><input type="date" name="actualStart" value="${c.today}" max="${c.today}" required>
        <div class="row d-save"><button class="primary" type="submit"${p.picked ? '' : ' disabled'}>Я включила рекламу</button></div></form>${p.picked ? '' : '<p class="small muted">Сначала выберите кампанию выше.</p>'}`
      : `<div class="tiles d-tiles fl-tiles">
          <div><div class="k">Расход</div><div class="v">${money(xl.spent)}</div><div class="s">из ${money(xl.budget)}</div></div>
          <div><div class="k">Клики</div><div class="v">${num(xl.clicks)}</div></div>
          <div><div class="k">В библиотеку</div><div class="v">${xl.conversions == null ? '—' : num(xl.conversions)}</div><div class="s">${xl.cpa != null ? `по ${money(xl.cpa)}` : ''}</div></div>
          <div><div class="k">Покупки</div><div class="v">${xb.conversions == null ? '—' : num(xb.conversions)}</div><div class="s">${xb.cpa != null ? `по ${money(xb.cpa)}` : ''}</div></div>
        </div>
        <p class="small muted">С ${fmtShort(fl.actualStart)}, только кампания «${esc(p.picked?.name || fl.campaignId)}». Покупки — те, что Директ отнёс к рекламе; настоящий доход сверяется в «Доходах».</p>
        <form data-form="fl.fixDate" class="settings-form"><div class="row"><input type="date" name="actualStart" value="${esc(fl.actualStart)}" max="${c.today}" required><button type="submit">Исправить дату</button></div></form>`}
    </div>` };
}

forms['fl.plan'] = async (fd) => {
  const budget = N(fd.get('budget'));
  if (!(budget > 0)) { toast('Бюджет должен быть больше нуля'); return false; }
  const pub = fd.get('publicationDate') || '', sub = fd.get('subscriptionDate') || '';
  if (pub && sub && sub < pub) { toast('Подписка не может начаться раньше первой главы'); return false; }
  const { plan } = resolvedLaunch(app()), royalty = N(fd.get('royalty'));
  // своё вписывается только если отличается от того, что пришло из Мастерской и с сайта — иначе источник остаётся главным
  await saveLaunch({
    budget, royalty: royalty > 0 ? royalty : '',
    ...(pub && pub !== (plan.wb?.publishStart || '') ? { publicationDate: pub, pubManual: true } : { pubManual: false }),
    subscriptionDate: sub && sub !== (plan.sb?.startDate || '') ? sub : '',
    bookUrl: String(fd.get('bookUrl') || '').trim(),
  });
  toast('Сохранено');
};
changes['fl.check'] = async (value, el, on) => { if (MANUAL.includes(el.dataset.k)) await saveLaunch({ [el.dataset.k]: !!on }); };
changes['fl.book'] = async (value) => {
  const a = app(), c = a.ctx();
  await switchLaunch(a, value || pickLaunchBook(c.data.w_books || [], c.today) || firstLaunchOf(c.settings).book, { manual: !!value });
  toast(value ? `План запуска — «${value}»` : 'Книга запуска выбирается сама');
};
changes['fl.campaign'] = async (value) => { await saveLaunch({ campaignId: String(value || '') }); };
forms['fl.launch'] = async (fd) => {
  const fl = firstLaunchOf(app().ctx().settings), date = String(fd.get('actualStart') || '');
  if (fl.actualStart) { toast('Старт уже отмечен'); return false; }
  if (!date || date > app().ctx().today) { toast('Проверьте дату'); return false; }
  if (!(await ask(`Отметить ${fmtShort(date)} как день начала показов? В Директе это ничего не включает.`, 'Отметить'))) return false;
  await saveLaunch({ actualStart: date });
  toast('Отмечено — цифры запуска считаются с этого дня');
};
forms['fl.fixDate'] = async (fd) => {
  const date = String(fd.get('actualStart') || '');
  if (!date || date > app().ctx().today) { toast('Проверьте дату'); return false; }
  await saveLaunch({ actualStart: date }); toast('Дата исправлена');
};

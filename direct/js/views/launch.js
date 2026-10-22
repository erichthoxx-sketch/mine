// Первый самостоятельный запуск рекламы: план под новую книгу, подготовка, проверка и отдельные цифры.
// Ничего в Яндекс Директе не меняет: создание и запуск кампании — только в кабинете владелицы.
import { esc, acts, forms, changes, toast, ask, N, opt } from '../../../js/ui.js';
import { rub, num, fmtShort } from '../../../js/format.js';
import { firstLaunchOf, launchReadiness, launchMetrics } from '../launchcalc.js';
import { metrikaOf } from './metrika.js';
import { demo } from '../demo.js';

const app = () => window.__app;
const saveLaunch = async (patch) => {
  const a = app(), d = a.ctx().settings.direct || {};
  await a.store.saveSettings({ direct: { ...d, firstLaunch: { ...firstLaunchOf(a.ctx().settings), ...patch } } });
};
const stateTag = (text, good) => `<span class="d-st ${good ? 'good' : ''}">● ${esc(text)}</span>`;
const money = (v) => rub(v, 0);
const checked = (value) => value ? ' checked' : '';
const verifiedItem = (ok, text) => `<div class="small ${ok ? 'up' : 'muted'}">${ok ? '✓' : '○'} ${esc(text)}</div>`;

export function launchView(a) {
  const c = a.ctx(), fl = firstLaunchOf(c.settings), m = metrikaOf(c);
  const main = a.snap('main') || { campaigns: [] }, stats = a.snap('stats') || {};
  const all = main.campaigns || [];
  const available = all.filter((x) => x.state !== 'ARCHIVED').sort((x, y) => (x.state === 'ON' ? -1 : 0) - (y.state === 'ON' ? -1 : 0));
  const r = launchReadiness(fl, { today: c.today, campaigns: demo.on ? [] : all, metrika: demo.on ? null : m });
  const x = launchMetrics(fl, { daily: stats.daily || [], conv: stats.conv || [], today: c.today, goalId: r.goal?.id });
  const running = !!fl.actualStart, complete = r.checks.filter((ch) => ch.ok).length;
  const goals = (m?.main || []).map(String);
  const goalNames = (m?.goals || []).filter((g) => goals.includes(String(g.id))).map((g) => g.name);
  return { html: `
    <div class="card">
      <div class="row between"><h2 style="margin:0">Мой первый запуск</h2>${stateTag(running ? 'идет тест' : 'подготовка', running)}</div>
      <p>Первый самостоятельный рекламный тест для книги <b>«${esc(fl.book)}»</b>. Твоя цель — разобраться, как получать покупателей из своего Директа, а не просто тратить рекламный бюджет.</p>
      <div class="tiles d-tiles">
        <div><div class="k">Бюджет теста</div><div class="v">${money(fl.budget)}</div></div>
        <div><div class="k">Расход именно теста</div><div class="v">${running ? money(x.spent) : '—'}</div></div>
        <div><div class="k">Старт рекламы</div><div class="v">${running ? fmtShort(fl.actualStart) : 'не начат'}</div></div>
      </div>
      <p class="small muted">1 ноября — начало подготовки, 9 ноября — первая публикация. День 1 рекламного теста наступит только после открытия подписки и твоего фактического запуска кампании в Яндексе.</p>
      ${demo.on ? '<p class="small warnc">Сейчас открыт демонстрационный режим. Первый запуск можно настраивать, но примерные кампании нельзя привязать к настоящему тесту.</p>' : ''}
    </div>
    <div class="card">
      <div class="row between"><h2 style="margin:0">1. Книга и экономика</h2>${stateTag(fl.subscriptionOpen && fl.subscriptionDate && fl.subscriptionDate <= c.today ? 'подписка открыта' : 'готовим книгу', !!fl.subscriptionOpen && !!fl.subscriptionDate && fl.subscriptionDate <= c.today)}</div>
      <p class="small">Начало публикации — <b>9 ноября</b>. Подписку планируем открыть после 4–5 глав; дата пока не утверждена. Реклама с оплатой начинается уже после этого.</p>
      <form data-form="fl.plan" class="settings-form">
        <div class="f2">
          <div><label>Дата открытия подписки (когда будет известна)</label><input name="subscriptionDate" type="date" value="${esc(fl.subscriptionDate)}"></div>
          <div><label>Бюджет первого теста, ₽</label><input name="budget" inputmode="decimal" value="${esc(fl.budget)}" required></div>
        </div>
        <label>Ссылка на книгу в Литнете (появится после публикации)</label>
        <input name="bookUrl" type="url" value="${esc(fl.bookUrl)}" placeholder="https://litnet.com/ru/book/...">
        <label>Роялти с одной покупки именно этой книги, ₽ (необязательно)</label>
        <input name="royalty" inputmode="decimal" value="${esc(fl.royalty)}" placeholder="После выбора цены подписки">
        <div class="row d-save"><button type="submit" class="primary">Сохранить план</button></div>
      </form>
      <label class="d-check small"><input type="checkbox" data-chg="fl.check" data-k="subscriptionOpen"${checked(fl.subscriptionOpen)}> Платная подписка уже открыта и книгу можно купить</label>
      <p class="small muted">Роялти нужно для предварительной оценки экономики. Это не автоматическое подтверждение фактических продаж.</p>
    </div>
    <div class="card">
      <div class="row between"><h2 style="margin:0">2. Проверка Метрики</h2>${stateTag(r.goal && fl.goalVerified ? 'проверено' : 'нужна проверка', !!r.goal && fl.goalVerified)}</div>
      <p class="small">Подключенный счетчик — еще не доказательство того, что реальная оплата отслеживается правильно. При старте будем анализировать покупки, отнесенные Директом к твоей кампании, а не все покупки по Литнету.</p>
      <p class="small">Сейчас выбрана главная цель: <b>${esc(goalNames.join(', ') || 'не выбрана')}</b>.</p>
      ${r.goal ? verifiedItem(true, 'Одна главная цель с названием оплаты или покупки')
        : '<p class="small warnc">Выбери в Настройках одну главную цель именно успешной покупки. «Начало покупки» и «Покупка» вместе для этого не подходят.</p>'}
      <div class="row"><button data-act="go" data-to="/settings">Настройки целей</button></div>
      <label class="d-check small"><input type="checkbox" data-chg="fl.check" data-k="goalVerified"${checked(fl.goalVerified)}${r.goal ? '' : ' disabled'}> Я проверила в Метрике, что эта цель соответствует оплаченной покупке</label>
      <p class="small muted">До запуска рекламы у твоей будущей кампании не будет рекламных конверсий. Срабатывания той же цели от других источников не означают, что новый алгоритм уже обучился.</p>
    </div>
    <div class="card">
      <div class="row between"><h2 style="margin:0">3. Рекламная гипотеза</h2>${stateTag(fl.creativeReady && fl.hypothesis ? 'объявления готовы' : 'подготовить', !!fl.creativeReady && !!fl.hypothesis)}</div>
      <p class="small">Начнем с одной конкретной идеи, которую можно проверить на покупках. Например: какой конфликт «Черной вдовы» лучше привлекает читательниц — фиктивные похороны мужа или опасное знакомство с владельцем ритуального бизнеса?</p>
      <form data-form="fl.creative" class="settings-form">
        <label>Что проверяем: аудитория, крючок и ожидаемый результат</label>
        <textarea name="hypothesis" rows="3" placeholder="Гипотеза для первой кампании">${esc(fl.hypothesis)}</textarea>
        <div class="row d-save"><button type="submit" class="primary">Сохранить гипотезу</button></div>
      </form>
      <label class="d-check small"><input type="checkbox" data-chg="fl.check" data-k="creativeReady"${checked(fl.creativeReady)}> Я подготовила и проверила объявление в Яндекс Директе</label>
      <p class="small muted">Приложение пока не создает кампанию с нуля. Мы готовим настройки здесь, а новое объявление создаем в самом Яндексе.</p>
    </div>
    <div class="card">
      <div class="row between"><h2 style="margin:0">4. Моя кампания и лимит</h2>${stateTag(r.picked?.state === 'ON' && fl.limitVerified ? 'готово' : 'пока не готово', r.picked?.state === 'ON' && !!fl.limitVerified)}</div>
      <p class="small">Создай отдельную кампанию под «Черную вдову» в своем кабинете. Мы будем учитывать только ее расходы и конверсии — старый кабинет и реклама таргетологов сюда не попадают.</p>
      <p class="small"><a href="https://direct.yandex.ru/" target="_blank" rel="noopener">Открыть Яндекс Директ ↗</a> · <button class="link" data-act="d.reload">Обновить кампании из Яндекса</button></p>
      <label for="flCampaign">Кампания для первого теста</label>
      <select id="flCampaign" data-chg="fl.campaign">
        <option value="">Не выбрана</option>
        ${available.map((camp) => opt(camp.id, camp.name + (camp.state === 'ON' ? ' · включена' : ' · не запущена'), fl.campaignId)).join('')}
      </select>
      ${!available.length ? '<p class="small muted">В этом кабинете пока нет доступных кампаний. После создания нажми «Обновить кампании».</p>' : ''}
      ${fl.campaignId && !r.picked ? '<p class="small warnc">Ранее выбранной кампании больше нет среди загруженных. Выбери ее заново.</p>' : ''}
      <label class="d-check small"><input type="checkbox" data-chg="fl.check" data-k="limitVerified"${checked(fl.limitVerified)}> Я проверила ограничения расходов в Яндекс Директе</label>
      <p class="small muted">10 000 ₽ — бюджет нашего эксперимента, а не автоматический лимит Яндекса. Приложение не меняет бюджеты и не включает кампании самостоятельно.</p>
    </div>
    <div class="card">
      <div class="row between"><h2 style="margin:0">5. Старт и контроль результатов</h2><span class="small muted">${complete} из ${r.checks.length} проверок</span></div>
      ${r.checks.map((ch) => verifiedItem(ch.ok, ch.label)).join('')}
      ${!running ? `<p class="small">Когда все условия выполнены и ты включила кампанию в Яндексе, укажи фактическую дату запуска. До этого расходы и продажи в наш тест не попадут.</p>
        <form data-form="fl.launch" class="settings-form">
          <label>Фактическая дата начала показов</label><input type="date" name="actualStart" value="${c.today}" max="${c.today}" min="${esc(fl.subscriptionDate || fl.publicationDate)}" required>
          <div class="row d-save"><button class="primary" type="submit"${r.ready ? '' : ' disabled'}>Я запустила рекламу в Яндексе</button></div>
        </form>` : `
        <p class="small">Тест идет с <b>${fmtShort(fl.actualStart)}</b>. Данные ниже относятся только к кампании «${esc(r.picked?.name || fl.campaignId)}» и периоду после ее старта.</p>
        <div class="tiles d-tiles">
          <div><div class="k">Расход</div><div class="v">${money(x.spent)}</div></div>
          <div><div class="k">Остаток бюджета</div><div class="v">${money(x.balance)}</div></div>
          <div><div class="k">Клики</div><div class="v">${num(x.clicks)}</div></div>
          <div><div class="k">Конверсии по цели оплаты</div><div class="v">${x.conversions == null ? '—' : num(x.conversions)}</div></div>
        </div>
        <p class="small">Цена целевого действия: <b>${x.cpa == null ? '—' : money(x.cpa)}</b>${x.estimate == null ? '' : ` · Предполагаемое роялти: <b>${money(x.estimate)}</b> · Разница с расходом: <b>${money(x.estimatedProfit)}</b>`}</p>
        <p class="small muted">Это предварительная оценка по цели Метрики и введенному роялти. Цель оплаты может относиться к разным книгам, а атрибуция не доказывает дополнительные продажи. Фактическую прибыль сверяем с выгрузкой Литнета и данными в «Доходах». Пока подтверждений нет, масштабировать рекламу не рекомендуем.</p>
        <form data-form="fl.fixDate" class="settings-form"><label>Исправить дату запуска, если записала неверно</label><div class="row"><input type="date" name="actualStart" value="${esc(fl.actualStart)}" max="${c.today}" required><button type="submit">Исправить</button></div></form>
        `}
    </div>
  ` };
}

forms['fl.plan'] = async (fd) => {
  const budget = N(fd.get('budget'));
  if (!(budget > 0)) { toast('Бюджет должен быть больше нуля'); return false; }
  const subscriptionDate = fd.get('subscriptionDate') || '';
  if (subscriptionDate && subscriptionDate < '2026-11-09') { toast('Подписка не может открыться раньше первой публикации 9 ноября'); return false; }
  const royalty = N(fd.get('royalty'));
  await saveLaunch({
    budget, subscriptionDate,
    bookUrl: String(fd.get('bookUrl') || '').trim(),
    royalty: royalty > 0 ? royalty : '',
  });
  toast('План сохранен');
};
forms['fl.creative'] = async (fd) => {
  const hypothesis = String(fd.get('hypothesis') || '').trim();
  const before = firstLaunchOf(app().ctx().settings);
  await saveLaunch({ hypothesis, creativeReady: before.hypothesis === hypothesis && before.creativeReady });
  toast('Гипотеза сохранена');
};
changes['fl.check'] = async (value, el, on) => {
  const keys = ['subscriptionOpen', 'goalVerified', 'creativeReady', 'limitVerified'];
  if (!keys.includes(el.dataset.k)) return;
  await saveLaunch({ [el.dataset.k]: !!on });
};
changes['fl.campaign'] = async (value) => { await saveLaunch({ campaignId: String(value || '') }); };
forms['fl.launch'] = async (fd) => {
  const a = app(), c = a.ctx(), fl = firstLaunchOf(c.settings);
  if (fl.actualStart) { toast('Тест уже начат'); return false; }
  const check = launchReadiness(fl, { today: c.today, campaigns: a.snap('main')?.campaigns || [], metrika: metrikaOf(c) });
  if (!check.ready) { toast('Сначала выполни все пять проверок'); return false; }
  const date = String(fd.get('actualStart') || '');
  if (!date || date > c.today || date < fl.subscriptionDate) { toast('Проверь фактическую дату начала показов'); return false; }
  if (!(await ask('Записать ' + date + ' как фактический старт теста? Это не включает рекламу в Яндексе.', 'Записать старт'))) return false;
  await saveLaunch({ actualStart: date });
  toast('Начало теста записано. Теперь статистика учитывается только по выбранной кампании.');
};
forms['fl.fixDate'] = async (fd) => {
  const a = app(), fl = firstLaunchOf(a.ctx().settings);
  if (!fl.actualStart) return false;
  const date = String(fd.get('actualStart') || '');
  if (!date || date > a.ctx().today || (fl.subscriptionDate && date < fl.subscriptionDate)) { toast('Проверь дату'); return false; }
  await saveLaunch({ actualStart: date }); toast('Дата исправлена');
};

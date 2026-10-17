// Аналитика по Яндекс Метрике (счётчик автора на Литнете): итоги, источники, устройства, страницы, дни недели
// и «шаги» — что сделать, с объяснением. Только чистые функции (их проверяют тесты).
// Осторожно с малыми числами: вывод — только когда визитов и целей достаточно, иначе «подождать».

export const MIN_VISITS = 50;   // меньше визитов в сегменте — сравнивать рано
export const MIN_CONV = 3;      // меньше целей — доля случайна
const r1 = (x) => Math.round(x * 10) / 10;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const pc = (x) => `${String(r1(x * 100)).replace('.', ',')} %`;
const WD = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];

export const SESSION_METRICS = ['ym:s:visits', 'ym:s:users', 'ym:s:bounceRate', 'ym:s:pageDepth', 'ym:s:avgVisitDurationSeconds'];
export const goalMetric = (id) => `ym:s:goal${id}reaches`;

// Ответ stat/v1/data → [{key, name, visits, users, bounce (доля), depth, dur, goals {id: достижения}}]
export function mkRows(json, goalIds = []) {
  return (json?.data || []).map((r) => {
    const d = r.dimensions?.[0] || {}, m = r.metrics || [];
    const goals = {};
    goalIds.forEach((g, i) => { goals[g] = Math.round(m[5 + i] || 0); });
    return { key: d.id ?? d.name ?? '', name: d.name ?? String(d.id ?? ''), visits: Math.round(m[0] || 0), users: Math.round(m[1] || 0), bounce: (m[2] || 0) / 100, depth: m[3] || 0, dur: m[4] || 0, goals };
  });
}
export const reach = (row, ids) => (ids || Object.keys(row.goals || {})).reduce((s, id) => s + (row.goals?.[id] || 0), 0);

// Сумма по дням [from, to] без дней сбоя; доля отказов — средняя, взвешенная по визитам
export function sumDays(daily = [], from, to, main = [], skip = null) {
  const t = { visits: 0, users: 0, conv: 0, b: 0, dur: 0, depth: 0, days: 0 };
  for (const x of daily) {
    if (x.key < from || x.key > to || skip?.has(x.key)) continue;
    t.visits += x.visits; t.users += x.users; t.conv += reach(x, main); t.b += x.bounce * x.visits; t.dur += x.dur * x.visits; t.depth += x.depth * x.visits; t.days++;
  }
  const v = t.visits || 1;
  return { visits: t.visits, users: t.users, conv: t.conv, cr: t.visits ? t.conv / t.visits : null, bounce: t.visits ? t.b / v : null, dur: t.visits ? t.dur / v : null, depth: t.visits ? t.depth / v : null, days: t.days };
}

// По дням недели (за все дни в данных): средние визиты и доля целей
export function byWeekday(daily = [], main = [], skip = null) {
  const w = Array.from({ length: 7 }, (_, i) => ({ wd: i, days: 0, visits: 0, conv: 0 }));
  for (const x of daily) {
    if (skip?.has(x.key)) continue;
    const i = new Date(x.key + 'T00:00:00Z').getUTCDay();
    w[i].days++; w[i].visits += x.visits; w[i].conv += reach(x, main);
  }
  return w.map((x) => ({ ...x, avg: x.days ? x.visits / x.days : 0, cr: x.visits ? x.conv / x.visits : null }));
}

// Главное: шаги с объяснением. {level: step|warn|good|wait|info, area, title, why, step, lesson}
export function mkInsights({ daily = [], sources = [], devices = [], pages = [], main = [], hasGoals = false, today, skip = null }) {
  const out = [], add = (level, area, title, why, step = '', lesson = '') => out.push({ level, area, title, why, step, lesson });
  const w = sumDays(daily, addDays(today, -6), today, main, skip), pw = sumDays(daily, addDays(today, -13), addDays(today, -7), main, skip);
  const m30 = sumDays(daily, addDays(today, -29), today, main, skip);

  if (!hasGoals) add('step', 'Цели', 'Не выбрана главная цель', 'Без цели видно только посещения: непонятно, кто из читателей покупает.', 'Настройки → «Яндекс Метрика» → отметьте цели и звёздочкой главную (покупку).', 'goals');
  if (m30.visits < MIN_VISITS) { add('wait', 'Данные', `За 30 дней ${m30.visits} визит(ов)`, `Для выводов нужно хотя бы ${MIN_VISITS} визитов — пока это случайность.`, 'Выкладывайте главы и анонсы; аналитика оживёт сама.'); return order(out); }

  // неделя к неделе
  if (w.visits >= MIN_VISITS && pw.visits >= MIN_VISITS) {
    const dv = (w.visits - pw.visits) / pw.visits;
    if (dv <= -0.25) add('warn', 'Посещаемость', `Визитов меньше на ${Math.round(-dv * 100)} %: ${w.visits} против ${pw.visits}`, 'Обычно так бывает, когда реже выходят главы, закончилась реклама или книга ушла из подборок.', 'Проверьте график выкладки и анонсы этой недели; если была реклама — не остановилась ли она.', 'rhythm');
    else if (dv >= 0.25) add('good', 'Посещаемость', `Визитов больше на ${Math.round(dv * 100)} %: ${w.visits} против ${pw.visits}`, 'Что-то сработало — важно понять что, чтобы повторить.', 'Посмотрите ниже, какой источник вырос, и запишите, что вы делали на этой неделе.', 'rhythm');
    if (hasGoals && w.conv >= MIN_CONV && pw.conv >= MIN_CONV) {
      const dc = (w.cr - pw.cr) / pw.cr;
      if (Math.abs(dc) >= 0.2) add(dc > 0 ? 'good' : 'warn', 'Покупки', `Доля покупок ${dc > 0 ? 'выросла' : 'упала'}: ${pc(pw.cr)} → ${pc(w.cr)}`, dc > 0 ? 'Сейчас приходят более «свои» читатели или страница книги убеждает лучше.' : 'Приходят менее целевые люди (новый источник?) или страница книги перестала убеждать.', dc > 0 ? 'Найдите ниже источник, который это дал, — его стоит усилить.' : 'Сравните источники ниже: где упала доля, там и причина.', 'goals');
    }
  } else add('wait', 'Динамика', 'Мало визитов, чтобы сравнивать недели', `Нужно хотя бы ${MIN_VISITS} визитов за каждую из двух недель.`);

  // источники: где читатели покупают чаще, где сразу уходят
  const big = sources.filter((s) => s.visits >= MIN_VISITS);
  if (hasGoals && m30.cr != null && m30.conv >= MIN_CONV) {
    const best = big.filter((s) => reach(s, main) >= MIN_CONV).sort((a, b) => reach(b, main) / b.visits - reach(a, main) / a.visits)[0];
    if (best && reach(best, main) / best.visits >= 1.5 * m30.cr) add('step', 'Источники', `«${best.name}»: покупают в ${String(r1(reach(best, main) / best.visits / m30.cr)).replace('.', ',')} раза чаще среднего`, `${best.visits} визитов, ${reach(best, main)} покупок — это ваши самые «тёплые» читатели.`, 'Усильте этот источник: чаще анонсы там же, а в рекламе — похожая аудитория.', 'scale');
    const ad = sources.find((s) => s.key === 'ad');
    if (ad && ad.visits >= MIN_VISITS) {
      const cr = reach(ad, main) / ad.visits;
      if (cr < 0.5 * m30.cr) add('warn', 'Реклама', `Из рекламы покупают реже: ${pc(cr)} против ${pc(m30.cr)} в среднем`, 'Реклама приводит людей, но не тех — или объявление обещает не то, что на странице книги.', 'Уточните аудиторию и фразы; проверьте, совпадают ли жанр и тон объявления со страницей книги.', 'goals');
      else if (cr >= m30.cr) add('good', 'Реклама', `Из рекламы покупают не хуже остальных (${pc(cr)})`, 'Реклама приводит своих читателей — её можно аккуратно расширять, если окупается.', 'Сверьте окупаемость в «Доходах» и, если в плюсе, поднимите бюджет на 20–30 %.', 'scale');
    }
  }
  const bouncy = big.filter((s) => s.bounce >= 0.6).sort((a, b) => b.visits - a.visits)[0];
  if (bouncy) add('warn', 'Источники', `«${bouncy.name}»: ${Math.round(bouncy.bounce * 100)} % уходят сразу`, 'Люди приходят и почти не смотрят страницу — источник приводит случайных посетителей или ожидания не совпадают.', bouncy.key === 'ad' ? 'Сверьте объявление со страницей книги: жанр, обложка, первые строки аннотации.' : 'Если это реклама или ссылки — уточните, где и как вы зовёте читателей.', 'rsy');

  // устройства
  const mob = devices.find((d) => /mobile|смартф/i.test(String(d.key) + d.name)), desk = devices.find((d) => /desktop|ПК|компьют/i.test(String(d.key) + d.name));
  if (mob && desk && mob.visits >= MIN_VISITS && desk.visits >= MIN_VISITS) {
    const share = mob.visits / (mob.visits + desk.visits);
    if (hasGoals && reach(mob, main) >= MIN_CONV && reach(desk, main) >= MIN_CONV) {
      const a = reach(mob, main) / mob.visits, b = reach(desk, main) / desk.visits;
      if (a < b / 1.5) add('info', 'Устройства', `С телефона покупают реже: ${pc(a)} против ${pc(b)} с компьютера`, `При этом с телефона приходит ${Math.round(share * 100)} % читателей.`, 'Проверьте страницу книги с телефона: видны ли обложка, аннотация и кнопка «Купить» без прокрутки.');
    } else add('info', 'Устройства', `С телефона — ${Math.round(share * 100)} % визитов`, 'Объявления и анонсы смотрят в основном с этого устройства.', share > 0.6 ? 'Пишите объявления короткими и проверяйте, как страница книги выглядит на телефоне.' : '');
  }

  // дни недели — нужно хотя бы 4 недели данных
  const wd = byWeekday(daily, main, skip);
  if (wd.every((x) => x.days >= 4)) {
    const top = [...wd].sort((a, b) => b.avg - a.avg)[0], low = [...wd].sort((a, b) => a.avg - b.avg)[0];
    if (top.avg >= low.avg * 1.3) add('step', 'Дни недели', `Больше всего читателей в ${WD[top.wd]} (в среднем ${Math.round(top.avg)}), меньше — в ${WD[low.wd]}`, 'Это ваш ритм аудитории за последние недели.', `Ставьте выход глав и анонсы на ${WD[top.wd]}; рекламу в ${WD[low.wd]} можно приглушить.`, 'rhythm');
  } else add('wait', 'Дни недели', 'Ритм по дням недели появится через 4 недели данных', 'Нужно хотя бы по 4 каждого дня недели, чтобы не путать случайность с закономерностью.');

  // страницы входа: много визитов, мало покупок
  if (hasGoals && m30.cr) {
    const weak = pages.filter((p) => p.visits >= MIN_VISITS * 2 && reach(p, main) / p.visits < 0.4 * m30.cr).sort((a, b) => b.visits - a.visits)[0];
    if (weak) add('warn', 'Страницы', `Страница с ${weak.visits} входами почти не продаёт`, `${shortUrl(weak.key || weak.name)} — доля покупок ${pc(reach(weak, main) / weak.visits)} при средней ${pc(m30.cr)}.`, 'Обновите аннотацию, первые строки и обложку этой книги; проверьте цену и что продолжение выходит.', 'goals');
  }
  if (hasGoals && m30.visits >= 200 && m30.conv === 0) add('warn', 'Цели', 'За 30 дней ни одной достигнутой главной цели', 'Возможно, выбрана не та цель или она перестала срабатывать.', 'Проверьте в Метрике: Цели → посмотрите, достигается ли цель вообще.', 'goals');
  return order(out);
}
const order = (a) => { const o = { step: 0, warn: 1, good: 2, wait: 3, info: 4 }; return a.sort((x, y) => o[x.level] - o[y.level]); };
export const shortUrl = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\?.*$/, '').slice(0, 70);

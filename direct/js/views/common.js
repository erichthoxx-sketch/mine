// Общее для экранов «Директа»: подписи статусов, подсказки к цифрам, кнопка действия с подтверждением.
import { esc, acts, toast, ask, openSheet } from '../../../js/ui.js';
import { rub, num, pct } from '../../../js/format.js';
import { describe, ctr, cpc } from '../dcalc.js';
import { apply, namesOf } from '../sync.js';

const app = () => window.__app;

export const STATE = { ON: ['идёт', 'good'], SUSPENDED: ['остановлена', ''], OFF: ['не показывается', 'warn'], ENDED: ['закончилась', ''], ARCHIVED: ['в архиве', ''], CONVERTED: ['перенесена', ''] };
export const STATUS = { DRAFT: 'черновик', MODERATION: 'на модерации', ACCEPTED: '', REJECTED: 'отклонено модерацией', PREACCEPTED: 'на модерации' };
// статус — точкой и словом
const ITEM = { ON: 'включено', SUSPENDED: 'остановлено' }; // для фраз и объявлений
export function stateDot(x, kind = 'кампания') {
  const [t, cls] = STATE[x.state] || [x.state?.toLowerCase() || '', ''];
  const word = kind === 'кампания' ? t : ITEM[x.state] || t;
  const st = STATUS[x.status];
  return `<span class="d-st ${cls}">● ${esc(word)}${st ? ` · <span class="${x.status === 'REJECTED' ? 'down' : 'muted'}">${esc(st)}</span>` : ''}</span>`;
}
export const STRATEGY = {
  HIGHEST_POSITION: 'ручные ставки',
  WB_MAXIMUM_CLICKS: 'максимум кликов (автостратегия)',
  AVERAGE_CPC: 'средняя цена клика (автостратегия)',
  WB_MAXIMUM_CONVERSION_RATE: 'максимум конверсий (автостратегия)',
  AVERAGE_CPA: 'оплата за конверсию (автостратегия)',
  PAY_FOR_CONVERSION: 'оплата за конверсии',
  MAXIMUM_COVERAGE: 'максимальный охват',
  NETWORK_DEFAULT: 'как на поиске',
  SERVING_OFF: 'выключено',
};
export const strategyText = (st = {}) => [st.search && `поиск — ${STRATEGY[st.search] || st.search}`, st.network && `сети — ${STRATEGY[st.network] || st.network}`].filter(Boolean).join(' · ');
export const manualBids = (camp) => camp?.strategy?.search === 'HIGHEST_POSITION' || !camp?.strategy?.search;

// Подсказки-«?» к цифрам (короткий учебник прямо на экране)
export const TERMS = {
  cost: ['Расход', 'Сколько списал Директ, с НДС. Списания — за клики, а если так выбрано в стратегии — за конверсии или (в медийных кампаниях) за показы.'],
  clicks: ['Клики', 'Сколько раз нажали на объявление и перешли на страницу книги.'],
  impr: ['Показы', 'Сколько раз объявление увидели. Само по себе ничего не стоит, важно, сколько из них нажали.'],
  ctr: ['CTR — кликабельность', 'Сколько человек из 100 увидевших нажали. На поиске ориентир — от 3 %, ниже 1 % — повод переписать объявление или убрать фразу. В сетях (на сайтах) CTR всегда ниже: 0,3–1 % — обычно.'],
  cpc: ['Цена клика', 'Сколько в среднем стоил один переход. Чем дешевле клик при тех же читателях, тем лучше. Окупается ли — видно только по продажам («Доходы»).'],
  budget: ['Тестовый бюджет', 'Сколько вы решили потратить на проверку. Дневной лимит ставится в кабинете Директа — приложение его не меняет, поэтому больше лимита не потратится.'],
  minus: ['Минус-фразы', 'Слова, по которым объявление НЕ показывать. Минус-слово «бесплатно» убирает все запросы, где оно есть: «читать бесплатно», «бесплатно полностью»…'],
  conv: ['Конверсии', 'Сколько раз после клика по рекламе сработала цель вашего счётчика Метрики (например, покупка). Считает сам Директ — по последнему значимому переходу: если человек пришёл из рекламы, ушёл и вернулся сам, покупка всё равно засчитывается рекламе.'],
  cpa: ['Цена покупки', 'Расход ÷ число конверсий по главной цели. Главная цифра таргетолога: если покупка обходится дешевле, чем вы с неё получаете, реклама окупается. Точную окупаемость по деньгам считают «Доходы».'],
  cr: ['Конверсия из клика', 'Сколько кликов из 100 закончились целью (например, покупкой). Если кликают много, а покупают мало — дело в странице книги или в том, кого приводит реклама.'],
  bounce: ['Отказы', 'Доля визитов, где человек ушёл почти сразу (до 15 секунд и без переходов). Много отказов — объявление обещает не то, что человек видит на странице книги.'],
  query: ['Поисковые запросы', 'Что люди на самом деле написали в Яндексе, когда увидели объявление. Главный источник минус-фраз.'],
};
export const q = (key) => `<button type="button" class="link d-q" data-act="d.term" data-k="${key}" aria-label="Что это?" title="Что это?">?</button>`;
acts['d.term'] = (d) => { const [t, x] = TERMS[d.k] || []; if (t) openSheet(t, `<p>${esc(x)}</p>`, null); return false; };

export const tile = (k, label, v, sub = '') => `<div><div class="k">${label} ${q(k)}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
export function tiles(t, sub = '') {
  return `<div class="tiles d-tiles">${tile('cost', 'Расход', rub(t.cost, 0), sub)}${tile('clicks', 'Клики', num(t.clicks), `показов ${num(t.impr)}`)}${tile('cpc', 'Цена клика', t.cpc == null ? '—' : rub(t.cpc, 1))}${tile('ctr', 'CTR', t.ctr == null ? '—' : pct(t.ctr, 1))}</div>`;
}
export const statLine = (s) => `показов ${num(s?.impr ?? 0)} · кликов ${num(s?.clicks ?? 0)}${s && ctr(s) != null ? ` · CTR ${pct(ctr(s), 1)}` : ''}${s && cpc(s) != null ? ` · клик ${rub(cpc(s), 1)}` : ''} · ${rub(s?.cost ?? 0, 0)}`;

// Кнопка действия: data-act="d.do" data-a='{"do":"minus",…}'. Перед записью — «что поменяется» и «Точно?»
export const actBtn = (a, label, cls = 'link') => `<button type="button" class="${cls}" data-act="d.do" data-a="${esc(JSON.stringify(a))}">${label}</button>`;
export async function runAction(a, { by = 'app', confirm = true } = {}) {
  const text = describe(a, namesOf(app().snap('main')));
  if (confirm && !(await ask(`${text}${a.why ? `. Почему: ${a.why}` : ''}`, 'Применить'))) return null;
  const r = await apply(app(), a, { by });
  if (r.errors.length) toast('Директ не принял: ' + r.errors.join('; '));
  else toast(r.warnings.length ? 'Готово. Директ предупреждает: ' + r.warnings.join('; ') : 'Готово: ' + text);
  return r;
}
acts['d.do'] = async (d) => { await runAction(JSON.parse(d.a)); return false; };

// «Сайт»: статистика lanafreitag.ru (analytics.js → siteTab) + «Реклама на сайт»: сколько стоит читательница,
// которая пришла по рекламе на сайт и нажала «Читать», и что потом сделала на Литнете (Метрика автора, метка utm_source=lanafreitag.ru).
import { esc } from '../../../js/ui.js';
import { rub, num, fmtShort } from '../../../js/format.js';
import { addDays } from '../../../js/calc.js';
import { lineChart } from '../../../js/charts.js';
import { goalsOf, siteAdRows, siteToLitnet } from '../pult.js';
import { metrikaOf } from './metrika.js';
import { siteTab } from './analytics.js';

const SITE_HOST = 'lanafreitag.ru';

export function siteView(a) {
  const c = a.ctx(), site = a.snap('site'), stats = a.snap('stats') || {}, main = a.snap('main') || {}, mk = a.snap('mk');
  const base = siteTab(a);
  if (!site) return { html: base };
  const rows = siteAdRows({ site, daily: stats.daily || [], campaigns: main.campaigns || [], today: c.today });
  const goals = goalsOf(metrikaOf(c) || {}), chain = siteToLitnet(mk?.utm || [], goals);
  const toSite = (main.ads || []).filter((x) => String(x.href || '').includes(SITE_HOST));
  const ads = `<div class="card"><div class="row between"><h2 style="margin:0">Реклама на сайт</h2><span class="small muted">за 30 дней</span></div>
    ${rows.length ? `<div class="list">${rows.map((r) => `<div class="item"><div class="row between"><b>${esc(r.name)}</b><span class="small muted">${r.kind === 'direct' ? 'Директ' : 'метка'}</span></div>
      <div class="small">${[`визитов ${num(r.visits)}`, r.cost != null ? `расход ${rub(r.cost, 0)}` : '', r.read != null ? `«Читать» ${num(r.read)}${r.perRead != null ? ` по ${rub(r.perRead, 0)}` : ''}` : '', r.sub != null ? `подписались ${num(r.sub)}${r.perSub != null ? ` по ${rub(r.perSub, 0)}` : ''}` : ''].filter(Boolean).join(' · ')}</div>
      ${r.bounce != null ? `<div class="small ${r.bounce >= 0.5 ? 'warnc' : 'muted'}">отказы ${Math.round(r.bounce * 100)} %${r.bounce >= 0.5 ? ' — много: реклама обещает не то, что видят на странице' : ''}</div>` : ''}</div>`).join('')}</div>`
      : `<p class="small muted">${toSite.length ? 'Объявления на сайт есть, но визитов по рекламе пока нет — данные появятся после первых кликов.' : 'Пока ни одно объявление не ведёт на сайт. Когда запустите рекламу на lanafreitag.ru, здесь будет видно, сколько стоит переход на страницу книги, нажатие «Читать» и подписка.'}</p>`}
    ${chain ? `<div class="item"><b>С сайта на Литнет</b><div class="small">за 90 дней: визитов ${num(chain.visits)}${chain.lib != null ? ` · в библиотеку ${num(chain.lib)}` : ''}${chain.buy != null ? ` · покупок ${num(chain.buy)}` : ''}</div><div class="small muted">По Метрике автора: ссылки сайта на Литнет помечены utm_source=lanafreitag.ru.</div></div>` : ''}
    <p class="small muted">Совет: ведите рекламу на страницу книги (lanafreitag.ru/?kniga=…), а не на главную. Цена «Читать» здесь — сколько стоит читательница, дошедшая до Литнета через сайт; сравнивайте её с ценой клика рекламы прямо на Литнет.</p></div>`;
  return {
    // реклама — сразу после главных цифр сайта, до целей и источников
    html: (() => { const i = ['<div class="card"><h2>Цели в Метрике', '<div class="grid2">'].map((k) => base.indexOf(k)).filter((x) => x > 0).sort((x, y) => x - y)[0]; return i ? base.slice(0, i) + ads + base.slice(i) : base + ads; })(),
    after() {
      const sc = document.getElementById('siteChart');
      if (sc) lineChart(sc, { points: (site.daily || []).map((x) => ({ label: fmtShort(x.key), value: x.visits })), fmtVal: (v) => num(v), height: 150 });
    },
  };
}

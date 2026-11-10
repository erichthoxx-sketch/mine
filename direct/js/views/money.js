// «Деньги»: Директ по месяцам (расход, добавления, покупки, роялти с покупок, отдача рубля) + вся реклама из «Доходов»
// и сравнение каналов с бюджетом на следующий месяц (adboard.js — тот же расчёт, что в «Доходах»).
import { esc } from '../../../js/ui.js';
import { rub, num, fmtMonth } from '../../../js/format.js';
import { goalsOf, directMonths } from '../pult.js';
import { royaltyPerSale } from '../mcalc.js';
import { metrikaOf } from './metrika.js';
import { boardCard, channelCard } from './adboard.js';

export function moneyView(a) {
  const c = a.ctx(), stats = a.snap('stats') || {}, m = metrikaOf(c) || {};
  const perSale = royaltyPerSale(c.data.sales || [], c.today)?.perSale ?? null;
  const rows = directMonths({ daily: stats.daily || [], conv: stats.conv || [], goals: goalsOf(m), perSale });
  const dirCard = rows.length ? `<div class="card"><div class="row between"><h2 style="margin:0">Яндекс Директ по месяцам</h2><span class="small muted">${perSale != null ? `покупка ≈ ${rub(perSale, 0)} роялти` : ''}</span></div>
    <div class="list">${rows.map((r) => `<div class="item"><div class="row between"><b>${esc(fmtMonth(r.month))}</b><span>${rub(r.cost, 0)}</span></div>
      <div class="small">${[`кликов ${num(r.clicks)}`, r.lib != null ? `в библиотеку ${num(r.lib)}${r.lib ? ` по ${rub(r.cost / r.lib, 0)}` : ''}` : '', r.buy != null ? `покупок ${num(r.buy)}${r.buy ? ` по ${rub(r.cost / r.buy, 0)}` : ''}` : ''].filter(Boolean).join(' · ')}</div>
      ${r.ret != null && r.buy ? `<div class="small ${r.ret >= 1.2 ? 'up' : r.ret < 0.9 ? 'down' : ''}">роялти с покупок ≈ ${rub(r.rev, 0)} — на 1 ₽ ${r.ret.toFixed(2).replace('.', ',')} ₽</div>` : ''}</div>`).join('')}</div>
    <p class="small muted">Покупки — те, что Директ засчитал рекламе по цели Метрики. Читательницы из библиотеки покупают и позже, поэтому полная отдача обычно выше — её видно в «Сравнении каналов» и в «Доходах».</p></div>` : '';
  const html = dirCard + channelCard(a) + boardCard(a);
  return { html: html || '<div class="card"><p class="muted">Здесь появятся деньги по рекламе, когда будет расход в Директе или реклама в «Доходах».</p></div>' };
}

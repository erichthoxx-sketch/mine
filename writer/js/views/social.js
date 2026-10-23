// Минимальный раздел соцсетей: персональные ссылки с источником «Соцсети».
import { esc } from '../../../js/ui.js';
import { plural } from '../../../js/format.js';
import { promoChannel } from '../promolinks.js';
import { promoLinksPanel } from './promolinks.js';

export function socialView(a) {
  const c=a.ctx();
  const count=(c.data.w_promolinks || []).filter(x => x.status!=='archived' && promoChannel(x)==='social').length;
  return { html: `
    <p><button class="btn back" data-act="go" data-to="/links">← Связи</button></p>
    <div class="row between" style="margin-bottom:14px"><h2 style="margin:0">Соцсети</h2><span class="small muted">${count} ${plural(count,['ссылка','ссылки','ссылок'])}</span></div>
    ${promoLinksPanel(c,{channel:'social'})}
  ` };
}

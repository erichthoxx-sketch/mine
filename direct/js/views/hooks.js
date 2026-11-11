// «Крючки» (#/hooks): какой троп кликают охотнее. Расчёты — ../hooks.js
import { esc, changes } from '../../../js/ui.js';
import { num } from '../../../js/format.js';
import { hookBoard, HOOK_DICT } from '../hooks.js';

const p1 = (v) => (v * 100).toFixed(1).replace('.', ',') + ' %';
export function hooksView(a) {
  const c = a.ctx(), main = a.snap('main') || {}, stats = a.snap('stats') || {};
  const tags = [...new Set((c.data.w_books || []).flatMap((b) => b.tags || []))];
  const B = hookBoard({ ads: main.ads || [], adDaily: stats.adDaily || [], tags, manual: c.settings.direct?.hooks || {} });
  const all = [...new Set([...tags, ...HOOK_DICT])];
  const head = `<p style="margin:0 0 6px"><button class="link small" data-act="go" data-to="/">← Пульт</button></p><h2 style="margin:0 0 6px">Крючки</h2>
    <p class="small muted" style="margin:0 0 14px">Какой троп в объявлении кликают охотнее — по всем вашим объявлениям. Троп определяю сама по тексту; если ошиблась — поправьте в списке.</p>`;
  if (!B.rows.length) return { html: head + '<div class="card"><p class="muted" style="margin:0">Показов объявлений пока нет.</p></div>' };
  const max = Math.max(...B.groups.map((g) => g.ctr));
  return { html: `${head}
    <div class="card"><h2 style="margin:0 0 4px">По тропам</h2><p style="margin:6px 0 10px">${esc(B.verdict)}</p>
      ${B.groups.map((g) => `<div class="bar-row"><div class="row between small"><span><b>${esc(g.hook || 'Без тропа')}</b> · объявлений ${g.n}</span><span>${p1(g.ctr)} · показов ${num(g.impr)}</span></div><div class="progress"><i style="width:${(g.ctr / max * 100).toFixed(1)}%"></i></div></div>`).join('')}</div>
    <div class="card"><h2 style="margin:0 0 4px">Объявления</h2><div class="list">${B.rows.map((r) => `<div class="item"><div class="row between" style="gap:12px;align-items:flex-start"><div style="min-width:0"><b>${esc(r.title)}</b>${r.state !== 'ON' ? ' <span class="small muted">· остановлено</span>' : ''}<div class="small muted">${esc(r.text)}</div></div><span style="white-space:nowrap"><b>${p1(r.ctr)}</b></span></div>
        <div class="row between small" style="margin-top:6px;gap:12px"><span class="muted">показов ${num(r.impr)} · кликов ${num(r.clicks)}</span><select data-chg="hk.set" data-id="${r.aid}" aria-label="Троп объявления" style="max-width:220px"><option value="">Без тропа</option>${[...new Set([r.hook, ...all].filter(Boolean))].map((t) => `<option${t === r.hook ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div></div>`).join('')}</div></div>` };
}
changes['hk.set'] = async (v, el) => { const a = window.__app, d = a.ctx().settings.direct || {}; await a.store.saveSettings({ direct: { ...d, hooks: { ...(d.hooks || {}), [el.dataset.id]: v } } }); };

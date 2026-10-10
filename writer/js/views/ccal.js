// Календарь конкурсов в «Маркетинге»: год вперёд одной полосой — приём работ, итоги, где мои книги.
// Конкурсы попадают сюда сами; год вперёд можно заполнить, вставив список (например, пост «Календарь конкурсов Литнета»).
import { esc, acts, openSheet, toast, uid } from '../../../js/ui.js';
import { addMonths, monthKey } from '../../../js/calc.js';
import { fmtDate } from '../../../js/format.js';
import { parseContestList, contestBookIds } from '../wcalc.js';

const app = () => window.__app;
const MS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const ms = (d) => Date.parse(d + 'T00:00:00Z');
const dm = (d) => fmtDate(d).slice(0, 5);

export function contestCalendar(c) {
  const m0 = monthKey(c.today), from = m0 + '-01', endM = addMonths(m0, 12), to = endM + '-01';
  const span = ms(to) - ms(from), pos = (d) => Math.max(0, Math.min(100, ((ms(d) - ms(from)) / span) * 100));
  const rows = c.data.w_contests
    .map((x) => ({ x, s: x.start || x.end, e: x.end || x.start }))
    .filter(({ x, s, e }) => s && e >= from && s < to && x.status !== 'done')
    .sort((a, b) => a.s.localeCompare(b.s));
  const months = Array.from({ length: 12 }, (_, i) => addMonths(m0, i));
  const head = months.map((k, i) => `<span style="left:${(i / 12) * 100}%">${MS[+k.slice(5, 7) - 1]}</span>${k.endsWith('-01') ? `<em class="cc-yr" style="left:${(i / 12) * 100}%">${k.slice(0, 4)}</em>` : ''}`).join('');
  const grid = months.map((_, i) => `<i style="left:${(i / 12) * 100}%"></i>`).join('');
  const now = `<b class="cc-now" style="left:${pos(c.today)}%"></b>`;
  const row = ({ x, s, e }) => {
    const mine = contestBookIds(x).filter((id) => c.wbooksById[id]).length;
    const st = x.status === 'sent' ? 'sent' : mine || x.status === 'in' ? 'in' : 'plan';
    const l = pos(s), w = Math.max(1.6, pos(e) - l);
    const when = x.approx ? `${MS[+s.slice(5, 7) - 1]} — примерно` : `${x.start ? dm(x.start) + ' — ' : 'до '}${dm(x.end || s)}`;
    return `<a class="cc-row tap" href="#" data-act="contest.edit" data-id="${x.id}"><span class="cc-name"><b>${esc(x.name || 'Конкурс')}</b><span>${x.platform ? esc(x.platform) + ' · ' : ''}${when}${mine ? ` · книг: ${mine}` : ''}</span></span>
      <span class="cc-track">${grid}${now}<span class="cc-bar cc-${st}${x.approx ? ' cc-approx' : ''}" style="left:${l}%;width:${w}%"></span>${x.results && x.results < to ? `<span class="cc-res" style="left:${pos(x.results)}%" title="Итоги ${dm(x.results)}"></span>` : ''}</span></a>`;
  };
  return `<div class="card cc">
    <div class="row between"><h2 style="margin:0">Календарь конкурсов</h2><button class="link" data-act="ccal.paste">+ Вставить список</button></div>
    ${rows.length ? `<div class="cc-grid"><div class="cc-row cc-head"><span class="cc-name"></span><span class="cc-track cc-months">${head}</span></div>${rows.map(row).join('')}</div>
    <div class="cc-legend"><span><i class="cc-plan"></i>собираюсь</span><span><i class="cc-in"></i>участвую</span><span><i class="cc-sent"></i>отправила</span><span><i class="cc-dot"></i>итоги</span></div>`
    : `<p class="small muted" style="margin:8px 0 0">Здесь будет год вперёд: когда идёт приём работ и когда итоги. Конкурсы появляются сами, когда вы их добавляете. Чтобы заполнить сразу на год — нажмите «Вставить список» и вставьте календарь конкурсов (например, пост Литнета).</p>`}
  </div>`;
}

const listHtml = (found, have) => found.length
  ? found.map((x, i) => { const dup = have.has(x.name.toLowerCase()); return `<label class="check cc-pick"><input type="checkbox" name="pick" value="${i}"${dup ? '' : ' checked'}><span><b>${esc(x.name)}</b><span class="sub">${x.approx ? `${MS[+x.start.slice(5, 7) - 1]} ${x.start.slice(0, 4)} — примерно` : `${x.start ? fmtDate(x.start) + ' — ' : 'до '}${fmtDate(x.end)}`}${x.results ? ` · итоги ${fmtDate(x.results)}` : ''}${dup ? ' · уже есть' : ''}</span></span></label>`; }).join('')
  : '<p class="small muted">Пока ничего не нашлось. Нужны название в «кавычках» и даты или месяц — каждый конкурс с новой строки или абзаца.</p>';
acts['ccal.paste'] = () => {
  const c = app().ctx(), have = new Set(c.data.w_contests.map((x) => String(x.name || '').toLowerCase()));
  let found = [];
  const f = openSheet('Календарь конкурсов', `<p class="small muted" style="margin-top:0">Скопируйте список конкурсов — например, пост «Календарь конкурсов» в блоге Литнета — и вставьте сюда. Приложение разберёт его на конкурсы: название, приём работ, итоги. Они появятся в календаре со статусом «Собираюсь»; условия потом можно уточнить в карточке.</p>
    <textarea name="t" id="ccT" style="min-height:120px" placeholder="«Зимняя сказка» — приём с 10 января по 10 марта, итоги 10 апреля&#10;«Летний роман» — в июне"></textarea>
    <div id="ccFound" class="checks" style="margin-top:10px"></div>`, async (fd) => {
    const picks = fd.getAll('pick').map(Number).map((i) => found[i]).filter(Boolean);
    if (!picks.length) { toast('Отметьте конкурсы, которые добавить'); return false; }
    for (const x of picks) await app().store.put('w_contests', { id: 'c' + uid(), status: 'plan', bookIds: [], pv: 2, ...x });
    toast(`Добавлено в календарь: ${picks.length}`);
  }, { submitText: 'Добавить' });
  const ta = f.querySelector('#ccT'), box = f.querySelector('#ccFound');
  const upd = () => { found = parseContestList(ta.value, c.today); box.innerHTML = ta.value.trim() ? listHtml(found, have) : ''; };
  ta.addEventListener('input', upd);
  return false;
};

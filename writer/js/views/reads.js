// Плитка «Прочтения» на странице книги: вставка таблицы «Статистика по частям» из кабинета Литнета,
// удержание от главы к главе и самый большой провал; итоги по всем книгам уходят нейросети (раздел «parts» личного Worker,
// инструмент get_part_reads) — по нажатию «Сохранить», как и сама вставка.
import { esc, acts, openSheet, toast } from '../../../js/ui.js';
import { num } from '../../../js/format.js';
import { addDays } from '../../../js/calc.js';
import { parsePartReads, mergePartReads, partRetention, readsBroken } from '../partreads.js';

const app = () => window.__app;

export function readsSub(b) {
  const r = b.reads;
  if (!r?.parts?.length || readsBroken(r)) return 'вставить с Литнета';
  const last = Object.keys(r.days || {}).sort().pop();
  return last ? `по ${last.slice(8, 10)}.${last.slice(5, 7)}` : 'нет данных';
}

export function readsCard(b, today) {
  const r = readsBroken(b.reads) ? null : b.reads;
  const head = `<div class="row between"><h2 style="margin:0">Прочтения по главам</h2><button data-act="reads.paste" data-id="${b.id}">Вставить таблицу</button></div>`;
  if (!r?.parts?.length) return `<div class="card">${head}<p class="small muted" style="margin:8px 0 0">Литнет → кабинет автора → «Статистика» → книга → «Последние 30 дней»: выделите таблицу целиком вместе с заголовком, скопируйте и вставьте сюда. Вставлять можно хоть каждый день — дни складываются.</p></div>`;
  const rows = partRetention(r, addDays(today, -29), today);
  const worst = rows.slice(1).filter((x) => x.drop != null && rows[0].reads >= 50).sort((x, y) => y.drop - x.drop)[0];
  const max = Math.max(1, ...rows.map((x) => x.reads));
  return `<div class="card">${head}
    <p class="small muted" style="margin:6px 0 10px">За 30 дней · доля — от прочтений «${esc(rows[0]?.part || '')}»</p>
    ${worst ? `<p class="small warnc">Больше всего уходят перед «${esc(worst.part)}»: −${String(worst.drop).replace('.', ',')} % к предыдущей части.</p>` : ''}
    ${rows.map((x) => `<div class="bar-row"><div class="row between small"><span>${esc(x.part)}</span><span>${num(x.reads)}${x.retention != null ? ` · ${String(x.retention).replace('.', ',')} %` : ''}</span></div><div class="progress"><i style="width:${(x.reads / max * 100).toFixed(1)}%"></i></div></div>`).join('')}</div>`;
}

// всё по книгам — нейросети (личный Worker «Мастерской»; только если он подключён)
async function pushParts() {
  const a = app(), s = a.ctx().settings, base = String(s.bookAiWorker || '').replace(/\/+$/, ''), user = a.store.auth?.currentUser;
  if (!base || !user || a.store.mode !== 'firebase') return;
  const books = (a.ctx().data.w_books || []).filter((x) => x.reads?.parts?.length && !readsBroken(x.reads)).map((x) => ({ id: x.id, title: x.title, ...x.reads }));
  await fetch(base + '/sync/section/parts', { method: 'PUT', headers: { Authorization: 'Bearer ' + await user.getIdToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ section: 'parts', generatedAt: new Date().toISOString(), books }) });
}

acts['reads.paste'] = (d) => {
  const a = app(), b = a.ctx().data.w_books.find((x) => x.id === d.id);
  openSheet('Статистика по частям с Литнета', `<p class="small">Кабинет автора → «Статистика» → «${esc(b?.title || '')}» → «Последние 30 дней». Выделите таблицу вместе с заголовком (части и даты), скопируйте и вставьте:</p>
    <textarea name="t" rows="10" required placeholder="Части	Оценки читателей	11.11	10.11…"></textarea>`, async (fd) => {
    let fresh;
    try { fresh = parsePartReads(fd.get('t'), a.ctx().today); } catch (e) { toast(e.message); return false; }
    await a.store.patch('w_books', b.id, { reads: mergePartReads(readsBroken(b.reads) ? {} : b.reads, fresh) });
    pushParts().catch((e) => console.warn('Прочтения → нейросеть:', e));
    toast(`Сохранено: ${fresh.parts.length} частей, ${Object.keys(fresh.days).length} дн.`);
  }, { submitText: 'Сохранить' });
  return false;
};

// Снимок одной книги для нейросетей: только канон и рукопись, без финансов и чужих данных.
// Текст берётся из Google Документа при каждом явном экспорте/обновлении, не из устаревших счётчиков Мастерской.
import * as drive from './drive.js';
import { chaptersOf, serviceParas } from './publish.js';
import { contentToBlocks, blocksText } from './docedit.js';
import { legendOf, legendContext } from './legend.js';
import { bookGenres, bookTags } from './bookmeta.js';
import { synText } from './synopsis.js';

const noEmpty = (x) => String(x || '').trim();
const words = (v) => Array.isArray(v) ? v.filter(Boolean).join(', ') : '';
const statusName = { idea: 'Идея', progress: 'В процессе', done: 'Завершена' };
function chaptersFromDoc(doc, book) {
  const chapters = chaptersOf(doc).map((c) => ({
    title: c.title,
    text: c.paras.map((p) => (p.runs || []).map((r) => r.t || '').join('')).join('\n').trim()
  }));
  if (chapters.length) return chapters;
  // В старом одно-вкладочном Google Документе всё содержимое — рукопись.
  const tabs = doc?.tabs || [];
  if (tabs.length === 1) {
    const t = tabs[0];
    const text = blocksText(contentToBlocks(t.documentTab?.body?.content)).trim();
    return text ? [{ title: book.title || t.tabProperties?.title || 'Рукопись', text }] : [];
  }
  return [];
}
function chaptersFromDocx(xml, title) {
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  if (dom.querySelector('parsererror')) throw Error('Не удалось прочитать Word');
  const paragraphs = [...dom.getElementsByTagNameNS('*', 'p')].map((p) => [...p.getElementsByTagNameNS('*', 't')].map((x) => x.textContent || '').join(''));
  const out = [], head = /^\s*(?:пролог|эпилог|глава\s+\d+)\b/i;
  let current = null;
  for (const p of paragraphs) {
    if (head.test(p) && p.trim().length < 150) {
      if (current?.lines.length) out.push({ title: current.title, text: current.lines.join('\n').trim() });
      current = { title: p.trim(), lines: [p] };
    } else {
      if (!current) current = { title: title || 'Рукопись', lines: [] };
      current.lines.push(p);
    }
  }
  if (current?.lines.length) out.push({ title: current.title, text: current.lines.join('\n').trim() });
  return out;
}
export function snapshotContext(b, synopsis) {
  const status = statusName[b.status] || statusName.progress;
  const fields = [
    '# Книга «' + b.title + '»',
    '- Автор: Лана Фрейтаг',
    '- Статус: ' + status,
    '- Жанры: ' + (words(bookGenres(b)) || 'не указаны'),
    '- Теги и тропы: ' + (words(bookTags(b)) || 'не указаны'),
    '',
    '## Важно',
    'Сведения ниже — утверждённый рабочий канон. Если написанный текст ему противоречит, укажи противоречие, не переписывай молча. Рукопись могла измениться после времени синхронизации.',
    '',
    legendContext(legendOf(b), { title: b.title, mode: 'work', sections: ['idea', 'plan', 'chars', 'syn'], synopsis: synopsis || synText(b) })
  ];
  const promo = b.promo || {};
  if (noEmpty(promo.annotation)) fields.push('', '## Аннотация', noEmpty(promo.annotation));
  if (noEmpty(promo.short)) fields.push('', '## Короткий анонс', noEmpty(promo.short));
  return fields.join('\n');
}
export async function bookSnapshot(b) {
  if (!b) throw Error('Книга не найдена');
  let chapters = [], synopsis = synText(b);
  if (b.fileId) {
    await drive.ensureToken();
    if (b.mimeType === drive.MIME.doc) {
      const doc = await drive.getDoc(b.fileId);
      chapters = chaptersFromDoc(doc, b);
      synopsis = serviceParas(doc, 'synopsis', { fallback: synopsis }).text || synopsis;
    } else if (b.mimeType === drive.MIME.docx) {
      const zip = await drive.loadJsZip(), blob = await drive.fileBlob({ id: b.fileId, mimeType: drive.MIME.docx });
      const z = await zip.loadAsync(blob);
      const f = z.file('word/document.xml');
      if (!f) throw Error('Не найден текст в файле Word');
      chapters = chaptersFromDocx(await f.async('text'), b.title);
    } else throw Error('Формат файла книги пока не поддерживается');
  }
  return {
    id: b.id,
    title: b.title,
    context: snapshotContext(b, synopsis),
    chapters,
    generatedAt: new Date().toISOString()
  };
}
export function snapshotMarkdown(s) {
  return [s.context, '', '## Рукопись', s.chapters.length ? '' : '(Написанные главы не найдены: проверь подключение файла.)',
    ...s.chapters.flatMap((ch, i) => ['\n### ' + (i + 1) + '. ' + ch.title, '', ch.text, ''])
  ].join('\n');
}

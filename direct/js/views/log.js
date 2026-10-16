// История: что и когда меняли в Директе — из приложения или по плану ИИ (чтобы потом понять, что сработало)
import { esc } from '../../../js/ui.js';
import { logOf } from '../demo.js';

export function logView(a) {
  const list = logOf(a).slice().sort((x, y) => y.at.localeCompare(x.at));
  const when = (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return {
    html: `<div class="card"><h2>История изменений</h2>${list.length ? `<div class="list">${list.map((x) => `<div class="item"><div class="row between"><b>${esc(x.text)}</b><span class="small ${x.ok ? 'muted' : 'down'}">${x.ok ? (x.by === 'ai' ? 'по плану ИИ' : 'вы') : 'не применилось'}</span></div>
      <div class="small muted">${when(x.at)}${x.why ? ' · ' + esc(x.why) : ''}${x.demo ? ' · пример' : ''}</div>
      ${x.errors?.length ? `<div class="small down">${esc(x.errors.join('; '))}</div>` : ''}${x.warnings?.length ? `<div class="small warnc">${esc(x.warnings.join('; '))}</div>` : ''}</div>`).join('')}</div>` : '<p class="muted">Пока ничего не меняли. Здесь будет видно, что, когда и почему поменялось, — через неделю удобно сравнить с расходом и продажами.</p>'}</div>`,
  };
}

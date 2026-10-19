// Текст страницы по ссылке (условия конкурса): браузер не может открыть чужой сайт напрямую, поэтому
// сначала — через переходник владелицы на Cloudflare (версия 3 умеет страницы площадок), потом — через
// общедоступные «читалки» страниц. Ничего не отправляем, кроме самой ссылки.
import { cleanContestText } from './wcalc.js';

const clean = (t) => String(t || '').replace(/\r/g, '').replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').replace(/^ +| +$/gm, '').trim();

// HTML → текст с переносами строк по абзацам и пунктам (как при «выделить всё и скопировать»)
export function htmlToText(html) {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('script, style, noscript, svg, iframe, header, footer, nav, form').forEach((e) => e.remove());
  d.querySelectorAll('br').forEach((e) => e.replaceWith('\n'));
  d.querySelectorAll('p, div, li, tr, h1, h2, h3, h4, h5, h6, section, article, dt, dd, time, span.date').forEach((e) => { e.prepend('\n'); e.append('\n'); });
  return clean(d.body?.textContent || '');
}

export async function fetchPageText(url, settings = {}) {
  const proxy = (settings.direct?.proxy || '').replace(/\/+$/, '');
  const tries = [
    ...(proxy ? [async () => { const r = await fetch(`${proxy}/page?url=${encodeURIComponent(url)}`); if (!r.ok) throw new Error(r.status); return htmlToText(await r.text()); }] : []),
    async () => { const r = await fetch('https://r.jina.ai/' + url, { headers: { Accept: 'text/plain' } }); if (!r.ok) throw new Error(r.status); return clean((await r.text()).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')); },
    async () => { const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url)); if (!r.ok) throw new Error(r.status); return htmlToText(await r.text()); },
  ];
  for (const t of tries) {
    try { const text = await t(); if (text && text.length > 200) return cleanContestText(text); } catch { /* пробуем следующий способ */ }
  }
  throw new Error('страница не открылась');
}

// Цвет акцентов для обоих приложений: пастельные палитры (светлая и тёмная тема).
// Выбор — в Настройках Мастерской, хранится в общих настройках (settings.accent) и в браузере, чтобы цвет
// включался сразу при открытии, без мигания розовым.
export const PALETTES = {
  rose: { name: 'Розовый', light: { accent: '#b0466f', a2: '#f6c9d9', soft: '#fbe7ef', from: '#f9d5e2', to: '#f3bcd0', bar: '#eeaac4', unk: '#f6dbe5', band: 'rgba(238,170,196,.18)', s2: '#f8eef2' }, dark: { accent: '#f2b3ca', a2: '#f2b3ca', soft: '#3a2a30', from: '#f6c6d7', to: '#eeaac4', bar: '#e79ab8', unk: '#5a3a46', band: 'rgba(242,179,202,.12)', s2: '#2c2427' } },
  sage: { name: 'Шалфей', light: { accent: '#4f7a5c', a2: '#c9e2cf', soft: '#e8f3eb', from: '#d6eadb', to: '#bcdcc5', bar: '#a9d2b4', unk: '#d9ebde', band: 'rgba(169,210,180,.2)', s2: '#eef5f0' }, dark: { accent: '#a9d8b6', a2: '#a9d8b6', soft: '#25332a', from: '#c2e6cc', to: '#a5d4b2', bar: '#8cc49c', unk: '#34493b', band: 'rgba(169,216,182,.12)', s2: '#232a25' } },
  sky: { name: 'Голубой', light: { accent: '#3f6f9a', a2: '#c8ddef', soft: '#e7f0f8', from: '#d4e5f4', to: '#b9d4ec', bar: '#a6c8e6', unk: '#d6e6f3', band: 'rgba(166,200,230,.2)', s2: '#edf3f8' }, dark: { accent: '#a9cbea', a2: '#a9cbea', soft: '#24303b', from: '#c1daf0', to: '#a3c6e6', bar: '#8bb7de', unk: '#33465a', band: 'rgba(169,203,234,.12)', s2: '#222930' } },
  lavender: { name: 'Лаванда', light: { accent: '#6e58a8', a2: '#dcd2f1', soft: '#f0ebfa', from: '#e3daf5', to: '#d0c2ee', bar: '#c3b2e8', unk: '#e4dcf4', band: 'rgba(195,178,232,.2)', s2: '#f3f0f9' }, dark: { accent: '#c6b6ef', a2: '#c6b6ef', soft: '#2e2a3b', from: '#d6cbf4', to: '#beaceb', bar: '#ab97e2', unk: '#433b59', band: 'rgba(198,182,239,.12)', s2: '#28252f' } },
  peach: { name: 'Персик', light: { accent: '#a85a3c', a2: '#f6d4c3', soft: '#fcece4', from: '#f9dccd', to: '#f3c6b0', bar: '#efb79d', unk: '#f7dfd3', band: 'rgba(239,183,157,.2)', s2: '#faf0eb' }, dark: { accent: '#f1bfa6', a2: '#f1bfa6', soft: '#3a2c25', from: '#f5ceba', to: '#edb699', bar: '#e5a281', unk: '#57402f', band: 'rgba(241,191,166,.12)', s2: '#2c2522' } },
  pearl: { name: 'Жемчужный', light: { accent: '#5d5a63', a2: '#dddbe1', soft: '#efeef1', from: '#e6e4e9', to: '#d4d1d9', bar: '#c4c0ca', unk: '#e3e1e6', band: 'rgba(196,192,202,.22)', s2: '#f2f1f3' }, dark: { accent: '#cfccd6', a2: '#cfccd6', soft: '#2d2c30', from: '#dcd9e2', to: '#c6c2cd', bar: '#aeaab6', unk: '#45434b', band: 'rgba(207,204,214,.12)', s2: '#272629' } },
};
// Свой цвет (владелица, 01.11.2026: «выбор абсолютно любого цвета, но стильный и удобный»): ключ «c:оттенок:насыщенность»
// (оттенок 0–359, насыщенность 0–100). Светлоту каждого тона задаём сами — так любой выбор остаётся мягким, как готовые палитры.
const hex = (h, s, l) => { s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0');
  return '#' + f(0) + f(8) + f(4); };
export const parseCustom = (key) => { const m = /^c:(\d{1,3}):(\d{1,3})$/.exec(String(key || '')); return m ? { h: Math.min(359, +m[1]), sat: Math.min(100, +m[2]) } : null; };
export const customKey = (h, sat) => `c:${Math.round(h)}:${Math.round(sat)}`;
export function customPalette(h, sat) {
  const s = 18 + sat * 0.52;           // 18–70 %: от пыльного до сочного, без кислотных цветов
  const L = (l, k = 1) => hex(h, s * k, l);
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(',');
  return { name: 'Свой', light: { accent: L(36, 0.95), a2: L(86), soft: L(94, 0.9), from: L(89), to: L(81), bar: L(75), unk: L(88, 0.8), band: `rgba(${rgb(L(75))},.2)`, s2: L(96, 0.5) },
    dark: { accent: L(79), a2: L(79), soft: L(19, 0.35), from: L(85), to: L(76), bar: L(69), unk: L(30, 0.4), band: `rgba(${rgb(L(77))},.12)`, s2: L(16, 0.2) } };
}
export const paletteOf = (key) => PALETTES[key] || (parseCustom(key) ? customPalette(parseCustom(key).h, parseCustom(key).sat) : PALETTES.rose);
const vars = (p) => `--accent:${p.accent};--accent-2:${p.a2};--accent-soft:${p.soft};--btn-from:${p.from};--btn-to:${p.to};--bar:${p.bar};--bar-unk:${p.unk};--band:${p.band};--surface-2:${p.s2};`;
export function applyAccent(key, { save = true } = {}) {
  const k = PALETTES[key] || parseCustom(key) ? key : 'rose';
  if (save) try { localStorage.setItem('accent', k); } catch { /* ок */ }
  recolorFavicon(k);
  let el = document.getElementById('accent-css');
  if (k === 'rose') { el?.remove(); return; } // розовый — родные цвета стилей
  if (!el) { el = document.createElement('style'); el.id = 'accent-css'; document.head.appendChild(el); }
  const p = paletteOf(k);
  el.textContent = `:root{${vars(p.light)}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars(p.dark)}}}:root[data-theme="dark"]{${vars(p.dark)}}`;
}
// при открытии — сразу из памяти браузера; после загрузки настроек — из них
export function initAccent(store) {
  let cur = null;
  try { cur = localStorage.getItem('accent'); } catch { /* ок */ }
  applyAccent(cur);
  store.subscribe(() => { const a = store.data.settings?.accent; if (a && a !== cur) { cur = a; applyAccent(a); } });
}

// значок вкладки — того же цвета: перекрашиваем розовый градиент значка приложения
const svgCache = {};
const getSvg = async (url) => (svgCache[url] ??= fetch(new URL(url, location.href)).then((r) => r.text()));
async function recolorFavicon(k) {
  const link = document.querySelector('link[rel="icon"]');
  if (!link) return;
  const orig = link.dataset.orig || (link.dataset.orig = link.getAttribute('href'));
  const p = paletteOf(k).light;
  if (!/\.svg(\?|$)/.test(orig)) return; // значок-картинка (фото медведя в Мастерской) — не перекрашиваем, ярлык телефона тоже остаётся свой
  try {
    const svg = await getSvg(orig);
    if (k !== 'rose') link.setAttribute('href', 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace(/#fbdbe6/gi, p.from).replace(/#f3bcd0/gi, p.to)));
    else link.setAttribute('href', orig);
    touchIcon(svg, p);
  } catch { /* останется прежний значок */ }
}
// Ярлык на экране телефона — того же цвета, что акценты (iPhone берёт картинку в момент «На экран „Домой“»).
// Значок с розовым градиентом (Доходы, Директ) перекрашиваем; линейный медведь (Мастерская) ставим на пастельный фон цвета акцента.
let touchSeq = 0;
async function touchIcon(svg, p) {
  const link = document.querySelector('link[rel="apple-touch-icon"]');
  if (!link) return;
  const seq = ++touchSeq;
  let out;
  if (/#fbdbe6/i.test(svg)) out = svg.replace(/#fbdbe6/gi, p.from).replace(/#f3bcd0/gi, p.to);
  else {
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<style>[\s\S]*?<\/style>/, '');
    out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="${p.from}"/><g transform="translate(12 12) scale(.64) translate(-12 -12)" fill="none" stroke="${p.accent}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${inner.replace(/class="f"/g, `fill="${p.accent}" stroke="none"`)}</g></svg>`;
  }
  try {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out);
    await img.decode();
    if (seq !== touchSeq) return;
    const cv = document.createElement('canvas'); cv.width = cv.height = 180;
    const g = cv.getContext('2d'); g.fillStyle = p.from; g.fillRect(0, 0, 180, 180); // без прозрачных углов — iPhone закрасил бы их чёрным
    g.drawImage(img, 0, 0, 180, 180);
    link.setAttribute('href', cv.toDataURL('image/png'));
  } catch { /* останется прежний ярлык */ }
}

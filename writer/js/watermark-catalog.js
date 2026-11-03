// Автоматическая загрузка опубликованных экспериментальных s*‑таблиц.
// Источник только guillaumemeyer/watermarks-remover (stealer). Никакие главы в
// сеть не отправляются: загружаются только публичные JSON с коэффициентами.
import { isTrainedScorer } from './watermark-score.js';

const OWNER_REPO = 'guillaumemeyer/watermarks-remover';
const API = 'https://api.github.com/repos/' + OWNER_REPO;
const RAW = 'https://raw.githubusercontent.com/' + OWNER_REPO + '/main/';
const CACHE_KEY = 'writer:wm-catalog:v1';
const CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_SINGLE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_MODELS = 4;

function allowedName(path) {
  const file = String(path || '');
  if (!file.toLowerCase().endsWith('.json')) return false;
  if (/(^|\/)(tests?|fixtures?|examples?|docs?|prompts?|benchmarks?)(\/|$)/i.test(file)) return false;
  return /(^|\/)(s[_-]?star(?:[_-][^/]*)?|[^/]*(?:scorer|watermark[_-]?model)[^/]*)\.json$/i.test(file)
    || /(^|\/)(?:stealer\/)?(?:scorers?|trained|models?)\/[^/]+\.json$/i.test(file);
}
function trustedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' &&
      (u.hostname === 'raw.githubusercontent.com' && u.pathname.startsWith('/' + OWNER_REPO + '/')) ||
      (u.protocol === 'https:' && u.hostname === 'github.com' &&
       u.pathname.startsWith('/' + OWNER_REPO + '/releases/download/'));
  } catch { return false; }
}
function fromTree(tree) {
  if (!Array.isArray(tree?.tree) || tree.truncated) return [];
  return tree.tree.filter((item) => item.type === 'blob' && allowedName(item.path))
    .map((item) => ({
      name: item.path.split('/').at(-1).replace(/\.json$/i, ''),
      url: RAW + item.path.split('/').map(encodeURIComponent).join('/'),
      bytes: item.size || 0,
    }));
}
function fromRelease(release) {
  if (!Array.isArray(release?.assets)) return [];
  return release.assets.filter((asset) => allowedName(asset.name))
    .map((asset) => ({
      name: asset.name.replace(/\.json$/i, ''),
      url: asset.browser_download_url,
      bytes: asset.size || 0,
    }));
}
export function modelCandidates(tree, release) {
  const all = [...fromTree(tree), ...fromRelease(release)].filter((x) =>
    trustedUrl(x.url) && x.bytes > 0 && x.bytes <= MAX_SINGLE_BYTES);
  const unique = new Map();
  all.forEach((item) => { if (!unique.has(item.url)) unique.set(item.url, item); });
  return [...unique.values()].sort((a, b) => a.bytes - b.bytes).slice(0, 24);
}

function cacheRead(storage) {
  try {
    const record = JSON.parse(storage?.getItem(CACHE_KEY) || 'null');
    if (!record || !Array.isArray(record.items) || !Number.isFinite(record.at)) return null;
    return { at: record.at, items: record.items.filter((m) =>
      trustedUrl(m.url) && Number(m.bytes) > 0 && Number(m.bytes) <= MAX_SINGLE_BYTES).slice(0, 24) };
  } catch { return null; }
}
function cacheWrite(storage, record) {
  try { storage?.setItem(CACHE_KEY, JSON.stringify(record)); } catch { /* private mode */ }
}
async function readJson(url, fetcher, timeoutMs = 10000) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetcher(url, { cache: 'no-store', signal: controller?.signal,
      headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  } finally { if (timer) clearTimeout(timer); }
}

export async function discoverModelCandidates({
  fetcher = globalThis.fetch, storage = globalThis.localStorage, now = Date.now(),
} = {}) {
  const cached = cacheRead(storage);
  if (cached && now - cached.at >= 0 && now - cached.at < CACHE_MS) {
    return { items: cached.items, stale: false };
  }
  const checks = await Promise.allSettled([
    readJson(API + '/git/trees/main?recursive=1', fetcher),
    readJson(API + '/releases/latest', fetcher),
  ]);
  if (checks.every((x) => x.status === 'rejected')) {
    if (cached) return { items: cached.items, stale: true };
    throw new Error('Не удалось проверить обновления на GitHub');
  }
  const tree = checks[0].status === 'fulfilled' ? checks[0].value : null;
  const release = checks[1].status === 'fulfilled' ? checks[1].value : null;
  const items = modelCandidates(tree, release);
  cacheWrite(storage, { at: now, items });
  return { items, stale: false };
}

function validation(data) {
  if (!isTrainedScorer(data)) return false;
  const count = Object.keys(data.scorer).length;
  // Test fixtures and placeholder tables are not model-specific analyses.
  if (count < 50) return false;
  return Object.values(data.scorer).some((entries) =>
    Array.isArray(entries) && entries.some((e) => typeof e.token === 'string' &&
      Number.isFinite(Number(e.score)) && Number(e.score) > 0));
}
function labelOf(data, item) {
  const raw = String(data.config?.model || data.config?.target_model || item.name || '').trim();
  return raw.slice(0, 80) || 'Модель без названия';
}
export function compatibleWithRussian(data) {
  const lang = String(data?.config?.language || data?.config?.lang || '').toLowerCase().trim();
  return !lang || /^(ru|ru-ru|русский|multilingual|multi|all|\*)$/.test(lang);
}

export async function availableModelScorers(options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  const discovered = await discoverModelCandidates(options);
  const loaded = [];
  let skipped = 0, bytes = 0;
  for (const item of discovered.items) {
    if (loaded.length >= MAX_MODELS) break;
    if (bytes + item.bytes > MAX_TOTAL_BYTES) { skipped++; continue; }
    bytes += item.bytes;
    try {
      const data = await readJson(item.url, fetcher, 15000);
      if (!validation(data) || !compatibleWithRussian(data)) { skipped++; continue; }
      loaded.push({ label: labelOf(data, item), source: item.url, data });
    } catch { skipped++; }
  }
  return { models: loaded, availableCount: discovered.items.length, skipped, stale: discovered.stale };
}

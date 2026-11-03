import test from 'node:test';
import assert from 'node:assert/strict';
import {
  modelCandidates, discoverModelCandidates, availableModelScorers, compatibleWithRussian,
} from '../writer/js/watermark-catalog.js';

const API = 'https://api.github.com/repos/guillaumemeyer/watermarks-remover';
const URL = 'https://raw.githubusercontent.com/guillaumemeyer/watermarks-remover/main/stealer/models/opus55_ru.json';
const mkStorage = () => {
  const values = new Map();
  return { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
};
const jsonResponse = (value) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => JSON.stringify(value),
});
const corpus = () => {
  const scorer = {};
  for (let i = 0; i < 60; i++) scorer[JSON.stringify(['контекст' + i])] = [{ token: 'слово', score: 0.5 }];
  return { config: { context_len: 1, model: 'Claude Opus 5.5', language: 'ru' }, scorer };
};

test('finds only candidate tables, not fixture / docs or other repositories', () => {
  const candidates = modelCandidates({
    truncated: false,
    tree: [
      { path: 'stealer/models/opus55_ru.json', type: 'blob', size: 3000 },
      { path: 'stealer/s_star_sonnet.json', type: 'blob', size: 5000 },
      { path: 'stealer/tests/s_star_fake.json', type: 'blob', size: 900 },
      { path: 'stealer/prompts/prompts.jsonl', type: 'blob', size: 900 },
      { path: 'README.md', type: 'blob', size: 2000 },
    ],
  }, { assets: [] });
  assert.equal(candidates.length, 2);
  assert.ok(candidates.some((x) => x.url === URL));
});

test('fetches the current catalog once and reuses it within six hours', async () => {
  const storage = mkStorage();
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (url === API + '/git/trees/main?recursive=1') {
      return jsonResponse({ tree: [{ path: 'stealer/models/opus55_ru.json', type: 'blob', size: 3000 }] });
    }
    if (url === API + '/releases/latest') return jsonResponse({ assets: [] });
    throw new Error('unexpected URL ' + url);
  };
  const a = await discoverModelCandidates({ fetcher, storage, now: 1000 });
  const b = await discoverModelCandidates({ fetcher, storage, now: 2000 });
  assert.deepEqual(a.items, b.items);
  assert.equal(calls.length, 2);
});

test('automatically loads a valid scorer for Russian; no manuscript sent upstream', async () => {
  const storage = mkStorage(), calls = [];
  const fetcher = async (url, args) => {
    calls.push({ url, method: args?.method || 'GET' });
    if (url === API + '/git/trees/main?recursive=1') {
      return jsonResponse({ tree: [{ path: 'stealer/models/opus55_ru.json', type: 'blob', size: 3000 }] });
    }
    if (url === API + '/releases/latest') return jsonResponse({ assets: [] });
    if (url === URL) return jsonResponse(corpus());
    throw new Error('unexpected request');
  };
  const result = await availableModelScorers({ fetcher, storage, now: 1000 });
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].label, 'Claude Opus 5.5');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(({ method }) => method === 'GET'));
});

test('does not accept English-only scorer for Russian work', () => {
  assert.equal(compatibleWithRussian({ config: { language: 'en' } }), false);
  assert.equal(compatibleWithRussian({ config: { language: 'multilingual' } }), true);
  assert.equal(compatibleWithRussian({ config: { language: 'ru' } }), true);
});

test('offline GitHub falls back to catalog entries already checked', async () => {
  const storage = mkStorage();
  storage.setItem('writer:wm-catalog:v1', JSON.stringify({
    at: 1000,
    items: [{ url: URL, name: 'opus55_ru', bytes: 3000 }],
  }));
  const result = await discoverModelCandidates({
    storage, now: 1000 + 7 * 3600000,
    fetcher: async () => { throw new Error('offline'); },
  });
  assert.equal(result.stale, true);
  assert.equal(result.items.length, 1);
});

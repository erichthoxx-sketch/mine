import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_INTEL_FEEDS, MARKET_INTEL_SOURCES, parsePublicFeed, distinctNews } from '../direct/js/marketintel.js';

test('международный рынок: RSS ленты и источники тропов, Amazon, Reddit', () => {
  assert.ok(MARKET_INTEL_FEEDS.some((x) => x.name === 'Book Riot'));
  assert.ok(MARKET_INTEL_SOURCES.some((x) => x.url.includes('amazon.com')));
  assert.ok(MARKET_INTEL_SOURCES.some((x) => x.url.includes('reddit.com')));
});

test('международный рынок: заголовки из публичного Markdown RSS-Reader; отсев рекламы и подозрительных ссылок', () => {
  const src = { id: 'riot', name: 'Book Riot', lang: 'EN', url: 'https://bookriot.com/feed/' };
  const text = [
    '[The New Dark Romance Reading Trend Readers Discuss](https://bookriot.com/dark-romance-reading-trend/)',
    '[About the website and our Team](https://bookriot.com/about/)',
    '[Romance Book News Special Edition](javascript:alert(1))',
    '[Fantasy romance and booktok growth this year](https://unrelated.example.org/post/)',
    '[Romance and sports romance on BookTok](https://bookriot.com/romance-booktok/)',
  ].join('\n');
  const result = parsePublicFeed(text, src);
  assert.deepEqual(result.map((x) => x.url), [
    'https://bookriot.com/dark-romance-reading-trend/',
    'https://bookriot.com/romance-booktok/',
  ]);
  assert.deepEqual(distinctNews([...result, ...result]).map((x) => x.url), result.map((x) => x.url));
});

test('международный рынок: нерелевантные новости не попадают в книжную разведку', () => {
  const src = { id: 'pub', name: 'Publishing Perspectives', lang: 'EN', url: 'https://publishingperspectives.com/feed/' };
  assert.deepEqual(parsePublicFeed('[Sports car sales climb in 2026](https://publishingperspectives.com/sports-cars/)', src), []);
});

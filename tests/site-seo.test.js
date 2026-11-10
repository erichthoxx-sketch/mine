import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSeo, seoLinks } from '../scripts/site-seo.mjs';
import { DEFAULT_CONTENT } from '../site/content.js';

test('страницы для поисковиков: главная и книги с текстом, заголовком, описанием, разметкой; sitemap и robots', () => {
  const shell = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const files = buildSeo(DEFAULT_CONTENT, shell, { today: '2026-11-10' });
  const home = files['index.html'];
  assert.match(home, /<title>[^<]+ — любовные романы, читать онлайн<\/title>/);
  assert.match(home, /application\/ld\+json/);
  assert.ok(!home.includes('<main id="top"></main>')); // текст уже в странице
  const books = Object.keys(files).filter((k) => k.startsWith('kniga/'));
  assert.ok(books.length >= 1);
  const page = files[books[0]];
  assert.match(page, /<base href="\/">/);
  assert.match(page, /"@type":"Book"/);
  assert.match(page, /<link rel="canonical" href="https:\/\/lanafreitag\.ru\/kniga\/[^"]+\/">/);
  assert.ok(!/<title>[^<]*\*/.test(page)); // без звёздочек курсива в заголовке
  assert.match(files['sitemap.xml'], /<loc>https:\/\/lanafreitag\.ru\/kniga\//);
  assert.match(files['robots.txt'], /Disallow: \/admin\/[\s\S]*Sitemap: https:\/\/lanafreitag\.ru\/sitemap\.xml/);
  assert.equal(seoLinks('<a href="./?kniga=abc">'), '<a href="/kniga/abc/">');
});

import { renderSite } from '../site/content.js';
test('«Письмо автору» в «Об авторе»: только когда подключён сервис писем и форма не выключена', () => {
  const about = { id: 'ka', type: 'about', label: 'Об авторе', title: 'Я', text: 'Текст', msgOn: true };
  const base = { ...DEFAULT_CONTENT, blocks: [about] };
  assert.ok(!renderSite(base).main.includes('data-letter'));
  const on = renderSite({ ...base, mailUrl: 'https://functions.yandexcloud.net/x' }).main;
  assert.match(on, /data-letter-form/); assert.match(on, /Написать мне/); assert.match(on, /name="site"/); // ловушка для ботов
  assert.ok(!renderSite({ ...base, mailUrl: 'https://f/x', blocks: [{ ...about, msgOn: false }] }).main.includes('data-letter'));
});

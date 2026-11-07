import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

test('Freitag AI: JavaScript parses', () => {
  execFileSync(process.execPath, ['--check', 'ai/app.js'], { stdio: 'pipe' });
});
test('Freitag AI: entrypoint, styles and manifest exist', () => {
  for (const file of ['ai/index.html', 'ai/style.css', 'ai/app.js', 'ai/manifest.webmanifest']) {
    assert.equal(existsSync(file), true, file);
  }
  const index = readFileSync('ai/index.html', 'utf8');
  assert.match(index, /src="\.\/app\.js"/);
  assert.match(index, /href="\.\/style\.css"/);
  assert.match(index, /href="\.\.\/css\/style\.css"/);
});
test('Freitag AI: deploy pipeline includes the app', () => {
  const yaml = readFileSync('.github/workflows/pages.yml', 'utf8');
  assert.match(yaml, /_site\/ai\/index\.html/);
  assert.match(yaml, /cp ai\/app\.js _site\/\$V\/ai\/app\.js/);
});

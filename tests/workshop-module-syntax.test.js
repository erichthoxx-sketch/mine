// Guard against browser-only syntax errors that do not appear in regular unit tests.
// One malformed template literal in a lazy-loaded view can prevent the entire workshop from starting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viewDir = join(root, 'writer/js/views');
const files = [
  join(root, 'writer/js/app.js'),
  join(root, 'writer/js/piracy.js'),
  join(root, 'writer/js/piracyscan.js'),
  ...readdirSync(viewDir).filter((name) => name.endsWith('.js')).map((name) => join(viewDir, name)),
];

test('Мастерская: все модули интерфейса проходят проверку синтаксиса', () => {
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file.replace(root + '/', '')}: ${result.stderr || result.stdout}`);
  }
});

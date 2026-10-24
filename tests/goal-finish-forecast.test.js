import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finishGoalForecast } from '../writer/js/wcalc.js';
import { readFileSync } from 'node:fs';

test('30 remaining chapters, Mon-Fri, one a day from Sat 24 Oct 2026 ends Fri 4 Dec', () => {
  assert.equal(finishGoalForecast({ from:'2026-10-24',chapters:30,completed:0,perDay:1,days:[1,2,3,4,5] }), '2026-12-04');
});
test('Excludes written chapters, starts first eligible day, leaves weekend off', () => {
  assert.equal(finishGoalForecast({ from:'2026-10-24',chapters:30,completed:25,perDay:1,days:[1,2,3,4,5] }), '2026-10-30');
  assert.equal(finishGoalForecast({ from:'2026-10-24',chapters:30,completed:25,perDay:2,days:[1,2,3,4,5] }), '2026-10-28');
  assert.equal(finishGoalForecast({ from:'2026-10-26',chapters:5,completed:4,perDay:1,days:[1,2,3,4,5] }), '2026-10-26');
});
test('Selected Saturday and Sunday can be writing days if user explicitly chooses them', () => {
  assert.equal(finishGoalForecast({ from:'2026-10-24',chapters:2,perDay:1,days:[6,7] }), '2026-10-25');
  assert.equal(finishGoalForecast({ from:'2026-10-24',chapters:1,perDay:1,days:[7] }), '2026-10-25');
  assert.equal(finishGoalForecast({ from:'2026-10-24',chapters:2,perDay:1,days:[] }), '2026-10-25'); // saved goal all seven days
});
test('Explicitly completed or invalid plans do not yield misleading dates', () => {
  assert.equal(finishGoalForecast({ from:'2026-10-24',chapters:30,completed:30,perDay:1,days:[1,2,3,4,5] }), '2026-10-24');
  for (const x of [
    {from:'2026-10-24',chapters:0,perDay:1},
    {from:'2026-10-24',chapters:30,perDay:0},
    {from:'2026-10-24',chapters:30,perDay:-1},
    {from:'2026-10-24',chapters:30,perDay:1,days:[9]},
    {from:'',chapters:30,perDay:1},
  ]) assert.equal(finishGoalForecast(x),null);
});
test('Manual target dates for existing goals are preserved; new goals default Mon-Fri', () => {
  const code=readFileSync(new URL('../writer/js/views/goals.js',import.meta.url),'utf8');
  assert.match(code,/g\.autoDeadline === true \|\| \(!g\.deadline && g\.autoDeadline !== false\)/);
  assert.match(code,/g\.days\.length \? g\.days : \[1, 2, 3, 4, 5, 6, 7\]\) : \[1, 2, 3, 4, 5\]/);
  assert.match(code,/f\.elements\.deadline\.readOnly = auto/);
  assert.match(code,/f\.querySelectorAll\('\[name="dow"\]:checked'\)/);
  assert.match(code,/for \(const ch of f\.querySelectorAll\('\[name="dow"\]'\)\) ch\.addEventListener\('change',upd\)/);
});

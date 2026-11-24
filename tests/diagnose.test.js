import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segRows, breakdown, diagnose, adDuel } from '../direct/js/diagnose.js';
import { compareRows } from '../direct/js/compare.js';

const day = (i) => new Date(Date.UTC(2026, 10, 19) - i * 864e5).toISOString().slice(0, 10);

test('отчёт «кто кликает» → строки с целями', () => {
  const r = segRows([{ CampaignId: 7, AdNetworkType: 'AD_NETWORK', Device: 'MOBILE', Gender: 'GENDER_FEMALE', Age: 'AGE_25_34', Impressions: '100', Clicks: '10', Cost: '90.5', Conversions_9002_LSCCD: '3', Conversions_9001_LSCCD: '0' }]);
  assert.deepEqual(r, [{ cid: 7, net: 'n', dev: 'MOBILE', gen: 'GENDER_FEMALE', age: 'AGE_25_34', impr: 100, clicks: 10, cost: 90.5, goals: { 9002: 3 } }]);
});

test('разрез: утечка и «работает лучше» — только при заметной разнице, мало кликов — «мало данных»', () => {
  const b = breakdown([
    { k: 'f', label: 'Женщины', clicks: 1000, cost: 9000, lib: 160 },
    { k: 'm', label: 'Мужчины', clicks: 250, cost: 2250, lib: 3 },
    { k: 'u', label: 'Не известно', clicks: 12, cost: 100, lib: 1 },
  ]);
  const by = Object.fromEntries(b.map((x) => [x.k, x]));
  assert.equal(by.m.verdict, 'cut'); assert.ok(by.m.effect > 0);
  assert.equal(by.u.verdict, 'few');
  assert.equal(by.f.verdict, 'boost');
  // одинаковая доля — «как в среднем»
  const e = breakdown([{ k: 'a', label: 'А', clicks: 500, cost: 4000, lib: 50 }, { k: 'b', label: 'Б', clicks: 500, cost: 4000, lib: 48 }]);
  assert.deepEqual(e.map((x) => x.verdict), ['ok', 'ok']);
});

test('диагноз: экономика добавления, безубыточность, узкое место и оценка', () => {
  const camp = { id: 1, start: day(40) };
  const daily = [], conv = [];
  for (let i = 29; i >= 0; i--) {
    const late = i < 7; // последняя неделя: из кликов добавляют вдвое реже
    daily.push({ date: day(i), cid: 1, impr: 2000, clicks: 80, cost: 800 });
    conv.push({ date: day(i), cid: 1, conv: { 9002: late ? 4 : 8 } });
  }
  const D = diagnose({ camp, daily, conv, goals: { lib: '9002', buy: ['9001'] }, today: day(0), libValue: 150 });
  assert.equal(D.enough, true);
  assert.equal(D.neck.k, 'cr'); // меньше людей добавляют книгу
  assert.ok(Math.abs(D.unit.cpc - 10) < 1e-9);
  // безубыточность: клик до доля × ценность, нужная доля — клик ÷ ценность
  assert.ok(Math.abs(D.unit.maxCpc - D.unit.cr * 150) < 1e-9);
  assert.ok(Math.abs(D.unit.needCr - 10 / 150) < 1e-9);
  assert.ok(D.score >= 0 && D.score <= 100);
  assert.equal(D.trend.length, 60);
  // мало данных — без оценки
  const W = diagnose({ camp, daily: daily.slice(-1), conv: conv.slice(-1), goals: { lib: '9002', buy: [] }, today: day(0) });
  assert.equal(W.score, null); assert.equal(W.neck.k, 'data');
});

test('тест объявлений: по добавлениям, когда они видны; победитель — только при заметной разнице; останавливать — если в группе останется другое', () => {
  const ads = [{ id: 1, gid: 5, state: 'ON', title: 'Вдова' }, { id: 2, gid: 5, state: 'ON', title: 'Медведь' }, { id: 3, gid: 5, state: 'ON', title: 'Третье' }];
  const measured = [{ k: 1, impr: 9000, clicks: 400, cost: 4000, lib: 60 }, { k: 2, impr: 9000, clicks: 400, cost: 4000, lib: 20 }, { k: 3, impr: 9000, clicks: 300, cost: 3000, lib: 30 }];
  const T = adDuel({ all: measured, measured }, ads);
  assert.equal(T.by, 'lib'); assert.equal(T.status, 'win'); assert.equal(T.best.k, 1); assert.equal(T.loser.k, 2); assert.equal(T.canStop, true);
  // два объявления в группе — победитель есть, но останавливать нельзя
  const T2 = adDuel({ all: measured.slice(0, 2), measured: measured.slice(0, 2) }, ads.slice(0, 2));
  assert.equal(T2.status, 'win'); assert.equal(T2.canStop, false);
  // целей по объявлениям нет — по CTR; мало показов — тест идёт, сколько ещё нужно
  const W = adDuel({ all: [{ k: 1, impr: 600, clicks: 12, cost: 100, lib: 0 }, { k: 2, impr: 600, clicks: 9, cost: 100, lib: 0 }], measured: [] }, ads);
  assert.equal(W.by, 'ctr'); assert.equal(W.status, 'wait'); assert.ok(W.need > 0);
});

test('все кампании в одной таблице: свой Директ и таргетологи без общего рейтинга и двойного счёта Директа из «Доходов»', () => {
  const income = [
    { c: { id: 'k1', name: 'Иванова, ноябрь', channel: 'own' }, m: { status: 'running', spendTotal: 10000 }, v: { kind: 'bad', share: 0.6 }, live: true },
    { c: { id: 'k2', name: 'Директ: «Вдова»', src: 'direct' }, m: { status: 'running', spendTotal: 5000 }, v: { kind: 'good', share: 2 }, live: true },
  ];
  const { rows, verdict } = compareRows({ direct: [{ id: 7, name: 'Вдова — ЕПК', book: 'Вдова', cost: 8000, score: 81, grade: 'good', share: 1.5, enough: true }], income, partners: [{ id: 'p', name: 'Иванова' }] });
  assert.deepEqual(rows.map((x) => [x.who, x.kind]), [['Мой Директ', 'good'], ['Иванова', 'bad']]);
  assert.match(verdict, /рассчитана разными способами/);
});

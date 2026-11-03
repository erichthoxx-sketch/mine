import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeWithOffsets, scoreTokenPositions, isTrainedScorer } from '../writer/js/watermark-score.js';

test('Cyrillic tokens get stable UTF-16 positions', () => {
  assert.deepEqual(tokenizeWithOffsets('Она подошла, да.'), [
    { text: 'она', start: 0, end: 3 },
    { text: 'подошла', start: 4, end: 11 },
    { text: ',', start: 11, end: 12 },
    { text: 'да', start: 13, end: 15 },
    { text: '.', start: 15, end: 16 },
  ]);
});

test('highlights only positively-scored exact context-token pairs', () => {
  const corpus = 'Она подошла к окну. Она подошла к двери.';
  const model = {
    config: { context_len: 2 },
    scorer: {
      '["подошла","к"]': [{ token: 'окну', score: 1.7 }, { token: 'двери', score: -0.4 }],
    },
  };
  const r = scoreTokenPositions(corpus, model);
  assert.equal(r.matched, 1);
  assert.deepEqual(r.hits.map((h) => h.text), ['окну']);
  assert.equal(corpus.slice(r.hits[0].start, r.hits[0].end), 'окну');
});

test('empty placeholder cannot be interpreted as negative result', () => {
  assert.equal(isTrainedScorer({ config: { context_len: 8 }, scorer: {} }), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSample, estimateSoc, createSimulator } from './telemetry.js';

test('parseSample accepts good JSON and computes power', () => {
  const s = parseSample('{"v":25.1,"i":10,"spd":18.4,"temp":41.2}', 1000);
  assert.equal(s.ts, 1000);
  assert.equal(s.p, 251);
});

test('parseSample rejects junk', () => {
  assert.equal(parseSample('not json'), null);
  assert.equal(parseSample('{"v":1}'), null);
  assert.equal(parseSample('{"v":"x","i":1,"spd":1,"temp":1}'), null);
});

test('estimateSoc clamps to 0-100', () => {
  assert.equal(estimateSoc(30, 20, 29.4), 100);
  assert.equal(estimateSoc(10, 20, 29.4), 0);
  assert.equal(estimateSoc(24.7, 20, 29.4), 50);
});

test('simulator stays inside plausible ranges', () => {
  const next = createSimulator();
  for (let n = 0; n < 2000; n++) {
    const s = next();
    assert.ok(s.v > 15 && s.v < 30);
    assert.ok(s.i >= 0 && s.i <= 40);
    assert.ok(s.spd >= 0 && s.spd <= 30);
  }
});

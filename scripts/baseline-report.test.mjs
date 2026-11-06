import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBaselineReport } from './baseline-report.mjs';

const validReport = { numTotalTestSuites: 2, numTotalTests: 8, snapshot: { total: 0 } };

void test('accepts a real report with zero snapshots and ignores unrelated reporter fields', () => {
  assert.deepEqual(parseBaselineReport(JSON.stringify({ ...validReport, success: true })), validReport);
});

void test('rejects malformed JSON and report fields before they reach baseline output', () => {
  for (const value of [
    null,
    [],
    {},
    { ...validReport, numTotalTests: '8' },
    { ...validReport, numTotalTestSuites: 0 },
    { ...validReport, numTotalTests: -1 },
    { ...validReport, numTotalTests: 1.5 },
    { ...validReport, snapshot: { total: -1 } },
  ]) {
    assert.throws(() => parseBaselineReport(JSON.stringify(value)));
  }
  assert.throws(() => parseBaselineReport('{broken'));
});

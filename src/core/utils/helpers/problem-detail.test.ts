import { readProblemType, readRetryAfterSeconds } from './problem-detail';

it.each([null, {}, { type: 42 }, 'secret'])('ignores malformed problem details %j', (data) => {
  expect(readProblemType(data)).toBeUndefined();
});
it('extracts only the problem type', () => {
  expect(readProblemType({ type: 'example:problem', detail: 'secret' })).toBe('example:problem');
});
it.each(['retry-after', 'Retry-After'])('reads either header spelling %s with an explicit cap', (name) => {
  expect(readRetryAfterSeconds({ [name]: '999999999999999999999999999' }, { max: 300 })).toBe(300);
  expect(readRetryAfterSeconds({ [name]: '00012' }, { max: 300 })).toBe(12);
  expect(readRetryAfterSeconds({ [name]: '0' }, { max: 300 })).toBe(0);
});
it.each(['-1', '1e3', 'Infinity', 'NaN', '1.5', '', 'secret'])('ignores malformed bounded delay %s', (value) => {
  expect(readRetryAfterSeconds({ 'retry-after': value }, { max: 300 })).toBeUndefined();
});
it.each([undefined, '01', '999999999999999999999999999', -1, 1.5, Number.POSITIVE_INFINITY])(
  'does not truncate or round an unbounded delay %s',
  (value) => {
    expect(readRetryAfterSeconds({ 'retry-after': value })).toBeUndefined();
  },
);
it.each([0, 30, '0', '120'])('preserves a valid unbounded delay %s', (value) => {
  expect(readRetryAfterSeconds({ 'retry-after': value })).toBe(Number(value));
});

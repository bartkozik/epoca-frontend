
/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * @param {unknown} value
 * @param {readonly string[]} expectedKeys
 * @param {string} label
 * @returns {asserts value is Record<string, unknown>}
 */
export const assertExactKeys = (value, expectedKeys, label) => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unknown or missing fields`);
  }
};

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {asserts value is string}
 */
export const assertString = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
};

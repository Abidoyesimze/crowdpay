const { test } = require('node:test');
const assert = require('node:assert');
const { parsePagination, paginatedResponse } = require('./pagination');

test('parsePagination returns defaults for empty query', () => {
  const result = parsePagination({});
  assert.deepStrictEqual(result, { limit: 20, offset: 0 });
});

test('parsePagination respects custom defaults', () => {
  const result = parsePagination({}, { limit: 50, max: 200 });
  assert.deepStrictEqual(result, { limit: 50, offset: 0 });
});

test('parsePagination parses limit and offset from query', () => {
  const result = parsePagination({ limit: '10', offset: '5' });
  assert.deepStrictEqual(result, { limit: 10, offset: 5 });
});

test('parsePagination caps limit to max', () => {
  const result = parsePagination({ limit: '999' }, { limit: 20, max: 100 });
  assert.deepStrictEqual(result, { limit: 100, offset: 0 });
});

test('parsePagination floors offset to 0 for negative values', () => {
  const result = parsePagination({ offset: '-5' });
  assert.deepStrictEqual(result, { limit: 20, offset: 0 });
});

test('parsePagination treats non-numeric limit as default', () => {
  const result = parsePagination({ limit: 'abc' });
  assert.deepStrictEqual(result, { limit: 20, offset: 0 });
});

test('parsePagination treats limit=0 as default', () => {
  const result = parsePagination({ limit: '0' });
  assert.deepStrictEqual(result, { limit: 20, offset: 0 });
});

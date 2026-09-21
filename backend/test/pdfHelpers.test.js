import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDeletedPages,
  getNumericOrder,
  getPageNumbers,
  reConstructMap,
  computeColumnWidths,
} from '../utils/pdfHelpers.js';

describe('getDeletedPages', () => {
  test('parses a simple comma-separated list', () => {
    assert.deepEqual(getDeletedPages('1,3,5'), [1, 3, 5]);
  });

  test('expands a range', () => {
    assert.deepEqual(getDeletedPages('5-7'), [5, 6, 7]);
  });

  test('mixes single pages and ranges', () => {
    assert.deepEqual(getDeletedPages('1,3,5-7'), [1, 3, 5, 6, 7]);
  });

  test('trims whitespace around entries', () => {
    assert.deepEqual(getDeletedPages(' 1 , 3 , 5 - 7 '), [1, 3, 5, 6, 7]);
  });
});

describe('getNumericOrder', () => {
  test('parses a comma-separated reorder list', () => {
    assert.deepEqual(getNumericOrder('3,1,2'), [3, 1, 2]);
  });
});

describe('getPageNumbers', () => {
  test('returns an empty array for an empty string', () => {
    assert.deepEqual(getPageNumbers(''), []);
  });

  test('parses a comma-separated list', () => {
    assert.deepEqual(getPageNumbers('2,4'), [2, 4]);
  });
});

describe('reConstructMap', () => {
  test('rebuilds a Map from its JSON array-of-entries form', () => {
    const map = reConstructMap(JSON.stringify([[1, 90], [3, 180]]));
    assert.equal(map.get(1), 90);
    assert.equal(map.get(3), 180);
    assert.equal(map.size, 2);
  });
});

describe('computeColumnWidths', () => {
  test('sizes columns to their longest cell, clamped to [40, 200]', () => {
    const table = [
      ['a', 'a very long header that exceeds the max width by quite a lot'],
      ['1', 'x'],
    ];
    const widths = computeColumnWidths(table);
    assert.equal(widths[0], 40); // shortest content clamps to the minimum
    assert.equal(widths[1], 200); // longest content clamps to the maximum
  });

  test('treats missing cells as empty strings', () => {
    const table = [['header'], [undefined]];
    assert.doesNotThrow(() => computeColumnWidths(table));
  });
});

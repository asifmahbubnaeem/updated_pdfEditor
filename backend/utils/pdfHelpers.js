// Pure parsing/formatting helpers used by the PDF page-manipulation routes in
// server.js. Pulled out into their own module (rather than defined inline)
// so they can be unit tested without importing server.js itself (which, as a
// side effect of import, sets up Express routes and reads config/env).

/**
 * Parses a comma-separated page spec that may include ranges, e.g.
 * "1,3,5-7" -> [1, 3, 5, 6, 7]
 */
export function getDeletedPages(deletedPagesAsStr) {
  const arr = deletedPagesAsStr.trim().split(',');
  const numArr = [];

  arr.forEach((item) => {
    if (item.includes('-')) {
      const [startStr, endStr] = item.split('-');
      const start = parseInt(startStr.trim(), 10);
      const end = parseInt(endStr.trim(), 10);

      for (let i = start; i <= end; i++) numArr.push(i);
    } else {
      numArr.push(parseInt(item.trim(), 10));
    }
  });

  return numArr;
}

/**
 * Parses a comma-separated new page order, e.g. "3,1,2" -> [3, 1, 2]
 */
export function getNumericOrder(pageOrder) {
  const arr = pageOrder.trim().split(',');
  return arr.map(Number);
}

/**
 * Parses a comma-separated list of page numbers to delete, e.g. "2,4" -> [2, 4].
 * Returns [] for an empty string (unlike getNumericOrder/getDeletedPages,
 * which are never called with one).
 */
export function getPageNumbers(pageNum) {
  if (pageNum.length === 0) return [];
  const arr = pageNum.split(',');
  return arr.map(Number);
}

/**
 * Reconstructs a page-number -> rotation-degrees Map from its JSON-serialized
 * array-of-entries form (what the frontend sends for `rotationInfo`).
 */
export function reConstructMap(strRotation) {
  const parsedArray = JSON.parse(strRotation);
  return new Map(parsedArray);
}

/**
 * Computes a per-column PDF table width (in points) from the longest cell in
 * each column, clamped to [40, 200].
 */
export function computeColumnWidths(tableData) {
  const colCount = tableData[0].length;
  const colWidths = [];

  for (let col = 0; col < colCount; col++) {
    let maxLen = 0;
    for (let row = 0; row < tableData.length; row++) {
      const cell = String(tableData[row][col] || "");
      if (cell.length > maxLen) maxLen = cell.length;
    }

    // Each char ~ 4 points wide, min 40, max 200
    const width = Math.min(Math.max(maxLen * 4, 40), 200);
    colWidths.push(width);
  }

  return colWidths;
}

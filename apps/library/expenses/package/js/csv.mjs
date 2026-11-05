// CSV the page writes itself (the entries a search found): UTF-8 with a byte order mark, every cell quoted, CRLF
// line ends, as spreadsheets expect. A cell that a spreadsheet would run as a formula gets a leading apostrophe.

const FORMULA_START = /^[\s"]*[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function cell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

/** The rows (arrays of cells, the first one the header) as CSV text. */
export function toCsv(rows) {
  return "\ufeff" + rows.map((row) => row.map(cell).join(",") + "\r\n").join("");
}

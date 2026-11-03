// The calculator behind the amount field. The expression is kept as plain text with "." as the decimal mark and
// the operators + − × ÷ (shown with the locale's own mark); it is worked out exactly in millionths (BigInt), so
// "12,50 ÷ 3" gives 4.17 and "3 × 2,50" gives 7.50 without floating-point errors.

export const OPERATORS = ["+", "−", "×", "÷"];
const MAX_LENGTH = 40;
const SCALE = 1000000n;

function isOperator(ch) {
  return OPERATORS.includes(ch);
}

/** The number being typed at the end of the expression ("" after an operator). */
function lastNumber(expr) {
  const parts = expr.split(/[+−×÷]/);
  return parts[parts.length - 1];
}

/**
 * The expression after a key press. Keys: "0"–"9", "00", ".", the four operators, "back" and "clear".
 * An operator after an operator replaces it; a number takes one decimal mark and at most two decimals;
 * a leading zero is replaced by the next digit.
 */
export function press(expr, key) {
  if (key === "clear") return "";
  if (key === "back") return expr.slice(0, -1);
  if (expr.length >= MAX_LENGTH) return expr;
  if (isOperator(key)) {
    if (expr === "") return key === "−" ? "" : expr; // an amount never starts negative
    const end = expr[expr.length - 1];
    if (isOperator(end)) return expr.slice(0, -1) + key;
    if (end === ".") return expr.slice(0, -1) + key;
    return expr + key;
  }
  const number = lastNumber(expr);
  if (key === ".") {
    if (number.includes(".")) return expr;
    return expr + (number === "" ? "0." : ".");
  }
  if (!/^\d+$/.test(key)) return expr;
  const decimals = number.includes(".") ? number.split(".")[1].length : -1;
  if (decimals >= 2) return expr;
  if (key === "00" && (number === "" || number === "0")) return expr + (number === "" ? "0" : "");
  if (key === "00" && decimals === 1) return expr + "0";
  if (number === "0") return expr.slice(0, -1) + key;
  return expr + key;
}

function parseNumber(text) {
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole || "0") * SCALE + BigInt((fraction + "000000").slice(0, 6));
}

function divRound(n, d) {
  const negative = n < 0n !== d < 0n;
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  let q = a / b;
  if ((a % b) * 2n >= b) q += 1n;
  return negative ? -q : q;
}

/**
 * Works out the expression: {cents, error}. A trailing operator is ignored while typing. error is "empty",
 * "divideByZero" or "invalid"; cents may be zero or negative, which the form refuses as an amount.
 */
export function evaluate(expr) {
  let text = expr.trim();
  while (text && (isOperator(text[text.length - 1]) || text.endsWith("."))) text = text.slice(0, -1);
  if (!text) return { cents: null, error: "empty" };
  const tokens = text.match(/[+−×÷]|[\d.]+/g) || [];
  if (tokens.join("") !== text) return { cents: null, error: "invalid" };
  // Multiplication and division first, then addition and subtraction, left to right.
  const terms = [];
  const signs = [];
  let current = null;
  let pending = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (isOperator(token)) {
      if (token === "+" || token === "−") {
        terms.push(current);
        signs.push(token);
        current = null;
      } else {
        pending = token;
      }
      continue;
    }
    const value = parseNumber(token);
    if (value === null) return { cents: null, error: "invalid" };
    if (current === null) {
      current = value;
    } else if (pending === "×") {
      current = divRound(current * value, SCALE);
      pending = null;
    } else if (pending === "÷") {
      if (value === 0n) return { cents: null, error: "divideByZero" };
      current = divRound(current * SCALE, value);
      pending = null;
    } else {
      return { cents: null, error: "invalid" };
    }
  }
  terms.push(current);
  if (terms.some((t) => t === null)) return { cents: null, error: "invalid" };
  let total = terms[0];
  for (let i = 0; i < signs.length; i++) total = signs[i] === "+" ? total + terms[i + 1] : total - terms[i + 1];
  return { cents: Number(divRound(total, 10000n)), error: null };
}

/** Whether the expression holds an operator (then the form shows the result under it). */
export function hasOperator(expr) {
  return /[+−×÷]/.test(expr.replace(/[+−×÷]$/, ""));
}

/** The expression as shown, with the locale's decimal mark and thin spaces around operators. */
export function display(expr, mark) {
  return expr.replace(/\./g, mark).replace(/([+−×÷])/g, " $1 ");
}

/** The expression that starts from an amount in cents ("12.50" → "12.5" keeps the shown digits short). */
export function fromCentsText(cents) {
  if (!cents) return "";
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  if (rest === 0) return String(whole);
  return whole + "." + String(rest).padStart(2, "0").replace(/0$/, "");
}

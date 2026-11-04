// Development only (not shipped): checks the app's barcode encoders.
//
//   node dev/test-barcodes.mjs                    # check digits, refusals and sizes
//   ZXING_JAR=<zxing core 3.5.x jar> node dev/test-barcodes.mjs
//                                                 # also reads every code back with ZXing's decoders (needs Java 17)
//
// The round trip draws each code as the app does (dark modules on white with a quiet zone) and decodes it with only
// its own format allowed, so a wrong bar, a wrong check character or a misplaced module fails the case.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encode, toSvg } from "../package/js/barcode/index.mjs";
import { gs1CheckDigit } from "../package/js/barcode/linear.mjs";

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (ok, what) => {
  if (!ok) {
    failures++;
    console.log("FAIL", what);
  }
};

// ---- GS1 check digits, worked out by hand
check(gs1CheckDigit("400638133393") === 1, "EAN-13 4006381333931");
check(gs1CheckDigit("290012345678") === 5, "EAN-13 2900123456785");
check(gs1CheckDigit("9638507") === 4, "EAN-8 96385074");
check(gs1CheckDigit("03600029145") === 2, "UPC-A 036000291452");

// ---- refusals the app turns into words
const reason = (value, format) => encode(value, format).reason;
check(reason("4006381333932", "ean13") === "checkDigit", "wrong EAN-13 check digit");
check(encode("4006381333932", "ean13").expected === 1, "expected check digit");
check(reason("2900123456", "ean13") === "digits", "too short for EAN-13");
check(reason("96385075", "ean8") === "checkDigit", "wrong EAN-8 check digit");
check(reason("2123456", "upcE") === "system", "UPC-E number system 2");
check(reason("04252615", "upcE") === "checkDigit", "wrong UPC-E check digit");
check(reason("abc", "code39") === "chars", "Code 39 lower case");
check(reason("Café 12", "code128") === "chars", "Code 128 accents");
check(reason("4821337", "itf") === "even", "ITF odd length");
check(reason("4821", "itf") === "short", "ITF too short");
check(reason("A123", "codabar") === "frame", "Codabar start without stop");
check(reason("", "qr") === "empty", "empty value");
check(reason("x".repeat(3000), "qr") === "tooLong", "QR too long");

// ---- sizes from the standards
check(encode("4006381333931", "ean13").symbol.columns === 95, "EAN-13 is 95 modules");
check(encode("96385074", "ean8").symbol.columns === 67, "EAN-8 is 67 modules");
check(encode("425261", "upcE").symbol.columns === 51, "UPC-E is 51 modules");
check(encode("HELLO WORLD", "qr").symbol.columns === 21, "a short QR code is version 1");
check(encode("123456", "dataMatrix").symbol.columns === 10, "six digits fit a 10×10 Data Matrix");
check(encode("Hello", "aztec").symbol.columns === 15, "a short Aztec code is compact with one layer");

// ---- the SVG
const svg = toSvg(encode("4006381333931", "ean13").symbol, "ean13", { label: 'A "quoted" label' });
check(svg.startsWith("<svg") && svg.includes('aria-label="A &#34;quoted&#34; label"'), "SVG with an escaped label");

// ---- round trips (value, format, what a decoder reads)
const CASES = [
  ["4006381333931", "ean13"],
  ["400638133393", "ean13", "4006381333931"],
  ["2900123456785", "ean13"],
  ["2000451183022", "ean13"],
  ["96385074", "ean8"],
  ["9638507", "ean8", "96385074"],
  ["20441098", "ean8"],
  ["036000291452", "upcA"],
  ["03600029145", "upcA", "036000291452"],
  ["425261", "upcE", "04252614"],
  ["04252614", "upcE"],
  ["12345670", "upcE"],
  ["GB-4471-0093", "code128"],
  ["1234567890123456", "code128"],
  ["Ab12cd3456", "code128"],
  ["BTC-STAMPS-7781", "code128"],
  ["FS 008812", "code39"],
  ["LIB0004417", "code39"],
  ["Member 42/b", "code93"],
  ["ABC-123", "code93"],
  ["A12345B", "codabar"],
  ["12345", "codabar", "A12345A"],
  ["48213377", "itf"],
  ["00012345678905", "itf"],
  ["BTC-STAMPS-7781", "qr"],
  ["0123456789012345", "qr"],
  ["https://example.com/card/7781", "qr"],
  ["Člen č. 7781 – Žilina", "qr"],
  ["x".repeat(400), "qr"],
  ["SB-GIFT-25-90311", "dataMatrix"],
  ["123456", "dataMatrix"],
  ["Kartička č. 42", "dataMatrix"],
  ["y".repeat(300), "dataMatrix"],
  ["RG|2026|00071", "pdf417"],
  ["Member 0042 Riverside", "pdf417"],
  ["Člen 0042 – Banská Bystrica", "pdf417"],
  ["z".repeat(250), "pdf417"],
  ["PSB:MEMBER:550193", "aztec"],
  ["Hello", "aztec"],
  ["Lístok č. 7", "aztec"],
  ["w".repeat(200), "aztec"],
  ["9".repeat(120), "aztec"],
];

const lines = [];
for (const [value, format, read = value] of CASES) {
  const result = encode(value, format);
  check(result.ok, `${format} ${value.slice(0, 30)} encodes`);
  if (!result.ok) continue;
  const s = result.symbol;
  let modules = "";
  for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.columns; c++) modules += s.isDark(c, r) ? "1" : "0";
  lines.push(
    [
      format,
      Buffer.from(read, "utf8").toString("base64"),
      s.columns,
      s.rows,
      s.rowHeight,
      s.linear ? 1 : 0,
      modules,
    ].join(" "),
  );
}

const jar = process.env.ZXING_JAR;
if (jar) {
  const dir = mkdtempSync(join(tmpdir(), "loyalty-barcodes-"));
  try {
    const file = join(dir, "cases.txt");
    writeFileSync(file, lines.join("\n") + "\n");
    const out = execFileSync("java", ["-cp", jar, join(here, "zxing", "RoundTrip.java"), file], { encoding: "utf8" });
    const results = out.trim().split("\n");
    results.forEach((line, i) =>
      check(line.startsWith("ok"), `round trip ${CASES[i][1]} ${CASES[i][0].slice(0, 30)}: ${line}`),
    );
    console.log(
      `Round trips: ${results.filter((l) => l.startsWith("ok")).length} of ${CASES.length} read back by ZXing.`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} else {
  console.log("Round trips skipped: set ZXING_JAR to a ZXing core jar to read the codes back.");
}

console.log(failures ? `${failures} failed` : "All barcode checks passed.");
process.exit(failures ? 1 : 0);

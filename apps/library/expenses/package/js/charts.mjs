// Charts drawn as SVG: a ring of categories and bar charts. Each one carries a sentence for screen readers, and the
// numbers it shows are also listed in text next to it, so nothing is told by colour alone.

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/**
 * A ring of shares: slices [{value, hue}] around a centre label. `label` describes the chart for screen readers.
 */
export function donut(slices, { label, center, sub }) {
  const size = 200;
  const r = 78;
  const stroke = 30;
  const root = svg("svg", { viewBox: "0 0 " + size + " " + size, class: "donut", role: "img", "aria-label": label });
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  root.appendChild(svg("circle", { cx: 100, cy: 100, r, fill: "none", class: "donut-track", "stroke-width": stroke }));
  if (total > 0) {
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    for (const slice of slices) {
      if (slice.value <= 0) continue;
      const length = (slice.value / total) * circumference;
      const gap = slices.length > 1 ? Math.min(2, length / 3) : 0;
      root.appendChild(
        svg("circle", {
          cx: 100,
          cy: 100,
          r,
          fill: "none",
          class: "donut-slice hue-stroke-" + slice.hue,
          "stroke-width": stroke,
          "stroke-dasharray": Math.max(0, length - gap) + " " + (circumference - Math.max(0, length - gap)),
          "stroke-dashoffset": -offset,
          transform: "rotate(-90 100 100)",
        }),
      );
      offset += length;
    }
  }
  const text = svg("text", { x: 100, y: sub ? 98 : 106, "text-anchor": "middle", class: "donut-center" });
  text.textContent = center;
  root.appendChild(text);
  if (sub) {
    const small = svg("text", { x: 100, y: 122, "text-anchor": "middle", class: "donut-sub" });
    small.textContent = sub;
    root.appendChild(small);
  }
  return root;
}

/**
 * Bars over time: rows [{label, values: [a, b]}] where each row has one or two bars (spending and income).
 * `highlight` marks one row (the month on screen); `line` draws a level such as a budget. onPick(index) on a tap.
 */
export function bars(rows, { label, series = ["spend"], line = null, highlight = -1, onPick, format }) {
  const width = 340;
  const height = 170;
  const top = 12;
  const bottom = 26;
  const plot = height - top - bottom;
  const max = Math.max(1, line || 0, ...rows.flatMap((r) => r.values));
  const slot = width / Math.max(1, rows.length);
  const barWidth = Math.max(3, Math.min(22, (slot - 6) / series.length));
  const root = svg("svg", { viewBox: "0 0 " + width + " " + height, class: "bars", role: "img", "aria-label": label });
  root.appendChild(svg("line", { x1: 0, x2: width, y1: top + plot, y2: top + plot, class: "axis" }));
  rows.forEach((row, i) => {
    const x0 = i * slot + (slot - barWidth * series.length) / 2;
    row.values.forEach((value, j) => {
      const h = value > 0 ? Math.max(2, (value / max) * plot) : 0;
      const rect = svg("rect", {
        x: x0 + j * barWidth,
        y: top + plot - h,
        width: Math.max(1, barWidth - 1.5),
        height: h,
        rx: 2.5,
        class: "bar " + series[j] + (i === highlight ? " on" : ""),
      });
      root.appendChild(rect);
    });
    if (row.label) {
      const text = svg("text", {
        x: i * slot + slot / 2,
        y: height - 8,
        "text-anchor": "middle",
        class: "bar-label" + (i === highlight ? " on" : ""),
      });
      text.textContent = row.label;
      root.appendChild(text);
    }
    if (onPick) {
      const hit = svg("rect", { x: i * slot, y: 0, width: slot, height, class: "bar-hit" });
      hit.addEventListener("click", () => onPick(i));
      root.appendChild(hit);
    }
  });
  if (line) {
    const y = top + plot - (line / max) * plot;
    root.appendChild(svg("line", { x1: 0, x2: width, y1: y, y2: y, class: "budget-line" }));
    if (format) {
      const text = svg("text", { x: width - 2, y: y - 4, "text-anchor": "end", class: "bar-label" });
      text.textContent = format(line);
      root.appendChild(text);
    }
  }
  return root;
}

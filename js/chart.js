import { scaleLinear } from "https://cdn.jsdelivr.net/npm/d3-scale@4.0.2/+esm";
import { t, fmt } from "./i18n.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Line styles for up to five sources on one chart. Colour plus dash pattern,
// so lines stay distinguishable without colour.
export const LINE_STYLES = [
  { cls: "s0", dash: "" },
  { cls: "s1", dash: "6 3" },
  { cls: "s2", dash: "2 3" },
  { cls: "s3", dash: "10 3 2 3" },
  { cls: "s4", dash: "1 2" },
];

// Year-axis line chart. lines = [{ label, points: [obs], style }]. A point with
// breakBefore starts a new segment, so a definition change is never joined up.
export function yearChart(el, { lines, xDomain, yDomain, decimals = 1, activeYear, unit = "" }) {
  const W = 420, H = 230, m = { t: 14, r: 46, b: 26, l: 46 };
  const x = scaleLinear(xDomain, [m.l, W - m.r]);
  const y = scaleLinear(yDomain, [H - m.b, m.t]).nice();
  const inX = (p) => p.year >= xDomain[0] && p.year <= xDomain[1];
  const label = lines.map((l) => `${l.label}: ${l.points.filter(inX).map((p) => `${p.period} ${fmt(p.value, decimals)}`).join(", ")}`).join("; ");
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">`;
  for (const v of y.ticks(4)) {
    s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`;
  }
  for (const v of x.ticks(6)) {
    s += `<text class="tick" x="${x(v)}" y="${H - 8}" text-anchor="middle">${v}</text>`;
  }
  // Reference years: 1857, Independence (1947) and the 1991 economic reforms.
  for (const yr of [1857, 1947, 1991]) {
    if (yr > xDomain[0] && yr < xDomain[1]) {
      s += `<line class="era" x1="${x(yr)}" x2="${x(yr)}" y1="${m.t}" y2="${H - m.b}"/><text class="era-label" x="${x(yr) + 3}" y="${m.t + 9}">${yr}</text>`;
    }
  }
  if (activeYear && activeYear >= xDomain[0] && activeYear <= xDomain[1]) {
    s += `<line class="cursor" x1="${x(activeYear)}" x2="${x(activeYear)}" y1="${m.t}" y2="${H - m.b}"/>`;
  }
  for (const l of lines) {
    const pts = l.points.filter(inX);
    if (!pts.length) continue;
    const segs = [];
    for (const p of pts) {
      if (!segs.length || p.breakBefore) segs.push([]);
      segs.at(-1).push(p);
    }
    for (const seg of segs) {
      if (seg.length > 1) {
        s += `<polyline class="ln ${l.style.cls}" stroke-dasharray="${l.style.dash}" points="${seg.map((p) => `${x(p.year).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}"/>`;
      }
    }
    // Dots when the series is sparse (surveys, censuses); hidden for dense annual data.
    if (pts.length <= 30) {
      for (const p of pts) s += `<circle class="dot ${l.style.cls}" cx="${x(p.year).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3"><title>${esc(l.label)}, ${esc(p.period)}: ${fmt(p.value, decimals)} ${esc(unit)}</title></circle>`;
    }
    const last = pts.at(-1);
    s += `<text class="end-label ${l.style.cls}" x="${x(last.year) + 5}" y="${y(last.value) + 4}">${fmt(last.value, decimals)}</text>`;
  }
  s += `</svg>`;
  s += `<div class="legend-inline">${lines
    .filter((l) => l.points.some(inX))
    .map((l) => `<span><svg width="22" height="8" aria-hidden="true"><line class="ln ${l.style.cls}" x1="1" x2="21" y1="4" y2="4" stroke-dasharray="${l.style.dash}"/></svg>${esc(l.label)}</span>`)
    .join("")}</div>`;
  el.innerHTML = s;
}

// Horizontal bars for top/bottom states, scaled to the indicator's domain.
export function rankBars(el, rows, { onSelect, selected, domain, decimals }) {
  const [lo, hi] = domain;
  el.innerHTML = rows
    .map(
      (r) => `<button class="rank-row${r.code === selected ? " selected" : ""}" data-code="${r.code}">
      <span class="rank-name">${esc(r.name)}</span>
      <span class="rank-bar"><i style="width:${Math.max(0, Math.min(100, ((r.value - lo) / (hi - lo)) * 100))}%"></i></span>
      <span class="rank-val">${fmt(r.value, decimals)}</span></button>`
    )
    .join("");
  el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => onSelect(b.dataset.code)));
}

export function dataTable(el, { codes, periods, valueAt, regionName, decimals }) {
  const head = periods.map((p) => `<th scope="col">${esc(p.period)}</th>`).join("");
  const body = codes
    .map((code) => {
      const cells = periods.map((p) => {
        const o = valueAt(p.period, code);
        return `<td>${o ? fmt(o.value, decimals) : `<span class="muted">–</span>`}</td>`;
      });
      return `<tr${code === "IN" ? ' class="nat"' : ""}><th scope="row">${esc(regionName(code))}</th>${cells.join("")}</tr>`;
    })
    .join("");
  el.innerHTML = `<table><thead><tr><th scope="col">${t("state")}</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export { esc };

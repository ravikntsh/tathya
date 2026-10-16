import { scaleLinear } from "https://cdn.jsdelivr.net/npm/d3-scale@4.0.2/+esm";
import { t, fmt, fmtCompact } from "./i18n.js";
import { projection, interpolate, projectionEnd } from "./estimate.js";

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

const W = 420, H = 230, M = { t: 14, r: 46, b: 26, l: 46 };

// Year-axis line chart. lines = [{ label, points: [obs], style }]. A point with
// breakBefore starts a new segment, so a definition change is never joined up.
// With estimates on, each line gets a dashed projection and a shaded 90% range
// after its last point, and hovering between points shows interpolated values.
export function yearChart(el, { lines, xDomain, yDomain, decimals = 1, activeYear, unit = "", estimates = false, bounds, scale }) {
  const toYear = Math.max(new Date().getFullYear() + 4, xDomain[1]);
  // Only extend series that are still current (see projectionEnd in estimate.js);
  // a series that ended in 1946 is history, not something to project.
  const projs = lines.map((l) => {
    const last = l.points.at(-1)?.year;
    if (!estimates || last == null) return null;
    const end = projectionEnd(last);
    return end > last ? projection(l.points, { toYear: end, bounds, scale }) : null;
  });
  const xMax = projs.some(Boolean) ? toYear : xDomain[1];
  const x = scaleLinear([xDomain[0], xMax], [M.l, W - M.r]);
  const y = scaleLinear(yDomain, [H - M.b, M.t]).nice();
  const inX = (p) => p.year >= xDomain[0] && p.year <= xMax;
  const label = lines.map((l) => `${l.label}: ${l.points.filter(inX).map((p) => `${p.period} ${fmt(p.value, decimals)}`).join(", ")}`).join("; ");
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">`;
  for (const v of y.ticks(4)) {
    s += `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${M.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmtCompact(v)}</text>`;
  }
  for (const v of x.ticks(6)) {
    s += `<text class="tick" x="${x(v)}" y="${H - 8}" text-anchor="middle">${v}</text>`;
  }
  // Reference years: 1857, Independence (1947) and the 1991 economic reforms.
  for (const yr of [1857, 1947, 1991]) {
    if (yr > xDomain[0] && yr < xMax) {
      s += `<line class="era" x1="${x(yr)}" x2="${x(yr)}" y1="${M.t}" y2="${H - M.b}"/><text class="era-label" x="${x(yr) + 3}" y="${M.t + 9}">${yr}</text>`;
    }
  }
  if (activeYear && activeYear >= xDomain[0] && activeYear <= xMax) {
    s += `<line class="cursor" x1="${x(activeYear)}" x2="${x(activeYear)}" y1="${M.t}" y2="${H - M.b}"/>`;
  }
  lines.forEach((l, k) => {
    const pr = projs[k];
    if (!pr) return;
    const band = [...pr.points.map((p) => `${x(p.year).toFixed(1)},${y(p.hi).toFixed(1)}`), ...pr.points.slice().reverse().map((p) => `${x(p.year).toFixed(1)},${y(p.lo).toFixed(1)}`)].join(" ");
    s += `<polygon class="est-band ${l.style.cls}" points="${band}"/>`;
    s += `<polyline class="est-line ${l.style.cls}" points="${pr.points.map((p) => `${x(p.year).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}"/>`;
  });
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
      for (const p of pts) s += `<circle class="dot ${l.style.cls}" cx="${x(p.year).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3"/>`;
    }
  }
  // Hover layer: crosshair, highlighted points, and a hit area over the plot.
  s += `<g class="hover" visibility="hidden"><line class="xhair" y1="${M.t}" y2="${H - M.b}"/><g class="hover-dots"></g></g>`;
  s += `<rect class="hit" x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}"/>`;
  s += `</svg>`;
  s += `<div class="tip" hidden></div>`;
  s += `<div class="legend-inline">${lines
    .filter((l) => l.points.some(inX))
    .map((l) => `<span><svg width="22" height="8" aria-hidden="true"><line class="ln ${l.style.cls}" x1="1" x2="21" y1="4" y2="4" stroke-dasharray="${l.style.dash}"/></svg>${esc(l.label)}</span>`)
    .join("")}${projs.some(Boolean) ? `<span class="est-key"><svg width="22" height="10" aria-hidden="true"><rect class="est-band s0" x="1" y="1" width="20" height="8"/><line class="est-line s0" x1="1" x2="21" y1="5" y2="5"/></svg>${t("estimateKey")}</span>` : ""}</div>`;
  el.innerHTML = s;
  el.classList.add("chart-wrap");
  bindHover(el, { lines, projs, x, y, xDomain: [xDomain[0], xMax], decimals, unit, estimates });
}

function bindHover(el, { lines, projs, x, y, xDomain, decimals, unit, estimates }) {
  const svg = el.querySelector("svg.chart");
  const hit = svg.querySelector(".hit");
  const hover = svg.querySelector(".hover");
  const xhair = svg.querySelector(".xhair");
  const dots = svg.querySelector(".hover-dots");
  const tip = el.querySelector(".tip");
  const u = unit === "%" ? "%" : ` ${unit}`;

  function valueAt(l, k, year) {
    const pts = l.points;
    const exact = pts.find((p) => p.year === year);
    if (exact) return { value: exact.value, text: `${fmt(exact.value, decimals)}${u}`, note: exact.period !== String(year) ? exact.period : "" };
    if (estimates) {
      const ip = interpolate(pts, year);
      if (ip) return { value: ip.value, text: `≈ ${fmt(ip.value, decimals)}${u}`, note: t("interpolated"), est: true };
      const pr = projs[k]?.points.find((p) => p.year === year);
      if (pr) return { value: pr.value, text: `≈ ${fmt(pr.value, decimals)}${u}`, note: `${t("estimate")} ${fmt(pr.lo, decimals + 1)}–${fmt(pr.hi, decimals + 1)}`, est: true };
    }
    // Without estimates, show the nearest real point within two years, with its own date.
    const near = pts.reduce((best, p) => (Math.abs(p.year - year) < Math.abs((best?.year ?? 1e9) - year) ? p : best), null);
    if (near && Math.abs(near.year - year) <= 2) return { value: near.value, text: `${fmt(near.value, decimals)}${u}`, note: near.period };
    return null;
  }

  function move(ev) {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const year = Math.round(x.invert(px));
    if (year < xDomain[0] || year > xDomain[1]) return leave();
    const rows = lines.map((l, k) => ({ l, v: valueAt(l, k, year) })).filter((r) => r.v);
    xhair.setAttribute("x1", x(year)); xhair.setAttribute("x2", x(year));
    dots.innerHTML = rows.map(({ l, v }) => `<circle class="dot ${l.style.cls}${v.est ? " est" : ""}" cx="${x(year)}" cy="${y(v.value)}" r="4.5"/>`).join("");
    hover.setAttribute("visibility", "visible");
    tip.innerHTML = `<strong>${year}</strong>${rows.length ? rows.map(({ l, v }) =>
      `<div class="tip-row"><i class="sw ${l.style.cls}"></i><span>${esc(l.label)}</span><b>${v.text}</b>${v.note ? `<small>${esc(v.note)}</small>` : ""}</div>`).join("")
      : `<div class="muted">${t("noData")}</div>`}`;
    tip.hidden = false;
    const left = ((x(year) / W) * r.width);
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, Math.min(r.width - tw, left + 12 > r.width - tw ? left - tw - 12 : left + 12))}px`;
    tip.style.top = `4px`;
  }
  function leave() {
    hover.setAttribute("visibility", "hidden");
    tip.hidden = true;
  }
  hit.addEventListener("pointermove", move);
  hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", leave);
}

// Draws the chart (with title, legend and sources) to a PNG for download.
export async function chartPng(el, { title, subtitle, sources, site }) {
  await document.fonts?.ready;
  const svg = el.querySelector("svg.chart");
  const clone = svg.cloneNode(true);
  clone.querySelector(".hover")?.remove();
  clone.querySelector(".hit")?.remove();
  // Inline computed styles so the standalone SVG keeps colours and dashes.
  const src = svg.querySelectorAll("*"), dst = clone.querySelectorAll("*");
  const props = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "fill-opacity", "font-size", "font-weight", "font-family"];
  let j = 0;
  src.forEach((node) => {
    if (node.closest(".hover") || node.classList?.contains("hit")) return;
    const cs = getComputedStyle(node);
    const d = dst[j++];
    if (d) d.setAttribute("style", props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";"));
  });
  clone.setAttribute("width", W); clone.setAttribute("height", H);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  await img.decode();

  const scale = 3, PW = 1200, chartW = PW - 80, chartH = (chartW * H) / W;
  const legend = [...el.querySelectorAll(".legend-inline > span")];
  const PH = 120 + chartH + 30 + legend.length * 30 + 40 + sources.length * 26 + 50;
  const cv = document.createElement("canvas");
  cv.width = PW; cv.height = PH;
  const g = cv.getContext("2d");
  const font = (w, s) => `${w} ${s}px "Noto Sans", "Noto Sans Devanagari", sans-serif`;
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, PW, PH);
  g.fillStyle = "#1B2A6B"; g.fillRect(0, 0, PW, 8);
  g.fillStyle = "#1A2233"; g.font = font(700, 34); g.fillText(title, 40, 62);
  g.fillStyle = "#4B5565"; g.font = font(400, 22); g.fillText(subtitle, 40, 96);
  g.drawImage(img, 40, 110, chartW, chartH);
  let yy = 110 + chartH + 34;
  for (const span of legend) {
    const line = span.querySelector("line");
    const cs = line ? getComputedStyle(line) : null;
    g.strokeStyle = cs?.stroke || "#1B2A6B"; g.lineWidth = 4;
    g.setLineDash((line?.getAttribute("stroke-dasharray") || "").split(/\s+/).filter(Boolean).map((n) => Number(n) * 2));
    g.beginPath(); g.moveTo(40, yy - 7); g.lineTo(80, yy - 7); g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#1A2233"; g.font = font(400, 20); g.fillText(span.textContent.trim(), 92, yy);
    yy += 30;
  }
  yy += 16;
  g.fillStyle = "#1A2233"; g.font = font(600, 20);
  for (const sname of sources) { g.fillText(sname.length > 110 ? sname.slice(0, 109) + "…" : sname, 40, yy); yy += 26; }
  g.fillStyle = "#4B5565"; g.font = font(400, 18); g.fillText(site, 40, PH - 24);
  void scale;
  return new Promise((res) => cv.toBlob(res, "image/png"));
}

// Horizontal bars for top/bottom states, scaled to the indicator's domain.
export function rankBars(el, rows, { onSelect, selected, domain, decimals }) {
  const [lo, hi] = domain;
  el.innerHTML = rows
    .map(
      (r) => `<button class="rank-row${r.code === selected ? " selected" : ""}" data-code="${r.code}">
      <span class="rank-name">${esc(r.name)}</span>
      <span class="rank-bar"><i style="width:${Math.max(0, Math.min(100, ((r.value - lo) / (hi - lo)) * 100))}%"></i></span>
      <span class="rank-val">${r.est ? "≈ " : ""}${r.value >= 100000 ? fmtCompact(r.value) : fmt(r.value, decimals)}</span></button>`
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

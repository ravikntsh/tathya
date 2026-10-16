import { scaleLinear, scalePoint } from "https://cdn.jsdelivr.net/npm/d3-scale@4.0.2/+esm";
import { t, tr, fmt } from "./i18n.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Line chart over survey rounds. `lines` = [{ label, points: [obs], cls }].
// If the indicator has a break_note, points are not joined (series break marker).
export function lineChart(el, { rounds, lines, activeRound, broken }) {
  const W = 360, H = 200, m = { t: 16, r: 56, b: 28, l: 34 };
  const x = scalePoint(rounds.map((r) => r.round), [m.l, W - m.r]).padding(0.3);
  const y = scaleLinear([0, 100], [H - m.b, m.t]);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(lines.map((l) => `${l.label}: ${l.points.map((p) => `${p.round} ${fmt(p.value)}%`).join(", ")}`).join("; "))}">`;
  for (const v of [0, 50, 100]) {
    s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  for (const r of rounds) {
    s += `<text class="tick${r.round === activeRound ? " active" : ""}" x="${x(r.round)}" y="${H - 8}" text-anchor="middle">${esc(r.round)} (${esc(r.years)})</text>`;
  }
  if (activeRound) s += `<line class="cursor" x1="${x(activeRound)}" x2="${x(activeRound)}" y1="${m.t}" y2="${H - m.b}"/>`;
  for (const l of lines) {
    const pts = l.points.filter((p) => x(p.round) != null);
    if (!pts.length) continue;
    if (!broken && pts.length > 1) {
      s += `<polyline class="ln ${l.cls}" points="${pts.map((p) => `${x(p.round)},${y(p.value)}`).join(" ")}"/>`;
    }
    for (const p of pts) s += `<circle class="dot ${l.cls}" cx="${x(p.round)}" cy="${y(p.value)}" r="4"/>`;
    const last = pts[pts.length - 1];
    s += `<text class="end-label ${l.cls}" x="${x(last.round) + 8}" y="${y(last.value) + 4}">${fmt(last.value)}</text>`;
  }
  if (broken) s += `<text class="tick" x="${W / 2}" y="${m.t - 4}" text-anchor="middle">⫽ series break</text>`;
  s += `</svg>`;
  el.innerHTML = s;
}

// Horizontal bars for top/bottom states.
export function rankBars(el, rows, { onSelect, selected }) {
  el.innerHTML = rows
    .map(
      (r) => `<button class="rank-row${r.code === selected ? " selected" : ""}" data-code="${r.code}">
      <span class="rank-name">${esc(r.name)}</span>
      <span class="rank-bar"><i style="width:${Math.max(0, Math.min(100, r.value))}%"></i></span>
      <span class="rank-val">${fmt(r.value)}</span></button>`
    )
    .join("");
  el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => onSelect(b.dataset.code)));
}

export function dataTable(el, { states, data, indicatorId, rounds, regionName }) {
  const head = rounds.map((r) => `<th scope="col">${esc(r.round)}<br><small>${esc(r.years)}</small></th>`).join("");
  const body = ["IN", ...states.map((s) => s.code)]
    .map((code) => {
      const cells = rounds.map((r) => {
        const o = data.get(indicatorId, r.round, code);
        return `<td>${o ? `<a href="${esc(o.sourceUrl)}" target="_blank" rel="noopener">${fmt(o.value)}</a>` : `<span class="muted">${t("noData")}</span>`}</td>`;
      });
      return `<tr${code === "IN" ? ' class="nat"' : ""}><th scope="row">${esc(regionName(code))}</th>${cells.join("")}</tr>`;
    })
    .join("");
  el.innerHTML = `<table><thead><tr><th scope="col">${t("state")}</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export { esc };

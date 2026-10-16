import { geoMercator, geoPath } from "https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";
import { t, tr, fmt } from "./i18n.js";

const NS = "http://www.w3.org/2000/svg";
// Five equal bands over the indicator's fixed domain, so moving the slider shows
// real change, not a rescaled map.
let domain = [0, 100];
export const setDomain = (d) => (domain = d || [0, 100]);
const thresholds = () => [1, 2, 3, 4].map((i) => domain[0] + ((domain[1] - domain[0]) * i) / 5);
export const bucket = (v) => thresholds().filter((x) => v >= x).length;

export async function loadMap(url) {
  const topo = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`map ${r.status}`);
    return r.json();
  });
  const key = Object.keys(topo.objects)[0];
  return feature(topo, topo.objects[key]).features;
}

export function createMap(container, features, { onSelect }) {
  const W = 600, H = 680;
  const projection = geoMercator().fitExtent([[8, 8], [W - 8, H - 8]], { type: "FeatureCollection", features });
  const path = geoPath(projection);

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "group");
  svg.classList.add("map");
  svg.innerHTML = `<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="6" height="6" fill="var(--no-data)"></rect><line x1="0" y1="0" x2="0" y2="6" stroke="var(--slate)" stroke-width="1.2"></line></pattern></defs>`;
  const g = document.createElementNS(NS, "g");
  svg.appendChild(g);

  const shapes = new Map();
  for (const f of features) {
    const code = f.properties.code;
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", path(f));
    p.setAttribute("tabindex", "0");
    p.setAttribute("role", "button");
    p.dataset.code = code;
    p.classList.add("state");
    const title = document.createElementNS(NS, "title");
    p.appendChild(title);
    p.addEventListener("click", () => onSelect(code));
    p.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(code); }
    });
    g.appendChild(p);
    shapes.set(code, { el: p, title, area: path.area(f) });
  }
  // Tiny UTs (Lakshadweep, Chandigarh, Puducherry, DH) get a ring so they stay visible and tappable.
  for (const f of features) {
    const s = shapes.get(f.properties.code);
    if (s.area < 12) {
      const [x, y] = path.centroid(f);
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 6);
      c.classList.add("ut-ring");
      c.addEventListener("click", () => onSelect(f.properties.code));
      g.appendChild(c);
      s.ring = c;
    }
  }
  container.replaceChildren(svg);

  function update({ valueOf, regionName, selected, label, format = (v) => fmt(v) + "%", isEstimate = () => false }) {
    svg.setAttribute("aria-label", label);
    for (const [code, s] of shapes) {
      const v = valueOf(code);
      const fill = v == null ? "url(#hatch)" : `var(--seq-${bucket(v)})`;
      s.el.style.fill = fill;
      if (s.ring) s.ring.style.fill = fill;
      const isSel = code === selected;
      const est = v != null && isEstimate(code);
      s.el.classList.toggle("est", est);
      s.ring?.classList.toggle("est", est);
      s.el.classList.toggle("selected", isSel);
      s.ring?.classList.toggle("selected", isSel);
      const text = `${regionName(code)}: ${v == null ? t("noData") : (est ? "≈ " : "") + format(v)}${est ? ` (${t("estimateShort")})` : ""}`;
      s.title.textContent = text;
      s.el.setAttribute("aria-label", text);
      s.el.setAttribute("aria-pressed", String(isSel));
    }
  }
  return { update };
}

export function renderLegend(el, unit = "%", { estimates = false } = {}) {
  const th = thresholds();
  const n = (v) => fmt(v, 0);
  const cells = [0, 1, 2, 3, 4].map((i) => {
    const lo = i === 0 ? domain[0] : th[i - 1];
    const hi = th[i] ?? domain[1];
    return `<span class="lg-cell"><i style="background:var(--seq-${i})"></i>${n(lo)}–${n(hi)}${unit === "%" ? "%" : ""}</span>`;
  });
  if (unit !== "%") cells.push(`<span class="lg-cell muted">${unit}</span>`);
  el.innerHTML = `${cells.join("")}<span class="lg-cell"><i class="lg-nodata"></i>${t("noData")}</span>${estimates ? `<span class="lg-cell"><i class="lg-est"></i>${t("estimateLegend")}</span>` : ""}`;
}


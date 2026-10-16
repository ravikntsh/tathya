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
    shapes.set(code, { el: p, title, area: path.area(f), centroid: path.centroid(f) });
  }
  // A star over each state whose value is an estimate (drawn above all shapes).
  const stars = document.createElementNS(NS, "g");
  stars.classList.add("est-stars");
  for (const [code, s] of shapes) {
    if (!Number.isFinite(s.centroid[0])) continue;
    const st = document.createElementNS(NS, "text");
    st.setAttribute("x", s.centroid[0]); st.setAttribute("y", s.centroid[1] + 5);
    st.setAttribute("text-anchor", "middle");
    st.textContent = "*";
    st.style.display = "none";
    stars.appendChild(st);
    s.star = st;
  }
  svg.appendChild(stars);
  // UTs too small to see or tap on the map get a labelled circle in the bottom-left
  // corner (open sea on this projection), filled with the same colour as their shape.
  const SMALL_UTS = ["DL", "CH", "PY", "DH", "LD"].filter((c) => shapes.has(c));
  const inset = document.createElementNS(NS, "g");
  inset.classList.add("ut-inset");
  const R = 15, GAP = 38, X = 24, Y0 = H - 12 - R - (SMALL_UTS.length - 1) * GAP;
  inset.innerHTML = `<text class="ut-inset-title" x="${X - R}" y="${Y0 - R - 8}">UTs</text>`;
  SMALL_UTS.forEach((code, k) => {
    const b = document.createElementNS(NS, "g");
    b.classList.add("ut-badge");
    b.setAttribute("tabindex", "0");
    b.setAttribute("role", "button");
    b.innerHTML = `<title></title><circle cx="${X}" cy="${Y0 + k * GAP}" r="${R}"></circle><text x="${X}" y="${Y0 + k * GAP + 4}" text-anchor="middle">${code}</text>`;
    b.addEventListener("click", () => onSelect(code));
    b.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(code); }
    });
    inset.appendChild(b);
    shapes.get(code).badge = b;
  });
  svg.appendChild(inset);
  container.replaceChildren(svg);

  function update({ valueOf, regionName, selected, label, format = (v) => fmt(v) + "%", isEstimate = () => false }) {
    svg.setAttribute("aria-label", label);
    for (const [code, s] of shapes) {
      const v = valueOf(code);
      const fill = v == null ? "url(#hatch)" : `var(--seq-${bucket(v)})`;
      s.el.style.fill = fill;
      const isSel = code === selected;
      const est = v != null && isEstimate(code);
      s.el.classList.toggle("est", est);
      s.el.classList.toggle("selected", isSel);
      // Tiny UTs show their star on the badge instead of over the shape.
      if (s.star) s.star.style.display = est && !s.badge ? "" : "none";
      const text = `${regionName(code)}: ${v == null ? t("noData") : format(v)}${est ? `* (${t("estimateShort")})` : ""}`;
      s.title.textContent = text;
      s.el.setAttribute("aria-label", text);
      s.el.setAttribute("aria-pressed", String(isSel));
      if (s.badge) {
        s.badge.querySelector("circle").style.fill = fill;
        // Light text on the two darkest bands, dark text otherwise.
        s.badge.classList.toggle("on-dark", v != null && bucket(v) >= 3);
        s.badge.classList.toggle("est", est);
        s.badge.querySelector("text").textContent = est ? `${code}*` : code;
        s.badge.classList.toggle("selected", isSel);
        s.badge.querySelector("title").textContent = text;
        s.badge.setAttribute("aria-label", text);
        s.badge.setAttribute("aria-pressed", String(isSel));
      }
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
  el.innerHTML = `${cells.join("")}<span class="lg-cell"><i class="lg-nodata"></i>${t("noData")}</span>`;
}


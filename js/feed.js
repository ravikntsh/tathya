import { loadData } from "./data.js";
import { loadMap, createMap, renderLegend, setDomain } from "./map.js";
import { yearChart, esc, LINE_STYLES } from "./chart.js";
import { t, tr, fmt, setLang, getLang } from "./i18n.js";
import { shareTexts, shareImage, download, copy } from "./share.js";
import { SITE_URL } from "./config.js";
import { estimateAt, anchoredEstimate, interpolateAcross } from "./estimate.js";

// Swipe feed: one full-screen fact per indicator. Swipe up or down between facts,
// left or right through the years. Each fact shows India (or a tapped state), a map
// or chart, and the source of the number on screen at all times. The figures follow
// the tracker's "All sources" rules: official (class A) sources first, a figure
// dated within a year counts, and anything that is not a real figure is starred.

const $ = (id) => document.getElementById(id);
const GROUPS = ["necessities", "health", "education", "infrastructure", "economy", "defence"];
const SPLITS = { TG: ["AP", 2014], LA: ["JK", 2019], CT: ["MP", 2000], JH: ["BR", 2000], UT: ["UP", 2000] };
let data, features = [], cards = [], view = "map", active = 0;

const groupOf = (x) => x.group || "economy";
const regionName = (code) => tr(data.regionByCode.get(code)?.name) || code;
const dsLabel = (id) => tr(data.datasetById.get(id)?.label) || id;
const unitText = (i) => (i.unit === "%" ? "%" : ` ${i.unit}`);
const fmtVal = (v, i) => `${fmt(v, i.decimals ?? 1)}${unitText(i)}`;
const deltaUnit = (i) => (i.unit === "%" ? ` ${t("pts")}` : unitText(i));
const opts = (i) => ({ bounds: [0, i.unit === "%" ? 100 : Infinity], scale: i.unit === "%" ? "logit" : /per 1,000/.test(i.unit) ? "log" : "linear" });
const isClassA = (ds) => data.datasetById.get(ds)?.class === "A";

init();

async function init() {
  try {
    const l = localStorage.getItem("lang");
    if (l) setLang(l);
    const th = localStorage.getItem("theme");
    if (th) document.documentElement.dataset.theme = th;
    const v = localStorage.getItem("feedView");
    if (v === "map" || v === "chart") view = v;
  } catch {}
  applyStaticText();
  $("feed").innerHTML = `<p class="status fc-loading">${esc(t("loading"))}</p>`;
  try {
    [data, features] = await Promise.all([loadData(), loadMap("geo/india-states.topo.json").catch((e) => (console.warn(e), []))]);
  } catch (err) {
    $("feed").innerHTML = `<p class="status warn">${esc(String(err))}</p>`;
    return;
  }
  build();
  $("lang").addEventListener("click", () => {
    setLang(getLang() === "en" ? "hi" : "en");
    try { localStorage.setItem("lang", getLang()); } catch {}
    applyStaticText();
    const keep = active;
    build();
    cards[keep]?.el.scrollIntoView({ block: "start" });
  });
  $("theme").addEventListener("click", () => {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = document.documentElement.dataset.theme || (dark ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
  });
  // Keyboard: up/down between facts, left/right through the years.
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, dialog")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      cards[Math.max(0, Math.min(cards.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)))]?.el.scrollIntoView({ block: "start", behavior: "smooth" });
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      step(cards[active], e.key === "ArrowRight" ? 1 : -1);
    }
  });
  $("share-close").addEventListener("click", () => $("share-dlg").close());
}

function applyStaticText() {
  document.documentElement.lang = getLang();
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $("lang").textContent = getLang() === "en" ? "हिं" : "EN";
}

// ---------- figures ----------

// India lines: the indicator's anchor series first, then official sources, then the longest.
function natDatasets(i) {
  const anchors = i.anchor || [];
  const rank = (d) => (anchors.includes(d) ? 0 : isClassA(d) ? 1 : 2);
  return data.nationalDatasets(i.id)
    .filter((d) => data.datasetById.get(d)?.chart !== false)
    .sort((a, b) => rank(a) - rank(b) || data.series(i.id, b, "IN").length - data.series(i.id, a, "IN").length);
}
function stateOrder(i) {
  return [...data.stateDatasets(i.id)].sort((a, b) => (isClassA(a) ? 0 : 1) - (isClassA(b) ? 0 : 1));
}
// Every year with a real figure for India or for states.
function slotsOf(i) {
  const ys = new Set();
  for (const d of natDatasets(i)) for (const o of data.series(i.id, d, "IN")) ys.add(o.year);
  for (const d of stateOrder(i)) for (const p of data.periods(i.id, d, { statesOnly: true })) ys.add(p.year);
  return [...ys].sort((a, b) => a - b);
}
function indiaObs(i, y) {
  for (const d of natDatasets(i)) {
    const o = data.series(i.id, d, "IN").find((p) => p.year === y);
    if (o) return o;
  }
  return null;
}
function stateObs(i, code, y) {
  for (const tol of [0, 1]) {
    for (const d of stateOrder(i)) {
      const o = data.series(i.id, d, code).find((p) => Math.abs(p.year - y) <= tol);
      if (o) return o;
    }
  }
  return null;
}
// One state's value for a year: real figure, undivided parent, or a starred estimate.
function stateCell(i, code, y) {
  const o = stateObs(i, code, y);
  if (o) return { kind: "obs", value: o.value, o };
  const split = SPLITS[code];
  if (split && y < split[1]) {
    const po = stateObs(i, split[0], y);
    if (po) return { kind: "parent", value: po.value, o: po, parent: split[0] };
  }
  const order = stateOrder(i);
  for (const a of i.anchor || []) {
    const nat = data.series(i.id, a, "IN");
    if (nat.length < 3) continue;
    for (const d of order) {
      const c = anchoredEstimate(data.series(i.id, d, code), nat, y, opts(i));
      if (c) return { ...c, anchor: a, via: d };
    }
  }
  for (const d of order) {
    const c = estimateAt(data.series(i.id, d, code), y, opts(i));
    if (c && c.kind !== "obs") return { ...c, via: d };
  }
  // Across a break (or with too few points for a trend): move with India in the same
  // source, keeping the state's gap to India at its nearest real figure.
  for (const d of order) {
    const nat = data.series(i.id, d, "IN");
    if (nat.length < 2) continue;
    const c = anchoredEstimate(data.series(i.id, d, code), nat, y, opts(i));
    if (c) return { ...c, anchor: d, same: true, via: d };
  }
  for (const d of order) {
    const b = interpolateAcross(data.series(i.id, d, code), y);
    if (b) return { ...b, via: d };
  }
  // A state created by a split, before the split: the undivided state's estimate.
  if (split && y < split[1]) {
    const pc = stateCell(i, split[0], y);
    if (isEst(pc)) return { ...pc, parentOf: split[0] };
  }
  return null;
}
function stateCells(i, y) {
  return new Map(data.states.map((s) => [s.code, stateCell(i, s.code, y)]));
}
// Same rule as the tracker: Census-population-weighted average of real state
// figures, only when they cover at least 80% of India's population.
function weightedIndia(cells, year) {
  const pop = data.population;
  if (!pop?.size || year == null) return null;
  const years = [...new Set([...pop.values()].flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const wy = years.filter((y) => y <= year).at(-1) ?? years[0];
  const total = pop.get("IN")?.get(wy);
  if (!total) return null;
  const skip = new Set([...(year >= 2014 ? ["AP", "TG"] : []), ...(year >= 2019 ? ["JK", "LA"] : [])]);
  let sum = 0, w = 0, n = 0;
  for (const s of data.states) {
    if (skip.has(s.code)) continue;
    const c = cells.get(s.code), p = pop.get(s.code)?.get(wy);
    if (c && p && c.kind === "obs") { sum += c.value * p; w += p; n++; }
  }
  if (!w || w / total < 0.8) return null;
  return { kind: "weighted", value: sum / w, states: n, coverage: w / total, popYear: wy, skipped: [...skip] };
}
function headline(i, code, y, cells) {
  if (code !== "IN") return cells.get(code) ?? stateCell(i, code, y);
  const o = indiaObs(i, y);
  if (o) return { kind: "obs", value: o.value, o };
  const nat = natDatasets(i)[0];
  if (nat) {
    const c = estimateAt(data.series(i.id, nat, "IN"), y, opts(i));
    if (c && c.kind !== "obs") return { ...c, via: nat };
  }
  return weightedIndia(cells, y);
}
const isEst = (c) => !!c && !["obs", "parent"].includes(c.kind);

// The start of the comparable stretch of a series (after the last break) up to o.
function baseFor(i, code, o) {
  const series = data.series(i.id, o.dataset, code).filter((p) => p.year <= o.year);
  let j = 0;
  series.forEach((p, k) => { if (p.breakBefore) j = k; });
  const base = series[j];
  return base && base.period !== o.period ? { base, series } : { base: null, series };
}

function howText(i, c) {
  return howCore(i, c) + (c.broken ? " " + t("estBroken") : "") + (c.parentOf ? " " + t("estParent")(regionName(c.parentOf)) : "");
}
function howCore(i, c) {
  const src = dsLabel(c.via);
  if (c.kind === "anchored" && c.same) return t("estSame")(src, c.basis.map((p) => p.period).join(" & "), fmtVal(c.lo, i), fmtVal(c.hi, i));
  if (c.kind === "anchored") return t("estAnchored")(dsLabel(c.anchor), c.basis.map((p) => p.period).join(" & "), fmtVal(c.lo, i), fmtVal(c.hi, i), src);
  if (c.kind === "interp") return t("estInterp")(`${c.from.period} (${fmtVal(c.from.value, i)})`, `${c.to.period} (${fmtVal(c.to.value, i)})`, src);
  return t("estProj")(c.basis.join(", "), fmtVal(c.lo, i), fmtVal(c.hi, i), src);
}
const basisOf = (c) => (c.kind === "interp" ? [c.from, c.to] : [c.last]);

function sourceHtml(o, label = t("source")) {
  const s = data.sourceById.get(o.sourceId);
  const where = [o.sourceTable, o.sourcePage ? `${t("page")} ${o.sourcePage}` : ""].filter(Boolean).join(", ");
  return `${esc(label)}: <a href="${esc(s?.url ?? "#")}" target="_blank" rel="noopener">${esc(s?.publisher ?? o.sourceId)}</a>${s ? `, <cite>${esc(s.title)}</cite>` : ""}${where ? ` (${esc(where)})` : ""}`;
}
const POP_SRC = "https://rbidocs.rbi.org.in/rdocs/Publications/DOCs/1T_09122024203D0FF3A7FC42068D952BA8D5603050.XLSX";

// ---------- cards ----------

function build() {
  const feed = $("feed");
  const list = [...GROUPS.flatMap((g) => data.indicators.filter((x) => groupOf(x) === g)),
    ...data.indicators.filter((x) => !GROUPS.includes(groupOf(x)))];
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("view") === "map" || p.get("view") === "chart") view = p.get("view");
  cards = list.map((i) => ({ i, slots: slotsOf(i), region: "IN" })).filter((c) => c.slots.length);
  cards.forEach((c) => {
    const lastState = Math.max(-Infinity, ...stateOrder(c.i).map((d) => data.periods(c.i.id, d, { statesOnly: true }).at(-1)?.year ?? -Infinity));
    const k = canMap(c) ? c.slots.lastIndexOf(lastState) : -1;
    c.k = k >= 0 ? k : c.slots.length - 1;
  });
  let start = Math.max(0, cards.findIndex((c) => c.i.id === p.get("ind")));
  if (p.get("ind") && cards[start]?.i.id === p.get("ind")) {
    const c = cards[start], y = Number(p.get("yr"));
    if (c.slots.includes(y)) c.k = c.slots.indexOf(y);
    if (data.regionByCode.has(p.get("state"))) c.region = p.get("state");
  } else start = 0;

  feed.innerHTML = cards.map((c, n) => shell(c, n)).join("");
  cards.forEach((c, n) => {
    c.el = feed.children[n];
    c.viz = c.el.querySelector(".fc-viz");
    c.on = false;
    wire(c);
    renderText(c);
  });

  // Section jump menu
  const present = GROUPS.filter((g) => cards.some((c) => groupOf(c.i) === g));
  $("jump").innerHTML = `<option value="">${esc(t("jumpTo"))}</option>` +
    present.map((g) => `<option value="${cards.findIndex((c) => groupOf(c.i) === g)}">${esc(t("groups")[g] ?? g)}</option>`).join("");
  $("jump").onchange = (e) => {
    const n = Number(e.target.value);
    if (e.target.value !== "") cards[n]?.el.scrollIntoView({ block: "start", behavior: "smooth" });
    e.target.value = "";
  };

  // Draw maps and charts only near the screen (and drop far ones) to stay light on phones.
  const near = new IntersectionObserver((es) => es.forEach((e) => {
    const c = cards[Number(e.target.dataset.n)];
    if (e.isIntersecting && !c.on) { c.on = true; renderViz(c); }
    else if (!e.isIntersecting && c.on) { c.on = false; c.map = null; c.viz.replaceChildren(); }
  }), { root: feed, rootMargin: "120% 0px" });
  const current = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { active = Number(e.target.dataset.n); writeHash(); }
  }), { root: feed, threshold: 0.6 });
  cards.forEach((c) => { near.observe(c.el); current.observe(c.el); });
  if (start > 0) cards[start].el.scrollIntoView({ block: "start" });
}

function shell(c, n) {
  const i = c.i;
  return `<article class="fcard" data-n="${n}" aria-roledescription="${esc(t("factRole"))}" aria-label="${esc(tr(i.short_label))}">
    <div class="fc-head"><span class="fc-group">${esc(t("groups")[groupOf(i)] ?? groupOf(i))}</span><span class="fc-count">${n + 1} / ${cards.length}</span></div>
    <h2 class="fc-title">${esc(tr(i.short_label))}</h2>
    <p class="fc-def">${esc(tr(i.label))}</p>
    <div class="fc-fig" aria-live="polite"></div>
    <div class="fc-viz"></div>
    <div class="fc-years">
      <button class="pill fc-prev" type="button" aria-label="${esc(t("prevYear"))}">◀</button>
      <div class="fc-slider"><input type="range" min="0" max="${c.slots.length - 1}" step="1" aria-label="${esc(t("yearAll"))}"><div class="fc-ticks"></div></div>
      <button class="pill fc-next" type="button" aria-label="${esc(t("nextYear"))}">▶</button>
    </div>
    <p class="fc-src"></p>
    <div class="fc-actions">
      <button class="pill fc-view" type="button"></button>
      <button class="pill fc-share" type="button">${esc(t("share"))}</button>
      <a class="pill fc-full" href="index.html">${esc(t("fullView"))} ↗</a>
    </div>
    ${n === 0 ? `<p class="fc-hint">${esc(t("feedHint"))}</p>` : ""}
  </article>`;
}

const canMap = (c) => features.length > 0 && data.stateDatasets(c.i.id).length > 0;
const viewOf = (c) => (canMap(c) ? view : "chart");

function wire(c) {
  const el = c.el;
  el.querySelector(".fc-prev").addEventListener("click", () => step(c, -1));
  el.querySelector(".fc-next").addEventListener("click", () => step(c, 1));
  el.querySelector("input[type=range]").addEventListener("input", (e) => { c.k = Number(e.target.value); refresh(c); });
  el.querySelector(".fc-view").addEventListener("click", () => {
    view = viewOf(c) === "map" ? "chart" : "map";
    try { localStorage.setItem("feedView", view); } catch {}
    // The choice carries to every fact: redraw the ones on screen.
    for (const x of cards) if (x.on) { x.map = null; renderViz(x); renderText(x); }
    writeHash();
  });
  el.querySelector(".fc-share").addEventListener("click", () => openShare(c));

  // Horizontal swipe changes the year. Vertical movement is left to the browser
  // (touch-action: pan-y), which snaps to the next fact. Swipes that start on the
  // chart are left to the chart (hover and two-date compare).
  let sx = 0, sy = 0, down = false, swallow = false;
  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".chart, input, button, a, select")) return;
    down = true; sx = e.clientX; sy = e.clientY;
  });
  el.addEventListener("pointerup", (e) => {
    if (!down) return;
    down = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > 1.4 * Math.abs(dy)) {
      swallow = true;
      setTimeout(() => (swallow = false), 60);
      step(c, dx < 0 ? 1 : -1);
    }
  });
  el.addEventListener("pointercancel", () => (down = false));
  // A swipe that ends on a state must not also select it.
  el.addEventListener("click", (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
}

function step(c, d) {
  if (!c) return;
  const k = Math.max(0, Math.min(c.slots.length - 1, c.k + d));
  if (k === c.k) { c.el.querySelector(".fc-fig").animate?.([{ transform: "translateX(0)" }, { transform: `translateX(${d * 8}px)` }, { transform: "translateX(0)" }], 180); return; }
  c.k = k;
  refresh(c);
  c.el.querySelector(".fc-fig").animate?.([{ opacity: 0.3, transform: `translateX(${d * 24}px)` }, { opacity: 1, transform: "translateX(0)" }], 200);
}

function refresh(c) {
  renderText(c);
  if (c.on) renderViz(c);
  if (cards[active] === c) writeHash();
}

function writeHash() {
  const c = cards[active];
  if (!c) return;
  const p = new URLSearchParams({ ind: c.i.id, yr: c.slots[c.k] });
  if (c.region !== "IN") p.set("state", c.region);
  if (view === "chart") p.set("view", "chart");
  history.replaceState(null, "", `#${p}`);
}

// Headline, change, source, slider and links for a card's current year and place.
function renderText(c) {
  const i = c.i, y = c.slots[c.k];
  c.cells = canMap(c) ? stateCells(i, y) : new Map();
  const h = headline(i, c.region, y, c.cells);
  c.h = h;
  const el = c.el;
  const back = c.region !== "IN" ? ` <button class="fc-back" type="button">← ${esc(t("backIndia"))}</button>` : "";
  let fig, src;
  if (!h) {
    fig = `<p class="fc-region">${esc(regionName(c.region))}${back}</p><p class="fc-big fc-none">${esc(t("noData"))}</p><p class="fc-when">${y}</p>`;
    src = "";
  } else if (h.kind === "weighted") {
    fig = `<p class="fc-region">${esc(regionName(c.region))}${back}</p>
      <p class="fc-big est-big">${fmt(h.value, i.decimals)}<sup class="star">*</sup><small>${esc(unitText(i))}</small></p>
      <p class="fc-when"><span class="est-tag">* ${esc(t("weightedTitle"))}</span> ${y}</p>`;
    src = `<span class="fc-how">${esc(t("weightedHow")(h.states, Math.round(h.coverage * 100), h.popYear, t("allSources")))}</span>
      ${esc(t("source"))}: <a href="${POP_SRC}" target="_blank" rel="noopener">RBI, Handbook of Statistics on Indian States 2023-24, Table 1 (Census populations)</a>`;
  } else if (isEst(h)) {
    fig = `<p class="fc-region">${esc(regionName(c.region))}${back}</p>
      <p class="fc-big est-big">${fmt(h.value, i.decimals)}<sup class="star">*</sup><small>${esc(unitText(i))}</small></p>
      <p class="fc-when"><span class="est-tag">* ${esc(t("estimateTitle"))}</span> ${y}</p>`;
    src = `<span class="fc-how">${esc(howText(i, h))}</span>` +
      [...new Map(basisOf(h).map((o) => [o.sourceId, o])).values()].map((o) => sourceHtml(o, t("basedOn"))).join("<br>");
  } else {
    const o = h.o;
    const { base } = baseFor(i, h.kind === "parent" ? h.parent : c.region, o);
    const d = base ? o.value - base.value : null;
    const good = d == null || i.higher_is_better == null ? null : (d >= 0) === i.higher_is_better;
    fig = `<p class="fc-region">${esc(regionName(c.region))}${back}</p>
      <p class="fc-big">${fmt(o.value, i.decimals)}<small>${esc(unitText(i))}</small></p>
      <p class="fc-when">${esc(o.period)} · ${esc(dsLabel(o.dataset))}</p>
      ${h.kind === "parent" ? `<p><span class="calc-tag">${esc(t("partOf")(regionName(h.parent)))}</span></p>` : ""}
      ${o.derived ? `<p><span class="calc-tag">${esc(t("calcTag"))}</span></p>` : ""}
      ${d == null ? "" : `<p class="delta ${good == null ? "neutral" : good ? "up" : "down"}">${d >= 0 ? "▲ +" : "▼ "}${fmt(d, i.decimals)}${esc(deltaUnit(i))} ${esc(t("since")(base.period, fmtVal(base.value, i)))}</p>`}`;
    src = sourceHtml(o);
  }
  el.querySelector(".fc-fig").innerHTML = fig;
  el.querySelector(".fc-back")?.addEventListener("click", () => { c.region = "IN"; refresh(c); });
  el.querySelector(".fc-src").innerHTML = src;

  const slider = el.querySelector("input[type=range]");
  slider.value = c.k;
  slider.disabled = c.slots.length < 2;
  slider.setAttribute("aria-valuetext", String(y));
  const n = c.slots.length;
  el.querySelector(".fc-ticks").innerHTML = `<span>${c.slots[0]}</span><span class="active">${y}</span><span>${c.slots[n - 1]}</span>`;
  el.querySelector(".fc-prev").disabled = c.k === 0;
  el.querySelector(".fc-next").disabled = c.k === n - 1;
  const vb = el.querySelector(".fc-view");
  vb.hidden = !canMap(c);
  vb.textContent = viewOf(c) === "map" ? `📈 ${t("viewChart")}` : `🗺 ${t("viewMap")}`;
  const fp = new URLSearchParams({ ind: i.id });
  if (data.stateDatasets(i.id).length > 1) { fp.set("src", "__all"); fp.set("yr", y); }
  if (c.region !== "IN") fp.set("state", c.region);
  el.querySelector(".fc-full").href = `index.html#${fp}`;
}

function renderViz(c) {
  const i = c.i, y = c.slots[c.k];
  if (viewOf(c) === "map") {
    if (!c.map) {
      c.viz.innerHTML = `<div class="fc-map"></div><div class="legend fc-legend"></div><p class="fc-mapnote"></p>`;
      c.map = createMap(c.viz.querySelector(".fc-map"), features, {
        onSelect: (code) => { c.region = c.region === code ? "IN" : code; refresh(c); },
      });
    }
    setDomain(i.map_domain ?? i.domain);
    const cells = c.cells;
    c.map.update({
      valueOf: (code) => cells.get(code)?.value ?? null,
      regionName,
      selected: c.region === "IN" ? null : c.region,
      label: `${tr(i.label)}, ${y}`,
      format: (v) => fmtVal(v, i),
      isEstimate: (code) => isEst(cells.get(code)),
      note: (code) => (cells.get(code)?.kind === "parent" ? t("partOf")(regionName(cells.get(code).parent))
        : cells.get(code)?.parentOf ? t("estParentShort")(regionName(cells.get(code).parentOf)) : ""),
    });
    renderLegend(c.viz.querySelector(".fc-legend"), i.unit, { estimates: false });
    // Which sources the coloured states come from this year (real figures only).
    const used = [...new Set([...cells.values()].filter((x) => x && !isEst(x)).map((x) => dsLabel(x.o.dataset)))];
    const star = [...cells.values()].some(isEst);
    c.viz.querySelector(".fc-mapnote").textContent =
      [used.length ? t("mapSources")(used.join("; ")) : "", star ? t("starShort") : "", t("tapStateFeed")].filter(Boolean).join(" · ");
    return;
  }
  c.map = null;
  const lines = [];
  if (c.region !== "IN") {
    stateOrder(i).map((d) => ({ d, pts: data.series(i.id, d, c.region) }))
      .filter((x) => x.pts.length >= 2).sort((a, b) => b.pts.length - a.pts.length).slice(0, 2)
      .forEach(({ d, pts }) => lines.push({ label: `${regionName(c.region)} (${dsLabel(d)})`, points: pts }));
  }
  for (const d of natDatasets(i)) {
    if (lines.length >= LINE_STYLES.length) break;
    lines.push({ label: `${t("national")}: ${dsLabel(d)}`, points: data.series(i.id, d, "IN") });
  }
  lines.forEach((l, k) => (l.style = LINE_STYLES[k]));
  const years = lines.flatMap((l) => l.points.map((p) => p.year));
  c.viz.innerHTML = `<div class="fc-chart"></div>`;
  if (!years.length) { c.viz.innerHTML = `<p class="muted small">${esc(t("noData"))}</p>`; return; }
  const lo = Math.min(...years), hi = Math.max(...years);
  yearChart(c.viz.querySelector(".fc-chart"), {
    lines, xDomain: [lo, Math.max(hi, lo + 1)], yDomain: i.domain, decimals: i.decimals,
    activeYear: y, unit: i.unit, estimates: false, ...opts(i),
    events: contextFor(i.id), terms: pmTerms(), width: 420, height: 300,
  });
}

// Same as the tracker: events for this indicator, and Prime Ministers' terms (names only, neutral greys).
function contextFor(id) {
  return (data.context || [])
    .filter((e) => e.indicators?.includes("*") || e.indicators?.includes(id))
    .map((e) => ({ year: Number(String(e.date).slice(0, 4)), endYear: e.end_date ? Number(String(e.end_date).slice(0, 4)) : null,
      label: e.label, summary: e.summary, when: e.end_date ? `${e.date} – ${e.end_date}` : e.date }));
}
function pmTerms() {
  const out = [];
  for (const g of data.governments || []) {
    const prev = out.at(-1);
    const part = `${g.party}${g.coalition ? `, ${g.coalition}` : ""}: ${g.start_date} to ${g.end_date || t("present")}`;
    if (prev && prev.full === g.pm && prev.end === g.start_date) { prev.end = g.end_date || null; prev.detail += `; ${part}`; continue; }
    const names = g.pm.replace(/\./g, "").split(" ");
    out.push({ start: g.start_date, end: g.end_date || null, full: g.pm,
      short: names.length > 1 ? `${names.slice(0, -1).map((n) => n[0]).join(". ")}. ${names.at(-1)}` : g.pm, detail: `${g.pm} (${part}` });
  }
  return out.map((g) => ({ ...g, detail: g.detail + ")" }));
}

// ---------- sharing ----------

function shareCard(c) {
  const i = c.i, y = c.slots[c.k], h = c.h;
  if (!h) return null;
  const common = { regionName: regionName(c.region), indicatorLabel: tr(i.short_label), value: h.value, valueText: fmtVal(h.value, i),
    unit: unitText(i), deltaUnit: deltaUnit(i), decimals: i.decimals, higherIsBetter: i.higher_is_better, domain: i.domain };
  if (h.kind === "weighted") {
    return { ...common, round: String(y), years: t("weightedTitle"), prev: null,
      sourceName: `${t("weightedTitle")}: ${t("allSources")}; RBI Handbook of Statistics on Indian States (Census populations)`, sourceUrl: POP_SRC,
      series: [{ round: String(y), value: h.value, est: true }],
      estimate: { note: t("weightedHow")(h.states, Math.round(h.coverage * 100), h.popYear, t("allSources")) } };
  }
  if (isEst(h)) {
    const basis = basisOf(h);
    const real = data.series(i.id, h.via, c.region).filter((p) => p.year < y).slice(-6);
    return { ...common, round: String(y), years: dsLabel(h.via), prev: null,
      sourceName: `${[...new Set(basis.map((o) => data.sourceById.get(o.sourceId)?.publisher ?? o.sourceId))].join("; ")} (${dsLabel(h.via)})`,
      sourceUrl: data.sourceById.get(basis.at(-1).sourceId)?.url ?? "",
      series: [...real.map((s) => ({ round: s.period, value: s.value })), { round: String(y), value: h.value, est: true }],
      estimate: { note: howText(i, h) } };
  }
  const o = h.o, src = data.sourceById.get(o.sourceId);
  const { base, series } = baseFor(i, h.kind === "parent" ? h.parent : c.region, o);
  return { ...common, round: o.period, years: dsLabel(o.dataset),
    prev: base ? { round: base.period, value: base.value } : null,
    sourceName: (src?.publisher ?? o.sourceId) + (o.derived ? ` (${t("calcTag")})` : ""), sourceUrl: src?.url ?? "",
    series: series.slice(-8).map((s) => ({ round: s.period, value: s.value })) };
}

function feedLink(c) {
  const p = new URLSearchParams({ ind: c.i.id, yr: c.slots[c.k] });
  if (c.region !== "IN") p.set("state", c.region);
  return `${SITE_URL}feed.html#${p}`;
}

function openShare(c) {
  const card = shareCard(c);
  const dlg = $("share-dlg");
  if (!card) return;
  const link = feedLink(c);
  const texts = shareTexts(card, link);
  const name = `tathya-${c.i.id}-${c.region}-${card.round}${card.estimate ? "-estimate" : ""}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  $("share-what").textContent = `${card.regionName}: ${card.indicatorLabel}: ${card.estimate ? "≈ " : ""}${card.valueText} (${card.round})`;
  $("share-est").hidden = !card.estimate;
  const native = !!navigator.share;
  $("share-actions").innerHTML = `
    ${native ? `<button class="pill primary" data-act="native">${esc(t("shareImage"))}</button>` : ""}
    <button class="pill" data-act="sq">${esc(t("shareSquare"))}</button>
    <button class="pill" data-act="wide">${esc(t("shareWide"))}</button>
    <button class="pill" data-act="x">${esc(t("copyX"))}</button>
    <button class="pill" data-act="long">${esc(t("copyLong"))}</button>
    <button class="pill" data-act="link">${esc(t("copyLink"))}</button>`;
  $("share-actions").querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
    const act = b.dataset.act;
    if (act === "native") {
      const blob = await shareImage(card, link, [1080, 1080]);
      const file = new File([blob], `${name}-1080.png`, { type: "image/png" });
      const payload = { text: texts.long, url: link };
      try {
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ ...payload, files: [file] });
        else await navigator.share(payload);
      } catch {}
      return;
    }
    if (act === "sq") return download(await shareImage(card, link, [1080, 1080]), `${name}-1080.png`);
    if (act === "wide") return download(await shareImage(card, link, [1200, 675]), `${name}-1200x675.png`);
    const ok = await copy(act === "x" ? texts.short : act === "long" ? texts.long : link);
    if (ok) { const old = b.textContent; b.textContent = t("copied"); setTimeout(() => (b.textContent = old), 1200); }
  }));
  dlg.showModal();
}

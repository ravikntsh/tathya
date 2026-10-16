import { loadData } from "./data.js";
import { loadMap, createMap, renderLegend, setDomain } from "./map.js";
import { yearChart, rankBars, dataTable, esc, LINE_STYLES, chartPng } from "./chart.js";
import { t, tr, fmt, setLang, getLang } from "./i18n.js";
import { cardLink, shareTexts, shareImage, download, copy } from "./share.js";
import { MAP_VERIFIED } from "./config.js";
import { estimateAt } from "./estimate.js";
import { renderRail } from "./rail.js";

const $ = (id) => document.getElementById(id);
const RANGES = { all: 1850, 1947: 1947, 1991: 1991 };
const state = { indicator: null, dataset: null, period: null, region: null, range: "all", cmpA: "", cmpB: "", estimates: false, year: null };
let data, map, lastCells = null;

init();

async function init() {
  readPrefs();
  applyStaticText();
  $("status").textContent = t("loading");
  let features = [];
  try {
    [data, features] = await Promise.all([loadData(), loadMap("geo/india-states.topo.json").catch((e) => (console.warn(e), []))]);
  } catch (err) {
    $("status").textContent = String(err);
    return;
  }
  readHash();
  if (!data.indicatorById.has(state.indicator) || !data.indicators.some((i) => i.id === state.indicator)) state.indicator = data.indicators[0]?.id;
  pickDataset();

  if (features.length) map = createMap($("map"), features, { onSelect: selectRegion });
  else $("map").innerHTML = `<p class="status warn">Map file not built yet (geo/india-states.topo.json).</p>`;
  $("map-banner").hidden = MAP_VERIFIED;

  bindControls();
  // Browsers restore checkbox state on reload; keep it in step with the page state.
  $("estimates").checked = state.estimates;
  $("est-note").hidden = !state.estimates;
  render();
}

// Keep the dataset and period valid for the current indicator.
function pickDataset() {
  const ds = data.stateDatasets(state.indicator);
  if (!ds.includes(state.dataset)) state.dataset = ds[0] ?? null;
  const ps = state.dataset ? data.periods(state.indicator, state.dataset, { statesOnly: true }) : [];
  if (!ps.some((p) => p.period === state.period)) state.period = ps.at(-1)?.period ?? null;
}

function readPrefs() {
  try {
    const l = localStorage.getItem("lang");
    if (l) setLang(l);
    const th = localStorage.getItem("theme");
    if (th) document.documentElement.dataset.theme = th;
  } catch {}
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.indicator = p.get("ind") || state.indicator;
  state.dataset = p.get("src") || null;
  state.period = p.get("round") || null;
  state.region = p.get("state") || null;
  if (RANGES[p.get("from")]) state.range = p.get("from");
  state.estimates = p.get("est") === "1";
  state.year = Number(p.get("yr")) || null;
}

function writeHash() {
  const p = new URLSearchParams({ ind: state.indicator });
  if (state.dataset) p.set("src", state.dataset);
  if (state.period) p.set("round", state.period);
  if (state.region) p.set("state", state.region);
  if (state.range !== "all") p.set("from", state.range);
  if (state.estimates) { p.set("est", "1"); if (state.year) p.set("yr", state.year); }
  history.replaceState(null, "", `#${p}`);
}

function applyStaticText() {
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $("lang").textContent = getLang() === "en" ? "हिं" : "EN";
  renderRail($("issues"), { active: "development" });
}

function bindControls() {
  $("round").addEventListener("input", (e) => {
    if (estMode()) {
      state.year = yearSlots()[Number(e.target.value)] ?? state.year;
    } else {
      const ps = data.periods(state.indicator, state.dataset, { statesOnly: true });
      state.period = ps[Number(e.target.value)]?.period ?? null;
    }
    render();
  });
  $("source").addEventListener("change", (e) => {
    state.dataset = e.target.value;
    state.period = null;
    pickDataset();
    render();
  });
  $("ranges").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-range]");
    if (!b) return;
    state.range = b.dataset.range;
    render();
  });
  $("lang").addEventListener("click", () => {
    setLang(getLang() === "en" ? "hi" : "en");
    try { localStorage.setItem("lang", getLang()); } catch {}
    applyStaticText();
    render();
  });
  $("theme").addEventListener("click", () => {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = document.documentElement.dataset.theme || (dark ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
  });
  $("table-toggle").addEventListener("click", () => {
    const tbl = $("table");
    tbl.hidden = !tbl.hidden;
    $("table-toggle").setAttribute("aria-expanded", String(!tbl.hidden));
    $("table-toggle").textContent = tbl.hidden ? t("showTable") : t("hideTable");
  });
  $("csv").addEventListener("click", downloadCsv);
  $("estimates").addEventListener("change", (e) => {
    state.estimates = e.target.checked;
    $("est-note").hidden = !state.estimates;
    const ps = state.dataset ? data.periods(state.indicator, state.dataset, { statesOnly: true }) : [];
    if (state.estimates) {
      // Start the year slider at the round that was showing.
      state.year = ps.find((p) => p.period === state.period)?.year ?? ps.at(-1)?.year ?? null;
    } else if (state.year) {
      // Back to rounds: the latest round at or before the chosen year.
      state.period = (ps.filter((p) => p.year <= state.year).at(-1) ?? ps[0])?.period ?? state.period;
    }
    render();
  });
  $("chart-png").addEventListener("click", async () => {
    const i = ind();
    const srcs = [...new Set(data.nationalDatasets(state.indicator).filter((ds) => data.datasetById.get(ds)?.chart !== false)
      .flatMap((ds) => data.series(state.indicator, ds, "IN").map((o) => data.sourceById.get(o.sourceId)?.publisher ?? o.sourceId)))];
    const blob = await chartPng($("trend"), {
      title: `${t("national")}: ${tr(i.short_label)}`,
      subtitle: `${tr(i.label)} (${i.unit})${state.estimates ? " · " + t("estimateKey") : ""}`,
      sources: srcs.map((x) => `${t("source")}: ${x}`),
      site: `Tathya · ${location.href.replace(/^https?:\/\//, "").slice(0, 90)}`,
    });
    download(blob, `tathya-${i.id}-chart.png`);
  });
  $("cmp-a").addEventListener("change", (e) => { state.cmpA = e.target.value; renderCompare(); });
  $("cmp-b").addEventListener("change", (e) => { state.cmpB = e.target.value; renderCompare(); });
}

function selectRegion(code) {
  state.region = state.region === code ? null : code;
  if (state.region && !state.cmpA) state.cmpA = state.region;
  render();
}

const regionName = (code) => tr(data.regionByCode.get(code)?.name) || code;
const dsLabel = (id) => tr(data.datasetById.get(id)?.label) || id;
const ind = () => data.indicatorById.get(state.indicator);
const unitText = (i) => (i.unit === "%" ? "%" : ` ${i.unit}`);
// Estimates can't go below 0, or above 100 for percentages.
const boundsOf = (i) => [0, i.unit === "%" ? 100 : Infinity];
// Trend scale for estimates: logit for percentages, log for rates per 1,000, linear otherwise.
const scaleOf = (i) => (i.unit === "%" ? "logit" : /per 1,000/.test(i.unit) ? "log" : "linear");
const fmtVal = (v, i = ind()) => `${fmt(v, i.decimals ?? 1)}${unitText(i)}`;
// Changes in a percentage are percentage points, not per cent.
const deltaUnit = (i) => (i.unit === "%" ? ` ${t("pts")}` : unitText(i));

// Estimates mode: the slider moves year by year from the dataset's first round to
// this year, and the map fills years without data with clearly marked estimates.
const estMode = () => state.estimates && !!state.dataset;
function yearSlots() {
  const ps = data.periods(state.indicator, state.dataset, { statesOnly: true });
  if (!ps.length) return [];
  const out = [];
  for (let y = ps[0].year; y <= new Date().getFullYear(); y++) out.push(y);
  return out;
}
// The value shown for one region in the selected round or year:
// - the observed value when the source has one;
// - otherwise an estimate from the region's own series in the same source
//   (between its real points, or its recent trend), shown with a star (*);
// - for India only, when no official figure exists: the population-weighted
//   average of the states shown (also starred and labelled as calculated).
// States created by splitting another: before the split, a source reports only
// the parent, so the child area shows the parent's figure (real data for the state
// as it then was), labelled "part of undivided ...", not starred.
const SPLITS = { TG: ["AP", 2014], LA: ["JK", 2019], CT: ["MP", 2000], JH: ["BR", 2000], UT: ["UP", 2000] };

function cell(code) {
  if (!state.dataset) return null;
  const year = estMode() ? state.year : data.periods(state.indicator, state.dataset, { statesOnly: true }).find((p) => p.period === state.period)?.year;
  if (!estMode()) {
    const o = data.get(state.indicator, state.dataset, state.period, code);
    if (o) return { kind: "obs", value: o.value, o };
  }
  if (year == null) return null;
  const split = SPLITS[code];
  if (split && year < split[1]) {
    const po = estMode()
      ? data.series(state.indicator, state.dataset, split[0]).find((p) => p.year === year)
      : data.get(state.indicator, state.dataset, state.period, split[0]);
    if (po) return { kind: "parent", value: po.value, o: po, parent: split[0] };
  }
  const opts = { bounds: boundsOf(ind()), scale: scaleOf(ind()) };
  const own = estimateAt(data.series(state.indicator, state.dataset, code), year, opts);
  if (own) return own;
  // Fallback: the same indicator from another source that has this state, e.g. the
  // DHS series (NFHS-1 to 5) when a state was not surveyed in NFHS-6. Always starred,
  // and the card names the source used.
  for (const ds of data.stateDatasets(state.indicator)) {
    if (ds === state.dataset) continue;
    const c = estimateAt(data.series(state.indicator, ds, code), year, opts);
    if (c) return { ...c, kind: c.kind === "obs" ? "other" : c.kind, via: ds };
  }
  return null;
}

// Population-weighted average of state values, used for India only when the
// source has no All-India figure. Weights are Census populations for the census
// year nearest to (and not after, where possible) the year shown. Needs states
// covering at least 80% of India's population, or no figure is shown.
function weightedIndia(cells, year) {
  const pop = data.population;
  if (!pop?.size || year == null) return null;
  const years = [...new Set([...pop.values()].flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const wy = years.filter((y) => y <= year).at(-1) ?? years[0];
  const total = pop.get("IN")?.get(wy);
  if (!total) return null;
  // Census populations exist only for undivided Andhra Pradesh and for J&K including
  // Ladakh, so after those splits the affected states are left out of the weights.
  const skip = new Set([...(year >= 2014 ? ["AP", "TG"] : []), ...(year >= 2019 ? ["JK", "LA"] : [])]);
  let sum = 0, w = 0, n = 0;
  for (const s of data.states) {
    if (skip.has(s.code)) continue;
    const c = cells.get(s.code), p = pop.get(s.code)?.get(wy);
    if (c && p && c.kind !== "parent") { sum += c.value * p; w += p; n++; }
  }
  if (!w || w / total < 0.8) return null;
  return { kind: "weighted", value: sum / w, states: n, coverage: w / total, popYear: wy, skipped: [...skip] };
}

function render() {
  const i = ind();
  setDomain(i.map_domain ?? i.domain);

  // Indicator chips
  $("indicators").innerHTML = data.indicators
    .map((x) => `<button class="chip" role="radio" aria-checked="${x.id === state.indicator}" data-id="${x.id}">${esc(tr(x.short_label))}</button>`)
    .join("");
  $("indicators").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      state.indicator = b.dataset.id;
      state.dataset = null;
      pickDataset();
      render();
    })
  );

  // Map source and slider (state-level datasets only)
  const stateDs = data.stateDatasets(state.indicator);
  $("source").innerHTML = stateDs.map((d) => `<option value="${d}">${esc(dsLabel(d))}</option>`).join("");
  $("source").value = state.dataset ?? "";
  $("source-field").hidden = stateDs.length < 2;
  const periods = state.dataset ? data.periods(state.indicator, state.dataset, { statesOnly: true }) : [];
  const slots = estMode()
    ? yearSlots().map((y) => ({ period: String(y), year: y, real: periods.some((p) => p.year === y) }))
    : periods.map((p) => ({ ...p, real: true }));
  if (estMode() && !slots.some((x) => x.year === state.year)) state.year = slots.at(-1)?.year ?? null;
  const idx = Math.max(0, estMode() ? slots.findIndex((x) => x.year === state.year) : slots.findIndex((p) => p.period === state.period));
  const slider = $("round");
  slider.max = Math.max(0, slots.length - 1);
  slider.value = idx;
  slider.disabled = slots.length < 2;
  slider.setAttribute("aria-valuetext", slots[idx] ? `${slots[idx].period}${slots[idx].real ? "" : ` (${t("estimateShort")})`}` : t("noData"));
  document.querySelector('label[for="round"]').textContent = estMode() ? t("estYear") : t("round");
  // Long series: label first, current and last only. Years without real data get a *.
  $("round-ticks").innerHTML = slots
    .map((p, k) => (slots.length <= 6 || k === 0 || k === idx || k === slots.length - 1)
      ? `<span class="${k === idx ? "active" : ""}">${esc(p.period)}${p.real ? "" : "*"}</span>` : "")
    .join("");
  $("slider-field").hidden = slots.length === 0;

  $("status").className = "status";
  $("status").textContent = "";
  if (!stateDs.length) {
    $("status").className = "status warn";
    $("status").textContent = t("nationalOnly");
  }
  $("origin").textContent = data.origin === "supabase" ? "Supabase (live)" : t("snapshot");

  const cells = new Map(["IN", ...data.states.map((s) => s.code)].map((c) => [c, cell(c)]));
  if (!cells.get("IN")) {
    const y = estMode() ? state.year : periods.find((p) => p.period === state.period)?.year;
    cells.set("IN", weightedIndia(cells, y));
  }
  lastCells = cells;
  const valueOf = (code) => cells.get(code)?.value ?? null;
  const isEstimate = (code) => !!cells.get(code) && !["obs", "parent"].includes(cells.get(code).kind);
  const parentOf = (code) => (cells.get(code)?.kind === "parent" ? cells.get(code).parent : null);
  const anyStar = [...cells.values()].some((c) => c && !["obs", "parent"].includes(c.kind));
  $("star-note").hidden = !anyStar;
  const when = estMode() ? String(state.year) : state.period ?? "";
  map?.update({ valueOf, regionName, selected: state.region, label: `${tr(i.label)}, ${when}`, format: (v) => fmtVal(v), isEstimate,
    note: (code) => (parentOf(code) ? t("partOf")(regionName(parentOf(code))) : "") });
  renderLegend($("legend"), i.unit, { estimates: estMode() });

  // Rankings
  const ranked = data.states
    .map((s) => ({ code: s.code, name: regionName(s.code), value: valueOf(s.code), est: isEstimate(s.code) }))
    .filter((r) => r.value != null && !parentOf(r.code))
    .sort((a, b) => (i.higher_is_better ? b.value - a.value : a.value - b.value));
  rankBars($("top"), ranked.slice(0, 5), { onSelect: selectRegion, selected: state.region, domain: i.domain, decimals: i.decimals });
  rankBars($("bottom"), ranked.slice(-5).reverse(), { onSelect: selectRegion, selected: state.region, domain: i.domain, decimals: i.decimals });
  $("ranks").hidden = ranked.length === 0;

  renderTrend();

  // Text summary
  const nat = valueOf("IN");
  $("summary").textContent = ranked.length
    ? t("summary")(tr(i.short_label), `${when} (${dsLabel(state.dataset)})`, nat != null ? fmtVal(nat) + (isEstimate("IN") ? "*" : "") : "",
        `${ranked[0].name} ${fmtVal(ranked[0].value)}${ranked[0].est ? "*" : ""}`, `${ranked.at(-1).name} ${fmtVal(ranked.at(-1).value)}${ranked.at(-1).est ? "*" : ""}`)
      + (anyStar ? ` ${t("starShort")}` : "")
    : "";

  $("ind-def").textContent = tr(i.definition);
  $("table-toggle").textContent = $("table").hidden ? t("showTable") : t("hideTable");
  if (state.dataset) {
    dataTable($("table"), {
      codes: ["IN", ...data.states.map((s) => s.code)],
      periods,
      valueAt: (period, code) => data.get(state.indicator, state.dataset, period, code),
      regionName,
      decimals: i.decimals,
    });
  } else $("table").innerHTML = "";

  renderCard();
  renderCompareOptions();
  renderCompare();
  writeHash();
}

function renderTrend() {
  const i = ind();
  // Datasets marked chart:false repeat another source's All-India line (e.g. the RBI copy of Census literacy).
  const dsList = data.nationalDatasets(state.indicator).filter((ds) => data.datasetById.get(ds)?.chart !== false);
  // The map's dataset first, then the rest; each source keeps its own line.
  dsList.sort((a, b) => (a === state.dataset ? -1 : b === state.dataset ? 1 : 0));
  const lines = dsList.slice(0, LINE_STYLES.length).map((ds, k) => ({ label: dsLabel(ds), points: data.series(state.indicator, ds, "IN"), style: LINE_STYLES[k] }));
  const years = lines.flatMap((l) => l.points.map((p) => p.year));
  const minYear = Math.max(Math.min(...years), RANGES[state.range]);
  const maxYear = Math.max(...years);
  document.querySelectorAll("#ranges button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === state.range)));
  if (!years.length) { $("trend").innerHTML = `<p class="muted small">${t("noData")}</p>`; return; }
  const activeYear = estMode() ? state.year : state.dataset ? data.get(state.indicator, state.dataset, state.period, "IN")?.year : null;
  yearChart($("trend"), {
    lines,
    xDomain: [minYear, Math.max(maxYear, minYear + 1)],
    yDomain: i.domain,
    decimals: i.decimals,
    activeYear,
    unit: i.unit,
    estimates: state.estimates,
    bounds: boundsOf(i),
    scale: scaleOf(i),
  });
  $("trend-note").textContent = lines.length > 1 ? t("sourcesNote") : "";
}

function sourceLine(o) {
  const s = data.sourceById.get(o.sourceId);
  const where = [o.sourceTable, o.sourcePage ? `${t("page")} ${o.sourcePage}` : ""].filter(Boolean).join(", ");
  return `${t("source")}: <a href="${esc(s?.url ?? "#")}" target="_blank" rel="noopener">${esc(s?.publisher ?? o.sourceId)}</a>${s ? `, <cite>${esc(s.title)}</cite>` : ""}${where ? ` (${esc(where)})` : ""}
    · ${o.archiveUrl ? `<a href="${esc(o.archiveUrl)}" target="_blank" rel="noopener">${t("archived")}</a>` : t("notArchived")}
    ${o.note ? `<br><span>${esc(o.note)}</span>` : ""}`;
}

function renderCard() {
  const el = $("card");
  const i = ind();
  const code = state.region || "IN";
  // National-only indicators: show India's latest value from the first national source.
  const natDs = data.nationalDatasets(state.indicator)[0];
  const c = lastCells?.get(code) ?? cell(code);
  const parentNote = c?.kind === "parent" ? `<p><span class="calc-tag">${t("partOf")(regionName(c.parent))}</span></p>` : "";
  if (c && c.kind === "weighted") return renderWeightedCard(el, i, c);
  if (c && !["obs", "parent"].includes(c.kind)) return renderEstimateCard(el, i, code, c);
  const o = state.dataset
    ? (c && ["obs", "parent"].includes(c.kind) ? c.o : null)
    : code === "IN" && natDs ? data.series(state.indicator, natDs, "IN").at(-1) ?? null : null;
  if (!o) {
    el.innerHTML = `<p class="region">${esc(regionName(code))}</p><p class="ind">${esc(tr(i.label))}</p>
      <p class="muted">${t("noData")}</p>${state.region ? "" : `<p class="muted small">${t("tapState")}</p>`}`;
    return;
  }
  const series = data.series(state.indicator, o.dataset, code);
  const k = series.findIndex((p) => p.period === o.period);
  const prev = k > 0 ? series[k - 1] : null;
  const d = prev && !o.breakBefore ? o.value - prev.value : null;
  const good = d == null ? null : (d >= 0) === i.higher_is_better;
  el.innerHTML = `
    <p class="region">${esc(regionName(code))}</p>
    <p class="ind">${esc(tr(i.label))}</p>
    <p class="big">${fmt(o.value, i.decimals)}<small>${esc(unitText(i))}</small></p>
    <p class="when">${esc(o.period)} · ${esc(dsLabel(o.dataset))}</p>
    ${o.derived ? `<p><span class="calc-tag">${t("calcTag")}</span></p>` : ""}
    ${parentNote}
    ${d == null ? (prev ? `<p class="muted small">${t("notComparable")}</p>` : "")
      : `<p class="delta ${good ? "up" : "down"}">${d >= 0 ? "▲ +" : "▼ "}${fmt(d, i.decimals)}${esc(deltaUnit(i))} · ${t("change")} ${esc(prev.period)} (${fmtVal(prev.value)})</p>`}
    <p class="src">${sourceLine(o)}</p>
    ${state.region ? "" : `<p class="muted small">${t("tapState")}</p>`}
    <div class="share" role="group" aria-label="${t("share")}">
      <button class="pill" data-act="sq">${t("shareSquare")}</button>
      <button class="pill" data-act="wide">${t("shareWide")}</button>
      <button class="pill" data-act="x">${t("copyX")}</button>
      <button class="pill" data-act="long">${t("copyLong")}</button>
      <button class="pill" data-act="link">${t("copyLink")}</button>
    </div>`;

  const src = data.sourceById.get(o.sourceId);
  const card = {
    regionName: regionName(code),
    indicatorLabel: tr(i.short_label),
    value: o.value,
    valueText: fmtVal(o.value),
    unit: unitText(i),
    deltaUnit: deltaUnit(i),
    decimals: i.decimals,
    round: o.period,
    years: dsLabel(o.dataset),
    prev: d == null ? null : { round: prev.period, value: prev.value },
    higherIsBetter: i.higher_is_better,
    sourceName: (src?.publisher ?? o.sourceId) + (o.derived ? ` (${t("calcTag")})` : ""),
    sourceUrl: src?.url ?? "",
    domain: i.domain,
    series: series.slice(-8).map((s) => ({ round: s.period, value: s.value })),
  };
  wireShare(el, card, code, o.period);
}

// Card for a year without data: shows the estimate, how it was made and the real
// points behind it. No share buttons: estimates are not shared as facts.
function renderWeightedCard(el, i, c) {
  const when = estMode() ? String(state.year) : state.period;
  el.innerHTML = `
    <p class="region">${esc(regionName("IN"))}</p>
    <p class="ind">${esc(tr(i.label))}</p>
    <p class="big est-big">${fmt(c.value, i.decimals)}<sup class="star">*</sup><small>${esc(unitText(i))}</small></p>
    <p class="when"><span class="est-tag">${t("weightedTitle")}</span> ${esc(when)}</p>
    <p class="small">${esc(t("weightedHow")(c.states, Math.round(c.coverage * 100), c.popYear, dsLabel(state.dataset)))}</p>
    ${c.skipped.length ? `<p class="muted small">${esc(t("weightedSkip")(c.skipped.map(regionName).join(", ")))}</p>` : ""}
    <p class="muted small">${t("source")}: <a href="https://rbidocs.rbi.org.in/rdocs/Publications/DOCs/1T_09122024203D0FF3A7FC42068D952BA8D5603050.XLSX" target="_blank" rel="noopener">RBI, Handbook of Statistics on Indian States 2023-24, Table 1 (Census populations)</a></p>
    <p class="muted small">${t("starNote")}</p>`;
}

function renderEstimateCard(el, i, code, c) {
  const src = dsLabel(c.via ?? state.dataset);
  const how = c.kind === "other"
    ? t("estOther")(src, c.o.period, dsLabel(state.dataset))
    : (c.kind === "interp"
      ? t("estInterp")(`${c.from.period} (${fmtVal(c.from.value)})`, `${c.to.period} (${fmtVal(c.to.value)})`, src)
      : t("estProj")(c.basis.join(", "), fmtVal(c.lo), fmtVal(c.hi), src))
    + (c.via && c.kind !== "other" ? " " + t("estVia")(dsLabel(state.dataset)) : "");
  const basis = c.kind === "other" ? [c.o] : c.kind === "interp" ? [c.from, c.to] : [c.last];
  el.innerHTML = `
    <p class="region">${esc(regionName(code))}</p>
    <p class="ind">${esc(tr(i.label))}</p>
    <p class="big est-big">${fmt(c.value, i.decimals)}<sup class="star">*</sup><small>${esc(unitText(i))}</small></p>
    <p class="when"><span class="est-tag">* ${t("estimateTitle")}</span> ${estMode() ? state.year : esc(state.period)}</p>
    <p class="small">${esc(how)}</p>
    ${basis.map((o) => `<p class="src">${sourceLine(o)}</p>`).join("")}
    <p class="muted small">${t("estShareNote")}</p>
    <div class="share" role="group" aria-label="${t("share")}">
      <button class="pill" data-act="sq">${t("shareSquare")}</button>
      <button class="pill" data-act="wide">${t("shareWide")}</button>
      <button class="pill" data-act="x">${t("copyX")}</button>
      <button class="pill" data-act="long">${t("copyLong")}</button>
      <button class="pill" data-act="link">${t("copyLink")}</button>
    </div>`;

  // Observed points, then the estimate as an outlined bar.
  const shownYear = estMode() ? state.year : (c.o?.year ?? c.to?.year ?? basis.at(-1).year + 1);
  const real = data.series(state.indicator, c.via ?? state.dataset, code).filter((p) => p.year < shownYear).slice(-6);
  const srcs = [...new Set(basis.map((o) => data.sourceById.get(o.sourceId)?.publisher ?? o.sourceId))];
  const card = {
    regionName: regionName(code),
    indicatorLabel: tr(i.short_label),
    value: c.value,
    valueText: fmtVal(c.value),
    unit: unitText(i),
    deltaUnit: deltaUnit(i),
    decimals: i.decimals,
    round: estMode() ? String(state.year) : state.period,
    years: src,
    prev: null,
    higherIsBetter: i.higher_is_better,
    sourceName: `${srcs.join("; ")} (${src})`,
    sourceUrl: data.sourceById.get(basis.at(-1).sourceId)?.url ?? "",
    domain: i.domain,
    series: [...real.map((s) => ({ round: s.period, value: s.value })), { round: estMode() ? String(state.year) : state.period, value: c.value, est: true }],
    estimate: { note: how },
  };
  wireShare(el, card, code, String(state.year));
}

function wireShare(el, card, code, label) {
  const link = cardLink({ indicator: state.indicator, dataset: state.dataset, round: state.period, region: state.region, est: estMode(), year: state.year });
  el.querySelectorAll("[data-act]").forEach((b) =>
    b.addEventListener("click", async () => {
      const act = b.dataset.act;
      const name = `tathya-${state.indicator}-${code}-${label}${card.estimate ? "-estimate" : ""}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
      if (act === "sq") download(await shareImage(card, link, [1080, 1080]), `${name}-1080.png`);
      else if (act === "wide") download(await shareImage(card, link, [1200, 675]), `${name}-1200x675.png`);
      else {
        const texts = shareTexts(card, link);
        const ok = await copy(act === "x" ? texts.short : act === "long" ? texts.long : link);
        if (ok) { const old = b.textContent; b.textContent = t("copied"); setTimeout(() => (b.textContent = old), 1200); }
      }
    })
  );
}

function renderCompareOptions() {
  const opts = `<option value="">${t("pickState")}</option>` +
    data.states.map((s) => `<option value="${s.code}">${esc(regionName(s.code))}</option>`).join("");
  for (const [id, val] of [["cmp-a", state.cmpA], ["cmp-b", state.cmpB]]) {
    $(id).innerHTML = opts;
    $(id).value = val;
  }
  $("compare-panel").hidden = !state.dataset;
}

function renderCompare() {
  const i = ind();
  const el = $("compare");
  const lines = [state.cmpA, state.cmpB]
    .filter(Boolean)
    .map((code, k) => ({ label: regionName(code), points: data.series(state.indicator, state.dataset, code), style: LINE_STYLES[k] }));
  if (!lines.length || !state.dataset) { el.innerHTML = ""; return; }
  const years = lines.flatMap((l) => l.points.map((p) => p.year));
  if (!years.length) { el.innerHTML = `<p class="muted small">${t("noData")}</p>`; return; }
  yearChart(el, { lines, xDomain: [Math.min(...years), Math.max(Math.max(...years), Math.min(...years) + 1)], yDomain: i.domain, decimals: i.decimals, unit: i.unit, estimates: state.estimates, bounds: boundsOf(i), scale: scaleOf(i) });
}

function downloadCsv() {
  const i = ind();
  const rows = [["region", "indicator", "source_dataset", "period", "year", "value", "unit", "source", "source_url", "table", "page", "note"]];
  for (const ds of new Set([...data.nationalDatasets(state.indicator), ...data.stateDatasets(state.indicator)])) {
    for (const code of ["IN", ...data.states.map((s) => s.code)]) {
      for (const o of data.series(state.indicator, ds, code)) {
        const s = data.sourceById.get(o.sourceId);
        rows.push([regionName(code), i.id, ds, o.period, o.year, o.value, i.unit, s?.publisher ?? o.sourceId, s?.url ?? "", o.sourceTable, o.sourcePage, o.note]);
      }
    }
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  download(new Blob(["﻿" + csv], { type: "text/csv" }), `tathya-${i.id}.csv`);
}

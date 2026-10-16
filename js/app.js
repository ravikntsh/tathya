import { loadData } from "./data.js";
import { loadMap, createMap, renderLegend, setDomain } from "./map.js";
import { yearChart, rankBars, dataTable, esc, LINE_STYLES } from "./chart.js";
import { t, tr, fmt, setLang, getLang } from "./i18n.js";
import { cardLink, shareTexts, shareImage, download, copy } from "./share.js";
import { MAP_VERIFIED } from "./config.js";

const $ = (id) => document.getElementById(id);
const RANGES = { all: 1850, 1947: 1947, 1990: 1990 };
const state = { indicator: null, dataset: null, period: null, region: null, range: "all", cmpA: "", cmpB: "" };
let data, map;

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
}

function writeHash() {
  const p = new URLSearchParams({ ind: state.indicator });
  if (state.dataset) p.set("src", state.dataset);
  if (state.period) p.set("round", state.period);
  if (state.region) p.set("state", state.region);
  if (state.range !== "all") p.set("from", state.range);
  history.replaceState(null, "", `#${p}`);
}

function applyStaticText() {
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $("lang").textContent = getLang() === "en" ? "हिं" : "EN";
  const issues = t("issueList");
  $("issues").innerHTML =
    `<li><a href="#" class="active" aria-current="page">${t("development")}</a></li>` +
    issues.map((i) => `<li><span aria-disabled="true">${esc(i)}<small>${t("soon")}</small></span></li>`).join("");
}

function bindControls() {
  $("round").addEventListener("input", (e) => {
    const ps = data.periods(state.indicator, state.dataset, { statesOnly: true });
    state.period = ps[Number(e.target.value)]?.period ?? null;
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
const fmtVal = (v, i = ind()) => `${fmt(v, i.decimals ?? 1)}${unitText(i)}`;
// Changes in a percentage are percentage points, not per cent.
const deltaUnit = (i) => (i.unit === "%" ? ` ${t("pts")}` : unitText(i));

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
  const idx = Math.max(0, periods.findIndex((p) => p.period === state.period));
  const slider = $("round");
  slider.max = Math.max(0, periods.length - 1);
  slider.value = idx;
  slider.disabled = periods.length < 2;
  slider.setAttribute("aria-valuetext", periods[idx]?.period ?? t("noData"));
  // Long series: label first, current and last only.
  $("round-ticks").innerHTML = periods
    .map((p, k) => (periods.length <= 6 || k === 0 || k === idx || k === periods.length - 1)
      ? `<span class="${k === idx ? "active" : ""}">${esc(p.period)}</span>` : "")
    .join("");
  $("slider-field").hidden = periods.length === 0;

  $("status").className = "status";
  $("status").textContent = "";
  if (!stateDs.length) {
    $("status").className = "status warn";
    $("status").textContent = t("nationalOnly");
  }
  $("origin").textContent = data.origin === "supabase" ? "Supabase" : "data/observations.csv";

  const valueOf = (code) => (state.dataset ? data.get(state.indicator, state.dataset, state.period, code)?.value ?? null : null);
  map?.update({ valueOf, regionName, selected: state.region, label: `${tr(i.label)}, ${state.period ?? ""}`, format: (v) => fmtVal(v) });
  renderLegend($("legend"), i.unit);

  // Rankings
  const ranked = data.states
    .map((s) => ({ code: s.code, name: regionName(s.code), value: valueOf(s.code) }))
    .filter((r) => r.value != null)
    .sort((a, b) => (i.higher_is_better ? b.value - a.value : a.value - b.value));
  rankBars($("top"), ranked.slice(0, 5), { onSelect: selectRegion, selected: state.region, domain: i.domain, decimals: i.decimals });
  rankBars($("bottom"), ranked.slice(-5).reverse(), { onSelect: selectRegion, selected: state.region, domain: i.domain, decimals: i.decimals });
  $("ranks").hidden = ranked.length === 0;

  renderTrend();

  // Text summary
  const nat = valueOf("IN");
  $("summary").textContent = ranked.length
    ? t("summary")(tr(i.short_label), `${state.period} (${dsLabel(state.dataset)})`, nat != null ? fmtVal(nat) : t("noData"),
        `${ranked[0].name} ${fmtVal(ranked[0].value)}`, `${ranked.at(-1).name} ${fmtVal(ranked.at(-1).value)}`)
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
  const activeYear = state.dataset ? data.get(state.indicator, state.dataset, state.period, "IN")?.year : null;
  yearChart($("trend"), {
    lines,
    xDomain: [minYear, Math.max(maxYear, minYear + 1)],
    yDomain: i.domain,
    decimals: i.decimals,
    activeYear,
    unit: i.unit,
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
  const o = state.dataset
    ? data.get(state.indicator, state.dataset, state.period, code)
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
    sourceName: src?.publisher ?? o.sourceId,
    sourceUrl: src?.url ?? "",
    domain: i.domain,
    series: series.slice(-8).map((s) => ({ round: s.period, value: s.value })),
  };
  const link = cardLink({ indicator: state.indicator, dataset: state.dataset, round: state.period, region: state.region });
  el.querySelectorAll("[data-act]").forEach((b) =>
    b.addEventListener("click", async () => {
      const act = b.dataset.act;
      const name = `tathya-${state.indicator}-${code}-${o.period}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
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
  yearChart(el, { lines, xDomain: [Math.min(...years), Math.max(Math.max(...years), Math.min(...years) + 1)], yDomain: i.domain, decimals: i.decimals, unit: i.unit });
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

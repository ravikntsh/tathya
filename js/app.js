import { loadData } from "./data.js";
import { loadMap, createMap, renderLegend } from "./map.js";
import { lineChart, rankBars, dataTable, esc } from "./chart.js";
import { t, tr, fmt, setLang, getLang } from "./i18n.js";
import { cardLink, shareTexts, shareImage, download, copy } from "./share.js";
import { MAP_VERIFIED } from "./config.js";

const $ = (id) => document.getElementById(id);
const state = { indicator: null, round: null, region: null, cmpA: "", cmpB: "" };
let data, map, features = [];

init();

async function init() {
  readPrefs();
  applyStaticText();
  $("status").textContent = t("loading");
  try {
    const [d, f] = await Promise.all([loadData(), loadMap("geo/india-states.topo.json").catch((e) => (console.warn(e), []))]);
    data = d;
    features = f;
  } catch (err) {
    $("status").textContent = String(err);
    return;
  }
  readHash();
  if (!data.indicatorById.has(state.indicator)) state.indicator = data.indicators[0]?.id;
  const rounds = data.rounds(state.indicator);
  if (!rounds.some((r) => r.round === state.round)) state.round = rounds.at(-1)?.round ?? null;

  if (features.length) map = createMap($("map"), features, { onSelect: selectRegion });
  else $("map").innerHTML = `<p class="status warn">Map file not built yet (geo/india-states.topo.json).</p>`;
  $("map-banner").hidden = MAP_VERIFIED;

  bindControls();
  render();
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
  state.round = p.get("round") || state.round;
  state.region = p.get("state") || null;
}

function writeHash() {
  const p = new URLSearchParams({ ind: state.indicator, round: state.round ?? "" });
  if (state.region) p.set("state", state.region);
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
    const rounds = data.rounds(state.indicator);
    state.round = rounds[Number(e.target.value)]?.round ?? null;
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
  $("cmp-a").addEventListener("change", (e) => { state.cmpA = e.target.value; renderCompare(); });
  $("cmp-b").addEventListener("change", (e) => { state.cmpB = e.target.value; renderCompare(); });
}

function selectRegion(code) {
  state.region = state.region === code ? null : code;
  if (state.region && !state.cmpA) state.cmpA = state.region;
  render();
}

const regionName = (code) => tr(data.regionByCode.get(code)?.name) || code;

function render() {
  const ind = data.indicatorById.get(state.indicator);
  const rounds = data.rounds(state.indicator);
  const idx = Math.max(0, rounds.findIndex((r) => r.round === state.round));

  // Indicator chips
  $("indicators").innerHTML = data.indicators
    .map((i) => `<button class="chip" role="radio" aria-checked="${i.id === state.indicator}" data-id="${i.id}">${esc(tr(i.short_label))}</button>`)
    .join("");
  $("indicators").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      state.indicator = b.dataset.id;
      const rs = data.rounds(state.indicator);
      if (!rs.some((r) => r.round === state.round)) state.round = rs.at(-1)?.round ?? null;
      render();
    })
  );

  // Slider
  const slider = $("round");
  slider.max = Math.max(0, rounds.length - 1);
  slider.value = idx;
  slider.disabled = rounds.length < 2;
  slider.setAttribute("aria-valuetext", rounds[idx] ? `${rounds[idx].round} (${rounds[idx].years})` : t("noData"));
  $("round-ticks").innerHTML = rounds
    .map((r, i) => `<span class="${i === idx ? "active" : ""}">${esc(r.round)} <small>${esc(r.years)}</small></span>`)
    .join("");

  $("status").className = "status";
  $("status").textContent = "";
  if (data.count === 0) {
    $("status").className = "status warn";
    $("status").textContent = t("emptyData");
  }
  $("origin").textContent = data.origin === "supabase" ? "Supabase" : "data/nfhs_state.csv";

  const valueOf = (code) => data.get(state.indicator, state.round, code)?.value ?? null;
  map?.update({ valueOf, regionName, selected: state.region, label: `${tr(ind?.label)}, ${state.round ?? ""}` });
  renderLegend($("legend"));

  // Rankings
  const ranked = data.states
    .map((s) => ({ code: s.code, name: regionName(s.code), value: valueOf(s.code) }))
    .filter((r) => r.value != null)
    .sort((a, b) => b.value - a.value);
  rankBars($("top"), ranked.slice(0, 5), { onSelect: selectRegion, selected: state.region });
  rankBars($("bottom"), ranked.slice(-5).reverse(), { onSelect: selectRegion, selected: state.region });

  // National trend
  lineChart($("trend"), {
    rounds,
    activeRound: state.round,
    broken: Boolean(ind?.break_note),
    lines: [{ label: t("national"), points: data.series(state.indicator, "IN"), cls: "nat" }],
  });

  // Text summary
  const nat = valueOf("IN");
  $("summary").textContent = ranked.length
    ? t("summary")(
        tr(ind?.short_label),
        `${state.round} (${rounds[idx]?.years})`,
        nat != null ? `${fmt(nat)}%` : t("noData"),
        `${ranked[0].name} ${fmt(ranked[0].value)}%`,
        `${ranked.at(-1).name} ${fmt(ranked.at(-1).value)}%`
      )
    : "";

  $("ind-def").textContent = tr(ind?.definition);
  $("table-toggle").textContent = $("table").hidden ? t("showTable") : t("hideTable");
  dataTable($("table"), { states: data.states, data, indicatorId: state.indicator, rounds, regionName });

  renderCard(ind, rounds);
  renderCompareOptions();
  renderCompare();
  writeHash();
}

function renderCard(ind, rounds) {
  const el = $("card");
  const code = state.region || "IN";
  const o = data.get(state.indicator, state.round, code);
  if (!o) {
    el.innerHTML = `<p class="region">${esc(regionName(code))}</p><p class="ind">${esc(tr(ind?.label))}</p>
      <p class="muted">${t("noData")}</p>${state.region ? "" : `<p class="muted small">${t("tapState")}</p>`}`;
    return;
  }
  const idx = rounds.findIndex((r) => r.round === state.round);
  const prev = idx > 0 ? data.get(state.indicator, rounds[idx - 1].round, code) : null;
  const d = prev ? o.value - prev.value : null;
  const series = data.series(state.indicator, code);
  el.innerHTML = `
    <p class="region">${esc(regionName(code))}</p>
    <p class="ind">${esc(tr(ind.label))}</p>
    <p class="big">${fmt(o.value)}%</p>
    <p class="when">${esc(o.round)} (${esc(o.years)})</p>
    ${d == null ? "" : `<p class="delta ${d >= 0 ? "up" : "down"}">${d >= 0 ? "▲ +" : "▼ "}${fmt(d)} ${t("pts")} · ${t("change")} ${esc(prev.round)} (${fmt(prev.value)}%)</p>`}
    <p class="src">${t("source")}: <a href="${esc(o.sourceUrl)}" target="_blank" rel="noopener">${esc(o.publisher)}, NFHS-5 fact sheet</a>${o.sourcePage ? `, ${t("page")} ${esc(o.sourcePage)}` : ""}
      · ${o.archiveUrl ? `<a href="${esc(o.archiveUrl)}" target="_blank" rel="noopener">${t("archived")}</a>` : t("notArchived")}
      ${o.note ? `<br><span>${esc(o.note)}</span>` : ""}</p>
    ${state.region ? "" : `<p class="muted small">${t("tapState")}</p>`}
    <div class="share" role="group" aria-label="${t("share")}">
      <button class="pill" data-act="sq">${t("shareSquare")}</button>
      <button class="pill" data-act="wide">${t("shareWide")}</button>
      <button class="pill" data-act="x">${t("copyX")}</button>
      <button class="pill" data-act="long">${t("copyLong")}</button>
      <button class="pill" data-act="link">${t("copyLink")}</button>
    </div>`;

  const card = {
    regionName: regionName(code),
    indicatorLabel: tr(ind.short_label),
    value: o.value,
    round: o.round,
    years: o.years,
    prev,
    sourceName: `NFHS (IIPS / MoHFW)`,
    sourceUrl: o.sourceUrl,
    series: series.map((s) => ({ round: s.round, value: s.value })),
  };
  const link = cardLink({ indicator: state.indicator, round: state.round, region: state.region });
  el.querySelectorAll("[data-act]").forEach((b) =>
    b.addEventListener("click", async () => {
      const act = b.dataset.act;
      const name = `tathya-${state.indicator}-${code}-${o.round}`.toLowerCase();
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
}

function renderCompare() {
  const rounds = data.rounds(state.indicator);
  const lines = [];
  if (state.cmpA) lines.push({ label: regionName(state.cmpA), points: data.series(state.indicator, state.cmpA), cls: "a" });
  if (state.cmpB) lines.push({ label: regionName(state.cmpB), points: data.series(state.indicator, state.cmpB), cls: "b" });
  if (!lines.length) { $("compare").innerHTML = ""; return; }
  const ind = data.indicatorById.get(state.indicator);
  const el = $("compare");
  el.innerHTML = `<div class="legend-inline">${lines.map((l) => `<span class="${l.cls}">${esc(l.label)}</span>`).join("")}</div><div></div>`;
  lineChart(el.lastElementChild, { rounds, lines, activeRound: state.round, broken: Boolean(ind?.break_note) });
}

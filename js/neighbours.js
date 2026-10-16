import { csvParse } from "https://cdn.jsdelivr.net/npm/d3-dsv@3.0.1/+esm";
import { t, fmt, setLang, getLang } from "./i18n.js";
import { yearChart, LINE_STYLES } from "./chart.js";
import { renderRail, NEIGHBOURS } from "./rail.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const TYPES = ["treaty", "agreement", "border", "war", "clash", "ceasefire", "crisis", "terror", "cooperation", "recognition"];
const state = { country: "cn", type: "all" };
let events = [], trade = [], sources = new Map();

init();

async function init() {
  try {
    const l = localStorage.getItem("lang"); if (l) setLang(l);
    const th = localStorage.getItem("theme"); if (th) document.documentElement.dataset.theme = th;
  } catch {}
  const p = new URLSearchParams(location.hash.slice(1));
  if (NEIGHBOURS.includes(p.get("c"))) state.country = p.get("c");
  staticText();
  $("status").textContent = t("loading");
  const [ev, tr_, src] = await Promise.all([
    fetch("data/neighbours_events.json").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    fetch("data/neighbour_trade.csv").then((r) => (r.ok ? r.text() : "")).catch(() => ""),
    fetch("data/sources_trade.json").then((r) => (r.ok ? r.json() : [])).catch(() => []),
  ]);
  events = ev;
  trade = tr_ ? csvParse(tr_) : [];
  sources = new Map(src.map((s) => [s.id, s]));
  $("status").textContent = "";
  bind();
  render();
  window.addEventListener("hashchange", () => {
    const c = new URLSearchParams(location.hash.slice(1)).get("c");
    if (NEIGHBOURS.includes(c) && c !== state.country) { state.country = c; state.type = "all"; render(); }
  });
}

function staticText() {
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $("lang").textContent = getLang() === "en" ? "हिं" : "EN";
}

function bind() {
  $("lang").addEventListener("click", () => {
    setLang(getLang() === "en" ? "hi" : "en");
    try { localStorage.setItem("lang", getLang()); } catch {}
    staticText();
    render();
  });
  $("theme").addEventListener("click", () => {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = document.documentElement.dataset.theme || (dark ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
  });
}

const countryName = (c) => t("nbCountries")[NEIGHBOURS.indexOf(c)] ?? c;

function render() {
  renderRail($("issues"), { active: state.country });
  history.replaceState(null, "", `#c=${state.country}`);

  $("countries").innerHTML = NEIGHBOURS.map((c) =>
    `<button class="chip" role="tab" aria-selected="${c === state.country}" aria-checked="${c === state.country}" data-c="${c}">${esc(countryName(c))}</button>`).join("");
  $("countries").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    state.country = b.dataset.c; state.type = "all"; render();
  }));

  const mine = events.filter((e) => e.country?.toLowerCase() === state.country).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const present = TYPES.filter((ty) => mine.some((e) => e.type === ty));
  $("types").innerHTML = ["all", ...present].map((ty) =>
    `<button class="chip" aria-pressed="${ty === state.type}" data-t="${ty}">${esc(ty === "all" ? t("nbAll") : t("nbTypes")[ty] ?? ty)}</button>`).join("");
  $("types").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { state.type = b.dataset.t; render(); }));

  const shown = mine.filter((e) => state.type === "all" || e.type === state.type);
  $("timeline").innerHTML = shown.length
    ? shown.map(eventItem).join("")
    : `<li class="muted">${t(events.length ? "nbNoEvents" : "nbComing")}</li>`;

  renderTrade();
}

function fmtDate(d, end) {
  const one = (x) => {
    const [y, m, dd] = String(x).split("-");
    if (!m) return y;
    const month = new Date(Date.UTC(+y, +m - 1, 1)).toLocaleString(getLang() === "hi" ? "hi-IN" : "en-IN", { month: "short", timeZone: "UTC" });
    return dd ? `${+dd} ${month} ${y}` : `${month} ${y}`;
  };
  return end ? `${one(d)} – ${one(end)}` : one(d);
}

function eventItem(e) {
  const srcs = (e.sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.publisher)}${s.title ? `: ${esc(s.title)}` : ""}</a>`).join(" · ");
  return `<li class="tl-item" id="${esc(e.id)}">
    <div class="tl-date">${esc(fmtDate(e.date, e.end_date))}</div>
    <div class="tl-body">
      <span class="tl-type">${esc(t("nbTypes")[e.type] ?? e.type)}</span>
      <h3>${esc(e.title)}</h3>
      <p>${esc(e.summary)}</p>
      <p class="src">${t("source")}: ${srcs || `<span class="muted">${t("noData")}</span>`}</p>
    </div>
  </li>`;
}

function renderTrade() {
  const rows = trade.filter((r) => r.partner?.toLowerCase() === state.country).map((r) => ({
    year: +r.year, exp: r.exports_usd === "" ? null : +r.exports_usd, imp: r.imports_usd === "" ? null : +r.imports_usd, src: r.source_id,
  })).sort((a, b) => a.year - b.year);
  if (!rows.length) {
    $("trade-stats").innerHTML = "";
    $("trade-chart").innerHTML = `<p class="muted small">${t(trade.length ? "noData" : "nbComing")}</p>`;
    $("trade-note").textContent = "";
    return;
  }
  const bn = (v) => v / 1e9;
  const pts = (key) => rows.filter((r) => r[key] != null).map((r) => ({ year: r.year, period: String(r.year), value: bn(r[key]) }));
  const exp = pts("exp"), imp = pts("imp");
  const last = rows.filter((r) => r.exp != null && r.imp != null).at(-1);
  if (last) {
    const bal = bn(last.exp - last.imp);
    $("trade-stats").innerHTML = `
      <div><span class="muted small">${t("nbExports")} ${last.year}</span><b>$${fmt(bn(last.exp), 2)} bn</b></div>
      <div><span class="muted small">${t("nbImports")} ${last.year}</span><b>$${fmt(bn(last.imp), 2)} bn</b></div>
      <div><span class="muted small">${t("nbBalance")}</span><b class="${bal >= 0 ? "pos" : "neg"}">${bal >= 0 ? "+" : "−"}$${fmt(Math.abs(bal), 2)} bn</b></div>`;
  }
  const all = [...exp, ...imp].map((p) => p.value);
  const years = rows.map((r) => r.year);
  yearChart($("trade-chart"), {
    lines: [
      { label: t("nbExports"), points: exp, style: LINE_STYLES[0] },
      { label: t("nbImports"), points: imp, style: LINE_STYLES[1] },
    ],
    xDomain: [Math.min(...years), Math.max(Math.max(...years), Math.min(...years) + 1)],
    yDomain: [0, Math.max(...all, 0.01)],
    decimals: 2,
    unit: "US$ bn",
  });
  const s = sources.get(rows.at(-1).src);
  $("trade-note").innerHTML = `${t("nbTradeNote")} ${s ? `${t("source")}: <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.publisher)}</a>` : ""}`;
}


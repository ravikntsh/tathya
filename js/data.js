import { csvParse } from "https://cdn.jsdelivr.net/npm/d3-dsv@3.0.1/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// Loads regions, indicators and observations. Supabase is the source of truth;
// the CSV/JSON files in /data are the seed and the fallback when no key is set
// or the tables are still empty.
export async function loadData() {
  let data = null;
  if (SUPABASE_ANON_KEY) {
    try {
      data = await fromSupabase();
      data.origin = "supabase";
    } catch (err) {
      console.warn("Supabase load failed, using local files", err);
    }
  }
  if (!data || data.observations.length === 0) {
    data = await fromLocal();
    data.origin = "local";
  }
  return index(data);
}

async function rest(table, query = "select=*") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
  return res.json();
}

async function fromSupabase() {
  const [regions, indicators, observations] = await Promise.all([
    rest("regions"),
    rest("indicators", "select=*&order=sort"),
    rest("observations", "select=*&limit=10000"),
  ]);
  return { regions, indicators, observations: observations.map(normaliseObs) };
}

async function fromLocal() {
  const [regions, indicators, csv] = await Promise.all([
    fetch("data/regions.json").then((r) => r.json()),
    fetch("data/indicators.json").then((r) => r.json()),
    fetch("data/nfhs_state.csv").then((r) => (r.ok ? r.text() : "")),
  ]);
  const rows = csv ? csvParse(csv) : [];
  return { regions, indicators, observations: rows.map(normaliseObs) };
}

function normaliseObs(r) {
  const years = r.survey_years;
  return {
    region: r.region_code ?? r.state_code,
    indicator: r.indicator_id,
    round: r.round,
    years,
    periodEnd: Number(r.period_end) || periodEnd(years),
    value: Number(r.value),
    sourceUrl: r.source_url,
    sourcePage: r.source_page || "",
    publisher: r.publisher,
    datePulled: r.date_pulled,
    archiveUrl: r.archive_url || "",
    note: r.note || "",
  };
}

// "2019-21" -> 2021, "2015-16" -> 2016
function periodEnd(years) {
  const [a, b] = String(years).split("-");
  if (!b) return Number(a);
  return Number(a.slice(0, a.length - b.length) + b);
}

function index({ regions, indicators, observations, origin }) {
  const regionByCode = new Map(regions.map((r) => [r.code, r]));
  const indicatorById = new Map(indicators.map((i) => [i.id, i]));
  const obs = observations.filter((o) => Number.isFinite(o.value) && regionByCode.has(o.region));
  // indicator -> round -> region -> observation
  const cube = new Map();
  for (const o of obs) {
    if (!cube.has(o.indicator)) cube.set(o.indicator, new Map());
    const byRound = cube.get(o.indicator);
    if (!byRound.has(o.round)) byRound.set(o.round, new Map());
    byRound.get(o.round).set(o.region, o);
  }
  function rounds(indicatorId) {
    const byRound = cube.get(indicatorId);
    if (!byRound) return [];
    return [...byRound.keys()]
      .map((round) => {
        const any = byRound.get(round).values().next().value;
        return { round, years: any.years, periodEnd: any.periodEnd };
      })
      .sort((a, b) => a.periodEnd - b.periodEnd);
  }
  const get = (indicatorId, round, region) => cube.get(indicatorId)?.get(round)?.get(region) ?? null;
  const series = (indicatorId, region) =>
    rounds(indicatorId).map((r) => get(indicatorId, r.round, region)).filter(Boolean);
  return {
    origin,
    regions,
    states: regions.filter((r) => r.kind !== "country"),
    indicators: [...indicators].sort((a, b) => a.sort - b.sort),
    regionByCode,
    indicatorById,
    rounds,
    get,
    series,
    count: obs.length,
  };
}

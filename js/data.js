import { csvParse } from "https://cdn.jsdelivr.net/npm/d3-dsv@3.0.1/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// Loads regions, indicators, datasets, sources and observations. Supabase is the
// source of truth; the files in /data are the seed and the fallback when
// Supabase is unreachable or still on the old schema.
export async function loadData() {
  let data = null;
  // ?local=1 reads the repo files even when Supabase is configured (to preview a new seed).
  const forceLocal = new URLSearchParams(location.search).has("local");
  if (SUPABASE_ANON_KEY && !forceLocal) {
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
    // Publishable keys (sb_publishable_…) are not JWTs, so only the apikey header is sent.
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
  return res.json();
}

async function fromSupabase() {
  const [regions, indicators, datasets, sources] = await Promise.all([
    rest("regions"),
    rest("indicators", "select=*&order=sort"),
    rest("datasets"),
    rest("sources"),
  ]);
  // PostgREST caps responses at 1,000 rows: read the total, then fetch all pages in parallel.
  const head = await fetch(`${SUPABASE_URL}/rest/v1/observations?select=id&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Prefer: "count=exact" },
  });
  if (!head.ok) throw new Error(`observations: HTTP ${head.status}`);
  const total = Number(head.headers.get("content-range")?.split("/")[1]) || 0;
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(total / 1000) }, (_, k) =>
      rest("observations", `select=*&order=id&offset=${k * 1000}&limit=1000`))
  );
  const observations = pages.flat();
  if (observations.length && !("dataset_id" in observations[0])) throw new Error("old schema");
  return { regions, indicators, datasets, sources, observations: observations.map(normalise) };
}

async function fromLocal() {
  const [regions, indicators, datasets, sources, csv] = await Promise.all([
    fetch("data/regions.json").then((r) => r.json()),
    fetch("data/indicators.json").then((r) => r.json()),
    fetch("data/datasets.json").then((r) => r.json()),
    fetch("data/sources.json").then((r) => r.json()),
    fetch("data/observations.csv").then((r) => (r.ok ? r.text() : "")),
  ]);
  return { regions, indicators, datasets, sources, observations: (csv ? csvParse(csv) : []).map(normalise) };
}

function normalise(r) {
  return {
    region: r.region_code,
    indicator: r.indicator_id,
    dataset: r.dataset_id,
    period: r.period_label,
    year: Number(r.year),
    value: Number(r.value),
    sourceId: r.source_id,
    sourceTable: r.source_table || "",
    sourcePage: r.source_page ? String(r.source_page) : "",
    datePulled: r.date_pulled,
    archiveUrl: r.archive_url || "",
    breakBefore: r.break_before === true || r.break_before === "1" || r.break_before === 1,
    note: r.note || "",
    // Values Tathya calculated from official counts (e.g. Census 2011 state percentages).
    derived: /^Calculated by Tathya/.test(r.note || ""),
  };
}

function index({ regions, indicators, datasets, sources, observations, origin }) {
  const regionByCode = new Map(regions.map((r) => [r.code, r]));
  const obs = observations.filter((o) => Number.isFinite(o.value) && regionByCode.has(o.region));
  // indicator -> dataset -> period -> region -> observation
  const cube = new Map();
  for (const o of obs) {
    const d = (cube.get(o.indicator) ?? cube.set(o.indicator, new Map()).get(o.indicator));
    const p = (d.get(o.dataset) ?? d.set(o.dataset, new Map()).get(o.dataset));
    const r = (p.get(o.period) ?? p.set(o.period, new Map()).get(o.period));
    r.set(o.region, o);
  }

  const datasetIds = (ind) => [...(cube.get(ind)?.keys() ?? [])];
  // Datasets with values for states (map-able) and for India (chart lines).
  // Ordered newest-first (latest year, then most periods) so the map opens on the most recent source.
  const stateDatasets = (ind) =>
    datasetIds(ind)
      .filter((ds) => [...cube.get(ind).get(ds).values()].some((m) => [...m.keys()].some((k) => k !== "IN")))
      .map((ds) => {
        const ps = [...cube.get(ind).get(ds).values()].flatMap((m) => [...m.values()].map((o) => o.year));
        return { ds, last: Math.max(...ps), n: cube.get(ind).get(ds).size };
      })
      .sort((a, b) => b.last - a.last || b.n - a.n)
      .map((x) => x.ds);
  const nationalDatasets = (ind) =>
    datasetIds(ind).filter((ds) => [...cube.get(ind).get(ds).values()].some((m) => m.has("IN")));

  // Periods of a dataset, ordered by plotting year (latest year of any row in that period).
  function periods(ind, ds, { statesOnly = false } = {}) {
    const byPeriod = cube.get(ind)?.get(ds);
    if (!byPeriod) return [];
    return [...byPeriod.entries()]
      .filter(([, m]) => !statesOnly || [...m.keys()].some((k) => k !== "IN"))
      .map(([period, m]) => ({ period, year: Math.max(...[...m.values()].map((o) => o.year)) }))
      .sort((a, b) => a.year - b.year);
  }
  const get = (ind, ds, period, region) => cube.get(ind)?.get(ds)?.get(period)?.get(region) ?? null;
  const series = (ind, ds, region) =>
    [...(cube.get(ind)?.get(ds)?.values() ?? [])]
      .map((m) => m.get(region))
      .filter(Boolean)
      .sort((a, b) => a.year - b.year);

  return {
    origin,
    regions,
    states: regions.filter((r) => r.kind !== "country"),
    indicators: [...indicators].filter((i) => cube.has(i.id)).sort((a, b) => a.sort - b.sort),
    regionByCode,
    indicatorById: new Map(indicators.map((i) => [i.id, i])),
    datasetById: new Map(datasets.map((d) => [d.id, d])),
    sourceById: new Map(sources.map((s) => [s.id, s])),
    stateDatasets,
    nationalDatasets,
    periods,
    get,
    series,
    count: obs.length,
  };
}

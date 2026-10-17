// Estimates for years without data. Shown only when the reader turns them on:
// dashed on charts, faded with dashed edges on the map, marked ≈ in cards and
// rankings, and never available to share images or share text.
//
// - Between two observed points of the same series: straight-line interpolation.
// - After the last observed point: an ordinary least-squares line through the
//   last (up to) 5 points of the latest unbroken segment, with a 90% prediction
//   interval. Needs at least 3 points. The fit is done on a scale that respects
//   the indicator's limits: logit for percentages (flattens near 0% and 100%), log
//   for rates such as infant mortality (falls but stays above 0), linear otherwise.
//   Only series whose latest point is recent are projected (see projectionEnd).

// Two-sided 90% t critical values by degrees of freedom (n - 2).
const T90 = { 1: 6.314, 2: 2.92, 3: 2.353 };

export function lastSegment(points) {
  let start = 0;
  points.forEach((p, k) => { if (p.breakBefore) start = k; });
  return points.slice(start);
}

const SCALES = {
  linear: { f: (v) => v, inv: (v) => v },
  log: { f: (v) => Math.log(Math.max(v, 1e-6)), inv: (v) => Math.exp(v) },
  logit: {
    f: (v) => { const p = Math.min(99.9, Math.max(0.1, v)) / 100; return Math.log(p / (1 - p)); },
    inv: (v) => 100 / (1 + Math.exp(-v)),
  },
};

export function projection(points, { toYear, bounds = [-Infinity, Infinity], scale = "linear" }) {
  const seg = lastSegment(points).slice(-5);
  const n = seg.length;
  if (n < 3) return null;
  const last = seg.at(-1);
  if (toYear <= last.year) return null;
  const sc = SCALES[scale] ?? SCALES.linear;
  const xs = seg.map((p) => p.year), ys = seg.map((p) => sc.f(p.value));
  const xbar = xs.reduce((a, b) => a + b, 0) / n, ybar = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - xbar) ** 2, 0);
  if (sxx === 0) return null;
  const slope = xs.reduce((a, x, k) => a + (x - xbar) * (ys[k] - ybar), 0) / sxx;
  const icpt = ybar - slope * xbar;
  const resid = ys.map((y, k) => y - (icpt + slope * xs[k]));
  const s = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / (n - 2));
  const t = T90[n - 2] ?? 2.353;
  const clamp = (v) => Math.min(bounds[1], Math.max(bounds[0], v));
  const out = [{ year: last.year, value: last.value, lo: last.value, hi: last.value }];
  for (let yr = last.year + 1; yr <= toYear; yr++) {
    const fit = icpt + slope * yr;
    const half = t * s * Math.sqrt(1 + 1 / n + (yr - xbar) ** 2 / sxx);
    out.push({ year: yr, value: clamp(sc.inv(fit)), lo: clamp(sc.inv(fit - half)), hi: clamp(sc.inv(fit + half)) });
  }
  return { points: out, basis: seg.map((p) => p.period), slope };
}

// How far estimates may reach: a series qualifies for a forward trend only if its
// latest point is within MAX_AGE years of today, and the trend runs at most
// MAX_AHEAD years past that point and no later than four years from today.
export const MAX_AGE = 15, MAX_AHEAD = 15;
export const projectionEnd = (lastYear, now = new Date().getFullYear()) =>
  lastYear >= now - MAX_AGE ? Math.min(now + 4, lastYear + MAX_AHEAD) : lastYear;

// Observed value, or an estimate, for one series at one year.
// Returns { kind: "obs", o } | { kind: "interp", value, from, to } | { kind: "proj", value, lo, hi, basis, last } | null
export function estimateAt(points, year, { bounds, scale } = {}) {
  if (!points.length) return null;
  const exact = points.find((p) => p.year === year);
  if (exact) return { kind: "obs", value: exact.value, o: exact };
  const ip = interpolate(points, year);
  if (ip) return { kind: "interp", value: ip.value, from: ip.from, to: ip.to };
  const last = points.at(-1);
  if (year > last.year && year <= projectionEnd(last.year)) {
    const pr = projection(points, { toYear: year, bounds, scale });
    const p = pr?.points.at(-1);
    // Too uncertain to mean anything (90% range wider than the estimate itself, e.g. a
    // small state whose yearly figures swing from 3 to 13): show no estimate at all.
    if (p && p.hi - p.lo <= Math.max(p.value, 1)) return { kind: "proj", value: p.value, lo: p.lo, hi: p.hi, basis: pr.basis, last };
  }
  return null;
}

// Value at a year between two observed points of the same unbroken segment.
export function interpolate(points, year) {
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k];
    if (b.breakBefore) continue;
    if (year > a.year && year < b.year) {
      return { value: a.value + ((b.value - a.value) * (year - a.year)) / (b.year - a.year), from: a, to: b };
    }
  }
  return null;
}

// Last resort for maps: a straight line between the nearest real figures on either
// side even when the series breaks between them (a change of definition or borders,
// e.g. undivided Madhya Pradesh in 1998-99 and today's in 2005-06). Marked `broken`
// so the card says the two figures are not fully comparable. At most MAX_BRIDGE years apart.
export const MAX_BRIDGE = 12;
export function interpolateAcross(points, year) {
  const a = points.filter((p) => p.year < year).at(-1), b = points.find((p) => p.year > year);
  if (!a || !b || b.year - a.year > MAX_BRIDGE) return null;
  return { kind: "interp", value: a.value + ((b.value - a.value) * (year - a.year)) / (b.year - a.year), from: a, to: b, broken: true };
}

// National-anchored estimate for a state in a year without state data.
//
// An annual All-India series (the anchor) carries the year-to-year movement; the
// state's own real data points fix its distance from India. On the indicator's
// scale (logit for %, log for rates and money), the state's gap to India is
// measured at each year the state has data, interpolated in a straight line
// between those years and held at its last value afterwards (for at most
// MAX_AHEAD years). Estimate = India's value that year + the state's gap.
// The 90% range widens with distance from the nearest real state point, at the
// pace the state's gap has actually drifted between its own data points.
// No estimate before the state's first point, or across a break in its series.
export function anchoredEstimate(statePts, anchorPts, year, { scale = "linear", bounds = [-Infinity, Infinity] } = {}) {
  const sc = SCALES[scale] ?? SCALES.linear;
  const seg = lastSegmentBefore(statePts, year);
  if (!seg.length || year < seg[0].year) return null;
  const natAt = (yr) => {
    const exact = anchorPts.find((p) => p.year === yr);
    if (exact) return exact.value;
    const ip = interpolate(anchorPts, yr);
    return ip ? ip.value : null;
  };
  const nYear = natAt(year);
  if (nYear == null) return null;
  const gaps = seg.map((p) => ({ year: p.year, g: natAt(p.year) == null ? null : sc.f(p.value) - sc.f(natAt(p.year)), p }))
    .filter((x) => x.g != null);
  if (!gaps.length) return null;
  let g, basis;
  const after = gaps.findIndex((x) => x.year > year);
  if (after === -1) {
    const last = gaps.at(-1);
    if (year - last.year > MAX_AHEAD) return null;
    g = last.g; basis = [last.p];
  } else if (after === 0) {
    return null;
  } else {
    const a = gaps[after - 1], b = gaps[after];
    g = a.g + ((b.g - a.g) * (year - a.year)) / (b.year - a.year);
    basis = [a.p, b.p];
  }
  // Drift of the gap per year between the state's own points (floor keeps a range).
  const drifts = gaps.slice(1).map((x, k) => Math.abs(x.g - gaps[k].g) / (x.year - gaps[k].year));
  const rate = Math.max(0.01, drifts.length ? drifts.reduce((a, b) => a + b, 0) / drifts.length : 0.03);
  const dist = Math.min(...gaps.map((x) => Math.abs(x.year - year)));
  const half = 1.645 * rate * dist;
  const clamp = (v) => Math.min(bounds[1], Math.max(bounds[0], v));
  const f = sc.f(nYear) + g;
  return { kind: "anchored", value: clamp(sc.inv(f)), lo: clamp(sc.inv(f - half)), hi: clamp(sc.inv(f + half)), basis, last: basis.at(-1), national: nYear };
}

// The unbroken stretch of a state's series that a given year belongs to.
function lastSegmentBefore(points, year) {
  let start = 0;
  points.forEach((p, k) => { if (p.breakBefore && p.year <= year) start = k; });
  const rest = points.slice(start);
  const end = rest.findIndex((p, k) => k > 0 && p.breakBefore);
  return end === -1 ? rest : rest.slice(0, end);
}

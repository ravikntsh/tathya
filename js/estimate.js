// Estimates for years without data. Shown only when the reader turns them on,
// always dashed and labelled, never used on the map, fact cards or share images.
//
// - Between two observed points of the same series: straight-line interpolation.
// - After the last observed point: an ordinary least-squares line through the
//   last (up to) 5 points of the latest unbroken segment, with a 90% prediction
//   interval. Needs at least 3 points. Values are clamped to the indicator's bounds.
//   The chart only projects series whose latest point is within the last 10 years.

// Two-sided 90% t critical values by degrees of freedom (n - 2).
const T90 = { 1: 6.314, 2: 2.92, 3: 2.353 };

export function lastSegment(points) {
  let start = 0;
  points.forEach((p, k) => { if (p.breakBefore) start = k; });
  return points.slice(start);
}

export function projection(points, { toYear, bounds = [-Infinity, Infinity] }) {
  const seg = lastSegment(points).slice(-5);
  const n = seg.length;
  if (n < 3) return null;
  const last = seg.at(-1);
  if (toYear <= last.year) return null;
  const xs = seg.map((p) => p.year), ys = seg.map((p) => p.value);
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
    out.push({ year: yr, value: clamp(fit), lo: clamp(fit - half), hi: clamp(fit + half) });
  }
  return { points: out, basis: seg.map((p) => p.period), slope };
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

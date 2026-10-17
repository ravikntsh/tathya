import { SITE_NAME, SITE_URL } from "./config.js";
import { getLang, fmt } from "./i18n.js";

// Share images always use the light palette so they read the same everywhere.
const C = { paper: "#FFFFFF", ink: "#1A2233", muted: "#4B5565", navy: "#1B2A6B", teal: "#2A8C82", terracotta: "#C2553A", slate: "#8A93A3", line: "#E3E7EE" };

export function cardLink(state) {
  const p = new URLSearchParams({ ind: state.indicator });
  if (state.dataset) p.set("src", state.dataset);
  if (state.round) p.set("round", state.round);
  if (state.region) p.set("state", state.region);
  if (state.est) p.set("est", "1");
  if ((state.est || state.dataset === "__all") && state.year) p.set("yr", state.year);
  return `${SITE_URL}#${p}`;
}

// card = { regionName, indicatorLabel, value, valueText, unit, decimals, round, years (source label),
//          prev: {round, value} | null, higherIsBetter, sourceName, sourceUrl, domain, series: [{round, value, est?}],
//          estimate?: { note } }  -- estimates are shareable but always marked as estimates.
const AMBER = { ink: "#7A4F0A", bg: "#F7EEDB" };
const num = (card, v) => fmt(v, card.decimals ?? 1);

export function shareTexts(card, link) {
  const hi = getLang() === "hi";
  if (card.estimate) {
    const tag = hi ? "अनुमान, आधिकारिक आँकड़ा नहीं" : "ESTIMATE, not official data";
    const head = `${card.regionName}: ${card.indicatorLabel}: ≈ ${card.valueText} (${card.round}). ${tag}.`;
    const basis = hi ? `आधार: ${card.sourceName}` : `Based on: ${card.sourceName}`;
    return {
      short: fitX(`${head} ${basis}`, link),
      long: `${head}\n\n${card.estimate.note}\n\n${basis}\n${card.sourceUrl}\n\n${link}`,
    };
  }
  const delta = card.prev ? card.value - card.prev.value : null;
  const sign = delta >= 0 ? "+" : "";
  const deltaTxt = delta == null ? "" : hi
    ? ` (${card.prev.round} में ${num(card, card.prev.value)}${card.unit} से ${sign}${num(card, delta)}${card.deltaUnit})`
    : ` (${sign}${num(card, delta)}${card.deltaUnit} from ${num(card, card.prev.value)}${card.unit} in ${card.prev.round})`;
  const head = `${card.regionName}: ${card.indicatorLabel}: ${card.valueText} (${card.round}, ${card.years})${deltaTxt}.`;
  const src = hi ? `स्रोत: ${card.sourceName}` : `Source: ${card.sourceName}`;
  const short = fitX(`${head} ${src}`, link);
  const long = `${head}\n\n${src}\n${card.sourceUrl}\n\n${link}`;
  return { short, long };
}

// X counts every link as 23 characters.
function fitX(text, link) {
  const budget = 280 - 24;
  const t = text.length > budget ? text.slice(0, budget - 1) + "…" : text;
  return `${t} ${link}`;
}

export async function shareImage(card, link, [W, H]) {
  await document.fonts?.ready;
  const hi = getLang() === "hi";
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const font = (w, s) => `${w} ${s}px "Noto Sans", "Noto Sans Devanagari", sans-serif`;
  const pad = Math.round(W * 0.06);

  g.fillStyle = C.paper; g.fillRect(0, 0, W, H);
  g.fillStyle = C.navy; g.fillRect(0, 0, W, Math.round(H * 0.012));

  let y = pad + 20;
  g.fillStyle = C.muted; g.font = font(600, Math.round(H * 0.035));
  g.fillText(card.regionName, pad, y);
  y += Math.round(H * 0.06);
  g.fillStyle = C.ink; g.font = font(600, Math.round(H * 0.045));
  y = wrap(g, card.indicatorLabel, pad, y, W * 0.55 - pad, Math.round(H * 0.058));

  y += Math.round(H * 0.19);
  const est = !!card.estimate;
  if (est) {
    // Estimate tag, top right, impossible to crop out without cutting the number.
    const tag = hi ? "अनुमान · आधिकारिक आँकड़ा नहीं" : "ESTIMATE · NOT OFFICIAL DATA";
    g.font = font(700, Math.round(H * 0.03));
    const tw = g.measureText(tag).width + 28, th = Math.round(H * 0.055);
    g.fillStyle = AMBER.bg; g.fillRect(W - pad - tw, pad - 8, tw, th);
    g.strokeStyle = AMBER.ink; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(W - pad - tw, pad - 8, tw, th); g.setLineDash([]);
    g.fillStyle = AMBER.ink; g.fillText(tag, W - pad - tw + 14, pad - 8 + th * 0.68);
  }
  const shown = (est ? "≈ " : "") + num(card, card.value);
  g.fillStyle = est ? C.muted : C.navy; g.font = font(700, Math.round(H * 0.13));
  g.fillText(shown, pad, y);
  const numW = g.measureText(shown).width;
  g.font = font(600, Math.round(H * 0.05));
  g.fillText(card.unit.trim(), pad + numW + 10, y);
  g.fillStyle = C.muted; g.font = font(400, Math.round(H * 0.035));
  g.fillText(`${card.round} · ${card.years}`, pad, y + Math.round(H * 0.055));

  if (est) {
    g.fillStyle = AMBER.ink; g.font = font(400, Math.round(H * 0.028));
    wrap(g, card.estimate.note, pad, y + Math.round(H * 0.11), W * 0.58 - pad, Math.round(H * 0.036));
  } else if (card.prev) {
    const d = card.value - card.prev.value;
    const good = card.higherIsBetter == null ? null : (d >= 0) === card.higherIsBetter;
    g.fillStyle = good == null ? C.muted : good ? C.teal : C.terracotta;
    g.font = font(600, Math.round(H * 0.04));
    const txt = hi
      ? `${d >= 0 ? "▲ +" : "▼ "}${num(card, d)} (${card.prev.round} से)`
      : `${d >= 0 ? "▲ +" : "▼ "}${num(card, d)} since ${card.prev.round}`;
    g.fillText(txt, pad, y + Math.round(H * 0.115));
  }

  // Mini bar chart of recent periods, right side, scaled to the indicator's domain.
  const bars = card.series;
  const [lo, hiV] = card.domain || [0, 100];
  const cw = W * 0.34, ch = H * 0.36, cx = W - pad - cw, cy = H * 0.3;
  const bw = cw / (bars.length * 1.6);
  bars.forEach((b, i) => {
    const h = Math.max(2, ((b.value - lo) / (hiV - lo)) * ch);
    const x = cx + i * bw * 1.6 + bw * 0.3;
    if (b.est) {
      // The estimated bar is an outline only, so it never looks like a measured value.
      g.strokeStyle = AMBER.ink; g.lineWidth = 2; g.setLineDash([5, 4]);
      g.strokeRect(x, cy + ch - h, bw, h); g.setLineDash([]);
    } else {
      g.fillStyle = b.round === card.round ? C.navy : C.slate;
      g.fillRect(x, cy + ch - h, bw, h);
    }
    if (bars.length <= 5) {
      g.fillStyle = C.muted; g.font = font(400, Math.round(H * 0.024));
      g.fillText(b.round, x, cy + ch + Math.round(H * 0.04));
    }
  });
  g.strokeStyle = C.line; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx, cy + ch); g.lineTo(cx + cw, cy + ch); g.stroke();

  // Source is bigger than the brand (requirements: Sharing).
  const by = H - pad;
  g.fillStyle = C.ink; g.font = font(600, Math.round(H * 0.03));
  const srcLabel = est ? (hi ? "आधार" : "Based on") : (hi ? "स्रोत" : "Source");
  // Lay the source out upward from the footer so long names never overlap the link.
  const lh = Math.round(H * 0.038);
  const srcLines = lines(g, `${srcLabel}: ${card.sourceName}`, W - pad * 2).slice(0, 4);
  srcLines.forEach((ln, k) => g.fillText(ln, pad, by - Math.round(H * 0.05) - (srcLines.length - 1 - k) * lh));
  g.fillStyle = C.muted; g.font = font(400, Math.round(H * 0.022));
  g.fillText(`${SITE_NAME} · ${link.replace(/^https?:\/\//, "").slice(0, 70)}`, pad, by);

  return new Promise((res) => cv.toBlob(res, "image/png"));
}

function lines(g, text, maxW) {
  const out = [];
  let line = "";
  for (const w of String(text).split(" ")) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
  }
  if (line) out.push(line);
  return out;
}

function wrap(g, text, x, y, maxW, lh) {
  const words = String(text).split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y); line = w; y += lh;
    } else line = test;
  }
  g.fillText(line, x, y);
  return y;
}

export function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// ---------- map, line chart and before → after images ----------

// Light map palette (same as css/tokens.css) so shared images look the same everywhere.
const SEQ = ["#E8EBF5", "#B9C1E0", "#8693C6", "#5262A6", "#1B2A6B"];
const font = (w, s) => `${w} ${s}px "Noto Sans", "Noto Sans Devanagari", sans-serif`;
const linesOf = (g, text, maxW, f) => { g.font = f; return lines(g, text, maxW); };

// On phones: the system share sheet with the image. Elsewhere: a download.
export async function deliver(blob, name, { text, url } = {}) {
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text, url }); return; } catch (e) { if (e?.name === "AbortError") return; }
  }
  download(blob, name);
}

// Header and footer shared by the map and before → after images. Returns where the
// body starts and ends; the footer (sources bigger than the brand) sits at the bottom.
function frame(g, W, H, { title, subtitle, sourceLines, link, footNote }) {
  const pad = 60;
  g.fillStyle = C.paper; g.fillRect(0, 0, W, H);
  g.fillStyle = C.navy; g.fillRect(0, 0, W, 12);
  let y = pad + 20;
  for (const ln of linesOf(g, title, W - pad * 2, font(700, 44)).slice(0, 2)) { g.fillStyle = C.ink; g.fillText(ln, pad, y); y += 54; }
  for (const ln of linesOf(g, subtitle, W - pad * 2, font(400, 26)).slice(0, 3)) { g.fillStyle = C.muted; g.fillText(ln, pad, y); y += 34; }
  let fy = H - 36;
  g.fillStyle = C.muted; g.font = font(400, 22);
  g.fillText(`${SITE_NAME} · ${link.replace(/^https?:\/\//, "").slice(0, 80)}`, pad, fy);
  fy -= 44;
  const src = sourceLines.flatMap((s) => linesOf(g, s, W - pad * 2, font(600, 26))).slice(0, 5);
  g.fillStyle = C.ink; g.font = font(600, 26);
  src.slice().reverse().forEach((ln) => { g.fillText(ln, pad, fy); fy -= 34; });
  if (footNote) {
    const fl = linesOf(g, footNote, W - pad * 2, font(600, 24)).slice(0, 3);
    g.fillStyle = AMBER.ink; g.font = font(600, 24);
    fl.slice().reverse().forEach((ln) => { g.fillText(ln, pad, fy); fy -= 32; });
  }
  return { top: y + 6, bottom: fy - 10, pad };
}

// Map of every state for one year, with the colour key and the source.
export async function mapImage({ svgImg, title, subtitle, headline, bands, unit, decimals = 0, noData, estNote, sourceLines, link }) {
  await document.fonts?.ready;
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const { top, bottom, pad } = frame(g, W, H, { title, subtitle, sourceLines, link, footNote: estNote });
  let y = top;
  if (headline) { g.fillStyle = C.navy; g.font = font(700, 40); g.fillText(headline, pad, y + 34); y += 56; }
  const keyH = 80, mapBottom = bottom - keyH;
  const avail = mapBottom - y, scale = Math.min((W - pad * 2) / svgImg.W, avail / svgImg.H);
  const mw = svgImg.W * scale, mh = svgImg.H * scale;
  g.drawImage(svgImg.img, (W - mw) / 2, y + (avail - mh) / 2, mw, mh);
  let kx = pad, ky = mapBottom + 34;
  g.font = font(400, 22);
  const u = unit === "%" ? "%" : "";
  const items = bands.map((b, k) => ({ color: SEQ[k], label: `${fmt(b.lo, decimals)}–${fmt(b.hi, decimals)}${u}` }));
  items.push({ hatch: true, label: noData });
  if (unit !== "%") items.push({ text: true, label: unit });
  for (const it of items) {
    g.font = font(400, 22);
    const w = (it.text ? 0 : 34) + g.measureText(it.label).width + 22;
    if (kx + w > W - pad) { kx = pad; ky += 36; }
    if (!it.text) {
      g.fillStyle = it.hatch ? "#DDE2EA" : it.color; g.fillRect(kx, ky - 20, 26, 26);
      if (it.hatch) {
        g.save(); g.beginPath(); g.rect(kx, ky - 20, 26, 26); g.clip();
        g.strokeStyle = C.slate; g.lineWidth = 2;
        for (let d = -26; d < 52; d += 7) { g.beginPath(); g.moveTo(kx + d, ky + 6); g.lineTo(kx + d + 26, ky - 20); g.stroke(); }
        g.restore();
      }
      g.strokeStyle = C.line; g.lineWidth = 1; g.strokeRect(kx, ky - 20, 26, 26);
    }
    g.fillStyle = it.text ? C.muted : C.ink; g.fillText(it.label, kx + (it.text ? 0 : 34), ky);
    kx += w;
  }
  return new Promise((res) => cv.toBlob(res, "image/png"));
}

// The two ends for a before → after comparison, from one source only: the latest
// round at or before `year`, and the earliest round in the same unbroken stretch
// that most states (60% or more) share. Real figures only; a state is left out if
// either end is missing or its series breaks in between.
export function beforeAfter(data, indId, dsList, year) {
  let best = null;
  for (const ds of dsList) {
    const ps = data.periods(indId, ds, { statesOnly: true }).filter((p) => p.year <= year + 1);
    if (ps.length < 2) continue;
    const pb = ps.at(-1);
    const rowsFor = (pa) => ["IN", ...data.states.map((s) => s.code)].flatMap((code) => {
      const s = data.series(indId, ds, code);
      const a = s.find((p) => p.period === pa.period), b = s.find((p) => p.period === pb.period);
      if (!a || !b || s.some((p) => p.year > a.year && p.year <= b.year && p.breakBefore)) return [];
      return [{ code, a, b }];
    });
    const nB = data.states.filter((s) => data.get(indId, ds, pb.period, s.code)).length;
    for (const pa of ps.slice(0, -1)) {
      const rows = rowsFor(pa);
      const n = rows.filter((r) => r.code !== "IN").length;
      if (n >= Math.max(5, 0.6 * nB)) {
        if (!best || n > best.n) best = { ds, pa, pb, rows, n };
        break;
      }
    }
  }
  return best;
}

// Before → after for every state: a hollow dot for the earlier figure, a filled dot
// for the later one, joined by a line (teal if better, terracotta if worse, grey
// where the indicator has no better direction). Sorted by the later figure.
export async function changeImage({ title, subtitle, labelA, labelB, rows, decimals = 1, unit, higherIsBetter, sourceLines, link, footNote }) {
  await document.fonts?.ready;
  const W = 1080, rowH = 30, H = Math.max(1080, 430 + rows.length * rowH + 280);
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const { top, bottom, pad } = frame(g, W, H, { title, subtitle, sourceLines, link, footNote });
  const u = unit === "%" ? "%" : "";
  const vals = rows.flatMap((r) => [r.a, r.b]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  // Round the axis to a clean step (1, 2, 2.5 or 5 times a power of ten), about 4 ticks.
  const raw = (hi - lo || Math.abs(hi) || 1) / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  if (unit === "%") { lo = Math.max(0, lo); hi = Math.min(100, hi); }
  if (hi === lo) hi = lo + step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(v);
  const x0 = pad + 250, x1 = W - pad - 130, X = (v) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  let y = top + 20;
  g.font = font(600, 24);
  g.strokeStyle = C.slate; g.lineWidth = 3; g.fillStyle = C.paper;
  g.beginPath(); g.arc(pad + 10, y - 8, 9, 0, 7); g.fill(); g.stroke();
  g.fillStyle = C.ink; g.fillText(labelA, pad + 28, y);
  const ax = pad + 28 + g.measureText(labelA).width + 40;
  g.fillStyle = C.navy; g.beginPath(); g.arc(ax + 10, y - 8, 9, 0, 7); g.fill();
  g.fillStyle = C.ink; g.fillText(labelB, ax + 28, y);
  y += 40;
  const tickDp = step < 1 ? 1 : 0;
  g.font = font(400, 20); g.textAlign = "center";
  for (const v of ticks) {
    g.fillStyle = C.muted; g.fillText(`${fmt(v, tickDp)}${u}`, X(v), y);
    g.strokeStyle = C.line; g.lineWidth = 1;
    g.beginPath(); g.moveTo(X(v), y + 8); g.lineTo(X(v), Math.min(bottom, y + 14 + rows.length * rowH)); g.stroke();
  }
  g.textAlign = "left";
  y += 14;
  const sorted = [...rows].sort((p, q) => q.b - p.b);
  for (const r of sorted) {
    if (y > bottom - rowH) break;
    const cy = y + rowH / 2;
    if (r.india) { g.fillStyle = "#EEF1F8"; g.fillRect(pad - 8, y + 1, W - pad * 2 + 16, rowH - 2); }
    g.fillStyle = C.ink; g.font = font(r.india ? 700 : 400, 21);
    g.fillText(r.name.length > 22 ? r.name.slice(0, 21) + "…" : r.name, pad, cy + 7);
    const d = r.b - r.a;
    const good = higherIsBetter == null || d === 0 ? null : (d > 0) === higherIsBetter;
    const col = good == null ? C.slate : good ? C.teal : C.terracotta;
    g.strokeStyle = col; g.lineWidth = 4;
    g.beginPath(); g.moveTo(X(r.a), cy); g.lineTo(X(r.b), cy); g.stroke();
    g.strokeStyle = C.slate; g.lineWidth = 3; g.fillStyle = C.paper;
    g.beginPath(); g.arc(X(r.a), cy, 8, 0, 7); g.fill(); g.stroke();
    g.fillStyle = C.navy; g.beginPath(); g.arc(X(r.b), cy, 8, 0, 7); g.fill();
    g.fillStyle = col; g.font = font(600, 21); g.textAlign = "right";
    g.fillText(`${d > 0 ? "+" : d < 0 ? "−" : "±"}${fmt(Math.abs(d), decimals)}`, W - pad, cy + 7);
    g.textAlign = "left";
    y += rowH;
  }
  return new Promise((res) => cv.toBlob(res, "image/png"));
}

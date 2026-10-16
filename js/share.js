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

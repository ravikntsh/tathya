import { SITE_NAME, SITE_URL } from "./config.js";
import { getLang, fmt } from "./i18n.js";

// Share images always use the light palette so they read the same everywhere.
const C = { paper: "#FFFFFF", ink: "#1A2233", muted: "#4B5565", navy: "#1B2A6B", teal: "#2A8C82", terracotta: "#C2553A", slate: "#8A93A3", line: "#E3E7EE" };

export function cardLink(state) {
  const p = new URLSearchParams({ ind: state.indicator });
  if (state.dataset) p.set("src", state.dataset);
  if (state.round) p.set("round", state.round);
  if (state.region) p.set("state", state.region);
  return `${SITE_URL}#${p}`;
}

// card = { regionName, indicatorLabel, value, valueText, unit, decimals, round, years (source label),
//          prev: {round, value} | null, higherIsBetter, sourceName, sourceUrl, domain, series: [{round, value}] }
const num = (card, v) => fmt(v, card.decimals ?? 1);

export function shareTexts(card, link) {
  const hi = getLang() === "hi";
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
  g.fillStyle = C.navy; g.font = font(700, Math.round(H * 0.13));
  g.fillText(num(card, card.value), pad, y);
  const numW = g.measureText(num(card, card.value)).width;
  g.font = font(600, Math.round(H * 0.05));
  g.fillText(card.unit.trim(), pad + numW + 10, y);
  g.fillStyle = C.muted; g.font = font(400, Math.round(H * 0.035));
  g.fillText(`${card.round} · ${card.years}`, pad, y + Math.round(H * 0.055));

  if (card.prev) {
    const d = card.value - card.prev.value;
    const good = (d >= 0) === card.higherIsBetter;
    g.fillStyle = good ? C.teal : C.terracotta;
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
    g.fillStyle = b.round === card.round ? C.navy : C.slate;
    g.fillRect(x, cy + ch - h, bw, h);
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
  wrap(g, `${hi ? "स्रोत" : "Source"}: ${card.sourceName}`, pad, by - Math.round(H * 0.07), W - pad * 2, Math.round(H * 0.038));
  g.fillStyle = C.muted; g.font = font(400, Math.round(H * 0.022));
  g.fillText(`${SITE_NAME} · ${link.replace(/^https?:\/\//, "").slice(0, 70)}`, pad, by);

  return new Promise((res) => cv.toBlob(res, "image/png"));
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

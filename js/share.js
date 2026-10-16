import { SITE_NAME, SITE_URL } from "./config.js";
import { getLang, fmt } from "./i18n.js";

// Share images always use the light palette so they read the same everywhere.
const C = { paper: "#FFFFFF", ink: "#1A2233", muted: "#4B5565", navy: "#1B2A6B", teal: "#2A8C82", terracotta: "#C2553A", slate: "#8A93A3", line: "#E3E7EE" };

export function cardLink(state) {
  const p = new URLSearchParams({ ind: state.indicator, round: state.round });
  if (state.region) p.set("state", state.region);
  return `${SITE_URL}#${p}`;
}

// card = { claim, regionName, value, round, years, prev, indicatorLabel, sourceName, sourceUrl, series:[{round,value}] }
export function shareTexts(card, link) {
  const hi = getLang() === "hi";
  const delta = card.prev ? card.value - card.prev.value : null;
  const deltaTxt = delta == null ? "" : hi
    ? ` (${card.prev.round} में ${fmt(card.prev.value)}% से ${delta >= 0 ? "+" : ""}${fmt(delta)} अंक)`
    : ` (${delta >= 0 ? "+" : ""}${fmt(delta)} pts from ${fmt(card.prev.value)}% in ${card.prev.round})`;
  const head = `${card.regionName}: ${card.indicatorLabel}: ${fmt(card.value)}% (${card.round}, ${card.years})${deltaTxt}.`;
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
  y = wrap(g, card.indicatorLabel, pad, y, W - pad * 2, Math.round(H * 0.058));

  y += Math.round(H * 0.19);
  g.fillStyle = C.navy; g.font = font(700, Math.round(H * 0.15));
  g.fillText(`${fmt(card.value)}%`, pad, y);
  g.fillStyle = C.muted; g.font = font(400, Math.round(H * 0.035));
  g.fillText(`${card.round} (${card.years})`, pad, y + Math.round(H * 0.055));

  if (card.prev) {
    const d = card.value - card.prev.value;
    g.fillStyle = d >= 0 ? C.teal : C.terracotta;
    g.font = font(600, Math.round(H * 0.04));
    const txt = `${d >= 0 ? "▲ +" : "▼ "}${fmt(d)} pts since ${card.prev.round}`;
    g.fillText(txt, pad, y + Math.round(H * 0.115));
  }

  // Mini bar chart of all rounds, right side.
  const bars = card.series;
  const cw = W * 0.34, ch = H * 0.36, cx = W - pad - cw, cy = H * 0.3;
  const bw = cw / (bars.length * 1.6);
  bars.forEach((b, i) => {
    const h = (b.value / 100) * ch;
    const x = cx + i * bw * 1.6 + bw * 0.3;
    g.fillStyle = b.round === card.round ? C.navy : C.slate;
    g.fillRect(x, cy + ch - h, bw, h);
    g.fillStyle = C.muted; g.font = font(400, Math.round(H * 0.026));
    g.fillText(b.round, x, cy + ch + Math.round(H * 0.04));
  });
  g.strokeStyle = C.line; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx, cy + ch); g.lineTo(cx + cw, cy + ch); g.stroke();

  // Source is bigger than the brand (requirements: Sharing).
  const by = H - pad;
  g.fillStyle = C.ink; g.font = font(600, Math.round(H * 0.032));
  wrap(g, `Source: ${card.sourceName}`, pad, by - Math.round(H * 0.05), W - pad * 2, Math.round(H * 0.04));
  g.fillStyle = C.muted; g.font = font(400, Math.round(H * 0.022));
  g.fillText(`${SITE_NAME} · ${link.replace(/^https?:\/\//, "").slice(0, 60)}`, pad, by);

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

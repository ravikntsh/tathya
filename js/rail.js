import { t } from "./i18n.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Neighbour codes in the same order as the "Border & neighbours" labels in i18n.js.
export const NEIGHBOURS = ["cn", "pk", "bd", "np", "bt", "lk", "mm", "mv", "af"];

// Renders the issue rail. `active` is "development" or a neighbour code.
export function renderRail(el, { active = "development" } = {}) {
  const items = t("issueList");
  const link = (href, label, on) => `<a href="${href}"${on ? ' class="active" aria-current="page"' : ""}>${esc(label)}</a>`;
  el.innerHTML =
    `<li>${link("index.html", t("development"), active === "development")}</li>` +
    items
      .map((i, k) => {
        if (!Array.isArray(i)) return `<li><span aria-disabled="true">${esc(i)}<small>${t("soon")}</small></span></li>`;
        // The first group is Border & neighbours (live pages); later groups are still to come.
        const isNeighbours = k === items.findIndex(Array.isArray);
        const subs = i[1]
          .map((x, j) => (isNeighbours
            ? `<li>${link(`neighbours.html#c=${NEIGHBOURS[j]}`, x, active === NEIGHBOURS[j])}</li>`
            : `<li><span aria-disabled="true">${esc(x)}</span></li>`))
          .join("");
        return `<li class="rail-group"><span class="rail-group-h">${esc(i[0])}</span><ul>${subs}</ul>${isNeighbours ? "" : `<small class="rail-soon">${t("soon")}</small>`}</li>`;
      })
      .join("");
}

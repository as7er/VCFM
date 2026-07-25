/** 离线国家队旗帜：避免 Windows 将旗帜 emoji 退化为地区代码。 */

const hBands = (...colors) => colors
  .map((color, i) => `<rect width="24" height="${16 / colors.length}" y="${(16 / colors.length) * i}" fill="${color}"/>`)
  .join("");

const vBands = (...colors) => colors
  .map((color, i) => `<rect width="${24 / colors.length}" height="16" x="${(24 / colors.length) * i}" fill="${color}"/>`)
  .join("");

const nordic = (background, cross, inner = null) => `
  <rect width="24" height="16" fill="${background}"/>
  <rect x="7" width="4" height="16" fill="${cross}"/><rect y="6" width="24" height="4" fill="${cross}"/>
  ${inner ? `<rect x="8" width="2" height="16" fill="${inner}"/><rect y="7" width="24" height="2" fill="${inner}"/>` : ""}`;

const FLAGS = {
  ENG: `<rect width="24" height="16" fill="#fff"/><rect x="9" width="6" height="16" fill="#ce1124"/><rect y="5" width="24" height="6" fill="#ce1124"/>`,
  ESP: `<rect width="24" height="16" fill="#aa151b"/><rect y="4" width="24" height="8" fill="#f1bf00"/><circle cx="7" cy="8" r="1.3" fill="#aa151b"/>`,
  GER: hBands("#111", "#dd0000", "#ffce00"),
  FRA: vBands("#0055a4", "#fff", "#ef4135"),
  ITA: vBands("#009246", "#fff", "#ce2b37"),
  POR: `<rect width="9" height="16" fill="#046a38"/><rect x="9" width="15" height="16" fill="#da291c"/><circle cx="9" cy="8" r="2.1" fill="#ffcc29"/>`,
  BRA: `<rect width="24" height="16" fill="#009c3b"/><polygon points="12,2 22,8 12,14 2,8" fill="#ffdf00"/><circle cx="12" cy="8" r="3.2" fill="#002776"/>`,
  ARG: hBands("#74acdf", "#fff", "#74acdf") + `<circle cx="12" cy="8" r="1.25" fill="#f6b40e"/>`,
  NED: hBands("#ae1c28", "#fff", "#21468b"),
  BEL: vBands("#111", "#fdda24", "#ef3340"),
  CRO: hBands("#ff0000", "#fff", "#171796") + `<rect x="10" y="5" width="4" height="5" fill="#fff" stroke="#d40000"/><path d="M10 5h2v2h-2zm2 2h2v2h-2z" fill="#d40000"/>`,
  URU: hBands("#fff", "#5bc0eb", "#fff", "#5bc0eb", "#fff", "#5bc0eb", "#fff", "#5bc0eb", "#fff") + `<circle cx="3.5" cy="3.5" r="1.5" fill="#f6b40e"/>`,
  COL: `<rect width="24" height="8" fill="#fcd116"/><rect y="8" width="24" height="4" fill="#003893"/><rect y="12" width="24" height="4" fill="#ce1126"/>`,
  MEX: vBands("#006847", "#fff", "#ce1126") + `<circle cx="12" cy="8" r="1.2" fill="#8c6b34"/>`,
  USA: `${Array.from({ length: 13 }, (_, i) => `<rect y="${(16 / 13) * i}" width="24" height="${16 / 13}" fill="${i % 2 ? "#fff" : "#b22234"}"/>`).join("")}<rect width="10" height="8.6" fill="#3c3b6e"/><g fill="#fff"><circle cx="2" cy="2" r=".45"/><circle cx="5" cy="2" r=".45"/><circle cx="8" cy="2" r=".45"/><circle cx="3.5" cy="4.3" r=".45"/><circle cx="6.5" cy="4.3" r=".45"/><circle cx="2" cy="6.6" r=".45"/><circle cx="5" cy="6.6" r=".45"/><circle cx="8" cy="6.6" r=".45"/></g>`,
  JPN: `<rect width="24" height="16" fill="#fff"/><circle cx="12" cy="8" r="4" fill="#bc002d"/>`,
  KOR: `<rect width="24" height="16" fill="#fff"/><path d="M8 8a4 4 0 0 1 8 0c-2-2-4 2-8 0" fill="#cd2e3a"/><path d="M16 8a4 4 0 0 1-8 0c2 2 4-2 8 0" fill="#0047a0"/><g stroke="#111" stroke-width=".8"><path d="M3 4l4-2M3.5 5.5l4-2M17 13l4-2M16.5 11.5l4-2"/></g>`,
  CHN: `<rect width="24" height="16" fill="#de2910"/><text x="2.2" y="6.1" font-size="5" fill="#ffde00">★</text><g fill="#ffde00"><circle cx="8" cy="3" r=".45"/><circle cx="9.5" cy="5" r=".45"/><circle cx="9.2" cy="7.5" r=".45"/><circle cx="7.4" cy="9" r=".45"/></g>`,
  NGA: vBands("#008751", "#fff", "#008751"),
  SEN: vBands("#00853f", "#fdef42", "#e31b23") + `<text x="10" y="10.7" font-size="5" fill="#00853f">★</text>`,
  GHA: hBands("#ce1126", "#fcd116", "#006b3f") + `<text x="10" y="10.4" font-size="5" fill="#111">★</text>`,
  CIV: vBands("#f77f00", "#fff", "#009e60"),
  MAR: `<rect width="24" height="16" fill="#c1272d"/><text x="8.4" y="11.4" font-size="8" fill="none" stroke="#006233" stroke-width=".8">☆</text>`,
  POL: hBands("#fff", "#dc143c"),
  DEN: nordic("#c60c30", "#fff"),
  SWE: nordic("#006aa7", "#fecc00"),
  NOR: nordic("#ba0c2f", "#fff", "#00205b"),
  SUI: `<rect width="24" height="16" fill="#d52b1e"/><rect x="10" y="3" width="4" height="10" fill="#fff"/><rect x="7" y="6" width="10" height="4" fill="#fff"/>`,
  AUT: hBands("#ed2939", "#fff", "#ed2939"),
  TUR: `<rect width="24" height="16" fill="#e30a17"/><circle cx="10" cy="8" r="4" fill="#fff"/><circle cx="11.5" cy="8" r="3.2" fill="#e30a17"/><text x="14" y="10.4" font-size="5" fill="#fff">★</text>`,
  SRB: hBands("#c6363c", "#0c4076", "#fff") + `<circle cx="7" cy="8" r="1.8" fill="#f4c430" stroke="#c6363c"/>`,
  UKR: hBands("#0057b7", "#ffd700"),
  SCO: `<rect width="24" height="16" fill="#0065bd"/><path d="M0 0l24 16M24 0L0 16" stroke="#fff" stroke-width="3"/>`,
  WAL: `<rect width="24" height="8" fill="#fff"/><rect y="8" width="24" height="8" fill="#00ab39"/><path d="M5 10l4-5 3 2 3-3 4 6-5-1-2 4-2-3z" fill="#d30731"/>`,
  IRL: vBands("#169b62", "#fff", "#ff883e"),
  AUS: `<rect width="24" height="16" fill="#012169"/><path d="M0 0l10 7M10 0L0 7" stroke="#fff" stroke-width="2"/><path d="M0 0l10 7M10 0L0 7" stroke="#c8102e" stroke-width=".8"/><path d="M5 0v7M0 3.5h10" stroke="#fff" stroke-width="2"/><path d="M5 0v7M0 3.5h10" stroke="#c8102e" stroke-width=".8"/><g fill="#fff"><circle cx="17" cy="4" r=".8"/><circle cx="20" cy="8" r=".7"/><circle cx="16" cy="12" r=".8"/><circle cx="11" cy="10" r=".6"/></g>`,
};

export function nationFlagHtml(code) {
  const key = String(code || "").toUpperCase();
  const content = FLAGS[key];
  if (!content) return `<span class="nation-flag nation-flag-code" aria-hidden="true">${key.slice(0, 2) || "—"}</span>`;
  return `<span class="nation-flag" aria-hidden="true"><svg viewBox="0 0 24 16" focusable="false">${content}</svg></span>`;
}

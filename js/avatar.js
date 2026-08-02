/**
 * 热血像素头像 2.1（Kunio-style procedural）
 * 全场景统一：名单 / 资料卡 / 战术板 / 职员 都走本文件程序生成。
 * 同队球衣由 kit 主副色直接绘制，天然同款同色。
 */

/** @typedef {'neutral'|'happy'|'injured'|'sad'|'tired'} AvatarMood */

import {
  APPEARANCE_HAIR_STYLE_IDS,
  APPEARANCE_REGION_OF,
  APPEARANCE_REGION_PROFILES,
  APPEARANCE_STYLE_AFRO,
  APPEARANCE_STYLE_DEFAULT,
  appearanceHash,
  appearanceWpick,
  normalizeHairColor,
  normalizeHairStyleId,
  normalizeSkinTone,
} from "./appearance.js";

// ============================================================
// 基础工具
// ============================================================

/** 稳定外貌身份键：appearanceSeed → id → name */
export function playerAppearanceKey(player) {
  if (!player || typeof player !== "object") return "anon";
  if (player.appearanceSeed != null && player.appearanceSeed !== "") return String(player.appearanceSeed);
  if (player.id != null && player.id !== "") return String(player.id);
  if (player.name != null && player.name !== "") return String(player.name);
  return "anon";
}


function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return String(name).slice(0, 2).toUpperCase();
}

function shiftHex(hex, delta) {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#") || hex.length < 7) {
    return hex || "#334155";
  }
  const clamp = (n) => Math.max(0, Math.min(255, n));
  const r = clamp(parseInt(hex.slice(1, 3), 16) + delta);
  const g = clamp(parseInt(hex.slice(3, 5), 16) + delta);
  const b = clamp(parseInt(hex.slice(5, 7), 16) + delta);
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** 两色混合（t=0 全 a，t=1 全 b） */
function mixHex(a, b, t) {
  if (!a?.startsWith?.("#") || a.length < 7) return b || a || "#334155";
  if (!b?.startsWith?.("#") || b.length < 7) return a;
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const ch = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const r = clamp(ch(a, 0) * (1 - t) + ch(b, 0) * t);
  const g = clamp(ch(a, 1) * (1 - t) + ch(b, 1) * t);
  const bl = clamp(ch(a, 2) * (1 - t) + ch(b, 2) * t);
  return "#" + [r, g, bl].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** 相对亮度 0–1（sRGB 近似） */
function luminance(hex) {
  if (!hex?.startsWith?.("#") || hex.length < 7) return 0.2;
  const ch = (i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(1)) + 0.0722 * lin(ch(2));
}

/** 球衣显示色：相对背景强制拉开对比（深衣提亮），保留色相 */
function kitDisplayColor(hex, bgLum = 0.12) {
  let c = hex || "#3d8bfd";
  let lum = luminance(c);
  const minLum = Math.max(0.3, bgLum + 0.24);
  let guard = 0;
  while (lum < minLum && guard < 8) {
    const t = Math.min(0.5, 0.2 + (minLum - lum) * 0.9);
    c = mixHex(c, "#ffffff", t);
    lum = luminance(c);
    guard++;
  }
  if (lum > 0.9) c = mixHex(c, "#cbd5e1", 0.2);
  return c;
}

// ============================================================
// 地区画像：肤色 / 发色 / 发型按国籍合理分配
// ============================================================

/** 肤色 [底色, 阴影]（NES 暖调色阶，浅→深） */
const SKIN_TONES = {
  pale: ["#f6d7b8", "#d9b48f"],
  fair: ["#efc8a0", "#cfa377"],
  light: ["#e6b98e", "#c39468"],
  tan: ["#d4a06a", "#ad7c4b"],
  olive: ["#c08d58", "#9a6c3e"],
  brown: ["#9f6b3f", "#7c4f2b"],
  deep: ["#7c4c2a", "#5e3820"],
  dark: ["#5f3a22", "#452a18"],
};

const HAIR_COLORS = {
  black: "#26221f",
  dkbrown: "#42301f",
  brown: "#5f4128",
  ltbrown: "#7d5731",
  blond: "#c99a45",
  red: "#a84c28",
  grey: "#9aa0a8",
  white: "#dfe3e8",
};

/** 由国籍 + 哈希得到稳定的外貌；face 保存与状态无关的天生五官差异。 */
function lookFor(h, nation, age = 25, persisted = null) {
  const prof = APPEARANCE_REGION_PROFILES[APPEARANCE_REGION_OF[nation] || ""] || APPEARANCE_REGION_PROFILES.weur;
  let skinKey = normalizeSkinTone(persisted?.skinTone) || appearanceWpick(h, 11, prof.skin);
  if (!SKIN_TONES[skinKey]) skinKey = "fair";
  const [skin, skinShade] = SKIN_TONES[skinKey];
  // 深肤色 → 黑/深棕发（自然合理）；发型偏向短寸/短卷/爆炸头
  const darkSkin = skinKey === "deep" || skinKey === "dark";
  let hairKey = normalizeHairColor(persisted?.hairColor)
    ? normalizeHairColor(persisted.hairColor)
    : (darkSkin
      ? appearanceWpick(h, 12, [["black", 80], ["dkbrown", 20]])
      : appearanceWpick(h, 12, prof.hair));
  if (!HAIR_COLORS[hairKey]) hairKey = "dkbrown";
  let hairHex = HAIR_COLORS[hairKey];
  // 年龄灰白（仅在无显式灰/白发时）
  if (hairKey !== "grey" && hairKey !== "white") {
    if (age >= 40) {
      hairHex = appearanceWpick(h, 13, [[HAIR_COLORS.grey, 55], [HAIR_COLORS.white, 25], [mixHex(hairHex, HAIR_COLORS.grey, 0.6), 20]]);
    } else if (age >= 34 && (h & 3) === 0) {
      hairHex = mixHex(hairHex, HAIR_COLORS.grey, 0.45);
    }
  }
  const styleW = darkSkin ? APPEARANCE_STYLE_AFRO : prof.style || APPEARANCE_STYLE_DEFAULT;
  let styleId = normalizeHairStyleId(persisted?.hairStyle);
  if (!APPEARANCE_HAIR_STYLE_IDS.includes(styleId)) styleId = appearanceWpick(h, 14, styleW);
  const face = {
    eyeStyle: (h >>> 3) % 4,
    browStyle: (h >>> 8) % 4,
    mouthStyle: (h >>> 13) % 4,
    noseStyle: (h >>> 18) % 3,
    gaze: ((h >>> 21) % 3) - 1,
    shape: (h >>> 23) % 4,
    earStyle: (h >>> 25) % 3,
    eyeSpacing: ((h >>> 27) % 3) - 1,
  };
  // 2.0 小特征：稳定但不喧宾夺主
  const accessories = {
    stubble: age >= 23 && ((h >>> 9) % 7) === 0,
    scar: ((h >>> 11) % 11) === 0,
    headband: styleId === 12 || ((h >>> 15) % 17) === 0,
    freckles: !darkSkin && ((h >>> 17) % 13) === 0,
    beard: age >= 25 && ((h >>> 19) % 8) === 0,
  };
  return { skin, skinShade, hairHex, styleId, darkSkin, face, skinKey, hairKey, accessories };
}

// ============================================================
// 像素绘制：32×32 单元格列表（cell 单位），双输出 SVG / canvas-PNG
// v5.3 起关键轮廓与五官直接使用 1-cell 细节，不再沿用旧 16×16 的 2× 粗块。
// ============================================================

const GRID = 32;
const PROFILE_GRID = 48;
const OUT = "#1b1613"; // 全局粗描边（热血式近黑）
const EYE = "#1e1a17";
const EYEWHITE = "#f4efe4";
const MOUTH = "#7e3a30";

/** 单格像素 → cell 对象 */
function P(x, y, c) {
  return { x, y, w: 1, h: 1, c };
}
/** 横向一段 [x0..x1] */
function R(x0, x1, y, c) {
  return { x: x0, y, w: x1 - x0 + 1, h: 1, c };
}
/** 竖向一段 [y0..y1] */
function C(x, y0, y1, c) {
  return { x, y: y0, w: 1, h: y1 - y0 + 1, c };
}
/** 矩形填充 [x0..x1] × [y0..y1] */
function Box(x0, x1, y0, y1, c) {
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, c };
}

/** 心情背景（棋盘双色，复古抖动） */
const MOOD_BG = {
  neutral: ["#4d5a74", "#465269"],
  happy: ["#4d6e5c", "#456354"],
  injured: ["#6e4d55", "#63454c"],
  tired: ["#4d5f74", "#455669"],
  sad: ["#565d6b", "#4d5461"],
};

function bgCells(mood) {
  const [a, b] = MOOD_BG[mood] || MOOD_BG.neutral;
  const cells = [{ x: 0, y: 0, w: GRID, h: GRID, c: a }];
  // 8×8 cell 的棋盘块（= 旧 4×4 的 2×）
  for (let by = 0; by < 4; by++) {
    for (let bx = 0; bx < 4; bx++) {
      if ((bx + by) % 2 === 1) {
        cells.push({ x: bx * 8, y: by * 8, w: 8, h: 8, c: b });
      }
    }
  }
  return cells;
}

/**
 * 发型（覆盖在脸之上）。每款返回 cell 数组（32 空间）。
 * H=发色 Hh=高光 S=肤色（发际线用）
 */
function hairCells(styleId, H, Hh, S) {
  const Hd = shiftHex(H, -22);
  switch (styleId) {
    case 0: // 平顶（国夫头）
      return [
        R(7, 24, 0, OUT), C(6, 1, 7, OUT), C(25, 1, 7, OUT),
        Box(7, 24, 1, 6, H), R(7, 24, 7, Hd),
        R(9, 15, 2, Hh), R(8, 12, 3, Hh),
        R(7, 10, 8, H), R(22, 24, 8, H),
      ];
    case 1: // 飞机头（リーゼント）
      return [
        R(15, 25, 0, OUT), P(26, 1, OUT), P(27, 2, OUT), P(28, 3, OUT),
        R(7, 14, 1, OUT), P(6, 2, OUT),
        Box(15, 25, 1, 3, H), R(26, 27, 2, H), P(27, 3, H),
        Box(7, 26, 3, 7, H), R(6, 25, 7, Hd),
        R(18, 24, 1, Hh), R(20, 25, 2, Hh), P(25, 3, Hh),
        R(7, 10, 8, H), R(22, 24, 8, H),
      ];
    case 2: // 刺猬头
      return [
        P(8, 0, OUT), P(14, 0, OUT), P(20, 0, OUT), P(25, 1, OUT),
        P(7, 1, H), P(9, 1, H), P(13, 1, H), P(15, 1, H),
        P(19, 1, H), P(21, 1, H), P(24, 2, H),
        R(6, 25, 3, OUT), Box(7, 24, 4, 7, H), R(7, 24, 7, Hd),
        P(10, 4, Hh), P(11, 4, Hh), P(16, 3, Hh), P(17, 3, Hh), P(22, 4, Hh),
        R(7, 10, 8, H), R(22, 24, 8, H),
      ];
    case 3: { // 寸头
      const buzz = mixHex(H, S, 0.3);
      return [
        R(9, 22, 3, OUT), P(8, 4, OUT), P(23, 4, OUT),
        R(7, 24, 5, buzz), R(6, 25, 6, buzz), R(7, 24, 7, Hd),
        P(9, 5, Hh), P(13, 5, Hh), P(17, 5, Hh), P(21, 5, Hh),
      ];
    }
    case 4: // 侧分
      return [
        R(9, 23, 0, OUT), P(8, 1, OUT), C(6, 2, 7, OUT), C(25, 2, 8, OUT),
        Box(7, 24, 1, 5, H), R(7, 18, 6, H), R(7, 14, 7, Hd),
        R(9, 15, 2, Hh), R(8, 12, 3, Hh),
        R(7, 10, 8, H), R(23, 24, 7, H), P(24, 9, H),
      ];
    case 5: // 锅盖头（刘海到眉上）
      return [
        R(9, 22, 0, OUT), P(7, 1, OUT), P(8, 1, OUT), P(23, 1, OUT), P(24, 1, OUT),
        Box(6, 25, 2, 7, H), R(7, 24, 8, Hd),
        R(8, 14, 2, Hh), R(9, 13, 3, Hh),
        R(6, 10, 9, H), R(21, 25, 9, H), P(7, 10, H), P(24, 10, H),
      ];
    case 6: // 爆炸头
      return [
        R(9, 22, 0, H), R(6, 25, 1, H), R(4, 27, 3, H),
        Box(3, 28, 4, 7, H), C(4, 8, 11, H), C(27, 8, 11, H),
        P(5, 2, H), P(8, 2, H), P(14, 2, H), P(19, 2, H), P(24, 2, H), P(27, 2, H),
        P(7, 3, Hh), P(12, 1, Hh), P(17, 4, Hh), P(23, 2, Hh), P(26, 5, Hh),
        P(5, 7, Hd), P(10, 5, Hd), P(21, 6, Hd), P(27, 8, Hd),
      ];
    case 7: // 短卷
      return [
        R(9, 12, 1, H), R(15, 18, 1, H), R(21, 24, 1, H),
        R(7, 10, 3, H), R(12, 16, 3, H), R(18, 22, 3, H), R(24, 25, 3, H),
        Box(6, 25, 4, 7, H), R(7, 24, 7, Hd),
        P(10, 4, Hh), P(15, 2, Hh), P(19, 4, Hh), P(24, 2, Hh),
        R(7, 10, 8, H), R(22, 24, 8, H),
      ];
    case 8: { // 光头渐层
      const fade = mixHex(H, S, 0.45);
      const gloss = mixHex(S, "#ffffff", 0.3);
      return [
        R(9, 22, 4, fade), P(8, 5, fade), P(23, 5, fade),
        C(6, 7, 11, fade), C(25, 7, 11, fade),
        R(12, 16, 5, gloss), P(11, 6, gloss),
      ];
    }
    case 9: // 90s 长发
      return [
        R(9, 22, 0, OUT), P(7, 1, OUT), P(8, 1, OUT), P(23, 1, OUT), P(24, 1, OUT),
        Box(6, 25, 2, 7, H), C(4, 6, 17, H), C(5, 7, 18, Hd),
        C(26, 7, 18, Hd), C(27, 6, 17, H),
        P(4, 18, OUT), P(5, 19, OUT), P(26, 19, OUT), P(27, 18, OUT),
        R(9, 15, 2, Hh), R(8, 12, 3, Hh),
      ];
    case 10: // 莫霍克
      return [
        R(14, 17, 0, OUT), R(13, 18, 1, OUT),
        Box(14, 17, 1, 7, H), R(13, 18, 2, H), R(14, 17, 7, Hd),
        P(15, 2, Hh), P(16, 3, Hh), P(15, 5, Hh),
        R(8, 11, 7, Hd), R(20, 23, 7, Hd),
      ];
    case 11: // 鲻鱼头（短顶长后）
      return [
        R(8, 23, 0, OUT), P(7, 1, OUT), P(24, 1, OUT),
        Box(8, 23, 1, 6, H), R(8, 23, 6, Hd),
        C(5, 7, 18, H), C(6, 8, 19, Hd), C(25, 8, 19, Hd), C(26, 7, 18, H),
        R(10, 15, 2, Hh), R(9, 13, 3, Hh),
      ];
    case 12: // 头带短发
      return [
        R(8, 23, 3, OUT), Box(8, 23, 4, 7, H), R(8, 23, 7, Hd),
        R(7, 24, 8, "#e11d48"), R(8, 23, 9, "#be123c"),
        P(10, 5, Hh), P(15, 5, Hh), P(20, 5, Hh),
      ];
    case 13: // 顶髻 / 束发
      return [
        R(9, 22, 3, OUT), Box(8, 23, 4, 7, H), R(8, 23, 7, Hd),
        Box(13, 18, 0, 3, H), R(14, 17, 1, Hh), P(12, 2, OUT), P(19, 2, OUT),
        R(8, 11, 8, H), R(20, 23, 8, H),
      ];
    default:
      return [Box(6, 25, 4, 5, "#26221f")];
  }
}

/** 眉+眼+嘴（心情决定）；锅盖头(5)刘海压到眉线，一律用平眉防穿模 */
function faceCells(mood, look, styleId, facialInjury = false) {
  const expressionMood = mood === "injured" && !facialInjury ? "sad" : mood;
  const browColor = mixHex(look.hairHex, OUT, look.darkSkin ? 0.3 : 0.55);
  const cheek = mixHex(look.skin, "#b85c55", look.darkSkin ? 0.12 : 0.22);
  const face = look.face || {
    eyeStyle: 0, browStyle: 0, mouthStyle: 0, noseStyle: 0, gaze: 0, shape: 0, earStyle: 0, eyeSpacing: 0,
  };
  const flatOnly = styleId === 5;
  const parts = [];
  const spacing = face.eyeSpacing || 0;
  const leftEyeStart = 9 + spacing;
  const rightEyeStart = 18 - spacing;

  // —— 眉毛：状态负责情绪，种子负责普通状态下的天生眉形 ——
  if (expressionMood === "happy") {
    parts.push(R(10, 13, 9, browColor), R(18, 21, 9, browColor));
  } else if (expressionMood === "tired") {
    parts.push(R(9, 13, 11, browColor), R(18, 22, 11, browColor));
  } else if (expressionMood === "sad") {
    // 垂眉：外低内高
    parts.push(P(9, 10, browColor), R(10, 11, 9, browColor), R(12, 13, 8, browColor));
    parts.push(R(18, 19, 8, browColor), R(20, 21, 9, browColor), P(22, 10, browColor));
  } else if (expressionMood === "injured") {
    parts.push(R(9, 12, 10, browColor), R(19, 22, 9, browColor));
  } else if (flatOnly || face.browStyle === 0) {
    // 平静直眉
    parts.push(R(9, 13, 9, browColor), R(18, 22, 9, browColor));
  } else if (face.browStyle === 1) {
    // 专注眉：只有一格倾斜，不再是旧版统一怒眉
    parts.push(R(9, 11, 9, browColor), R(12, 13, 10, browColor));
    parts.push(R(20, 22, 9, browColor), R(18, 19, 10, browColor));
  } else if (face.browStyle === 2) {
    // 轻扬眉
    parts.push(P(9, 9, browColor), R(10, 12, 8, browColor), P(13, 9, browColor));
    parts.push(P(18, 9, browColor), R(19, 21, 8, browColor), P(22, 9, browColor));
  } else {
    // 短眉，观感更年轻友善
    parts.push(R(10, 13, 9, browColor), R(18, 21, 9, browColor));
  }

  // 普通眼睛：四种眼型 + 三种目光方向；两眼始终同步，避免斜视感。
  const openEyes = () => {
    const lp = Math.max(leftEyeStart + 1, Math.min(leftEyeStart + 3, leftEyeStart + 2 + face.gaze));
    const rp = Math.max(rightEyeStart + 1, Math.min(rightEyeStart + 3, rightEyeStart + 2 + face.gaze));
    if (face.eyeStyle === 1) {
      // 圆眼
      parts.push(R(leftEyeStart + 1, leftEyeStart + 3, 11, EYE), P(leftEyeStart, 12, EYE), P(leftEyeStart + 4, 12, EYE), R(leftEyeStart + 1, leftEyeStart + 3, 13, EYE));
      parts.push(R(rightEyeStart + 1, rightEyeStart + 3, 11, EYE), P(rightEyeStart, 12, EYE), P(rightEyeStart + 4, 12, EYE), R(rightEyeStart + 1, rightEyeStart + 3, 13, EYE));
      parts.push(R(leftEyeStart + 1, leftEyeStart + 3, 12, EYEWHITE), R(rightEyeStart + 1, rightEyeStart + 3, 12, EYEWHITE), P(lp, 12, EYE), P(rp, 12, EYE));
    } else if (face.eyeStyle === 2) {
      // 细长眼，但保持水平眼线，避免眯眼坏笑
      parts.push(R(leftEyeStart, leftEyeStart + 4, 12, EYE), R(leftEyeStart + 1, leftEyeStart + 3, 13, EYEWHITE), P(lp, 13, EYE));
      parts.push(R(rightEyeStart, rightEyeStart + 4, 12, EYE), R(rightEyeStart + 1, rightEyeStart + 3, 13, EYEWHITE), P(rp, 13, EYE));
    } else if (face.eyeStyle === 3) {
      // 柔和短眼
      parts.push(R(leftEyeStart + 1, leftEyeStart + 4, 11, EYE), R(leftEyeStart + 1, leftEyeStart + 3, 12, EYEWHITE), P(lp, 12, EYE));
      parts.push(R(rightEyeStart, rightEyeStart + 3, 11, EYE), R(rightEyeStart + 1, rightEyeStart + 3, 12, EYEWHITE), P(rp, 12, EYE));
    } else {
      // 标准开眼
      parts.push(R(leftEyeStart, leftEyeStart + 4, 11, EYE), R(leftEyeStart + 1, leftEyeStart + 3, 12, EYEWHITE), P(lp, 12, EYE));
      parts.push(R(rightEyeStart, rightEyeStart + 4, 11, EYE), R(rightEyeStart + 1, rightEyeStart + 3, 12, EYEWHITE), P(rp, 12, EYE));
    }
  };

  // —— 眼睛：伤病 / 疲惫覆盖天生眼型，其余状态保留个人差异 ——
  if (expressionMood === "injured") {
    // 左眼闭合线 + 右眼正常 + 淤青
    parts.push(R(9, 13, 12, EYE), P(10, 11, EYE), P(12, 13, EYE));
    parts.push(R(18, 22, 12, EYE), R(19, 21, 13, EYEWHITE), P(19, 13, EYE));
    parts.push(P(21, 14, "#a15b50"), P(22, 14, "#8f4a48"));
  } else if (expressionMood === "tired") {
    parts.push(R(9, 13, 12, EYE), R(18, 22, 12, EYE));
    parts.push(P(24, 8, "#b7ecff"), P(24, 9, "#8fd7f2"), P(25, 10, "#5db6dc"));
  } else if (expressionMood === "happy" && face.eyeStyle % 2 === 0) {
    // 一半球员开心时眯成上扬弧线，另一半仍保留开眼笑
    parts.push(P(9, 12, EYE), R(10, 12, 13, EYE), P(13, 12, EYE));
    parts.push(P(18, 12, EYE), R(19, 21, 13, EYE), P(22, 12, EYE));
  } else {
    openEyes();
  }

  // —— 三种小鼻型；去掉旧版横向三格鼻影，避免像胡子 ——
  if (face.noseStyle === 1) {
    parts.push(P(15, 14, look.skinShade), P(15, 15, look.skinShade), P(16, 16, look.skinShade));
  } else if (face.noseStyle === 2) {
    parts.push(P(16, 14, look.skinShade), P(16, 15, look.skinShade), P(15, 16, look.skinShade));
  } else {
    parts.push(P(16, 15, look.skinShade), P(15, 16, look.skinShade));
  }

  // —— 嘴：状态决定情绪，neutral 仍有四种自然嘴型 ——
  if (expressionMood === "happy") {
    if (face.mouthStyle % 2 === 0) {
      parts.push(P(11, 17, OUT), R(12, 19, 18, OUT), P(20, 17, OUT));
      parts.push(R(13, 18, 18, "#fdf6ea"), R(14, 17, 19, MOUTH));
    } else {
      parts.push(P(12, 18, MOUTH), R(13, 18, 19, MOUTH), P(19, 18, MOUTH));
    }
    parts.push(P(9, 16, cheek), P(22, 16, cheek));
  } else if (expressionMood === "sad" || expressionMood === "injured") {
    parts.push(R(14, 17, 17, MOUTH), P(13, 18, MOUTH), P(18, 18, MOUTH));
  } else if (face.mouthStyle === 1) {
    // 很轻的友善弧线
    parts.push(P(13, 18, MOUTH), R(14, 17, 19, MOUTH), P(18, 18, MOUTH));
  } else if (face.mouthStyle === 2) {
    // 坚定的短直嘴
    parts.push(R(14, 17, 18, OUT));
  } else if (face.mouthStyle === 3) {
    // 略张嘴，但保持居中对称
    parts.push(R(14, 17, 18, OUT), R(15, 16, 19, MOUTH));
  } else {
    parts.push(R(14, 17, 18, MOUTH));
  }

  // —— 受伤绷带 ——
  if (expressionMood === "injured") {
    parts.push(R(8, 23, 5, "#e8e4da"), R(10, 21, 6, "#d4cfc2"));
    parts.push(P(7, 6, "#e8e4da"), P(24, 5, "#d4cfc2"));
  }

  // —— 2.0 小特征（与状态叠加，但不盖过情绪）——
  const acc = look.accessories || {};
  if (acc.freckles) {
    parts.push(P(11, 14, cheek), P(12, 15, cheek), P(20, 14, cheek), P(19, 15, cheek));
  }
  if (acc.scar && expressionMood !== "injured") {
    parts.push(P(20, 10, "#a15b50"), P(21, 11, "#8f4a48"), P(22, 12, "#a15b50"));
  }
  if (acc.stubble && expressionMood !== "happy") {
    const stub = mixHex(look.skinShade, look.hairHex, 0.35);
    parts.push(R(12, 19, 18, stub), P(11, 17, stub), P(20, 17, stub));
  }
  if (acc.beard && expressionMood !== "happy") {
    const beard = mixHex(look.hairHex, look.skinShade, 0.18);
    parts.push(R(11, 20, 19, beard), R(12, 19, 20, beard));
  }
  if (acc.headband && styleId !== 12) {
    parts.push(R(8, 23, 7, "#e11d48"), R(9, 22, 8, "#be123c"));
  }
  return parts;
}

/** 头部底盘：描边 + 脸 + 耳 + 下颚阴影 */
function headCells(look, age = 25) {
  const S = look.skin;
  const Sd = look.skinShade;
  const Sh = mixHex(S, "#fff7ed", 0.18);
  const face = look.face || {};
  const parts = [
    // 一格描边 + 阶梯式下颚，轮廓比旧版更圆润清楚
    R(9, 22, 3, OUT), R(7, 24, 4, OUT),
    P(6, 5, OUT), P(25, 5, OUT), C(6, 6, 18, OUT), C(25, 6, 18, OUT),
    P(5, 11, OUT), C(4, 12, 15, OUT), P(5, 16, OUT),
    P(26, 11, OUT), C(27, 12, 15, OUT), P(26, 16, OUT),
    P(7, 19, OUT), P(24, 19, OUT), R(8, 10, 20, OUT), R(21, 23, 20, OUT),
    P(11, 21, OUT), P(20, 21, OUT),
    // 脸、耳朵与下颚
    Box(7, 24, 5, 18, S), R(8, 23, 19, S), R(11, 20, 20, S),
    C(5, 12, 15, S), C(26, 12, 15, S), P(5, 14, Sd), P(26, 14, Sd),
    R(8, 10, 18, Sd), R(21, 23, 18, Sd), P(10, 19, Sd), P(21, 19, Sd),
    R(9, 13, 6, Sh), P(8, 7, Sh),
  ];
  if (face.shape === 1) {
    // Narrow jaw.
    parts.push(P(8, 19, S), P(23, 19, S), P(10, 20, S), P(21, 20, S));
  } else if (face.shape === 2) {
    // Broad jaw and stronger chin.
    parts.push(P(6, 19, OUT), P(25, 19, OUT), R(7, 10, 20, OUT), R(21, 24, 20, OUT), R(12, 19, 21, S));
  } else if (face.shape === 3) {
    // Longer, angular face.
    parts.push(P(8, 20, OUT), P(23, 20, OUT), R(10, 21, 21, OUT), R(12, 19, 20, S));
  }
  if (face.earStyle === 1) {
    parts.push(P(4, 11, S), P(27, 11, S), P(4, 16, S), P(27, 16, S));
  } else if (face.earStyle === 2) {
    parts.push(P(5, 13, Sd), P(26, 13, Sd), P(5, 15, Sd), P(26, 15, Sd));
  }
  if (age >= 32) {
    const line = mixHex(Sd, S, 0.45);
    parts.push(P(9, 15, line), P(22, 15, line));
  }
  if (age >= 40) {
    const wrinkle = mixHex(Sd, S, 0.25);
    parts.push(R(10, 13, 8, wrinkle), R(18, 21, 8, wrinkle));
    if (age >= 50) parts.push(R(13, 18, 5, wrinkle));
  }
  return parts;
}

/** 球衣躯干（球员） */
function jerseyCells(kitP, kitS, pos, skin) {
  const collar = mixHex(kitS, "#ffffff", 0.25);
  const parts = [
    // 颈
    Box(12, 19, 20, 21, skin),
    // 肩线描边
    Box(4, 11, 22, 23, OUT),
    Box(20, 27, 22, 23, OUT),
    P(2, 24, OUT), P(3, 24, OUT), P(28, 24, OUT), P(29, 24, OUT),
    // 领口
    Box(12, 19, 22, 23, collar),
    // 躯干
    Box(2, 29, 24, 31, kitP),
    // 插肩袖（副色）
    Box(2, 5, 24, 31, kitS),
    Box(26, 29, 24, 31, kitS),
    Box(6, 7, 24, 25, kitS),
    Box(24, 25, 24, 25, kitS),
    // 胸口小 V
    Box(14, 17, 24, 25, kitS),
  ];
  if (pos === "GK") {
    parts.push(Box(8, 23, 28, 29, mixHex(kitP, "#ffffff", 0.5)));
  }
  return parts;
}

/** 职员躯干：西装 / 风衣 / 白大褂 */
function staffTorsoCells(role, tieColor, skin) {
  if (role === "doctor") {
    return [
      Box(12, 19, 20, 21, skin),
      Box(4, 11, 22, 23, OUT), Box(20, 27, 22, 23, OUT),
      P(2, 24, OUT), P(3, 24, OUT), P(28, 24, OUT), P(29, 24, OUT),
      Box(2, 29, 24, 31, "#eef2f6"),
      Box(14, 17, 22, 31, "#d7dde5"),
      Box(14, 17, 26, 29, "#d84343"),
    ];
  }
  if (role === "scout") {
    return [
      Box(12, 19, 20, 21, skin),
      Box(4, 11, 22, 23, OUT), Box(20, 27, 22, 23, OUT),
      P(2, 24, OUT), P(3, 24, OUT), P(28, 24, OUT), P(29, 24, OUT),
      Box(2, 29, 24, 31, "#57503c"),
      Box(12, 19, 22, 23, "#6b6350"),
      Box(14, 17, 26, 27, "#403a2c"),
      Box(8, 9, 24, 31, "#4a4433"),
      Box(22, 23, 24, 31, "#4a4433"),
    ];
  }
  // coach / manager
  return [
    Box(12, 19, 20, 21, skin),
    Box(4, 11, 22, 23, OUT), Box(20, 27, 22, 23, OUT),
    P(2, 24, OUT), P(3, 24, OUT), P(28, 24, OUT), P(29, 24, OUT),
    Box(2, 29, 24, 31, "#2a3442"),
    Box(12, 19, 22, 23, "#e8ecf2"),
    Box(12, 13, 24, 25, "#e8ecf2"),
    Box(18, 19, 24, 25, "#e8ecf2"),
    Box(14, 17, 24, 27, tieColor),
    Box(14, 17, 28, 29, shiftHex(tieColor, -24)),
  ];
}

/** 球探鸭舌帽 */
function scoutCapCells() {
  return [
    Box(8, 23, 0, 1, OUT),
    Box(6, 25, 2, 5, "#6b6350"),
    Box(6, 27, 6, 7, "#57503c"),
    Box(24, 27, 6, 7, "#4a4433"),
    Box(8, 15, 2, 3, "#7d755f"),
  ];
}

// ============================================================
// 组装：cells → SVG / canvas-PNG
// ============================================================

/** 组装完整头像的单元格列表（绘制顺序即遮挡顺序） */
function composeCells(opts = {}) {
  const seed = opts.seed || opts.id || opts.name || "anon";
  const h = appearanceHash(seed);
  const role = opts.role || "player";
  const pos = opts.pos || "";
  const age = opts.age || 25;
  const mood = opts.mood || "neutral";
  const nation = opts.nation || null;

  const persisted = opts.skinTone || opts.hairColor || opts.hairStyle != null
    ? {
        skinTone: opts.skinTone || null,
        hairColor: opts.hairColor || null,
        hairStyle: opts.hairStyle,
      }
    : null;
  const look = lookFor(h, nation, age, persisted);

  const bgLum = luminance(MOOD_BG[mood]?.[0] || MOOD_BG.neutral[0]);
  const kitP = kitDisplayColor(opts.kitPrimary || "#3d8bfd", bgLum);
  let kitS = opts.kitSecondary || shiftHex(kitP, -42);
  {
    // 副色与主色太近时强制拉开
    const pr = parseInt(kitP.slice(1, 3), 16) || 0;
    const pg = parseInt(kitP.slice(3, 5), 16) || 0;
    const pb = parseInt(kitP.slice(5, 7), 16) || 0;
    const sr = parseInt(String(kitS).slice(1, 3), 16) || 0;
    const sg = parseInt(String(kitS).slice(3, 5), 16) || 0;
    const sb = parseInt(String(kitS).slice(5, 7), 16) || 0;
    if (Math.hypot(pr - sr, pg - sg, pb - sb) < 70) {
      const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
      kitS = lum > 140 ? mixHex(kitP, "#0f172a", 0.55) : mixHex(kitP, "#f8fafc", 0.45);
    }
  }

  const Hh = shiftHex(look.hairHex, 30);
  const isStaff = role !== "player";
  const torso = isStaff
    ? staffTorsoCells(role, role === "manager" ? "#3d8bfd" : "#b0433a", look.skin)
    : jerseyCells(kitP, kitS, pos, look.skin);
  const hairLayer =
    role === "scout" ? scoutCapCells() : hairCells(look.styleId, look.hairHex, Hh, look.skin);

  return [
    ...bgCells(mood),
    ...headCells(look, age),
    ...hairLayer,
    ...faceCells(mood, look, look.styleId, !!opts.facialInjury),
    ...torso,
  ];
}

function scaleCells(cells, fromGrid, toGrid) {
  const scale = toGrid / fromGrid;
  return cells.map((cell) => {
    const x0 = Math.round(cell.x * scale);
    const y0 = Math.round(cell.y * scale);
    const x1 = Math.round((cell.x + cell.w) * scale);
    const y1 = Math.round((cell.y + cell.h) * scale);
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), c: cell.c };
  });
}

/** 48-grid portrait details reuse the compact face identity instead of inventing a second likeness. */
function profileDetailCells(opts = {}) {
  const seed = opts.seed || opts.id || opts.name || "anon";
  const h = appearanceHash(seed);
  const age = opts.age || 25;
  const mood = opts.mood || "neutral";
  const persisted = opts.skinTone || opts.hairColor || opts.hairStyle != null
    ? { skinTone: opts.skinTone || null, hairColor: opts.hairColor || null, hairStyle: opts.hairStyle }
    : null;
  const look = lookFor(h, opts.nation || null, age, persisted);
  const face = look.face || {};
  const skinLight = mixHex(look.skin, "#fff7ed", 0.24);
  const skinMid = mixHex(look.skin, look.skinShade, 0.35);
  const hairLight = shiftHex(look.hairHex, 38);
  const hairDark = shiftHex(look.hairHex, -28);
  const parts = [];

  // Fine hair strands make the large portrait read as pixel art rather than a scaled thumbnail.
  if (look.styleId !== 8) {
    const strandSets = [
      [[14, 5], [18, 4], [23, 5], [28, 4], [33, 6]],
      [[13, 7], [17, 5], [22, 4], [27, 4], [32, 5], [36, 7]],
      [[15, 5], [20, 3], [25, 4], [30, 3], [34, 6]],
      [[16, 8], [20, 7], [25, 7], [30, 7]],
    ];
    for (const [x, y] of strandSets[look.styleId % strandSets.length]) parts.push(P(x, y, hairLight));
    parts.push(P(12, 10, hairDark), P(36, 11, hairDark), P(15, 12, hairDark), P(33, 12, hairDark));
  } else {
    parts.push(P(20, 8, skinLight), P(21, 8, skinLight), P(18, 9, skinLight));
  }

  // Extra facial modelling follows the compact face's stable eye spacing, gaze and nose style.
  const spacing = face.eyeSpacing || 0;
  const leftX = 17 + spacing;
  const rightX = 30 - spacing;
  if (!(mood === "injured" && opts.facialInjury)) {
    parts.push(P(leftX, 18, EYEWHITE), P(rightX, 18, EYEWHITE));
    if (mood !== "tired") {
      const gaze = face.gaze || 0;
      parts.push(P(leftX + gaze, 19, EYE), P(rightX + gaze, 19, EYE));
      parts.push(P(leftX + gaze, 18, "#ffffff"), P(rightX + gaze, 18, "#ffffff"));
    }
  }
  parts.push(P(22, 21, skinLight), P(23, 22, skinLight));
  if (face.noseStyle === 1) parts.push(P(24, 23, look.skinShade), P(25, 24, look.skinShade));
  else if (face.noseStyle === 2) parts.push(P(23, 23, look.skinShade), P(22, 24, look.skinShade));
  else parts.push(P(24, 24, look.skinShade));
  parts.push(P(12, 17, skinLight), P(13, 16, skinLight), P(35, 19, skinMid));

  // One-pixel lip and chin accents preserve the mood while adding definition at 96px.
  if (mood === "happy") {
    parts.push(R(21, 27, 28, "#fdf6ea"), R(22, 26, 29, MOUTH));
  } else if (mood === "sad" || mood === "injured") {
    parts.push(R(22, 26, 27, MOUTH), P(21, 28, MOUTH), P(27, 28, MOUTH));
  } else {
    parts.push(R(22, 26, 28, MOUTH), P(24, 29, skinMid));
  }

  if (age >= 32) parts.push(P(15, 22, skinMid), P(33, 22, skinMid));
  if (age >= 40) {
    parts.push(R(15, 19, 15, skinMid), R(29, 33, 15, skinMid));
    parts.push(P(16, 21, skinMid), P(32, 21, skinMid));
  }
  if (age >= 50) parts.push(R(21, 27, 9, skinMid), P(19, 25, skinMid), P(29, 25, skinMid));

  // Shirt seams and collar are visible only in the profile portrait.
  const kitPrimary = kitDisplayColor(opts.kitPrimary || "#3d8bfd");
  const kitSecondary = opts.kitSecondary || shiftHex(kitPrimary, -42);
  if ((opts.role || "player") === "player") {
    parts.push(R(8, 17, 37, shiftHex(kitPrimary, 24)), R(30, 39, 37, shiftHex(kitPrimary, 24)));
    parts.push(P(22, 37, kitSecondary), P(25, 37, kitSecondary), R(23, 24, 38, kitSecondary));
  } else {
    parts.push(R(8, 18, 37, "#3f4b5d"), R(29, 39, 37, "#3f4b5d"));
  }
  return parts;
}

function composeProfileCells(opts = {}) {
  return [
    ...scaleCells(composeCells(opts), GRID, PROFILE_GRID),
    ...profileDetailCells(opts),
  ];
}

function avatarCellSource(opts = {}) {
  const detail = opts.detail === "profile" ? "profile" : "compact";
  return detail === "profile"
    ? { cells: composeProfileCells(opts), grid: PROFILE_GRID, detail }
    : { cells: composeCells(opts), grid: GRID, detail };
}

/**
 * 渲染像素头像 SVG（热血风）。预览页 / 无 DOM 环境（node 校验）用；
 * 游戏内 avatarHtml 走 canvas-PNG（清晰度不受浏览器合成影响）。
 * @param {object} opts
 * @param {AvatarMood} [opts.mood]
 * @param {string} [opts.nation] 国籍 code（决定肤色/发色/发型分布）
 */
export function renderAvatarSvg(opts = {}) {
  const size = opts.size || 36;
  const mood = opts.mood || "neutral";
  const { cells, grid, detail } = avatarCellSource(opts);
  const CELL = 2;
  const VB = grid * CELL;
  const rects = cells
    .map(
      (r) =>
        `<rect x="${r.x * CELL}" y="${r.y * CELL}" width="${r.w * CELL}" height="${r.h * CELL}" fill="${r.c}"/>`
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}" class="avatar-svg avatar-pixel" shape-rendering="crispEdges" data-grid="${grid}" data-detail="${detail}" data-mood="${mood}" data-ini="${escapeAttr(initials(opts.name))}" aria-hidden="true">${rects}</svg>`;
}

/** PNG 缓存：同一 (种子|心情|球衣|尺寸|DPR) 只画一次 canvas */
const pngCache = new Map();
const PNG_CACHE_MAX = 800;

/**
 * 渲染像素头像 PNG data-URI（canvas 内部保持整数 cell，显示层可平滑缩小）。
 * 仅浏览器可用；无 DOM 时返回 null（调用方回退 SVG）。
 */
export function renderAvatarPngUri(opts = {}) {
  if (typeof document === "undefined") return null;
  const size = opts.size || 36;
  const dpr = Math.max(1, Math.min(3, (typeof window !== "undefined" && window.devicePixelRatio) || 1));
  const key = [
    opts.seed || opts.id || opts.name || "anon",
    opts.role || "player",
    opts.pos || "",
    opts.age || 25,
    opts.nation || "",
    opts.skinTone || "",
    opts.hairColor || "",
    opts.hairStyle ?? "",
    opts.mood || "neutral",
    opts.facialInjury ? "face-injury" : "body-injury",
    opts.detail || "compact",
    opts.kitPrimary || "",
    opts.kitSecondary || "",
    size,
    dpr,
  ].join("|");
  const hit = pngCache.get(key);
  if (hit) return hit;

  // 至少生成 64px 源图再交给浏览器缩小：小头像的单格轮廓不会因 28/30px
  // 这类非整数比例被放大成不均匀方块，高分屏仍按整数 cell 绘制。
  const { cells, grid } = avatarCellSource(opts);
  const k = Math.max(1, Math.ceil((size * dpr) / grid));
  const px = grid * k;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  for (const r of cells) {
    ctx.fillStyle = r.c;
    ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
  }
  const uri = canvas.toDataURL("image/png");
  if (pngCache.size >= PNG_CACHE_MAX) pngCache.clear();
  pngCache.set(key, uri);
  return uri;
}

/**
 * 根据球员状态推断表情（优先级：伤 > 低士气 > 高士气开心 > 低体能疲惫 > 默认）
 * @returns {AvatarMood}
 */
export function moodFromPlayer(player) {
  if (!player) return "neutral";
  if ((player.injured || 0) > 0) return "injured";
  const morale = player.morale ?? 70;
  const fitness = player.fitness ?? 80;
  if (morale <= 40) return "sad";
  if (morale >= 82) return "happy";
  if (fitness <= 50) return "tired";
  if (fitness <= 62 && morale < 60) return "tired";
  return "neutral";
}

/** Only a diagnosed head or facial injury should alter the player's face. */
export function hasFacialInjury(player) {
  if (!player || (player.injured || 0) <= 0) return false;
  const injury = player.injury || {};
  const text = `${injury.key || ""} ${injury.label || ""} ${injury.labelEn || ""}`.toLowerCase();
  return /head|face|facial|concussion|eye|nose|jaw|cheek|头|面|脑震荡|眼|鼻|颌|下巴/.test(text);
}

export function avatarHtml(person, opts = {}) {
  if (!person) return "";
  const role = opts.role || person.role || (person.pos ? "player" : "manager");
  const size = opts.size || 36;
  const kitPrimary = opts.kitPrimary || opts.kit?.primary;
  const kitSecondary = opts.kitSecondary || opts.kit?.secondary;
  const detail = opts.detail || (size >= 80 ? "profile" : "compact");
  let mood = opts.mood;
  if (!mood && role === "player") mood = moodFromPlayer(person);
  if (!mood) mood = "neutral";

  // 稳定身份：appearanceSeed → id → name（与资产映射、程序脸一致）
  const seedKey = playerAppearanceKey(person);

  const renderOpts = {
    seed: seedKey,
    id: person.id,
    name: person.name,
    role,
    pos: person.pos,
    age: person.age,
    nation: person.nationality || null,
    skinTone: person.skinTone || null,
    hairColor: person.hairColor || null,
    hairStyle: person.hairStyle,
    kitPrimary,
    kitSecondary,
    size,
    mood,
    facialInjury: role === "player" && hasFacialInjury(person),
    detail,
  };
  // 全场景统一：热血程序脸 2.1
  const pngUri = renderAvatarPngUri(renderOpts);
  const svgFallback = () => renderAvatarSvg(renderOpts);

  let inner;
  if (pngUri) {
    inner = `<img class="avatar-px" src="${pngUri}" width="${size}" height="${size}" alt="" draggable="false">`;
  } else {
    inner = svgFallback();
  }

  const moodTip =
    mood === "injured"
      ? " · 受伤"
      : mood === "happy"
        ? " · 状态佳"
        : mood === "sad"
          ? " · 士气低"
          : mood === "tired"
            ? " · 疲惫"
            : "";
  const label = (person.name || "") + moodTip;
  const cls = `avatar avatar-${detail} mood-${mood}${opts.className ? " " + opts.className : ""}`;
  return `<span class="${cls}" style="width:${size}px;height:${size}px;--avatar-size:${size}px" title="${escapeAttr(
    label
  )}" role="img" aria-label="${escapeAttr(label)}">${inner}${moodOverlayHtml(mood)}</span>`;
}

/** 状态角标（伤/佳/低/疲） */
function moodOverlayHtml(mood) {
  if (!mood || mood === "neutral") return "";
  const label =
    mood === "injured" ? "伤" :
    mood === "happy" ? "佳" :
    mood === "sad" ? "低" :
    mood === "tired" ? "疲" : "";
  if (!label) return "";
  return `<span class="avatar-mood-overlay mood-${mood}" aria-hidden="true">${label}</span>`;
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}


/** 兼容旧调用：程序脸无需异步着色 */
export function hydrateAvatarKitRecolor() {}

export function playerAvatarKitColors(club) {
  return {
    primary: club?.kit?.primary || club?.color || "#3d8bfd",
    secondary: club?.kit?.secondary || club?.kit?.secondaryColor || null,
  };
}

export function playerAvatarHtml(player, club, size = 36) {
  const { primary: kitPrimary, secondary: kitSecondary } = playerAvatarKitColors(club);
  return avatarHtml(player, {
    role: "player",
    size,
    kitPrimary,
    kitSecondary,
    mood: moodFromPlayer(player),
  });
}

export function staffAvatarHtml(staff, size = 48) {
  return avatarHtml(staff, {
    role: staff?.role || "coach",
    size,
    mood: "neutral",
  });
}

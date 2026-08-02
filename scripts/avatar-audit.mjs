import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  APPEARANCE_HAIR_STYLE_IDS,
  APPEARANCE_STYLE_AFRO,
  APPEARANCE_STYLE_DEFAULT,
  APPEARANCE_STYLE_EASIA,
  generatePlayerAppearance,
} from "../js/appearance.js";
import { hasFacialInjury, renderAvatarSvg } from "../js/avatar.js";
import { generatePlayerAppearance as generateFromModels } from "../js/models.js";

const nations = ["ENG", "FRA", "GER", "ESP", "ITA", "JPN", "NGA", "BRA", "USA", "MAR"];
const repo = resolve(import.meta.dirname, "..");
const players = Array.from({ length: 640 }, (_, index) => ({
  id: `avatar-audit-${index}`,
  name: `Player ${index}`,
  age: 18 + (index % 43),
  nationality: nations[index % nations.length],
  pos: ["GK", "DEF", "MID", "ATT"][index % 4],
}));

for (const player of players) {
  assert.deepEqual(
    generateFromModels(player),
    generatePlayerAppearance(player),
    "models and avatar pipeline must share one appearance generator"
  );
}

const styles = new Set(players.map((player) => generatePlayerAppearance(player).hairStyle));
assert.ok(styles.size >= 11, `large sample should cover most hairstyles, got ${styles.size}`);
assert.ok(
  APPEARANCE_HAIR_STYLE_IDS.every((id) =>
    [...APPEARANCE_STYLE_DEFAULT, ...APPEARANCE_STYLE_EASIA, ...APPEARANCE_STYLE_AFRO]
      .some(([style]) => style === id)
  ),
  "shared profiles should not silently orphan hairstyle ids"
);

const signatures = new Set(
  players.slice(0, 160).map((player) => {
    const look = generatePlayerAppearance(player);
    return `${look.skinTone}|${look.hairColor}|${look.hairStyle}|${renderAvatarSvg({
      ...look,
      seed: look.appearanceSeed,
      nation: player.nationality,
      age: player.age,
      size: 64,
    })}`;
  })
);
assert.ok(signatures.size >= 150, `stable face traits should limit exact collisions, got ${signatures.size}/160`);

const bodyInjury = {
  injured: 5,
  injury: { key: "hamstring", label: "腿后肌拉伤", labelEn: "Hamstring strain" },
};
const facialInjury = {
  injured: 5,
  injury: { key: "facial-knock", label: "面部挫伤", labelEn: "Facial bruise" },
};
assert.equal(hasFacialInjury(bodyInjury), false, "lower-body injury must not draw facial trauma");
assert.equal(hasFacialInjury(facialInjury), true, "diagnosed facial injury should draw facial trauma");

const base = { seed: "age-audit", nation: "ENG", hairStyle: 4, hairColor: "brown", skinTone: "fair", size: 64 };
const young = renderAvatarSvg({ ...base, age: 20 });
const mature = renderAvatarSvg({ ...base, age: 45 });
const senior = renderAvatarSvg({ ...base, age: 55 });
assert.notEqual(young, mature, "mature avatars should visibly age");
assert.notEqual(mature, senior, "senior avatars should gain another age tier");

const compactPortrait = renderAvatarSvg({ ...base, age: 25, size: 32, detail: "compact" });
const profilePortrait = renderAvatarSvg({ ...base, age: 25, size: 96, detail: "profile" });
assert.match(compactPortrait, /data-grid="32" data-detail="compact"/, "list portrait must retain the 32-grid renderer");
assert.match(profilePortrait, /data-grid="48" data-detail="profile"/, "profile portrait must use the native 48-grid renderer");
for (const attr of profilePortrait.matchAll(/(?:x|y|width|height)="(\d+)"/g)) {
  assert.ok(Number(attr[1]) <= 96, `profile portrait coordinate must stay inside its 48-grid viewBox: ${attr[0]}`);
}

const mainSource = readFileSync(resolve(repo, "js/main.js"), "utf8");
const smallAvatarSizes = [
  ...mainSource.matchAll(/(?:playerAvatarHtml|staffAvatarHtml)\([^\n]*?,\s*(\d+)\)/g),
].map((match) => Number(match[1])).filter((size) => size < 40);
assert.ok(smallAvatarSizes.length > 0, "audit should find small avatar call sites");
assert.ok(
  smallAvatarSizes.every((size) => size === 32),
  `small list avatars must use the 32px grid: ${[...new Set(smallAvatarSizes)].join(", ")}`
);
assert.match(mainSource, /playerAvatarHtml\(player, displayTeam, 96\)/, "player profile portrait must use 96px");
const cssSource = readFileSync(resolve(repo, "css/style.css"), "utf8");
assert.match(cssSource, /image-rendering:\s*pixelated/, "pixel avatars must retain hard edges");
const avatarSource = readFileSync(resolve(repo, "js/avatar.js"), "utf8");
assert.doesNotMatch(avatarSource, /function scaleCells\(/, "profile portraits must not use fractional compact-grid scaling");
assert.match(avatarSource, /function profileHeadCells\(/, "profile portraits need a native head component");
assert.match(avatarSource, /function profileFaceCells\(/, "profile portraits need one native facial anchor system");
assert.match(avatarSource, /detail: "compact-fallback"/, "invalid profile cells must safely fall back to compact rendering");
assert.match(avatarSource, /const PROFILE_ART_VERSION = 2;/, "profile art changes must invalidate the browser PNG cache");
assert.match(avatarSource, /Box\(start \+ gaze, start \+ gaze \+ 1, 19, 20, EYE\)/, "profile eyes should use readable 2x2 pupils");
assert.doesNotMatch(avatarSource, /R\(17, 30, 30, beard\)/, "ordinary stubble must not form a solid jaw band");

console.log(JSON.stringify({
  samples: players.length,
  hairstyles: styles.size,
  uniqueFaces: signatures.size,
  smallAvatarSize: 32,
  profileAvatarSize: 96,
  profileGrid: 48,
}, null, 2));

import assert from "node:assert/strict";
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

console.log(JSON.stringify({ samples: players.length, hairstyles: styles.size, uniqueFaces: signatures.size }, null, 2));

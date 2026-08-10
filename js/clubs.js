/**
 * 七国 270 家原创俱乐部（15 联赛 × 18 队，v152 起双循环 34 轮）。
 * 旧名称仅保留在 legacyName 迁移字段中；clubId 与虚构品牌层稳定。
 */

import { COUNTRY_BRANDING, LEAGUE_BRANDING } from "./branding.js";

const BRAND_COLORS = [
  "#0f766e", "#b91c1c", "#1d4ed8", "#a16207", "#7e22ce", "#047857",
  "#be123c", "#0369a1", "#4d7c0f", "#c2410c", "#4338ca", "#0e7490",
  "#86198f", "#15803d", "#9f1239", "#1e40af", "#92400e", "#6d28d9",
  "#166534", "#c026d3", "#075985", "#3f6212", "#9a3412", "#334155",
];
const KIT_STYLES = ["solid", "stripes", "halves", "sash", "hoops"];
const CREST_SHAPES = ["circle", "shield", "diamond", "hexagon", "striped-shield"];
const CREST_SYMBOLS = ["peak", "river", "star", "tower", "tree", "wing"];
const STADIUM_SUFFIXES = [
  ["Park", "公园球场"],
  ["Ground", "球场"],
  ["Arena", "竞技场"],
  ["Field", "运动场"],
];

let brandingIndex = 0;
const usedShortNames = new Set();
const SHORT_NAME_BLOCKS = new Map([
  ["AC", "AC"],
  ["AS", "AS"],
  ["CF", "CF"],
  ["FC", "FC"],
  ["SC", "SC"],
  ["SV", "SV"],
  ["VFR", "VFR"],
]);
const SHORT_NAME_CONNECTORS = new Set(["D", "DA", "DE", "DEL", "DI", "DO", "LA", "THE"]);
const SHORT_NAME_ORGANIZATIONS = new Set([
  ...SHORT_NAME_BLOCKS.keys(),
  "ATHLETIC",
  "ATLETICO",
  "BOROUGH",
  "CALCIO",
  "CITY",
  "CLUB",
  "COUNTY",
  "DEPORTIVO",
  "EINTRACHT",
  "FORTUNA",
  "OLYMPIQUE",
  "RACING",
  "ROVERS",
  "SPORTING",
  "SPORTIVA",
  "STADE",
  "TOWN",
  "UNION",
  "UNIONE",
  "UNITED",
  "VALE",
  "VIRTUS",
  "WANDERERS",
]);
const SHORT_NAME_OVERRIDES = Object.freeze({
  raven: "RBA",
  village: "GHV",
  harbor3: "WBW",
  sol_4_02: "DVA",
  sol_4_11: "MZS",
  sol_4_16: "SCU",
  sol_5_01: "MLD",
  sol_5_10: "VDS",
  eis_6_04: "EFA",
  eis_6_10: "FWT",
  eis_7_03: "VFG",
  eis_7_09: "ESH",
  eis_7_14: "EAH",
  eis_7_16: "FMD",
  bel_8_02: "FMV",
  bel_8_09: "AUN",
  bel_8_14: "UMA",
  bel_8_17: "CMC",
  bel_9_04: "UVS",
  bel_9_05: "VCS",
  bel_9_11: "VMC",
  bel_9_12: "AVO",
  bel_9_15: "UCR",
  bel_9_17: "AMA",
  lum_10_01: "FBM",
  lum_10_03: "OMC",
  lum_10_13: "MDR",
  lum_10_17: "UMT",
  lum_10_18: "SVC",
  lum_11_03: "UPL",
  lum_11_04: "SHR",
  lum_11_05: "CLV",
  lum_11_08: "ORP",
  lum_11_09: "UBP",
  lum_11_14: "UBR",
  lum_11_15: "SRZ",
  lum_11_16: "FHB",
  lum_11_18: "OVD",
});

function contrastText(hex) {
  const h = String(hex || "").replace("#", "");
  const rgb = [0, 2, 4].map((offset) => parseInt(h.slice(offset, offset + 2), 16) || 0);
  const luminance = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return luminance > 145 ? "#111827" : "#ffffff";
}

function cityFromEnglishName(name) {
  return String(name)
    .replace(/\b(AC|AS|CF|FC|SC|SV|VfR|Athletic|Borough|Calcio|City|Club|County|Deportivo|Eintracht|Fortuna|Olympique|Racing|Rovers|Sporting|Sportiva|Stade|Town|Union|Unión|Unione|United|Vale|Virtus|Wanderers|Atletico|Atlético)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cityFromChineseName(name) {
  return String(name)
    .replace(/(足球俱乐部|竞技协会|奥林匹克|自治镇|流浪者|漫游者|维尔图斯|体育会|竞速会|足球会|竞技会|团结队|福图纳|俱乐部|郡队|竞技|体育|联盟|城|谷)$/u, "")
    .trim();
}

function shortNameTokens(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^A-Za-z]+/g, " ")
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);
}

function makeShortName(nameEn, cityEn, clubId) {
  const override = SHORT_NAME_OVERRIDES[clubId];
  if (override) {
    if (usedShortNames.has(override)) throw new Error(`Duplicate club short name override: ${override}`);
    usedShortNames.add(override);
    return override;
  }

  const nameTokens = shortNameTokens(nameEn).filter((token) => !SHORT_NAME_CONNECTORS.has(token));
  const cityTokens = shortNameTokens(cityEn).filter((token) => !SHORT_NAME_CONNECTORS.has(token));
  const identityTokens = nameTokens.filter((token) => !SHORT_NAME_ORGANIZATIONS.has(token));
  const identityCompact = (cityTokens.length ? cityTokens : identityTokens.length ? identityTokens : nameTokens).join("");
  const initialism = nameTokens
    .map((token) => SHORT_NAME_BLOCKS.get(token) || token[0])
    .join("")
    .slice(0, 4);
  const organization = nameTokens
    .filter((token) => SHORT_NAME_ORGANIZATIONS.has(token))
    .map((token) => SHORT_NAME_BLOCKS.get(token) || token[0])
    .join("");
  const firstIdentityIndex = nameTokens.findIndex((token) => !SHORT_NAME_ORGANIZATIONS.has(token));
  const firstOrganizationIndex = nameTokens.findIndex((token) => SHORT_NAME_ORGANIZATIONS.has(token));
  const coreThree = identityCompact.slice(0, 3);
  const candidates = [];
  const add = (code) => {
    const normalized = String(code || "").replace(/[^A-Z]/g, "").slice(0, 4);
    if (/^[A-Z]{3,4}$/.test(normalized) && !candidates.includes(normalized)) candidates.push(normalized);
  };

  if (initialism.length >= 3) add(initialism);
  add(coreThree);
  if (organization && firstOrganizationIndex >= 0 && firstOrganizationIndex < firstIdentityIndex) {
    const organizationPrefix = organization.length >= 2 ? organization.slice(0, 2) : organization[0];
    add(`${organizationPrefix}${identityCompact.slice(0, 3 - organizationPrefix.length)}`);
  }
  if (organization) add(`${coreThree}${organization[0]}`);
  for (const char of identityCompact.slice(1)) add(`${initialism.slice(0, 3)}${char}`);
  add(identityCompact.slice(0, 4));
  const consonants = identityCompact[0] + identityCompact.slice(1).replace(/[AEIOU]/g, "");
  add(consonants.slice(0, 3));
  add(consonants.slice(0, 4));
  add(`${initialism}${identityCompact.slice(1)}`);
  for (const char of identityCompact.slice(2)) add(`${coreThree}${char}`);

  const code = candidates.find((candidate) => !usedShortNames.has(candidate));
  if (!code) throw new Error(`Unable to create a unique club short name for ${clubId}`);
  usedShortNames.add(code);
  return code;
}

// 层级从 LEAGUE_BRANDING 的 tier 派生，避免每加一个联赛都要手工维护集合。
const TOP_DIVISIONS = new Set(
  Object.values(LEAGUE_BRANDING).filter((l) => l.tier === 1).map((l) => l.id)
);
const SECOND_DIVISIONS = new Set(
  Object.values(LEAGUE_BRANDING).filter((l) => l.tier === 2).map((l) => l.id)
);

function buildRealityProfile(countryCode, division, index, count, power, money) {
  const tier = TOP_DIVISIONS.has(division) ? 1 : SECOND_DIVISIONS.has(division) ? 2 : 3;
  const rank = index + 1;
  let stature;
  if (tier === 1) {
    stature = power >= 80
      ? "global_power"
      : power >= 77
        ? "title_contender"
        : power >= 73
          ? "continental"
          : power >= 68
            ? "established"
            : "survival";
  } else if (tier === 2) {
    stature = rank <= Math.max(3, Math.round(count * 0.2))
      ? "promotion_favorite"
      : rank >= Math.round(count * 0.8)
        ? "relegation_fight"
        : "second_tier";
  } else {
    stature = rank <= 4 ? "promotion_favorite" : rank >= count - 3 ? "relegation_fight" : "lower_league";
  }
  const facilityBase = tier === 1
    ? stature === "global_power"
      ? { stadiumLevel: 5, trainingLevel: 5 }
      : stature === "title_contender"
        ? { stadiumLevel: 4, trainingLevel: 4 }
        : stature === "continental"
          ? { stadiumLevel: 4, trainingLevel: 3 }
          : { stadiumLevel: 3, trainingLevel: 2 }
    : tier === 2
      ? { stadiumLevel: 2, trainingLevel: stature === "promotion_favorite" ? 2 : 1 }
      : { stadiumLevel: 1, trainingLevel: 1 };
  const youthLevel = tier === 1
    ? rank <= 3 || rank % 7 === 0
      ? 3
      : 2
    : stature === "promotion_favorite"
      ? 2
      : 1;
  return {
    version: 1,
    referenceSlot: `${countryCode}-T${tier}-${String(rank).padStart(2, "0")}`,
    tier,
    domesticRankSeed: rank,
    stature,
    financeBand: money >= 45_000_000 ? 5 : money >= 30_000_000 ? 4 : money >= 18_000_000 ? 3 : money >= 8_000_000 ? 2 : 1,
    youthLevel,
    ...facilityBase,
  };
}

function buildBranding(base, renamed, division, countryId) {
  const [nameEn, nameZh] = renamed;
  const index = brandingIndex++;
  const countryCode = COUNTRY_BRANDING[countryId].countryCode;
  const cityEn = cityFromEnglishName(nameEn);
  const cityZh = cityFromChineseName(nameZh);
  const shortName = makeShortName(nameEn, cityEn, base.id);
  const primary = BRAND_COLORS[index % BRAND_COLORS.length];
  let secondary = BRAND_COLORS[(index * 7 + Math.floor(index / BRAND_COLORS.length) * 5 + 9) % BRAND_COLORS.length];
  if (secondary === primary) secondary = BRAND_COLORS[(index + 11) % BRAND_COLORS.length];
  const accent = BRAND_COLORS[(index * 11 + 4) % BRAND_COLORS.length];
  const style = KIT_STYLES[index % KIT_STYLES.length];
  const [stadiumSuffixEn, stadiumSuffixZh] = STADIUM_SUFFIXES[index % STADIUM_SUFFIXES.length];
  return {
    clubId: base.id,
    legacyName: base.name,
    legacyShortName: base.short,
    nameEn,
    nameZh,
    shortName,
    displayShortEn: cityEn,
    displayShortZh: cityZh,
    countryId,
    countryCode,
    leagueId: division,
    cityEn,
    cityZh,
    stadiumEn: `${cityEn} ${stadiumSuffixEn}`,
    stadiumZh: `${cityZh}${stadiumSuffixZh}`,
    colors: { primary, secondary, accent },
    kit: { style, primary, secondary, numberColor: contrastText(primary) },
    crest: {
      shape: CREST_SHAPES[index % CREST_SHAPES.length],
      symbol: CREST_SYMBOLS[(index * 5 + 1) % CREST_SYMBOLS.length],
      monogram: shortName,
      primary,
      secondary,
    },
    replaceCrest: true,
    migrateOldSave: true,
  };
}

/** 超联 18 — 顶级都会 / 豪门气质（德甲/法甲量级，18队34轮更合理） */
const D1 = [
  ["vcc", "Vanguard City", "Vanguard", 82, 55_000_000],
  ["harbor", "Harbourgate Athletic", "Harbour", 80, 48_000_000],
  ["north", "Northbridge United", "Northbridge", 79, 42_000_000],
  ["river", "Riverside Rovers", "Riverside", 78, 38_000_000],
  ["steel", "Steelborough FC", "Steelboro", 77, 35_000_000],
  ["capital", "Capital Borough", "Capital", 76, 33_000_000],
  ["royal", "Royal Crest Athletic", "Crest", 75, 30_000_000],
  ["metro", "Metrovale FC", "Metrovale", 74, 28_000_000],
  ["crown", "Crownfield United", "Crownfield", 74, 27_000_000],
  ["atlas", "Atlas Park", "Atlas", 73, 26_000_000],
  ["nova", "Novabridge FC", "Novabridge", 73, 25_000_000],
  ["olympic", "Olympia Town", "Olympia", 72, 24_000_000],
  ["titan", "Titanford United", "Titanford", 72, 23_000_000],
  ["horizon", "Horizon Athletic", "Horizon", 71, 22_000_000],
  ["empire", "Empire Lane", "Empire", 71, 21_000_000],
  ["summit", "Summit United", "Summit", 70, 20_000_000],
  ["legend", "Legendale FC", "Legendale", 70, 19_500_000],
  ["prime", "Primrose City", "Primrose", 69, 19_000_000],
  // 删除最后2队以达到18队（galaxy 和 zenith）
];

/** 甲级 18 — 中游工业城 / 海滨镇气质（二级联赛，18队更合理） */
const D2 = [
  ["eagle", "Eaglecliff United", "Eaglecliff", 67, 14_000_000],
  ["forest", "Greenwood Rovers", "Greenwood", 66, 13_000_000],
  ["lion", "Lionsgate Athletic", "Lionsgate", 65, 12_000_000],
  ["wave", "Tideswell FC", "Tideswell", 65, 11_500_000],
  ["canyon", "Canyondale Town", "Canyondale", 64, 11_000_000],
  ["harbor2", "Southharbour FC", "S.Harbour", 64, 10_500_000],
  ["phoenix", "Phoenixford", "Phoenixford", 63, 10_000_000],
  ["aurora", "Aurorafield", "Aurora", 63, 9_500_000],
  ["raven", "Raventhorpe", "Raven", 62, 9_000_000],
  ["iron", "Ironbridge Athletic", "Ironbridge", 62, 8_800_000],
  ["storm", "Stormhaven FC", "Stormhaven", 61, 8_500_000],
  ["delta", "Deltamouth United", "Deltamouth", 61, 8_200_000],
  ["beacon", "Beacon Hill", "Beacon", 60, 8_000_000],
  ["falcon", "Falconridge", "Falcon", 60, 7_800_000],
  ["ridge", "Ridgeway Rovers", "Ridgeway", 59, 7_500_000],
  ["coral", "Coral Bay FC", "Coral Bay", 59, 7_200_000],
  ["pioneer", "Pioneer Athletic", "Pioneer", 58, 7_000_000],
  ["comet", "Cometbury Town", "Cometbury", 58, 6_800_000],
  // 删除最后2队以达到18队（bastion 和 mirage）
];

/** 英格兰第三级 18（开局可选）— 小镇 / 码头 / 矿区气质 */
const D3 = [
  ["sunset", "Westend Town", "Westend", 55, 3_800_000],
  ["mill", "Millford United", "Millford", 54, 3_500_000],
  ["dock", "Dockside Athletic", "Dockside", 54, 3_300_000],
  ["valley", "Valleyford FC", "Valleyford", 53, 3_100_000],
  ["bridge", "Longbridge Rovers", "Longbridge", 53, 3_000_000],
  ["mines", "Miners United", "Miners", 52, 2_800_000],
  ["farm", "Farmstead FC", "Farmstead", 52, 2_600_000],
  ["village", "Village Green", "V.Green", 51, 2_500_000],
  ["harbor3", "Westbay United", "Westbay", 51, 2_400_000],
  ["chapel", "Chapelgate", "Chapelgate", 50, 2_300_000],
  ["quarry", "Quarrytown FC", "Quarrytown", 50, 2_200_000],
  ["meadow", "Meadowbank", "Meadowbank", 49, 2_100_000],
  ["lantern", "Lantern Borough", "Lantern", 49, 2_000_000],
  ["ferry", "Ferrybridge Athletic", "Ferrybridge", 48, 1_900_000],
  ["orchard", "Orchard United", "Orchard", 48, 1_850_000],
  ["slate", "Slateford Town", "Slateford", 47, 1_800_000],
  ["willow", "Willowdale FC", "Willowdale", 47, 1_750_000],
  ["brook", "Brookside Athletic", "Brookside", 46, 1_700_000],
  // 删除最后2队以达到18队（anchor 和 hearth）
];

const ENG_D1_BRANDS = [
  ["Kingsford Athletic", "金斯福德竞技"],
  ["Redhaven City", "红港城"],
  ["Northcastle Rovers", "北堡流浪者"],
  ["Westmere Borough", "西米尔自治镇"],
  ["Stonebridge County", "石桥郡队"],
  ["Ashbourne Vale", "阿什伯恩谷"],
  ["Highmoor Athletic", "高沼竞技"],
  ["Ravenswick City", "雷文斯维克城"],
  ["Oakshire Rovers", "橡树郡流浪者"],
  ["Blackwater Borough", "黑水自治镇"],
  ["Eastmere Wanderers", "东米尔漫游者"],
  ["Greycastle Vale", "灰堡谷"],
  ["Alderwick City", "奥尔德维克城"],
  ["Briarford Athletic", "布莱尔福德竞技"],
  ["Mossley County", "莫斯利郡队"],
  ["Fairhaven Rovers", "费尔黑文流浪者"],
  ["Wynthorpe Borough", "温索普自治镇"],
  ["Rosewick City", "罗斯维克城"],
  // 删除最后2个品牌以匹配18队
];

const ENG_D2_BRANDS = [
  ["Brackenford City", "布拉肯福德城"],
  ["Pinehurst Rovers", "松林流浪者"],
  ["Foxmere Athletic", "福克斯米尔竞技"],
  ["Tidecroft Borough", "泰德克罗夫特自治镇"],
  ["Emberton County", "恩伯顿郡队"],
  ["Southmere Wanderers", "南米尔漫游者"],
  ["Flintwick City", "弗林特维克城"],
  ["Moorland Vale", "荒原谷"],
  ["Redbrook Athletic", "红溪竞技"],
  ["Copperfield Rovers", "铜原流浪者"],
  ["Rainford Borough", "雷恩福德自治镇"],
  ["Marshgate City", "沼门城"],
  ["Beaconhurst County", "灯塔赫斯特郡队"],
  ["Falconmere Athletic", "猎鹰米尔竞技"],
  ["Ridgeholt Rovers", "里奇霍尔特流浪者"],
  ["Coralwick Town", "珊瑚维克镇"],
  ["Pioneerford City", "拓荒福德城"],
  ["Starling Vale", "椋鸟谷"],
  // 删除最后2个品牌以匹配18队
];

const ENG_D3_BRANDS = [
  ["Sunmere Wanderers", "桑米尔漫游者"],
  ["Millhaven Athletic", "米尔黑文竞技"],
  ["Dockmere City", "多克米尔城"],
  ["Valleydown Rovers", "谷地流浪者"],
  ["Longfen Borough", "朗芬自治镇"],
  ["Quarrymere County", "奎里米尔郡队"],
  ["Farmleigh Athletic", "法姆利竞技"],
  ["Greenhollow Vale", "绿谷"],
  ["Westbay Wanderers", "西湾漫游者"],
  ["Chapelwick City", "查珀尔维克城"],
  ["Slatebury Rovers", "斯莱特伯里流浪者"],
  ["Meadowcroft Borough", "草甸克罗夫特自治镇"],
  ["Lanternmere Athletic", "兰特恩米尔竞技"],
  ["Ferryholt County", "费里霍尔特郡队"],
  ["Orchardwick Vale", "果园维克谷"],
  ["Willowfen Rovers", "柳沼流浪者"],
  ["Brookmere City", "布鲁克米尔城"],
  ["Anchorleigh Athletic", "安克利竞技"],
  // 删除最后2个品牌以匹配18队
];

function pack(list, renamedList, division, countryId = "crownland") {
  return list.map((row, i) => {
    const [id, name, short, power, money] = row;
    const branding = buildBranding({ id, name, short }, renamedList[i], division, countryId);
    const realityProfile = buildRealityProfile(branding.countryCode, division, i, list.length, power, money);
    return {
      id,
      name: branding.nameZh,
      nameEn: branding.nameEn,
      nameZh: branding.nameZh,
      short: branding.displayShortZh,
      shortName: branding.shortName,
      shortCode: branding.shortName,
      legacyName: name,
      legacyShortName: short,
      power,
      money,
      color: branding.colors.primary,
      division,
      countryId,
      countryCode: branding.countryCode,
      leagueId: division,
      city: { en: branding.cityEn, zh: branding.cityZh },
      stadiumName: { en: branding.stadiumEn, zh: branding.stadiumZh },
      colors: { ...branding.colors },
      kit: { ...branding.kit },
      crest: { ...branding.crest },
      branding,
      realityProfile,
    };
  });
}

function packGenerated(
  names,
  renamedList,
  division,
  countryId,
  { maxPower, minPower, maxMoney, minMoney, powerCurve = null, moneyCurve = null }
) {
  return names.map((name, i) => {
    const ratio = names.length <= 1 ? 0 : i / (names.length - 1);
    const power = powerCurve?.[i] ?? Math.round(maxPower + (minPower - maxPower) * ratio);
    const money = moneyCurve?.[i] ?? Math.round(maxMoney + (minMoney - maxMoney) * ratio);
    const id = `${countryId.slice(0, 3)}_${division}_${String(i + 1).padStart(2, "0")}`;
    const legacyShortName = name.split(/\s+/)[0].slice(0, 14);
    const branding = buildBranding(
      { id, name, short: legacyShortName },
      renamedList[i],
      division,
      countryId
    );
    const realityProfile = buildRealityProfile(branding.countryCode, division, i, names.length, power, money);
    return {
      id,
      name: branding.nameZh,
      nameEn: branding.nameEn,
      nameZh: branding.nameZh,
      short: branding.displayShortZh,
      shortName: branding.shortName,
      shortCode: branding.shortName,
      legacyName: name,
      legacyShortName,
      power,
      money,
      color: branding.colors.primary,
      division,
      countryId,
      countryCode: branding.countryCode,
      leagueId: division,
      city: { en: branding.cityEn, zh: branding.cityZh },
      stadiumName: { en: branding.stadiumEn, zh: branding.stadiumZh },
      colors: { ...branding.colors },
      kit: { ...branding.kit },
      crest: { ...branding.crest },
      branding,
      realityProfile,
    };
  });
}

const SOLARA_TOP = [
  "Aurelia CF", "Puerto Celeste", "Monteluz Union", "Valdora Atletico",
  "Costa Alba FC", "Sierra Dorada", "Maravilla SC", "Rio Claro Athletic",
  "Estrella Roja", "Campo Verde", "Torreluna FC", "Bahia Serena",
  "Alcazar Nova", "Villasol United", "Cobre Vista", "Mirador CF",
  "Puerta Dorada", "Marina Sol",
];

const SOLARA_SECOND = [
  "Loma Azul", "Puerto Sol", "Valmera Deportivo", "Prado Alto",
  "Roca Blanca", "Nueva Espera", "Arco del Mar", "Santa Vega",
  "Fuente Oro", "Brisa Norte", "Olivar FC", "Canto Claro",
  "Arena Sur", "Lago Rojo", "Camino Unido", "Sol del Este",
  "Valle Tranquilo", "Colina Dorada",
];

const EISENMARK_TOP = [
  "Falkenstadt SV", "Eisenhafen 04", "Kronberg FC", "Adlerbruck",
  "Stahlheim Union", "Nordfels 09", "Waldkirch SC", "Blauwerk FC",
  "Rotental 08", "Bergwacht", "Lindenbruck", "Hafenkrone",
  "Silbersee", "Donnerfeld", "Morgenstadt", "Westtor SV",
  "Blauental", "Goldstadt",
];

const EISENMARK_SECOND = [
  "Kupferwald", "Steinbach 07", "Grunhafen", "Ostmarke FC",
  "Tannenfels", "Hochbruck", "Eisental", "Sudtor 05",
  "Nebelstadt", "Hammersee", "Weissburg", "Rotbruck",
  "Feldkrone", "Adlerhain", "Werkstadt", "Mondtal SC",
  "Berghafen", "Dunkelwald",
];

const BELLADORO_TOP = [
  "Aurora Calcio", "Porto d'Oro", "Valdoro FC", "Citta Nova",
  "Rosalba 1912", "Montechiaro", "Rivabella", "Aquila Nera",
  "Stella Marina", "Fortuna Verde", "Torriano", "Lago Azzurro",
  "Borgo Sole", "Granvista", "Virtu Bellena", "Pietraluna",
  "Castelmonte", "Luna Nova",
];

const BELLADORO_SECOND = [
  "Colleverde", "Marina Rossa", "Casalvento", "Fontebella",
  "Alba Nuova", "Portoforte", "Vigna d'Oro", "Serradoro",
  "Pontechiaro", "Rocca Nova", "Campo Fiore", "Valle Serena",
  "Marevento", "Luna Calcio", "Ferrovia AC", "Orizzonte",
  "Monte Azzurro", "Costa Verde",
];

const LUMERA_TOP = [
  "Lumeris FC", "Belle-Rive AC", "Valcroix Union", "Aurore Sport",
  "Rochebleue", "Port-Lumiere", "Ciel Rouge FC", "Grandval Athletic",
  "Bois d'Argent", "Vallonne SC", "Marais Royal", "Etoile d'Azur",
  "Couronne FC", "Riveneuve", "Montfleur", "Nordlac",
  "Montargent", "Valciel",
];

const LUMERA_SECOND = [
  "Petit-Pont", "Clairbois", "Rougeval", "Sudriviere",
  "Chateau-Lune", "Fontelune", "Aigle Blanc", "Verteville",
  "Port d'Aube", "Lac d'Or", "Vieux Marche", "Haute-Rive",
  "Moulin Vert", "Cote Claire", "Jardin FC", "Plein-Ciel",
  "Fontnoble", "Valdore SC",
];

const TULIPA_TOP = [
  "Amstelveen", "Rijnmond", "Zuiderhaven", "Nieuwdam",
  "Sparta Veldhoek", "Willemstad", "Molenbeek", "Oostvliet",
  "Duinkerk", "Groenwoud", "Hoogeveld", "Waterlinie",
  "Zeearend", "Kanaalstad", "Bloemendijk", "Noordwijk",
  "Steenbergen", "Vesting",
];

const TULIPA_SECOND = [
  "Klaverdijk", "Roodbrug", "Meerhoven", "Turfmarkt",
  "Zandvoort", "Elzenhof", "Havenkwartier", "Sluisberg",
  "Kleiveld", "Wilgenbeek", "Boomgaard", "Polderzicht",
  "Windmolen", "Vlietstroom", "Grasland", "Kanaaloever",
  "Duinrand", "Veenendam",
];

const NAVERA_TOP = [
  "Portomar", "Benfica Serrano", "Estrela do Norte", "Rio Douro",
  "Sporting Vilamar", "Serra Verde", "Oliveira", "Atlantico",
  "Montalegre", "Praia Dourada", "Vinhedo", "Castelo Branco",
  "Uniao Ribeira", "Sol Nascente", "Alvorada", "Pedravela",
  "Marinheiro", "Lusitano",
];

const NAVERA_SECOND = [
  "Vale Fundo", "Ponte Velha", "Azulejo", "Ribamar",
  "Douradinha", "Terra Nova", "Pinhal", "Costa Azul",
  "Barrocal", "Alentejo", "Uniao Salgueiro", "Fonte Clara",
  "Miradouro", "Carvalhal", "Vila Nova", "Penedo",
  "Amoreira", "Cabo Real",
];

// 匿名现实竞争曲线：只保存联赛席位层级，不保存或展示现实俱乐部身份。
// 顶部断层、争冠集团和中下游密度分别贴近五国当代联赛生态。
// 调整为18队以匹配德甲/法甲现实，提供更合理的34轮双循环赛制。
const TOP_REALITY_CURVES = Object.freeze({
  ESP: {
    power: [82, 81, 77, 76, 74, 73, 72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61],
    money: [56, 54, 38, 34, 30, 27, 25, 23, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12].map((n) => n * 1_000_000),
  },
  GER: {
    power: [82, 78, 77, 75, 74, 73, 72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61],
    money: [52, 40, 36, 32, 29, 27, 25, 23, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12].map((n) => n * 1_000_000),
  },
  ITA: {
    power: [79, 78, 77, 76, 75, 74, 73, 72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62],
    money: [45, 43, 40, 37, 34, 31, 28, 25, 23, 21, 19, 18, 17, 16, 15, 14, 13, 12].map((n) => n * 1_000_000),
  },
  FRA: {
    power: [81, 76, 75, 73, 72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60, 59],
    money: [50, 34, 30, 27, 24, 22, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8].map((n) => n * 1_000_000),
  },
  // 荷甲/葡超：顶部两三家垄断，与第四名起的断层比五大联赛更陡
  NED: {
    power: [78, 76, 74, 66, 64, 63, 62, 61, 60, 60, 59, 59, 58, 58, 57, 57, 56, 55],
    money: [34, 30, 26, 14, 12, 11, 10, 10, 9, 9, 8, 8, 8, 7, 7, 7, 7, 6].map((n) => n * 1_000_000),
  },
  POR: {
    power: [78, 77, 75, 64, 62, 61, 60, 59, 59, 58, 58, 57, 57, 56, 56, 56, 55, 55],
    money: [30, 28, 25, 11, 10, 9, 8, 8, 7, 7, 7, 6, 6, 6, 6, 5, 5, 5].map((n) => n * 1_000_000),
  },
});

const ESP_TOP_BRANDS = [
  ["Atlético Solmar", "索尔马竞技"],
  ["Deportivo Valdoro", "瓦尔多罗体育"],
  ["Unión Monteclaro", "蒙特克拉罗联盟"],
  ["Sporting Puerto Realta", "雷阿尔塔港竞技"],
  ["Club Sierra Azul", "蓝山俱乐部"],
  ["Costa Roja CF", "红海岸足球会"],
  ["Villaluna Atlético", "维拉露娜竞技"],
  ["Río Blanco Deportivo", "白河体育"],
  ["Campo Verde CF", "绿野足球会"],
  ["Altamira Unión", "阿尔塔米拉联盟"],
  ["Marazul Sporting", "蓝海竞技"],
  ["Cerro Dorado CF", "金丘足球会"],
  ["Valle Serena Deportivo", "塞雷纳谷体育"],
  ["Luzmar Atlético", "卢兹马尔竞技"],
  ["Ribera Clara CF", "克拉拉河岸足球会"],
  ["Solcanto Unión", "索尔坎托联盟"],
  ["Puerta Sol Deportivo", "太阳门体育"],
  ["Marina Alta CF", "上滨足球会"],
];

const ESP_SECOND_BRANDS = [
  ["Monteluna Deportivo", "蒙特露娜体育"],
  ["Puerto Brisa CF", "微风港足球会"],
  ["Sierra Alba Unión", "阿尔巴山联盟"],
  ["Costa Verde Sporting", "绿海岸竞技"],
  ["Villanueva Sol CF", "新村太阳足球会"],
  ["Río Carmesí Deportivo", "绯红河体育"],
  ["Campo Norte Unión", "北野联盟"],
  ["Loma Clara CF", "克拉拉山坡足球会"],
  ["Marina Azul Atlético", "蓝湾竞技"],
  ["Valdoro Sur Deportivo", "南瓦尔多罗体育"],
  ["Solierra CF", "索列拉足球会"],
  ["Piedra Serena Unión", "塞雷纳石镇联盟"],
  ["Bahía Luna Sporting", "月湾竞技"],
  ["Monte Rojo CF", "红山足球会"],
  ["Pradera Sol Deportivo", "阳光草原体育"],
  ["Canto del Mar Unión", "海歌联盟"],
  ["Valle Tranquilo CF", "宁静谷足球会"],
  // 与顶级「金丘足球会 / Cerro Dorado」区分：中文短名「金岭」全局唯一
  ["Colina Dorada Unión", "金岭联盟"],
];

const GER_TOP_BRANDS = [
  ["FC Eisenbruck", "艾森布吕克足球会"],
  ["SV Waldheim", "瓦尔德海姆体育会"],
  ["VfR Nordhafen", "诺德哈芬竞技协会"],
  ["Eintracht Falkenstadt", "法尔肯施塔特团结队"],
  ["Fortuna Silberberg", "锡尔伯格福图纳"],
  ["FC Grünwald", "格林瓦尔德足球会"],
  ["SV Rheinbruck", "莱茵布吕克体育会"],
  ["VfR Kronental", "克罗嫩塔尔竞技协会"],
  ["Eintracht Adlerfeld", "阿德勒费尔德团结队"],
  ["Fortuna Westtal", "韦斯特塔尔福图纳"],
  ["FC Morgenhain", "摩根海恩足球会"],
  ["SV Hohenmark", "霍恩马克体育会"],
  ["VfR Lichtwald", "利希特瓦尔德竞技协会"],
  ["Eintracht Brückenau", "布吕肯瑙团结队"],
  ["Fortuna Tannengrund", "坦嫩格伦德福图纳"],
  ["FC Kupferhain", "库普费尔海恩足球会"],
  ["SV Blauental", "布劳恩塔尔体育会"],
  ["VfR Goldstadt", "戈尔德施塔特竞技协会"],
];

const GER_SECOND_BRANDS = [
  ["SV Falkenried", "法尔肯里德体育会"],
  ["FC Steinbrunn", "施泰因布伦足球会"],
  ["VfR Grünhafen", "格林哈芬竞技协会"],
  ["Eintracht Osttal", "奥斯塔尔团结队"],
  ["Fortuna Nebelgrund", "内贝尔格伦德福图纳"],
  ["FC Hochwald", "霍赫瓦尔德足球会"],
  ["SV Eisental", "艾森塔尔体育会"],
  ["VfR Südbrück", "南布吕克竞技协会"],
  ["Eintracht Silberhain", "锡尔伯海恩团结队"],
  ["Fortuna Hammerfeld", "哈默费尔德福图纳"],
  ["FC Weissental", "魏森塔尔足球会"],
  ["SV Rotheide", "罗特海德体育会"],
  ["VfR Feldkranz", "费尔德克兰茨竞技协会"],
  ["Eintracht Adlerhain", "阿德勒海恩团结队"],
  ["Fortuna Werkental", "韦尔克塔尔福图纳"],
  ["FC Mondtal", "蒙德塔尔足球会"],
  ["SV Berghafen", "贝格哈芬体育会"],
  ["VfR Dunkelwald", "邓克尔瓦尔德竞技协会"],
];

const ITA_TOP_BRANDS = [
  ["AC Valdoria", "瓦尔多里亚竞技"],
  ["FC Monteverde", "蒙特韦尔德足球会"],
  ["Calcio Bellacosta", "贝拉科斯塔足球会"],
  ["Unione Porto Aurelio", "奥雷利奥港联盟"],
  ["Virtus San Celeste", "圣切莱斯特维尔图斯"],
  ["Rocca Nera Sportiva", "罗卡内拉体育"],
  ["Castelvento Calcio", "卡斯特尔文托足球会"],
  ["Rivabella FC", "里瓦贝拉足球会"],
  ["Altavilla Unione", "阿尔塔维拉联盟"],
  ["Fonteluce Sportiva", "丰特卢切体育"],
  ["AC Serenalto", "塞雷纳尔托竞技"],
  ["FC Pietradoro", "皮耶特拉多罗足球会"],
  ["Calcio Ventoalto", "文托阿尔托足球会"],
  ["Unione Marisole", "马里索莱联盟"],
  ["Virtus Collechiaro", "科莱基亚罗维尔图斯"],
  ["Rocca Verde FC", "罗卡韦尔德足球会"],
  ["Castelmonte Calcio", "卡斯特尔蒙特足球会"],
  ["AC Lunanova", "卢纳诺瓦竞技"],
];

const ITA_SECOND_BRANDS = [
  ["AC Montelume", "蒙特卢梅竞技"],
  ["FC Bellariva", "贝拉里瓦足球会"],
  ["Calcio Portovento", "波尔托文托足球会"],
  ["Unione Valserena", "瓦尔塞雷纳联盟"],
  ["Virtus Castelsole", "卡斯特尔索莱维尔图斯"],
  ["Rivaforte Sportiva", "里瓦福尔泰体育"],
  ["AC Lunacosta", "卢纳科斯塔竞技"],
  ["FC Fontanera", "丰塔内拉足球会"],
  ["Calcio Borgoluce", "博尔戈卢切足球会"],
  ["Unione Roccaferma", "罗卡费尔马联盟"],
  ["Virtus Marechiaro", "马雷基亚罗维尔图斯"],
  ["AC Valleombra", "瓦莱翁布拉竞技"],
  ["FC Altacielo", "阿尔塔切洛足球会"],
  ["Calcio San Virello", "圣维雷洛足球会"],
  ["Unione Castelrosa", "卡斯特尔罗萨联盟"],
  ["Virtus Campolago", "坎波拉戈维尔图斯"],
  ["AC Monteazzurro", "蒙特阿祖罗竞技"],
  ["FC Costaverde", "科斯塔韦尔德足球会"],
];

const FRA_TOP_BRANDS = [
  ["FC Bellemont", "贝勒蒙足球会"],
  ["AS Valrouge", "瓦勒鲁日体育会"],
  ["Olympique Montclair", "蒙克莱尔奥林匹克"],
  ["Racing Saint-Aurel", "圣奥雷尔竞速会"],
  ["Union Cote d'Argent", "银岸联盟"],
  ["Stade Riviere Bleue", "蓝河体育会"],
  ["FC Port-Lumiere", "光港足球会"],
  ["AS Grandvallon", "大谷体育会"],
  ["Olympique Hautefort", "欧特福尔奥林匹克"],
  ["Racing Clairbois", "克莱尔布瓦竞速会"],
  ["Union Valdune", "瓦尔迪讷联盟"],
  ["Stade Belle-Rive", "贝尔里夫体育会"],
  ["FC Montdoriel", "蒙多里耶足球会"],
  ["AS Rivemont", "里夫蒙体育会"],
  ["Olympique Boisclair", "布瓦克莱尔奥林匹克"],
  ["Racing Auriville", "奥里维尔竞速会"],
  ["Union Montargent", "蒙塔让联盟"],
  ["Stade Valciel", "瓦尔希耶尔体育会"],
];

const FRA_SECOND_BRANDS = [
  ["FC Valcendre", "瓦尔桑德足球会"],
  ["AS Montfauve", "蒙福沃体育会"],
  ["Union Portelune", "波特吕讷联盟"],
  ["Stade Hauterive", "欧特里夫体育会"],
  ["FC Clairval", "克莱瓦尔足球会"],
  ["Racing Grandbois", "格朗布瓦竞速会"],
  ["AS Neufrivage", "新河岸体育会"],
  ["Olympique Rochepale", "罗什帕勒奥林匹克"],
  ["Union Belleplaine", "贝勒普兰联盟"],
  ["Stade Luminac", "吕米纳克体育会"],
  ["FC Aubeval", "欧布瓦尔足球会"],
  ["AS Coteverte", "绿岸体育会"],
  ["Racing Montserein", "蒙瑟兰竞速会"],
  ["Union Boisroux", "布瓦鲁联盟"],
  ["Stade Rivazur", "里瓦祖尔体育会"],
  ["FC Hautebrise", "欧特布里兹足球会"],
  ["AS Fontnoble", "丰诺布勒体育会"],
  ["Olympique Valdore", "瓦尔多雷奥林匹克"],
];

const NED_TOP_BRANDS = [
  ["Amstelveen", "阿姆斯特芬"],
  ["Rijnmond", "莱茵蒙德"],
  ["Zuiderhaven", "南港"],
  ["Nieuwdam", "尼乌达姆"],
  ["Sparta Veldhoek", "费尔德胡克斯巴达"],
  ["Willemstad", "威廉斯塔德"],
  ["Molenbeek", "莫伦贝克"],
  ["Oostvliet", "东弗利特"],
  ["Duinkerk", "杜因凯克"],
  ["Groenwoud", "赫罗恩沃德"],
  ["Hoogeveld", "霍赫费尔德"],
  ["Waterlinie", "水线"],
  ["Zeearend", "海鹰"],
  ["Kanaalstad", "运河城"],
  ["Bloemendijk", "布卢门代克"],
  ["Noordwijk", "诺德韦克"],
  ["Steenbergen", "斯滕贝尔亨"],
  ["Vesting", "费斯廷"],
];

const NED_SECOND_BRANDS = [
  ["Klaverdijk", "克拉弗代克"],
  ["Roodbrug", "红桥"],
  ["Meerhoven", "梅尔霍芬"],
  ["Turfmarkt", "图尔夫马克特"],
  ["Zandvoort", "赞德沃特"],
  ["Elzenhof", "埃尔森霍夫"],
  ["Havenkwartier", "港区"],
  ["Sluisberg", "斯勒伊斯贝尔赫"],
  ["Kleiveld", "克莱费尔德"],
  ["Wilgenbeek", "维尔亨贝克"],
  ["Boomgaard", "博姆加德"],
  ["Polderzicht", "波尔德济赫特"],
  ["Windmolen", "风车"],
  ["Vlietstroom", "弗利特斯特罗姆"],
  ["Grasland", "赫拉斯兰"],
  ["Kanaaloever", "运河岸"],
  ["Duinrand", "杜因兰德"],
  ["Veenendam", "费嫩达姆"],
];

const POR_TOP_BRANDS = [
  ["Portomar", "波尔托马尔"],
  ["Benfica Serrano", "塞拉诺本菲卡"],
  ["Estrela do Norte", "北极星"],
  ["Rio Douro", "杜罗河"],
  ["Sporting Vilamar", "维拉马尔竞技"],
  ["Serra Verde", "青山"],
  ["Oliveira", "奥利维拉"],
  ["Atlantico", "大西洋"],
  ["Montalegre", "蒙塔莱格里"],
  ["Praia Dourada", "金滩"],
  ["Vinhedo", "维涅多"],
  ["Castelo Branco", "白堡"],
  ["Uniao Ribeira", "里贝拉联"],
  ["Sol Nascente", "朝阳"],
  ["Alvorada", "阿尔沃拉达"],
  ["Pedravela", "佩德拉维拉"],
  ["Marinheiro", "水手"],
  ["Lusitano", "卢西塔诺"],
];

const POR_SECOND_BRANDS = [
  ["Vale Fundo", "深谷"],
  ["Ponte Velha", "古桥"],
  ["Azulejo", "阿祖莱茹"],
  ["Ribamar", "里巴马尔"],
  ["Douradinha", "多拉迪纽"],
  ["Terra Nova", "新地"],
  ["Pinhal", "皮尼亚尔"],
  ["Costa Azul", "蓝岸"],
  ["Barrocal", "巴罗卡尔"],
  ["Alentejo", "阿连特茹"],
  ["Uniao Salgueiro", "萨尔盖罗联"],
  ["Fonte Clara", "清泉"],
  ["Miradouro", "米拉多罗"],
  ["Carvalhal", "卡瓦利亚尔"],
  ["Vila Nova", "新镇"],
  ["Penedo", "佩内多"],
  ["Amoreira", "阿莫雷拉"],
  ["Cabo Real", "皇家角"],
];

export const CLUB_TEMPLATES = [
  ...pack(D1, ENG_D1_BRANDS, 1, "crownland"),
  ...pack(D2, ENG_D2_BRANDS, 2, "crownland"),
  ...pack(D3, ENG_D3_BRANDS, 3, "crownland"),
  ...packGenerated(SOLARA_TOP, ESP_TOP_BRANDS, 4, "solara", {
    maxPower: 82, minPower: 63, maxMoney: 56_000_000, minMoney: 14_000_000,
    powerCurve: TOP_REALITY_CURVES.ESP.power, moneyCurve: TOP_REALITY_CURVES.ESP.money,
  }),
  ...packGenerated(SOLARA_SECOND, ESP_SECOND_BRANDS, 5, "solara", { maxPower: 62, minPower: 47, maxMoney: 9_500_000, minMoney: 2_000_000 }),
  ...packGenerated(EISENMARK_TOP, GER_TOP_BRANDS, 6, "eisenmark", {
    maxPower: 82, minPower: 63, maxMoney: 52_000_000, minMoney: 14_000_000,
    powerCurve: TOP_REALITY_CURVES.GER.power, moneyCurve: TOP_REALITY_CURVES.GER.money,
  }),
  ...packGenerated(EISENMARK_SECOND, GER_SECOND_BRANDS, 7, "eisenmark", { maxPower: 63, minPower: 48, maxMoney: 10_000_000, minMoney: 2_100_000 }),
  ...packGenerated(BELLADORO_TOP, ITA_TOP_BRANDS, 8, "belladoro", {
    maxPower: 79, minPower: 64, maxMoney: 45_000_000, minMoney: 14_000_000,
    powerCurve: TOP_REALITY_CURVES.ITA.power, moneyCurve: TOP_REALITY_CURVES.ITA.money,
  }),
  ...packGenerated(BELLADORO_SECOND, ITA_SECOND_BRANDS, 9, "belladoro", { maxPower: 62, minPower: 47, maxMoney: 9_200_000, minMoney: 1_900_000 }),
  ...packGenerated(LUMERA_TOP, FRA_TOP_BRANDS, 10, "lumera", {
    maxPower: 81, minPower: 61, maxMoney: 50_000_000, minMoney: 10_000_000,
    powerCurve: TOP_REALITY_CURVES.FRA.power, moneyCurve: TOP_REALITY_CURVES.FRA.money,
  }),
  ...packGenerated(LUMERA_SECOND, FRA_SECOND_BRANDS, 11, "lumera", { maxPower: 61, minPower: 46, maxMoney: 8_800_000, minMoney: 1_800_000 }),
  ...packGenerated(TULIPA_TOP, NED_TOP_BRANDS, 12, "tulipa", {
    maxPower: 78, minPower: 57, maxMoney: 34_000_000, minMoney: 6_500_000,
    powerCurve: TOP_REALITY_CURVES.NED.power, moneyCurve: TOP_REALITY_CURVES.NED.money,
  }),
  ...packGenerated(TULIPA_SECOND, NED_SECOND_BRANDS, 13, "tulipa", { maxPower: 57, minPower: 43, maxMoney: 5_200_000, minMoney: 1_100_000 }),
  ...packGenerated(NAVERA_TOP, POR_TOP_BRANDS, 14, "navera", {
    maxPower: 78, minPower: 55, maxMoney: 30_000_000, minMoney: 5_000_000,
    powerCurve: TOP_REALITY_CURVES.POR.power, moneyCurve: TOP_REALITY_CURVES.POR.money,
  }),
  ...packGenerated(NAVERA_SECOND, POR_SECOND_BRANDS, 15, "navera", { maxPower: 55, minPower: 42, maxMoney: 4_600_000, minMoney: 950_000 }),
];

/** Complete, reviewable old-name to new-brand migration map. */
export const clubBrandingById = Object.freeze(
  Object.fromEntries(CLUB_TEMPLATES.map((club) => [club.id, club.branding]))
);

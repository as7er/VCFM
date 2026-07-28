/** 教练组 / 球探 / 队医 — 按实力生成 + 合同与俱乐部间流动 */

import { FIRST_NAMES, LAST_NAMES, DIVISIONS } from "./data.js";
import { formatMoney } from "./models.js";
import { isTransferWindowOpen } from "./transfers.js";

const ROLES = {
  coach: {
    key: "coach",
    label: "主教练",
    desc: "提升比赛表现与训练成长，协助经理安排训练",
    effect: "比赛强度、年轻球员成长、训练委托",
  },
  scout: {
    key: "scout",
    label: "球探",
    desc: "转会议价与青训苗子质量",
    effect: "买人折扣、市场情报、招生潜力",
  },
  doctor: {
    key: "doctor",
    label: "队医",
    desc: "伤病与体能恢复",
    effect: "受伤概率↓、恢复↑",
  },
};

const STAFF_ROLES = ["coach", "scout", "doctor"];

/** 职员质量标尺版本：旧档 ensureStaff 时按实力重校准一次 */
export const STAFF_QUALITY_VERSION = 2;

function rand(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function uid(prefix = "st") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function wageFromRating(rating) {
  const r = clamp(Number(rating) || 8, 1, 20);
  return Math.max(500, Math.round(r * r * 35));
}

function roleMod(role) {
  if (role === "coach") return 1.15;
  if (role === "doctor") return 0.95;
  return 1;
}

function clubNameOf(club) {
  return club?.name || club?.nameZh || club?.id || "—";
}

/**
 * 俱乐部职员能力基准（1–20 标尺上的期望中心）。
 */
export function staffBaseForClub(club) {
  const tier = DIVISIONS[club?.division || 3]?.tier || 3;
  const power = Number(club?.power);
  const money = Number(club?.money) || 0;
  const stature = club?.realityProfile?.stature || "";

  let base = tier === 1 ? 11 : tier === 2 ? 8.5 : 6.5;
  if (Number.isFinite(power)) {
    base += clamp((power - 55) / 6.5, -1.5, 4.6);
  }
  const statureBonus = {
    global_power: 2.4,
    title_contender: 1.3,
    continental: 0.7,
    established: 0.25,
    promotion_favorite: 0.35,
    second_tier: 0,
    lower_league: -0.2,
    relegation_fight: -0.45,
    survival: -0.55,
  };
  base += statureBonus[stature] || 0;
  if (money >= 45_000_000) base += 1.0;
  else if (money >= 28_000_000) base += 0.55;
  else if (money >= 15_000_000) base += 0.25;
  else if (money > 0 && money < 2_500_000) base -= 0.35;

  return clamp(base, 5, 18.5);
}

function roleRatingSpec(role) {
  if (role === "coach") return { bias: 0.35, spread: [-1, 2] };
  if (role === "scout") return { bias: -0.15, spread: [-2, 1] };
  return { bias: 0, spread: [-2, 2] };
}

export function staffTargetRating(club, role, { jitter = true } = {}) {
  const base = staffBaseForClub(club);
  const spec = roleRatingSpec(role);
  let rating = base + spec.bias;
  if (jitter) rating += rand(spec.spread[0], spec.spread[1]);
  const stature = club?.realityProfile?.stature || "";
  if (role === "coach" && stature === "global_power") rating = Math.max(rating, 15);
  if (role === "coach" && stature === "title_contender") rating = Math.max(rating, 13);
  return clamp(Math.round(rating), 5, 19);
}

/** 默认合同年限：能力越高越长 */
export function defaultStaffContractYears(rating) {
  const r = Number(rating) || 8;
  if (r >= 16) return rand(3, 4);
  if (r >= 12) return rand(2, 3);
  return rand(1, 2);
}

/**
 * 在职解约/挖角补偿金（给现东家）。
 * 自由身为 0。合同将尽更便宜。
 */
export function staffCompensationFee(staff) {
  if (!staff || staff.clubId == null) return 0;
  const r = clamp(Number(staff.rating) || 8, 1, 20);
  const years = Math.max(1, Number(staff.contractYears) || 1);
  let fee = r * r * 12_000 * years * roleMod(staff.role);
  if ((staff.contractYears || 1) <= 1) fee *= 0.65;
  return Math.max(5_000, Math.round(fee / 1000) * 1000);
}

/** 签自由身的行政签约费（非转会费） */
export function staffSigningFee(staff) {
  const r = clamp(Number(staff?.rating) || 8, 1, 20);
  return Math.max(2_000, Math.round(r * r * 4_000));
}

export function ensureStaffContract(staff, club = null) {
  if (!staff) return staff;
  if (staff.contractYears == null || staff.contractYears < 0) {
    staff.contractYears = defaultStaffContractYears(staff.rating);
  }
  staff.contractYears = clamp(Math.round(Number(staff.contractYears) || 1), 0, 5);
  if (club) {
    staff.clubId = club.id;
  } else if (staff.clubId === undefined) {
    staff.clubId = null;
  }
  if (staff.wage == null) staff.wage = wageFromRating(staff.rating);
  return staff;
}

export function createStaff(role, rating = null, opts = {}) {
  const r = rating != null ? rating : rand(6, 16);
  const staff = {
    id: uid(),
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    role,
    rating: clamp(r, 1, 20),
    wage: wageFromRating(r),
    age: rand(32, 62),
    contractYears: opts.contractYears != null ? opts.contractYears : defaultStaffContractYears(r),
    clubId: opts.clubId != null ? opts.clubId : null,
  };
  return staff;
}

export function defaultStaffForClub(club) {
  const staff = {
    coach: createStaff("coach", staffTargetRating(club, "coach"), { clubId: club?.id }),
    scout: createStaff("scout", staffTargetRating(club, "scout"), { clubId: club?.id }),
    doctor: createStaff("doctor", staffTargetRating(club, "doctor"), { clubId: club?.id }),
  };
  for (const role of STAFF_ROLES) ensureStaffContract(staff[role], club);
  return staff;
}

export function calibrateClubStaff(club, { force = false } = {}) {
  if (!club) return null;
  if (!club.staff) club.staff = defaultStaffForClub(club);
  for (const role of STAFF_ROLES) {
    if (!club.staff[role]) {
      club.staff[role] = createStaff(role, staffTargetRating(club, role), { clubId: club.id });
      ensureStaffContract(club.staff[role], club);
      continue;
    }
    const s = club.staff[role];
    const target = staffTargetRating(club, role, { jitter: true });
    const cur = Number(s.rating) || 8;
    const gap = target - cur;
    let next;
    if (force || Math.abs(gap) >= 2) next = Math.round(cur * 0.2 + target * 0.8);
    else next = cur;
    s.rating = clamp(next, 5, 19);
    s.wage = wageFromRating(s.rating);
    s.role = role;
    if (!s.id) s.id = uid();
    if (!s.name) s.name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    if (!s.age) s.age = rand(32, 62);
    ensureStaffContract(s, club);
  }
  club.staffQualityVersion = STAFF_QUALITY_VERSION;
  return club.staff;
}

export function ensureStaff(club) {
  if (!club) return null;
  if (!club.staff) {
    club.staff = defaultStaffForClub(club);
    club.staffQualityVersion = STAFF_QUALITY_VERSION;
    return club.staff;
  }
  for (const role of STAFF_ROLES) {
    if (!club.staff[role]) {
      club.staff[role] = createStaff(role, staffTargetRating(club, role), { clubId: club.id });
    }
    ensureStaffContract(club.staff[role], club);
  }
  if (club.staffQualityVersion !== STAFF_QUALITY_VERSION) {
    calibrateClubStaff(club, { force: true });
  }
  return club.staff;
}

export function ensureWorldStaff(world) {
  if (!world?.clubs) return;
  for (const club of world.clubs) ensureStaff(club);
  ensureStaffMarket(world);
  ensureStaffApproaches(world);
}

export function staffRating(club, role) {
  ensureStaff(club);
  return club.staff[role]?.rating || 8;
}

export function coachMatchMod(club) {
  const r = staffRating(club, "coach");
  return 0.94 + (r / 20) * 0.14;
}

export function coachGrowthBonus(club) {
  return staffRating(club, "coach") * 0.008;
}

export function scoutBuyMod(club) {
  const r = staffRating(club, "scout");
  return 1.12 - (r / 20) * 0.2;
}

export function scoutSellMod(club) {
  const r = staffRating(club, "scout");
  return 0.85 + (r / 20) * 0.2;
}

export function scoutYouthPotBonus(club) {
  return Math.floor(staffRating(club, "scout") / 8);
}

export function doctorInjuryMod(club) {
  const r = staffRating(club, "doctor");
  return 1.15 - (r / 20) * 0.45;
}

export function doctorHealBonus(club) {
  return Math.floor(staffRating(club, "doctor") / 5);
}

export function staffWageBill(club) {
  ensureStaff(club);
  return STAFF_ROLES.reduce((s, k) => s + (club.staff[k]?.wage || 0), 0);
}

// ─── 自由市场 / 挖角队列 ─────────────────────────────────────────

export function ensureStaffMarket(world) {
  if (!world) return [];
  if (!Array.isArray(world.staffMarket)) world.staffMarket = [];
  return world.staffMarket;
}

export function ensureStaffApproaches(world) {
  if (!world) return [];
  if (!Array.isArray(world.staffApproaches)) world.staffApproaches = [];
  return world.staffApproaches;
}

export function pendingStaffApproaches(world) {
  ensureStaffApproaches(world);
  return world.staffApproaches.filter(
    (a) => a.status === "pending" && a.targetIsUser && a.buyerId !== world.userClubId
  );
}

/** 生成一批自由身候选人（补充市场，不覆盖已有自由身） */
export function generateStaffMarket(count = 12) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    const rating =
      roll < 0.08 ? rand(16, 19) : roll < 0.35 ? rand(12, 16) : rand(7, 13);
    const s = createStaff(pick(STAFF_ROLES), rating, { clubId: null, contractYears: 0 });
    s.clubId = null;
    s.contractYears = 0;
    list.push(s);
  }
  return list.sort((a, b) => b.rating - a.rating);
}

export function refreshStaffMarket(world, count = 12) {
  ensureStaffMarket(world);
  // 保留仍是自由身的真实人员，只补随机候选人到 count
  const kept = world.staffMarket.filter((s) => s && s.clubId == null);
  const need = Math.max(0, count - kept.length);
  const extra = need > 0 ? generateStaffMarket(need) : [];
  world.staffMarket = [...kept, ...extra].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  if (world.staffMarket.length > 40) world.staffMarket.length = 40;
  return world.staffMarket;
}

function pushFreeAgent(world, staff) {
  if (!world || !staff) return;
  ensureStaffMarket(world);
  staff.clubId = null;
  // 自由身展示合同为 0
  staff.contractYears = 0;
  if (!world.staffMarket.some((s) => s.id === staff.id)) {
    world.staffMarket.unshift(staff);
  }
  if (world.staffMarket.length > 40) world.staffMarket.length = 40;
}

function removeFromMarket(world, staffId) {
  if (!world || !Array.isArray(world.staffMarket)) return;
  world.staffMarket = world.staffMarket.filter((s) => s.id !== staffId);
}

function findEmployedStaff(world, staffId) {
  for (const club of world.clubs || []) {
    ensureStaff(club);
    for (const role of STAFF_ROLES) {
      const s = club.staff[role];
      if (s?.id === staffId) return { staff: s, club, role };
    }
  }
  return null;
}

function makeCaretaker(club, role) {
  const temp = Math.max(5, staffTargetRating(club, role, { jitter: false }) - rand(3, 5));
  const s = createStaff(role, temp, { clubId: club.id, contractYears: 1 });
  s.contractYears = 1;
  s.clubId = club.id;
  return s;
}

/**
 * 解约：赔补偿 → 原职员进自由市场 → 临时工上岗
 */
export function fireStaff(worldOrClub, roleMaybe, roleArg) {
  // 兼容旧签名 fireStaff(club, role) 与新签名 fireStaff(world, club, role)
  let world = null;
  let club;
  let role;
  if (roleArg != null) {
    world = worldOrClub;
    club = roleMaybe;
    role = roleArg;
  } else {
    club = worldOrClub;
    role = roleMaybe;
  }
  ensureStaff(club);
  const s = club.staff[role];
  if (!s) return { ok: false, msg: "没有该职位职员" };
  ensureStaffContract(s, club);
  const cost = Math.max(s.wage * 4, Math.round(staffCompensationFee(s) * 0.35));
  if (club.money < cost) return { ok: false, msg: `解约补偿不足（需 ${formatMoney(cost)}）` };
  club.money -= cost;
  const released = { ...s, clubId: null, contractYears: 0 };
  club.staff[role] = makeCaretaker(club, role);
  if (world) pushFreeAgent(world, released);
  return {
    ok: true,
    msg: `已与 ${s.name} 解约（补偿 ${formatMoney(cost)}），临时${ROLES[role].label}已上岗`,
    released,
    cost,
  };
}

/**
 * 签自由身（仅 staffMarket / clubId==null）
 */
export function hireStaff(world, club, candidate, fee = null) {
  ensureStaff(club);
  ensureStaffMarket(world);
  if (!candidate || candidate.clubId != null) {
    return { ok: false, msg: "只能直接签下自由身职员；在职请走接触挖角" };
  }
  const role = candidate.role;
  const signFee = fee != null ? fee : staffSigningFee(candidate);
  const newWage = Math.max(candidate.wage || wageFromRating(candidate.rating), wageFromRating(candidate.rating));
  if (club.money < signFee + newWage * 4) {
    return { ok: false, msg: "资金不足以支付签约费与初期薪水" };
  }
  const old = club.staff[role];
  club.money -= signFee;
  if (old) {
    const released = { ...old, clubId: null, contractYears: 0 };
    pushFreeAgent(world, released);
  }
  const years = defaultStaffContractYears(candidate.rating);
  club.staff[role] = {
    id: candidate.id,
    name: candidate.name,
    role: candidate.role,
    rating: candidate.rating,
    wage: newWage,
    age: candidate.age,
    contractYears: years,
    clubId: club.id,
    joinedDay: world?.day ?? 1,
  };
  removeFromMarket(world, candidate.id);
  return {
    ok: true,
    msg: `已签下自由身 ${candidate.name} 担任${ROLES[role].label}（能力 ${candidate.rating}，${years} 年合同）${
      old ? `，${old.name} 成为自由身` : ""
    }`,
    old,
    fee: signFee,
  };
}

/** 可接触列表：自由身 + 他队在职 */
export function listApproachableStaff(world, buyerClub) {
  if (!world || !buyerClub) return [];
  ensureStaff(buyerClub);
  ensureStaffMarket(world);
  const out = [];

  for (const s of world.staffMarket) {
    if (!s || s.clubId != null) continue;
    out.push({
      staff: s,
      fromClub: null,
      freeAgent: true,
      compensation: 0,
      signingFee: staffSigningFee(s),
      totalCost: staffSigningFee(s),
    });
  }

  for (const club of world.clubs || []) {
    if (club.id === buyerClub.id) continue;
    ensureStaff(club);
    for (const role of STAFF_ROLES) {
      const s = club.staff[role];
      if (!s) continue;
      ensureStaffContract(s, club);
      // 窗规：窗外仅自由身；窗内可挖在职。合同≤1 窗外也可挖（现实更松）
      const windowOpen = isTransferWindowOpen(world);
      if (!windowOpen && (s.contractYears || 1) > 1) continue;
      const comp = staffCompensationFee(s);
      const years = s.contractYears || 1;
      const st = club.realityProfile?.stature || "";
      const tags = [];
      if (years <= 1) tags.push({ id: "short", zh: "短合同易挖", en: "Short deal" });
      if (st === "global_power" || st === "title_contender") {
        tags.push({ id: "elite", zh: "豪门惜售", en: "Elite club" });
      }
      if ((s.rating || 0) >= 16) tags.push({ id: "star", zh: "高能力", en: "Top rated" });
      if ((club.power || 0) + 8 < (buyerClub.power || 0)) {
        tags.push({ id: "weaker", zh: "弱队更易放", en: "Weaker seller" });
      }
      const difficulty =
        (st === "global_power" || st === "title_contender") && (s.rating || 0) >= 16
          ? "hard"
          : years <= 1
            ? "easy"
            : "normal";
      out.push({
        staff: s,
        fromClub: club,
        freeAgent: false,
        compensation: comp,
        signingFee: 0,
        totalCost: comp,
        tags,
        difficulty,
        hintZh:
          difficulty === "hard"
            ? "豪门高能力职员：即使溢价也可能拒绝"
            : difficulty === "easy"
              ? "合同将尽，成交概率较高"
              : "按公允补偿接触，结果看对方态度",
        hintEn:
          difficulty === "hard"
            ? "Elite high-rated staff may refuse even strong bids"
            : difficulty === "easy"
              ? "Expiring contract — higher chance"
              : "Fair compensation; outcome depends on the club",
      });
    }
  }

  out.sort((a, b) => (b.staff.rating || 0) - (a.staff.rating || 0));
  return out;
}

function buildWageOffer(staff, buyer) {
  const base = Math.max(staff.wage || wageFromRating(staff.rating), wageFromRating(staff.rating));
  const buyerBase = staffBaseForClub(buyer);
  const uplift = buyerBase + 1 > (staff.rating || 8) ? 1.12 + Math.random() * 0.12 : 1.05 + Math.random() * 0.08;
  return Math.round(base * uplift);
}

function buildContractOffer(staff, freeAgent) {
  if (freeAgent) return clamp(defaultStaffContractYears(staff.rating), 1, 3);
  return clamp(Math.max(2, defaultStaffContractYears(staff.rating)), 2, 4);
}

/**
 * 发起接触：自由身直接可 complete；挖用户队职员 → pending；挖 AI → 掷骰自动或拒绝
 */
export function approachStaff(world, buyerClubId, staffId, fromClubId = null) {
  if (!world) return { ok: false, msg: "无效世界" };
  const buyer = world.clubs.find((c) => c.id === buyerClubId);
  if (!buyer) return { ok: false, msg: "买方俱乐部不存在" };
  ensureStaff(buyer);
  ensureStaffApproaches(world);

  let staff = null;
  let fromClub = null;
  let freeAgent = false;

  if (fromClubId) {
    fromClub = world.clubs.find((c) => c.id === fromClubId);
    if (!fromClub) return { ok: false, msg: "东家俱乐部不存在" };
    ensureStaff(fromClub);
    staff = STAFF_ROLES.map((r) => fromClub.staff[r]).find((s) => s?.id === staffId) || null;
    if (!staff) return { ok: false, msg: "该职员已不在原俱乐部" };
    ensureStaffContract(staff, fromClub);
    const windowOpen = isTransferWindowOpen(world);
    if (!windowOpen && (staff.contractYears || 1) > 1) {
      return { ok: false, msg: "转会窗外只能接触合同剩余 ≤1 年的在职职员，或签自由身" };
    }
  } else {
    ensureStaffMarket(world);
    staff = world.staffMarket.find((s) => s.id === staffId) || null;
    if (!staff || staff.clubId != null) {
      // 也可能是在职但未传 fromClubId
      const employed = findEmployedStaff(world, staffId);
      if (employed) {
        staff = employed.staff;
        fromClub = employed.club;
        ensureStaffContract(staff, fromClub);
      } else {
        return { ok: false, msg: "找不到该职员" };
      }
    } else {
      freeAgent = true;
    }
  }

  if (fromClub && fromClub.id === buyer.id) {
    return { ok: false, msg: "不能接触本队职员" };
  }

  const role = staff.role;
  // 玩家接触时略高于公允补偿，提高成交率（现实中也常溢价挖人）
  const fair = freeAgent ? 0 : staffCompensationFee(staff);
  const compensation = freeAgent
    ? 0
    : Math.round(fair * (buyerClubId === world.userClubId ? 1.1 : 1.0));
  const wageOffer = buildWageOffer(staff, buyer);
  const contractYears = buildContractOffer(staff, freeAgent);
  const totalNeed = compensation + (freeAgent ? staffSigningFee(staff) : 0) + wageOffer * 4;
  if (buyer.money < totalNeed) {
    return { ok: false, msg: `资金不足（需约 ${formatMoney(totalNeed)} 含补偿与初期薪水）` };
  }

  // 已有对本队同人的 pending 不重复
  if (
    world.staffApproaches.some(
      (a) => a.status === "pending" && a.staffId === staff.id && a.buyerId === buyer.id
    )
  ) {
    return { ok: false, msg: "已有对该职员的接触在处理中" };
  }

  const targetIsUser = !!(fromClub && fromClub.id === world.userClubId);
  const approach = {
    id: uid("sa"),
    day: world.day || 1,
    role,
    staffId: staff.id,
    staffName: staff.name,
    rating: staff.rating,
    fromClubId: fromClub?.id || null,
    fromClubName: fromClub ? clubNameOf(fromClub) : null,
    buyerId: buyer.id,
    buyerName: clubNameOf(buyer),
    compensation,
    wageOffer,
    contractYears,
    freeAgent,
    status: "pending",
    expiresDay: (world.day || 1) + (freeAgent ? 3 : 5),
    targetIsUser,
  };

  // 自由身：买方是用户或 AI 都可直接完成（用户点聘请）
  if (freeAgent) {
    const done = completeStaffMove(world, approach);
    return done;
  }

  // 挖用户队：挂起等玩家
  if (targetIsUser) {
    // 同时仅保留一条针对用户的 pending（避免刷屏）
    if (world.staffApproaches.some((a) => a.status === "pending" && a.targetIsUser)) {
      return { ok: false, msg: "已有待处理的职员接触" };
    }
    world.staffApproaches.unshift(approach);
    if (world.staffApproaches.length > 24) world.staffApproaches.length = 24;
    world.news?.unshift({
      day: world.day,
      text: `📞 ${approach.buyerName} 接触本队${ROLES[role].label} ${staff.name}（补偿 ${formatMoney(compensation)}，请在职员页处理，${approach.expiresDay - world.day} 天内有效）`,
    });
    return { ok: true, pending: true, approach, msg: "已向该俱乐部发出接触，等待答复" };
  }

  // 挖 AI：自动谈判（溢价 + 短合同 + 买方更强 → 高概率放人）
  const acceptP = aiSellerAcceptChance(fromClub, staff, compensation, buyer);
  if (Math.random() > acceptP) {
    approach.status = "rejected";
    world.staffApproaches.unshift(approach);
    if (world.staffApproaches.length > 24) world.staffApproaches.length = 24;
    const reasons = staffRejectReasons(fromClub, staff, compensation, buyer);
    return {
      ok: false,
      reason: "refused",
      reasons,
      msg: `${clubNameOf(fromClub)} 拒绝放走 ${staff.name}：${reasons.join("；")}`,
      approach,
    };
  }
  const done = completeStaffMove(world, approach);
  if (done.ok) {
    done.msg = `${done.msg}（对方接受了 ${formatMoney(compensation)} 补偿）`;
  }
  return done;
}

/** 拒绝原因（给 UI/toast，可解释） */
export function staffRejectReasons(fromClub, staff, compensation, buyer) {
  const reasons = [];
  const fair = staffCompensationFee(staff) || 1;
  const ratio = compensation / fair;
  const years = staff.contractYears || 1;
  const st = fromClub?.realityProfile?.stature || "";
  if (ratio < 1.05) reasons.push("补偿未达心理预期");
  if (years >= 3) reasons.push(`合同仍有 ${years} 年`);
  if ((st === "global_power" || st === "title_contender") && (staff.rating || 0) >= 16) {
    reasons.push("豪门不愿放走核心职员");
  }
  if ((buyer.power || 0) + 5 < (fromClub.power || 0)) {
    reasons.push("认为你的平台更低");
  }
  if (!reasons.length) reasons.push("董事会暂时无意放人，可稍后再试或等合同更短");
  return reasons;
}

function aiSellerAcceptChance(fromClub, staff, compensation, buyer) {
  const fair = staffCompensationFee(staff) || 1;
  const ratio = compensation / fair;
  // 公允溢价附近高概率；弱队短合同接近必成
  let p = clamp(0.48 + (ratio - 0.95) * 0.7, 0.18, 0.96);
  if ((staff.contractYears || 1) <= 1) p += 0.2;
  const st = fromClub?.realityProfile?.stature || "";
  if ((st === "global_power" || st === "title_contender") && (staff.rating || 0) >= 16) p *= 0.55;
  if ((buyer.power || 0) > (fromClub.power || 0) + 6) p += 0.12;
  if ((fromClub.money || 0) < compensation * 0.6) p += 0.14;
  if ((buyer.money || 0) > (fromClub.money || 0) * 2.5) p += 0.1;
  // 临时工/低能力几乎不拦
  if ((staff.rating || 0) <= staffTargetRating(fromClub, staff.role, { jitter: false }) - 2) p += 0.2;
  return clamp(p, 0.12, 0.97);
}

/** 用户处理「别人挖我的职员」 */
export function resolveStaffApproach(world, approachId, accept) {
  ensureStaffApproaches(world);
  const approach = world.staffApproaches.find((a) => a.id === approachId);
  if (!approach || approach.status !== "pending") {
    return { ok: false, msg: "接触无效或已处理" };
  }
  if (!approach.targetIsUser) {
    return { ok: false, msg: "该接触无需你方处理" };
  }
  if (accept) {
    return completeStaffMove(world, approach);
  }
  approach.status = "rejected";
  world.news?.unshift({
    day: world.day,
    text: `👔 已拒绝 ${approach.buyerName} 对本队${ROLES[approach.role]?.label || ""} ${approach.staffName} 的接触`,
  });
  return { ok: true, msg: "已拒绝接触", approach };
}

/**
 * 成交：付钱、换人、原岗临时工、买方旧人自由身
 */
export function completeStaffMove(world, approach) {
  if (!world || !approach) return { ok: false, msg: "无效交易" };
  const buyer = world.clubs.find((c) => c.id === approach.buyerId);
  if (!buyer) return { ok: false, msg: "买方不存在" };
  ensureStaff(buyer);
  ensureStaffMarket(world);

  let staff = null;
  let fromClub = null;
  if (approach.freeAgent || !approach.fromClubId) {
    staff = world.staffMarket.find((s) => s.id === approach.staffId);
    if (!staff) return { ok: false, msg: "自由身职员已离开市场" };
  } else {
    fromClub = world.clubs.find((c) => c.id === approach.fromClubId);
    if (!fromClub) return { ok: false, msg: "东家不存在" };
    ensureStaff(fromClub);
    staff = STAFF_ROLES.map((r) => fromClub.staff[r]).find((s) => s?.id === approach.staffId);
    if (!staff) return { ok: false, msg: "职员已离开原俱乐部" };
  }

  const role = staff.role || approach.role;
  const compensation = approach.compensation || 0;
  const wageOffer = approach.wageOffer || buildWageOffer(staff, buyer);
  const years = approach.contractYears || buildContractOffer(staff, !fromClub);
  const need = compensation + wageOffer * 4;
  if (buyer.money < need) {
    approach.status = "rejected";
    return { ok: false, msg: "买方资金不足，交易取消" };
  }

  buyer.money -= compensation + (approach.freeAgent ? staffSigningFee(staff) : 0);
  // 自由身签约费已在上面；在职只付 compensation
  if (!approach.freeAgent && compensation > 0 && fromClub) {
    fromClub.money = (fromClub.money || 0) + compensation;
  }

  // 买方原岗位 → 自由身
  const displaced = buyer.staff[role];
  const displacedName =
    displaced && displaced.id !== staff.id ? displaced.name : null;
  const displacedRating =
    displaced && displaced.id !== staff.id ? displaced.rating : null;
  if (displaced && displaced.id !== staff.id) {
    pushFreeAgent(world, { ...displaced, clubId: null, contractYears: 0 });
  }

  // 卖方填临时工
  if (fromClub) {
    fromClub.staff[role] = makeCaretaker(fromClub, role);
  }

  buyer.staff[role] = {
    id: staff.id,
    name: staff.name,
    role,
    rating: staff.rating,
    wage: wageOffer,
    age: staff.age,
    contractYears: years,
    clubId: buyer.id,
    joinedDay: world.day || 1,
  };
  removeFromMarket(world, staff.id);

  approach.status = "completed";
  ensureStaffApproaches(world);
  if (!world.staffApproaches.includes(approach)) {
    world.staffApproaches.unshift(approach);
  }

  const feeTxt = approach.freeAgent
    ? `签约费 ${formatMoney(staffSigningFee(staff))}`
    : `补偿 ${formatMoney(compensation)} 给 ${approach.fromClubName || ""}`;
  const msg = approach.freeAgent
    ? `已签下自由身 ${staff.name} 任${ROLES[role].label}（${feeTxt}，周薪 ${formatMoney(wageOffer)}，${years} 年）`
    : `已从 ${approach.fromClubName} 签下 ${staff.name} 任${ROLES[role].label}（${feeTxt}，周薪 ${formatMoney(wageOffer)}，${years} 年）`;

  // 主教练变动写入更醒目的「换帅」世界新闻（AI/用户共用同一通道）
  if (role === "coach") {
    const fromBit = approach.freeAgent
      ? "自由市场"
      : approach.fromClubName || clubNameOf(fromClub);
    const outBit = displacedName
      ? `，原主教练 ${displacedName}${displacedRating != null ? `（${displacedRating}）` : ""} 离任`
      : "";
    const sellerBit =
      fromClub && !approach.freeAgent
        ? `；${clubNameOf(fromClub)} 暂由临时主帅接管`
        : "";
    world.news?.unshift({
      day: world.day,
      text: `📢 换帅：${clubNameOf(buyer)} 任命 ${staff.name}（${staff.rating}）为主教练，来自${fromBit}${outBit}${sellerBit}。${feeTxt}，周薪 ${formatMoney(wageOffer)}，合同 ${years} 年。`,
    });
  } else {
    world.news?.unshift({
      day: world.day,
      text: `👔 ${clubNameOf(buyer)}：${msg}`,
    });
  }

  return { ok: true, msg, approach, staff: buyer.staff[role] };
}

export function expireStaffApproaches(world) {
  ensureStaffApproaches(world);
  const day = world.day || 1;
  for (const a of world.staffApproaches) {
    if (a.status === "pending" && day > a.expiresDay) a.status = "expired";
  }
}

/**
 * 赛季末：合同 -1；到期变自由身 + 临时工
 */
export function processStaffContractsEndOfSeason(world) {
  if (!world?.clubs) return { released: 0 };
  ensureStaffMarket(world);
  let released = 0;
  for (const club of world.clubs) {
    ensureStaff(club);
    for (const role of STAFF_ROLES) {
      const s = club.staff[role];
      if (!s) continue;
      ensureStaffContract(s, club);
      s.contractYears = (s.contractYears || 1) - 1;
      if (s.contractYears <= 0) {
        const gone = { ...s, clubId: null, contractYears: 0 };
        pushFreeAgent(world, gone);
        club.staff[role] = makeCaretaker(club, role);
        released++;
        if (club.id === world.userClubId) {
          world.news?.unshift({
            day: world.day || 1,
            text: `👔 ${ROLES[role].label} ${s.name} 合同到期，成为自由身`,
          });
        }
      }
    }
  }
  return { released };
}

/**
 * 每日：过期报价 + AI 职员流动（采样，避免卡顿）
 */
export function processStaffMarketDay(world) {
  if (!world || world.seasonOver || world.sacked) return;
  expireStaffApproaches(world);
  ensureWorldStaff(world);

  const windowOpen = isTransferWindowOpen(world);
  // 窗内更高频率（约每 5–6 天世界有一笔尝试）
  if (Math.random() > (windowOpen ? 0.22 : 0.06)) return;

  const clubs = (world.clubs || []).filter((c) => c.id !== world.userClubId);
  if (!clubs.length) return;
  // 采样 16 队
  const sample = [];
  const copy = clubs.slice();
  for (let i = 0; i < Math.min(16, copy.length); i++) {
    const idx = rand(0, copy.length - 1);
    sample.push(copy.splice(idx, 1)[0]);
  }

  for (const club of sample) {
    ensureStaff(club);
    if ((club.money || 0) < 150_000) continue;
    for (const role of STAFF_ROLES) {
      const cur = club.staff[role];
      const target = staffTargetRating(club, role, { jitter: false });
      const gap = target - (cur?.rating || 0);
      // 临时工或明显低于应有水平才积极补强
      if (gap < 1.5) continue;
      if (Math.random() > 0.45) continue;

      // 1) 自由市场更好的人
      ensureStaffMarket(world);
      const free = world.staffMarket
        .filter((s) => s.role === role && s.clubId == null && (s.rating || 0) > (cur?.rating || 0) + 0.5)
        .sort((a, b) => b.rating - a.rating)[0];
      if (free) {
        const res = approachStaff(world, club.id, free.id, null);
        if (res.ok) return; // 一日最多一笔新闻级
        continue;
      }

      // 2) 挖其他 AI 或用户
      const candidates = [];
      for (const other of world.clubs || []) {
        if (other.id === club.id) continue;
        ensureStaff(other);
        const s = other.staff[role];
        if (!s) continue;
        ensureStaffContract(s, other);
        if (!windowOpen && (s.contractYears || 1) > 1) continue;
        if ((s.rating || 0) <= (cur?.rating || 0)) continue;
        // 不要轻易挖远强于自己目标的天价
        if ((s.rating || 0) > target + 3) continue;
        candidates.push({ s, other });
      }
      if (!candidates.length) continue;
      candidates.sort((a, b) => b.s.rating - a.s.rating);
      const pickC = candidates[rand(0, Math.min(3, candidates.length - 1))];
      const res = approachStaff(world, club.id, pickC.s.id, pickC.other.id);
      if (res.ok || res.pending) return;
    }
  }
}

export { ROLES, STAFF_ROLES };

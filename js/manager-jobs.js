/**
 * 经理职业流动：解雇后再就业、主动辞职、出色被更高水平俱乐部邀请
 */

import { DIVISIONS } from "./data.js";
import { ensureManagerCareer } from "./career.js";
import { generateBoardObjective } from "./board.js";
import {
  ensureTactics,
  ensureMatchLineup,
  autoLineup,
  assignSquadNumbers,
  ensureKit,
  formatMoney,
} from "./models.js";
import { ensureStaff } from "./staff.js";
import { ensureFacilities } from "./facilities.js";
import { ensureTraining } from "./training.js";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function uid() {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function ensureManagerJob(world) {
  if (!world) return null;
  if (!world.managerJob || typeof world.managerJob !== "object") {
    world.managerJob = {
      status: world.sacked ? "unemployed" : "employed", // employed | unemployed
      unemployedSince: world.sacked ? world.day || 1 : null,
      reason: world.sackedReason || null,
      offers: [],
      lastOfferDay: 0,
      resignCooldownUntil: 0,
      jobsTaken: 0,
    };
  }
  const j = world.managerJob;
  if (!Array.isArray(j.offers)) j.offers = [];
  if (j.status == null) j.status = world.sacked ? "unemployed" : "employed";
  if (j.jobsTaken == null) j.jobsTaken = 0;
  if (j.lastOfferDay == null) j.lastOfferDay = 0;
  if (j.resignCooldownUntil == null) j.resignCooldownUntil = 0;
  // 解雇标记与待业对齐
  if (world.sacked && j.status === "employed") {
    j.status = "unemployed";
    j.unemployedSince = world.day || 1;
    j.reason = world.sackedReason || j.reason;
  }
  return j;
}

/** 名望档位文案 */
export function reputationTierLabel(rep, lang = "zh") {
  const r = Number(rep) || 0;
  if (lang === "en") {
    if (r >= 75) return "Elite";
    if (r >= 60) return "Established";
    if (r >= 45) return "Promising";
    if (r >= 30) return "Developing";
    return "Fringe";
  }
  if (r >= 75) return "顶级名帅";
  if (r >= 60) return "成名教头";
  if (r >= 45) return "新锐主帅";
  if (r >= 30) return "成长中";
  return "边缘人选";
}

/** 0–100 名望：决定邀请档次 */
export function managerReputation(world) {
  const c = ensureManagerCareer(world);
  let rep = 38;
  rep += Math.min(22, (c.wins || 0) * 0.35);
  rep += Math.min(12, ((c.wins || 0) / Math.max(1, c.matches || 1)) * 20);
  rep += (c.titles || 0) * 9;
  rep += (c.promotions || 0) * 7;
  rep += (c.cups || 0) * 5;
  rep += Math.min(8, (c.seasons || 0) * 1.2);
  rep -= (c.sacked || 0) * 5;
  rep -= (c.relegations || 0) * 6;
  if (c.bestFinish?.pos === 1) rep += 4;
  // 现役俱乐部战绩
  if (!world.sacked && world.managerJob?.status !== "unemployed") {
    const club = world.clubs?.find((x) => x.id === world.userClubId);
    const row = club && world.table?.[club.id];
    if (row && row.played >= 5) {
      const ppg = row.pts / row.played;
      if (ppg >= 2.2) rep += 6;
      else if (ppg >= 1.8) rep += 3;
      else if (ppg < 0.9) rep -= 4;
    }
  }
  return clamp(Math.round(rep), 12, 96);
}

function clubTier(club) {
  return DIVISIONS[club?.division || 3]?.tier || 3;
}

function clubSortKey(club) {
  const tier = clubTier(club);
  const power = Number(club.power) || 50;
  const money = Number(club.money) || 0;
  return (4 - tier) * 1000 + power + money / 5e6;
}

function offerWage(rep, club) {
  const base = 8_000 + rep * 400 + (clubTier(club) === 1 ? 12_000 : clubTier(club) === 2 ? 5_000 : 0);
  return Math.round(base / 500) * 500;
}

function makeOffer(world, club, kind, note) {
  const rep = managerReputation(world);
  const tier = clubTier(club);
  const repTier = reputationTierLabel(rep, "zh");
  return {
    id: uid(),
    clubId: club.id,
    clubName: club.name || club.nameZh || club.id,
    division: club.division,
    divName: DIVISIONS[club.division]?.name || "",
    tier,
    power: club.power,
    kind, // sack_rehire | resign | prestige | lateral
    wage: offerWage(rep, club),
    note: note || "",
    repAtOffer: rep,
    repTier,
    day: world.day || 1,
    expiresDay: (world.day || 1) + 12,
    status: "pending",
  };
}

/**
 * 生成工作邀请列表（不重复已有 pending 俱乐部）
 */
export function generateJobOffers(world, { force = false, count = 3 } = {}) {
  ensureManagerJob(world);
  ensureManagerCareer(world);
  const job = world.managerJob;
  const rep = managerReputation(world);
  const unemployed = job.status === "unemployed" || !!world.sacked;
  const existing = new Set(
    (job.offers || []).filter((o) => o.status === "pending").map((o) => o.clubId)
  );
  existing.add(world.userClubId);

  const candidates = (world.clubs || [])
    .filter((c) => c.id !== world.userClubId && !existing.has(c.id))
    .map((c) => ({ club: c, key: clubSortKey(c), tier: clubTier(c) }));

  if (!candidates.length) return [];

  const picks = [];
  // 按名望筛选档次
  let pool;
  if (rep >= 72) {
    pool = candidates.filter((x) => x.tier === 1 || x.key > 2500);
  } else if (rep >= 55) {
    pool = candidates.filter((x) => x.tier <= 2);
  } else if (rep >= 40) {
    pool = candidates.filter((x) => x.tier >= 2 || x.key < 2800);
  } else {
    pool = candidates.filter((x) => x.tier >= 2);
  }
  if (!pool.length) pool = candidates;

  pool.sort((a, b) => {
    if (unemployed) return a.key - b.key + (Math.random() - 0.5) * 200; // 待业时也有中小俱乐部
    return b.key - a.key + (Math.random() - 0.5) * 150; // 在职名望邀请偏强队
  });

  const kind = unemployed
    ? world.sacked || job.reason?.includes?.("解雇")
      ? "sack_rehire"
      : "resign"
    : "prestige";

  const n = force ? count : Math.min(count, unemployed ? 4 : 2);
  const repLabel = reputationTierLabel(rep, "zh");
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const { club, tier } = pool[i];
    let note;
    if (kind === "prestige") {
      note =
        tier === 1
          ? `以你目前「${repLabel}」名望（${rep}），特邀执教顶级联赛`
          : `认可近况，邀请冲击更高目标（名望 ${rep} · ${repLabel}）`;
    } else if (kind === "sack_rehire") {
      note = `再就业机会：按你的名望（${rep} · ${repLabel}）匹配的俱乐部`;
    } else {
      note = `请辞后的空缺：名望 ${rep}（${repLabel}）档可选东家`;
    }
    const offer = makeOffer(world, club, kind, note);
    job.offers.unshift(offer);
    picks.push(offer);
  }
  if (job.offers.length > 16) job.offers.length = 16;
  job.lastOfferDay = world.day || 1;
  return picks;
}

export function pendingJobOffers(world) {
  ensureManagerJob(world);
  const day = world.day || 1;
  return (world.managerJob.offers || []).filter(
    (o) => o.status === "pending" && (o.expiresDay == null || o.expiresDay >= day)
  );
}

export function expireJobOffers(world) {
  ensureManagerJob(world);
  const day = world.day || 1;
  for (const o of world.managerJob.offers || []) {
    if (o.status === "pending" && o.expiresDay != null && day > o.expiresDay) {
      o.status = "expired";
    }
  }
}

/** 进入待业（解雇或辞职） */
export function enterUnemployment(world, reason = "", { fromSack = false } = {}) {
  ensureManagerJob(world);
  ensureManagerCareer(world);
  const job = world.managerJob;
  job.status = "unemployed";
  job.unemployedSince = world.day || 1;
  job.reason = reason || (fromSack ? "被董事会解雇" : "主动请辞");
  // sacked 锁：不能再经营旧队；再就业 acceptJobOffer 时清除
  world.sacked = true;
  world.sackedReason = job.reason;
  world.sackedDay = world.day;
  // 解雇计数由 sackManager 负责；主动请辞不计入 sacked 次
  // 清旧 offer，生成新邀请
  job.offers = (job.offers || []).filter((o) => o.status === "pending" && o.kind === "prestige");
  for (const o of job.offers) o.status = "expired";
  job.offers = [];
  const created = generateJobOffers(world, { force: true, count: 4 });
  world.news = world.news || [];
  world.news.unshift({
    day: world.day,
    text: fromSack
      ? `🚨 你已失业：${job.reason}。经理市场出现 ${created.length} 个工作机会。`
      : `📭 你已离开 ${world.clubs?.find((c) => c.id === world.userClubId)?.name || "俱乐部"}：${job.reason}。现有 ${created.length} 个新机会。`,
  });
  return { ok: true, offers: created, job };
}

/** 主动请辞（在职） */
export function resignManagership(world) {
  ensureManagerJob(world);
  if (world.managerJob.status === "unemployed" || world.sacked) {
    return { ok: false, msg: "你已处于待业状态" };
  }
  const day = world.day || 1;
  const coolUntil = world.managerJob.resignCooldownUntil || 0;
  if (day < coolUntil) {
    const left = coolUntil - day;
    return {
      ok: false,
      reason: "cooldown",
      daysLeft: left,
      msg: `跳槽冷却中：还需 ${left} 天（至 D${coolUntil}）董事会才允许解约`,
    };
  }
  const club = world.clubs?.find((c) => c.id === world.userClubId);
  if ((world.managerJob.jobsTaken || 0) > 0 && day - (world.managerJob.lastAcceptDay || 0) < 20) {
    const left = 20 - (day - (world.managerJob.lastAcceptDay || 0));
    return {
      ok: false,
      reason: "new_job",
      daysLeft: left,
      msg: `上任未满 20 天，还需 ${left} 天方可请辞`,
    };
  }
  return enterUnemployment(world, `主动辞去 ${club?.name || "俱乐部"} 主帅职务`, {
    fromSack: false,
  });
}

/** 距可请辞还剩几天；0 表示可以 */
export function resignCooldownLeft(world) {
  ensureManagerJob(world);
  if (world.managerJob.status === "unemployed" || world.sacked) return 0;
  const day = world.day || 1;
  const a = Math.max(0, (world.managerJob.resignCooldownUntil || 0) - day);
  const b =
    (world.managerJob.jobsTaken || 0) > 0 && world.managerJob.lastAcceptDay != null
      ? Math.max(0, 20 - (day - world.managerJob.lastAcceptDay))
      : 0;
  return Math.max(a, b);
}

/**
 * 接受工作邀请 → 换 userClubId，恢复可操作
 */
export function acceptJobOffer(world, offerId) {
  ensureManagerJob(world);
  const job = world.managerJob;
  const offer = (job.offers || []).find((o) => o.id === offerId);
  if (!offer || offer.status !== "pending") {
    return { ok: false, msg: "邀请无效或已过期" };
  }
  const club = world.clubs?.find((c) => c.id === offer.clubId);
  if (!club) return { ok: false, msg: "目标俱乐部不存在" };

  const prevId = world.userClubId;
  const prev = world.clubs?.find((c) => c.id === prevId);

  world.userClubId = club.id;
  world.sacked = false;
  world.sackedReason = null;
  world.sackedDay = null;
  job.status = "employed";
  job.unemployedSince = null;
  job.reason = null;
  job.jobsTaken = (job.jobsTaken || 0) + 1;
  job.lastAcceptDay = world.day || 1;
  job.resignCooldownUntil = (world.day || 1) + 25;
  offer.status = "accepted";
  for (const o of job.offers) {
    if (o.status === "pending") o.status = "expired";
  }

  // 新东家：补齐经营结构、新董事会目标
  ensureKit(club);
  ensureStaff(club);
  ensureFacilities(club);
  ensureTraining(club);
  ensureTactics(club);
  assignSquadNumbers(club);
  autoLineup(club);
  ensureMatchLineup(club);
  world.board = generateBoardObjective(club, world.clubs, world.season);

  world.managerWage = offer.wage;

  world.news = world.news || [];
  world.news.unshift({
    day: world.day,
    text: `✍️ 上任公告：${world.managerName || "经理"} 正式执教 ${club.name}（${DIVISIONS[club.division]?.name || ""}），周薪约 ${formatMoney(offer.wage)}。${
      prev && prev.id !== club.id ? `此前离开 ${prev.name}。` : ""
    }董事会目标：${world.board?.label || "竞争中游"}。`,
  });
  if (prev && prev.id !== club.id) {
    world.news.unshift({
      day: world.day,
      text: `📰 ${prev.name} 方面表示尊重 ${world.managerName || "前主帅"} 的选择，已开始物色继任者。`,
    });
  }

  return {
    ok: true,
    club,
    offer,
    msg: `已上任 ${club.name}（${DIVISIONS[club.division]?.name || ""}）· 周薪 ${formatMoney(offer.wage)}`,
  };
}

export function rejectJobOffer(world, offerId) {
  ensureManagerJob(world);
  const offer = (world.managerJob.offers || []).find((o) => o.id === offerId);
  if (!offer || offer.status !== "pending") {
    return { ok: false, msg: "邀请无效" };
  }
  offer.status = "rejected";
  return { ok: true, msg: `已拒绝 ${offer.clubName} 的邀请` };
}

/**
 * 每日：过期邀请；待业补刷；在职出色则偶发豪门邀请
 */
export function processManagerJobsDay(world) {
  if (!world || world.seasonOver) return;
  ensureManagerJob(world);
  expireJobOffers(world);
  const job = world.managerJob;
  const day = world.day || 1;
  const rep = managerReputation(world);

  // 待业：每隔数天补邀请
  if (job.status === "unemployed" || world.sacked) {
    job.status = "unemployed";
    const pending = pendingJobOffers(world);
    if (pending.length < 2 && day - (job.lastOfferDay || 0) >= 5) {
      const created = generateJobOffers(world, { force: true, count: 3 });
      if (created.length) {
        world.news = world.news || [];
        world.news.unshift({
          day,
          text: `📞 经理市场：又有 ${created.length} 家俱乐部向你发出邀请。`,
        });
      }
    }
    return;
  }

  // 在职：战绩出色 → 更高水平邀请
  if (day - (job.lastOfferDay || 0) < 18) return;
  if (Math.random() > 0.12) return;
  if (rep < 52) return;

  const club = world.clubs?.find((c) => c.id === world.userClubId);
  if (!club) return;
  const row = world.table?.[club.id];
  if (!row || row.played < 6) return;
  const ppg = row.pts / row.played;
  if (ppg < 1.7 && rep < 70) return;

  const myKey = clubSortKey(club);
  const better = (world.clubs || []).filter((c) => {
    if (c.id === club.id) return false;
    return clubSortKey(c) > myKey + 80 || clubTier(c) < clubTier(club);
  });
  if (!better.length) return;

  better.sort((a, b) => clubSortKey(b) - clubSortKey(a));
  const target = better[Math.floor(Math.random() * Math.min(5, better.length))];
  if ((job.offers || []).some((o) => o.status === "pending" && o.clubId === target.id)) return;

  const offer = makeOffer(
    world,
    target,
    "prestige",
    rep >= 70
      ? "你的执教表现引起豪门关注，正式发出主帅邀请"
      : "更高水平俱乐部希望你能带队更进一步"
  );
  job.offers.unshift(offer);
  job.lastOfferDay = day;
  world.news = world.news || [];
  world.news.unshift({
    day,
    text: `🌟 ${target.name}（${DIVISIONS[target.division]?.name || ""}）向你发出执教邀请（周薪约 ${formatMoney(offer.wage)}）。可在生涯页查看。`,
  });
}

/** 是否处于可经营本队状态 */
export function isManagerEmployed(world) {
  if (!world) return false;
  ensureManagerJob(world);
  return world.managerJob.status === "employed" && !world.sacked;
}

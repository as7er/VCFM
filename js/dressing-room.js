/**
 * VCFM · 更衣室：球员之间的关系网、派系与不满累积
 *
 * 设计原则：关系强度全部由已有的真实事实推导（国籍、年龄、青训出身、
 * 同队赛季数、位置竞争、出场差距），不新增隐藏字段，旧档直接生效。
 * 本模块只回答「谁和谁合得来」，不向比赛写入能力或胜率修正——场上影响
 * 只经由既有的 relationMatchNudge 选人权重通道体现。
 *
 * 关系分 -100..+100，按需计算不落盘：同一份输入永远得到同一结果，
 * 因此无需迁移，也不会把存档标脏。
 */

import { ensurePlayerPathway } from "./player-pathway.js";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * 关系强度阈值。
 * 按真实事实能凑出的分数校准：同国籍+同龄≈48、同期青训+同龄≈42、
 * 同龄+共事≈26、仅同国籍≈28（22+共事6）。取 30 让「同龄同乡」「同期青训」
 * 都能成帮，而单一条件不足以抱团。
 *
 * 同国籍权重曾为 34，实测导致关系网退化：某档 19 人里 14 个同国籍，三名领袖
 * 的可吸附人数是 10/9/1，首位领袖吸满上限后其余再也凑不出派系，全队恒为
 * 单一阵营。降到 22 后同一档变成 3/5/5，派系数 1→2。
 *
 * 同位置竞争 -14（门将 -26），叠加出场差距 -12 后才够 -25，故摩擦阈值取 -25。
 */
export const BOND_ALLY = 30;      // 以上算「交好」
export const BOND_FRICTION = -25; // 以下算「不合」

/**
 * 两名球员一起效力的赛季数。
 * 读 history 的 season+clubId，不额外记账；当前赛季尚未归档，故两人同队
 * 即计 1，再叠加历史共同赛季。不读 world，保证同一对球员结果恒定。
 */
function seasonsTogether(a, b) {
  const clubId = a.clubId;
  if (!clubId || b.clubId !== clubId) return 0;
  const seasonsOf = (p) =>
    new Set((p.history || []).filter((h) => h.clubId === clubId).map((h) => h.season));
  const sa = seasonsOf(a);
  const sb = seasonsOf(b);
  let shared = 1; // 当下同队
  for (const s of sa) if (sb.has(s)) shared += 1;
  return shared;
}

/**
 * 球员 a 对 b 的关系分 -100..+100。
 * 对称量（国籍/年龄/共事）双向一致；竞争量按各自处境可不对称。
 * world 仅为调用侧签名统一而保留，本函数只读两名球员自身的事实。
 */
export function playerBond(a, b, world = null) {
  if (!a || !b || a.id === b.id) return 0;
  let score = 0;

  // 同国籍：语言与文化圈。权重刻意低于「同国籍即成帮」的直觉——真实更衣室
  // 不是只按护照分派，同龄、同期打拼的人一样会走到一起。
  if (a.nationality && a.nationality === b.nationality) score += 22;

  // 年龄相近：同一代球员的共同话题
  const ageGap = Math.abs((a.age || 24) - (b.age || 24));
  if (ageGap <= 2) score += 20;
  else if (ageGap <= 5) score += 11;
  else if (ageGap >= 12) score -= 8;

  // 同为青训出身：一起长起来的
  if (a.fromYouth && b.fromYouth) score += 16;

  // 共事时间
  const together = seasonsTogether(a, b);
  score += Math.min(20, together * 6);

  // 同位置直接竞争：位置越稀缺越紧张
  if (a.pos && a.pos === b.pos) {
    score -= a.pos === "GK" ? 26 : 14;
    // 竞争者之间，出场差距越大越难受（只影响出场少的一方，故不对称）
    const appsA = Number(a.stats?.apps || 0);
    const appsB = Number(b.stats?.apps || 0);
    if (appsA + appsB >= 6 && appsB > appsA * 2) score -= 12;
  }

  return clamp(Math.round(score), -100, 100);
}

/**
 * 更衣室领袖：按年龄、能力、共事年限与对主帅的关系推举，不新增属性。
 * 队长（战术页指定）恒定入选。
 */
export function dressingRoomLeaders(club, world, limit = 4) {
  const players = club?.players || [];
  if (!players.length) return [];
  const captainId = club.tactics?.captainId || null;
  const scored = players.map((p) => {
    const tenure = (p.history || []).filter((h) => h.clubId === club.id).length;
    const standing =
      (p.ovr || 10) * 2.2 +
      Math.min(14, Math.max(0, (p.age || 24) - 22)) * 1.6 +
      Math.min(18, tenure * 4) +
      (p.relation || 0) * 4 +
      Number(p.stats?.apps || 0) * 0.4;
    return { player: p, standing: p.id === captainId ? standing + 40 : standing };
  });
  return scored
    .sort((x, y) => y.standing - x.standing)
    .slice(0, limit)
    .map((entry) => entry.player);
}

/**
 * 把阵容按关系网分成派系。
 * 贪心聚类：以领袖为核心，按关系强度择优吸附队友，剩下的归入「散人」。
 * 单个派系上限为阵容的三分之一——现实里更衣室是若干小圈子，不是一个大帮；
 * 不设上限时首位领袖会吸走所有同乡，后续领袖再也凑不出派系。
 */
export function dressingRoomFactions(club, world) {
  const players = club?.players || [];
  if (players.length < 6) return [];
  const leaders = dressingRoomLeaders(club, world, 3);
  const maxSize = Math.max(3, Math.floor(players.length / 3));
  const assigned = new Set();
  const factions = [];

  for (const leader of leaders) {
    if (assigned.has(leader.id)) continue;
    assigned.add(leader.id);
    const candidates = players
      .filter((p) => !assigned.has(p.id))
      .map((p) => ({ player: p, bond: playerBond(leader, p, world) }))
      .filter((entry) => entry.bond >= BOND_ALLY)
      .sort((x, y) => y.bond - x.bond)
      .slice(0, maxSize - 1);
    const members = [leader, ...candidates.map((entry) => entry.player)];
    for (const m of members) assigned.add(m.id);

    // 一个人不成派系
    if (members.length >= 3) {
      factions.push({
        leaderId: leader.id,
        leaderName: leader.name,
        memberIds: members.map((m) => m.id),
        size: members.length,
        // 派系整体对主帅的态度，决定它是助力还是隐患
        stance: Math.round(
          (members.reduce((s, m) => s + (m.relation || 0), 0) / members.length) * 100
        ) / 100,
      });
    } else {
      for (const m of members) assigned.delete(m.id);
    }
  }
  return factions;
}

/**
 * 队内摩擦：找出关系恶劣且都在一线队的组合。
 * 只报告事实，不产生后果——后果由 processDressingRoomDay 决定。
 */
export function dressingRoomFrictions(club, world, limit = 5) {
  const players = (club?.players || []).filter((p) => Number(p.stats?.apps || 0) >= 2);
  const found = [];
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const bond = Math.min(
        playerBond(players[i], players[j], world),
        playerBond(players[j], players[i], world)
      );
      if (bond <= BOND_FRICTION) {
        found.push({
          aId: players[i].id,
          aName: players[i].name,
          bId: players[j].id,
          bName: players[j].name,
          bond,
        });
      }
    }
  }
  return found.sort((x, y) => x.bond - y.bond).slice(0, limit);
}

/**
 * 更衣室整体健康度 0–100：在既有士气/关系之外，计入派系对立与摩擦。
 */
export function dressingRoomHarmony(club, world) {
  const players = club?.players || [];
  if (!players.length) return 50;
  const factions = dressingRoomFactions(club, world);
  const frictions = dressingRoomFrictions(club, world);

  let harmony = 70;
  // 有派系不必然是坏事：态度正面的派系是凝聚力，负面的是山头
  for (const f of factions) {
    harmony += f.stance >= 0 ? Math.min(6, f.size * 0.8) : -Math.min(14, f.size * 1.8);
  }
  harmony -= frictions.length * 4;
  // 想走的人越多越离心
  harmony -= players.filter((p) => p.wantsTransfer).length * 5;
  return clamp(Math.round(harmony), 0, 100);
}

/**
 * 转会申请：球员正式向俱乐部递交离队请求。
 * 现实里这是一次性的正式动作，不是每天重复抱怨，故记录状态避免刷屏；
 * 状态只写在球员自己身上，不产生能力或胜率修正。
 */
export function ensureTransferRequest(player) {
  if (!player) return null;
  if (!player.transferRequest || typeof player.transferRequest !== "object") return null;
  return player.transferRequest;
}

/** 球员是否已递交且尚未处理的转会申请 */
export function hasPendingTransferRequest(player) {
  return ensureTransferRequest(player)?.status === "pending";
}

/**
 * 找出该递交转会申请的球员。
 * 触发条件全部来自既有事实：连续违约出场承诺（breaches≥2 已置 wantsTransfer）、
 * 对主帅关系恶劣、且本赛季尚未递交过。
 */
function findTransferRequester(club, world) {
  for (const player of club.players || []) {
    if (!player.wantsTransfer) continue;
    const existing = ensureTransferRequest(player);
    // 同一赛季只递交一次；被驳回后要等到下赛季或再次违约才会重提
    if (existing && existing.season === world.season) continue;
    const pathway = ensurePlayerPathway(player, club, world);
    if (Number(pathway.breaches || 0) < 2) continue;
    if (Number(player.relation || 0) > -1) continue;
    return player;
  }
  return null;
}

export function harmonyLabel(score, lang = "zh") {
  if (lang === "en") {
    if (score >= 78) return "United";
    if (score >= 60) return "Settled";
    if (score >= 42) return "Uneasy";
    if (score >= 25) return "Split";
    return "Fractured";
  }
  if (score >= 78) return "团结";
  if (score >= 60) return "融洽";
  if (score >= 42) return "微妙";
  if (score >= 25) return "分裂";
  return "失控";
}

/**
 * 每日推进：把更衣室矛盾转成可见后果。
 * 与 processRelationsDay 一致，只返回信箱草稿，由 engine 投递以避免环依赖。
 */
export function processDressingRoomDay(world) {
  if (!world || world.seasonOver || world.sacked) return null;
  const club = world.clubs?.find((c) => c.id === world.userClubId);
  if (!club) return null;

  const harmony = dressingRoomHarmony(club, world);
  club._harmony = harmony;

  // 正式转会申请：比派系抱怨更紧急，优先投递
  const requester = findTransferRequester(club, world);
  if (requester) {
    requester.transferRequest = {
      status: "pending",
      season: world.season,
      day: world.day || 0,
      reason: "playing-time",
    };
    const allies = (dressingRoomFactions(club, world).find((f) =>
      f.memberIds.includes(requester.id)
    )?.size || 1) - 1;
    return {
      inboxDraft: {
        category: "player",
        priority: 3,
        title: `${requester.name} 正式递交转会申请`,
        titleEn: `${requester.name} hands in a transfer request`,
        body: `出场承诺连续未兑现，${requester.name} 要求离队。${
          allies > 0 ? `更衣室里与他交好的 ${allies} 名队友正在观望你的处理。` : "如何处理会被全队看在眼里。"
        }`,
        bodyEn: `After repeated broken playing-time promises, ${requester.name} wants to leave.${
          allies > 0 ? ` The ${allies} teammates closest to him are watching how you respond.` : " The squad is watching how you respond."
        }`,
        dedupeKey: `transfer_request_${requester.id}_${world.season}`,
        expiresDay: (world.day || 0) + 14,
        ref: { kind: "transfer_request", playerId: requester.id },
        actions: [
          { id: "grant_request", label: "批准并挂牌", labelEn: "Accept and list", primary: true },
          { id: "reject_request", label: "驳回申请", labelEn: "Reject" },
          { id: "promise", label: "承诺出场挽留", labelEn: "Promise minutes" },
        ],
      },
    };
  }

  // 领袖长期得不到出场，会带着整个派系离心
  const factions = dressingRoomFactions(club, world);
  for (const faction of factions) {
    const leader = club.players.find((p) => p.id === faction.leaderId);
    if (!leader) continue;
    const pathway = ensurePlayerPathway(leader, club, world);
    if (Number(pathway.breaches || 0) < 2 || faction.stance > -0.5) continue;
    return {
      inboxDraft: {
        category: "player",
        priority: 3,
        title: `${leader.name} 代表更衣室表达不满`,
        titleEn: `${leader.name} speaks for a unsettled dressing room`,
        body: `作为队内领袖，${leader.name} 认为自己的出场承诺未兑现，与他交好的 ${faction.size - 1} 名队友情绪同样受影响。`,
        bodyEn: `As a dressing-room leader, ${leader.name} feels his playing-time promise was broken; the ${faction.size - 1} teammates closest to him are unsettled too.`,
        dedupeKey: `faction_unrest_${leader.id}`,
        expiresDay: (world.day || 0) + 10,
        ref: { kind: "player_talk", playerId: leader.id },
        actions: [
          { id: "listen", label: "倾听诉求", labelEn: "Listen", primary: true },
          { id: "promise", label: "承诺出场", labelEn: "Promise minutes" },
          { id: "criticize", label: "强硬回应", labelEn: "Push back" },
          { id: "ack", label: "稍后", labelEn: "Later" },
        ],
      },
    };
  }
  return null;
}

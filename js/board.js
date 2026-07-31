/** 董事会目标：赛季任务、进度、奖惩 */

import { DIVISIONS } from "./data.js";
import { formatMoney } from "./models.js";
import { pushBoardInbox, pushBoardObjectiveMail } from "./inbox.js";
import { recordFinanceEntry } from "./finance-ledger.js";

const STATUS_LABEL = {
  active: "进行中",
  on_track: "达标中",
  met: "达标中",
  tight: "边缘",
  at_risk: "危险",
  danger: "危险",
  success: "完成",
  achieved: "完成",
  failed: "未完成",
};

function ordinalEn(n) {
  const value = Number(n) || 0;
  const mod100 = value % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : value % 10 === 1
        ? "st"
        : value % 10 === 2
          ? "nd"
          : value % 10 === 3
            ? "rd"
            : "th";
  return `${value}${suffix}`;
}

export const CLUB_PLAN_DEFS = {
  compete: {
    label: "即战争胜",
    labelEn: "Compete now",
    desc: "优先成熟即战力与关键比赛阵容稳定",
    descEn: "Prioritise proven quality and stability in key matches",
    youthWeight: 0.1,
    valueWeight: 0.15,
    ovrWeight: 1.25,
  },
  youth: {
    label: "培养青年",
    labelEn: "Develop youth",
    desc: "保护高潜年轻人，并为其创造轮换机会",
    descEn: "Protect high-potential youngsters and create rotation opportunities",
    youthWeight: 1.25,
    valueWeight: 0.25,
    ovrWeight: 0.9,
  },
  rebuild: {
    label: "更新换代",
    labelEn: "Rebuild the squad",
    desc: "降低阵容年龄，逐步替换高龄球员",
    descEn: "Lower the squad age and phase out older players",
    youthWeight: 0.85,
    valueWeight: 0.35,
    ovrWeight: 1,
  },
  sustainable: {
    label: "财政稳健",
    labelEn: "Financial stability",
    desc: "控制转会费与工资，优先高性价比补强",
    descEn: "Control fees and wages while seeking value",
    youthWeight: 0.45,
    valueWeight: 0.75,
    ovrWeight: 0.9,
  },
  attacking: {
    label: "主动进攻",
    labelEn: "Proactive football",
    desc: "围绕传控与前场能力建设阵容",
    descEn: "Build around possession and attacking quality",
    youthWeight: 0.3,
    valueWeight: 0.3,
    ovrWeight: 1,
  },
  resilient: {
    label: "稳固防守",
    labelEn: "Defensive resilience",
    desc: "重视门将、防线、对抗与阵容深度",
    descEn: "Prioritise goalkeeping, defence, physicality and depth",
    youthWeight: 0.25,
    valueWeight: 0.35,
    ovrWeight: 1,
  },
  balanced: {
    label: "均衡建设",
    labelEn: "Balanced build",
    desc: "按位置短板和年龄结构稳步补强",
    descEn: "Address positional and age-profile needs steadily",
    youthWeight: 0.35,
    valueWeight: 0.35,
    ovrWeight: 1,
  },
};

function average(items, getValue) {
  return items.length ? items.reduce((sum, item) => sum + getValue(item), 0) / items.length : 0;
}

/** 同一份阵容/财政数据生成赛季计划，供董事会、AI 转会和界面共用。 */
export function generateClubSeasonPlan(club, allClubs, season) {
  const players = club?.players || [];
  const peers = (allClubs || []).filter((item) => item.division === club.division);
  const powerRank = Math.max(1, [...peers]
    .sort((a, b) => (b.power || 0) - (a.power || 0))
    .findIndex((item) => item.id === club.id) + 1);
  const avgAge = average(players, (player) => Number(player.age) || 25);
  const youngShare = players.filter((player) => (player.age || 25) <= 23).length / Math.max(1, players.length);
  const weeklyWage = players.reduce((sum, player) => sum + (Number(player.wage) || 0), 0);
  const youthLevel = Number(club?.facilities?.youth || club?.youth?.level) || 1;
  const posAvg = (positions) => average(
    players.filter((player) => positions.includes(player.pos)),
    (player) => Number(player.ovr) || 10
  );
  const attack = posAvg(["MID", "ATT"]);
  const defense = posAvg(["GK", "DEF"]);

  let key = "balanced";
  if ((club.money || 0) < weeklyWage * 10) key = "sustainable";
  else if (avgAge >= 28.4) key = "rebuild";
  else if (youthLevel >= 4 || youngShare >= 0.36) key = "youth";
  else if (powerRank <= 4) key = "compete";
  else if (attack >= defense + 0.8) key = "attacking";
  else if (defense >= attack + 0.8) key = "resilient";

  const def = CLUB_PLAN_DEFS[key] || CLUB_PLAN_DEFS.balanced;
  return {
    season: season ?? null,
    key,
    label: def.label,
    labelEn: def.labelEn,
    desc: def.desc,
    descEn: def.descEn,
    metrics: {
      avgAge: Math.round(avgAge * 10) / 10,
      youngShare: Math.round(youngShare * 100),
      powerRank,
      youthLevel,
    },
  };
}

export function ensureClubSeasonPlan(club, allClubs, season) {
  if (!club) return null;
  if (!club.seasonPlan || club.seasonPlan.season !== season) {
    club.seasonPlan = generateClubSeasonPlan(club, allClubs, season);
  }
  return club.seasonPlan;
}

export function ensureWorldSeasonPlans(world) {
  if (!world?.clubs) return [];
  return world.clubs.map((club) => ensureClubSeasonPlan(club, world.clubs, world.season));
}

export function clubPlanDef(planOrClub) {
  const key = planOrClub?.key || planOrClub?.seasonPlan?.key || "balanced";
  return CLUB_PLAN_DEFS[key] || CLUB_PLAN_DEFS.balanced;
}

/** 按队力在本级排名生成目标 */
export function generateBoardObjective(userClub, allClubs, season) {
  const div = userClub.division || 3;
  const peers = allClubs.filter((c) => (c.division || 3) === div);
  const sorted = [...peers].sort(
    (a, b) => (b.power || 0) - (a.power || 0) || String(a.id).localeCompare(String(b.id))
  );
  const powerRank = Math.max(1, sorted.findIndex((c) => c.id === userClub.id) + 1);
  const n = peers.length || 20;
  const division = DIVISIONS[div] || DIVISIONS[3];
  const tier = division.tier || 3;
  const upperName = DIVISIONS[division.upperDivision]?.name || "上级联赛";

  let type;
  let targetPos;
  let label;

  if (tier > 1 && !division.lowerDivision) {
    if (powerRank <= 4) {
      type = "promote";
      targetPos = division.promote || 3;
      label = `升级${upperName}（前 ${targetPos} 名）`;
    } else if (powerRank <= Math.ceil(n / 2)) {
      type = "top_half";
      targetPos = Math.ceil(n / 2);
      label = `杀入前半区（前 ${targetPos}）`;
    } else {
      type = "midtable";
      targetPos = Math.max(1, n - 4);
      label = `稳住中游（前 ${targetPos}）`;
    }
  } else if (tier > 1) {
    if (powerRank <= 3) {
      type = "promote";
      targetPos = division.promote || 3;
      label = `升级${upperName}（前 ${targetPos} 名）`;
    } else if (powerRank >= n - 4) {
      type = "survive";
      targetPos = n - 3;
      label = `保级（第 ${n - 3} 名或更好）`;
    } else if (powerRank <= 8) {
      type = "top_half";
      targetPos = Math.ceil(n / 2);
      label = `冲击前半区（前 ${targetPos}）`;
    } else {
      type = "midtable";
      targetPos = Math.max(1, n - 4);
      label = `中游安全（前 ${targetPos}）`;
    }
  } else if (powerRank <= 2) {
    type = "title";
    targetPos = 1;
    label = "争夺冠军（第 1）";
  } else if (powerRank <= 6) {
    type = "top_half";
    targetPos = 6;
    label = "前 6 名";
  } else if (powerRank >= n - 4) {
    type = "survive";
    targetPos = n - 3;
    label = `保级（第 ${n - 3} 名或更好）`;
  } else {
    type = "midtable";
    targetPos = 12;
    label = "中游安全区（前 12）";
  }

  const pot = Math.max(2_000_000, userClub.money || 5_000_000);
  const bonus = Math.round((pot * 0.06 + 400_000) / 10_000) * 10_000;
  const fine = Math.round((bonus * 0.55) / 10_000) * 10_000;
  const seasonPlan = ensureClubSeasonPlan(userClub, allClubs, season);

  return {
    season: season || null,
    division: div,
    type,
    targetPos,
    label,
    bonus,
    fine,
    status: "active",
    lastCheckDay: 0,
    settled: false,
    /** 解雇警告 0–4，满 4 中途解雇 */
    sackWarnings: 0,
    sacked: false,
    planKey: seasonPlan?.key || "balanced",
    planLabel: seasonPlan?.label || CLUB_PLAN_DEFS.balanced.label,
    planLabelEn: seasonPlan?.labelEn || CLUB_PLAN_DEFS.balanced.labelEn,
    planDesc: seasonPlan?.desc || CLUB_PLAN_DEFS.balanced.desc,
    planDescEn: seasonPlan?.descEn || CLUB_PLAN_DEFS.balanced.descEn,
  };
}

/** 确保本赛季有董事会目标 */
export function ensureBoardObjective(world) {
  if (!world) return null;
  const user = world.clubs?.find((c) => c.id === world.userClubId);
  if (!user) return null;
  ensureWorldSeasonPlans(world);

  if (!world.board || world.board.season !== world.season) {
    world.board = generateBoardObjective(user, world.clubs, world.season);
    world.news = world.news || [];
    world.news.unshift({
      day: world.day || 1,
      text: `董事会目标：${world.board.label}。赛季计划「${world.board.planLabel}」：${world.board.planDesc}。达成奖金 ${formatMoney(world.board.bonus)}，未完成罚款 ${formatMoney(world.board.fine)}。`,
    });
    try {
      pushBoardObjectiveMail(world, world.board);
    } catch (_) {
      /* ignore */
    }
  }
  const plan = ensureClubSeasonPlan(user, world.clubs, world.season);
  if (!world.board.planKey) {
    world.board.planKey = plan?.key || "balanced";
    world.board.planLabel = plan?.label || CLUB_PLAN_DEFS.balanced.label;
    world.board.planLabelEn = plan?.labelEn || CLUB_PLAN_DEFS.balanced.labelEn;
    world.board.planDesc = plan?.desc || CLUB_PLAN_DEFS.balanced.desc;
    world.board.planDescEn = plan?.descEn || CLUB_PLAN_DEFS.balanced.descEn;
  }
  return world.board;
}

export function boardStatusLabel(status) {
  return STATUS_LABEL[status] || status || "—";
}

/**
 * 当前进度
 * status: active | met | danger | success | failed
 */
export function evaluateBoardProgress(world, sortedTableFn) {
  const board = ensureBoardObjective(world);
  if (!board) return null;
  const user = world.clubs.find((c) => c.id === world.userClubId);
  if (!user) return null;

  let table = [];
  if (typeof sortedTableFn === "function") {
    table = sortedTableFn(world, user.division || 3);
  } else {
    const div = user.division || 3;
    table = world.clubs
      .filter((c) => (c.division || 3) === div)
      .map((c) => {
        const t = world.table?.[c.id] || { pts: 0, gf: 0, ga: 0, played: 0 };
        return {
          id: c.id,
          pts: t.pts || 0,
          gd: (t.gf || 0) - (t.ga || 0),
          gf: t.gf || 0,
          played: t.played || 0,
        };
      })
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  }

  const pos = table.findIndex((r) => r.id === user.id) + 1;
  const row = table.find((r) => r.id === user.id);
  const played = row?.played || 0;

  let status = board.status;
  if (board.settled) {
    status = board.status === "achieved" || board.status === "success" ? "success" : "failed";
  } else if (world.seasonOver) {
    status = pos > 0 && pos <= board.targetPos ? "success" : "failed";
  } else if (played < 6) {
    status = "active";
  } else if (pos > 0 && pos <= board.targetPos) {
    status = "met";
  } else if (pos > 0 && pos <= board.targetPos + 2) {
    status = "active";
  } else {
    status = "danger";
  }

  if (!board.settled) board.status = status;

  return {
    board,
    pos,
    played,
    status,
    targetPos: board.targetPos,
    label: board.label,
    bonus: board.bonus,
    fine: board.fine,
    settled: !!board.settled,
  };
}

/**
 * 执行解雇：标记存档、新闻、士气崩盘。
 * 返回 { sacked: true, msg } 供 UI 弹回菜单。
 */
export function sackManager(world, reason = "") {
  const board = ensureBoardObjective(world);
  const user = world.clubs?.find((c) => c.id === world.userClubId);
  if (!user) return { sacked: false };

  if (board) {
    board.sacked = true;
    board.status = "failed";
  }
  world.sacked = true;
  world.sackedDay = world.day;
  world.sackedReason = reason || "董事会对成绩失去耐心";
  try {
    if (!world.managerCareer) world.managerCareer = { sacked: 0 };
    world.managerCareer.sacked = (world.managerCareer.sacked || 0) + 1;
  } catch (_) {
    /* ignore */
  }

  for (const p of user.players || []) {
    p.morale = Math.max(20, (p.morale || 70) - 12);
  }

  world.news = world.news || [];
  world.news.unshift({
    day: world.day,
    text: `🚨 解雇通告：${world.managerName || "经理"} 被 ${user.name} 董事会解除职务。${world.sackedReason}`,
  });

  return {
    sacked: true,
    msg: `你已被 ${user.name} 解雇。${world.sackedReason}`,
    clubName: user.name,
  };
}

/** 赛季中施压/鼓励（约每 14 天）；危险累计警告，满 4 解雇（改进：从 3 次提升到 4 次，更宽容） */
export function checkBoardMidSeason(world, sortedTableFn) {
  if (!world || world.seasonOver || world.sacked) return null;
  const board = ensureBoardObjective(world);
  if (!board || board.settled || board.sacked) return null;

  const prog = evaluateBoardProgress(world, sortedTableFn);
  if (!prog || prog.played < 8) return null;
  if (world.day - (board.lastCheckDay || 0) < 14) return null;

  const prev = board._lastNewsStatus || "active";
  board.lastCheckDay = world.day;
  board._lastNewsStatus = prog.status;
  if (board.sackWarnings == null) board.sackWarnings = 0;

  const user = world.clubs.find((c) => c.id === world.userClubId);
  if (!user) return null;

  if (prog.status === "danger") {
    // 持续危险就加警告；刚进入危险也加
    board.sackWarnings = Math.min(4, (board.sackWarnings || 0) + 1);
    const w = board.sackWarnings;
    if (w >= 4) {
      return sackManager(
        world,
        `联赛第 ${prog.pos}，远未达到「${board.label}」，董事会忍无可忍。`
      );
    }
    if (w === 3) {
      const text = `⚠️ 最后警告：当前第 ${prog.pos}，目标「${board.label}」。再无起色将被解雇！（警告 ${w}/4）`;
      world.news.unshift({ day: world.day, text });
      pushBoardInbox(world, {
        title: "董事会最后警告",
        titleEn: "Final warning from the board",
        body: text,
        bodyEn: `Final warning: the club is ${ordinalEn(prog.pos)}, with a target of top ${board.targetPos}. Results must improve to avoid dismissal. Warning ${w}/4.`,
        warning: true,
        priority: 3,
      });
    } else {
      const text = `董事会施压：当前第 ${prog.pos}，目标「${board.label}」。警告 ${w}/4 · 未完成将罚 ${formatMoney(board.fine)}。`;
      world.news.unshift({ day: world.day, text });
      pushBoardInbox(world, {
        title: "董事会施压",
        titleEn: "The board demands improvement",
        body: text,
        bodyEn: `The club is ${ordinalEn(prog.pos)}, with a target of top ${board.targetPos}. Warning ${w}/4 · failure penalty ${formatMoney(board.fine)}.`,
        warning: true,
        priority: 3,
      });
    }
    for (const p of user.players || []) {
      p.morale = Math.max(30, (p.morale || 70) - 2 - w);
    }
  } else if (prog.status === "met") {
    // 改进：连续达标时可减免警告（最多连续 3 次达标减免 1 次警告）
    if ((board.sackWarnings || 0) > 0) {
      board._consecutiveMet = (board._consecutiveMet || 0) + 1;
      if (board._consecutiveMet >= 3) {
        board.sackWarnings = Math.max(0, board.sackWarnings - 1);
        board._consecutiveMet = 0;
        const text = `董事会认可：排名回升至第 ${prog.pos}，连续达标表现良好。警告降至 ${board.sackWarnings}/4。`;
        world.news.unshift({ day: world.day, text });
        pushBoardInbox(world, {
          title: "董事会认可近况",
          titleEn: "The board acknowledges recent progress",
          body: text,
          bodyEn: `The club has recovered to ${ordinalEn(prog.pos)} and sustained good form. Warnings reduced to ${board.sackWarnings}/4.`,
          priority: 1,
        });
        for (const p of user.players || []) {
          p.morale = Math.min(100, (p.morale || 70) + 3);
        }
      }
    } else if (prev === "danger") {
      board._consecutiveMet = 0;
      const text = `董事会认可：排名回升至第 ${prog.pos}，目标「${board.label}」重回正轨。`;
      world.news.unshift({ day: world.day, text });
      pushBoardInbox(world, {
        title: "董事会认可近况",
        titleEn: "The board acknowledges recent progress",
        body: text,
        bodyEn: `The club has recovered to ${ordinalEn(prog.pos)} and the target of top ${board.targetPos} is back on track.`,
        priority: 1,
      });
      for (const p of user.players || []) {
        p.morale = Math.min(100, (p.morale || 70) + 1);
      }
    }
  } else if (prog.status === "danger" && world.day % 28 < 3) {
    const text = `目标告急：仍在第 ${prog.pos}（目标前 ${board.targetPos}）· 警告 ${board.sackWarnings || 0}/4`;
    world.news.unshift({ day: world.day, text });
    pushBoardInbox(world, {
      title: "目标告急",
      titleEn: "Board objective at risk",
      body: text,
      bodyEn: `The club remains ${ordinalEn(prog.pos)} against a top-${board.targetPos} target · warnings ${board.sackWarnings || 0}/4.`,
      warning: true,
      priority: 2,
    });
  }
  return null;
}

/** 赛季末结算奖金/罚款；严重未完成可能解雇 */
export function settleBoardObjective(world, finalPos, sortedTableFn) {
  const board = world?.board;
  if (!board || board.settled) return null;
  if (board.season != null && board.season !== world.season) return null;
  if (world.sacked || board.sacked) {
    board.settled = true;
    return { ok: false, status: "failed", sacked: true };
  }

  const user = world.clubs.find((c) => c.id === world.userClubId);
  if (!user) return null;

  let pos = finalPos;
  if (pos == null || pos <= 0) {
    const prog = evaluateBoardProgress(world, sortedTableFn);
    pos = prog?.pos || 99;
  }

  const ok = pos <= board.targetPos;
  board.settled = true;
  board.finalPos = pos;
  board.status = ok ? "success" : "failed";

  const divName = DIVISIONS[board.division || user.division || 3]?.name || "";
  if (ok) {
    recordFinanceEntry(user, board.bonus, { category: "board", source: "board-bonus", season: world.season, day: world.day });
    board.sackWarnings = 0;
    world.news.unshift({
      day: world.day,
      text: `董事会目标完成！${divName}第 ${pos} 名 · 「${board.label}」。奖金 ${formatMoney(board.bonus)} 已到账。`,
    });
    for (const p of user.players || []) {
      p.morale = Math.min(100, (p.morale || 70) + 4);
    }
    return { ok: true, status: "success", money: board.bonus };
  }

  recordFinanceEntry(user, -board.fine, { category: "board", source: "board-fine", season: world.season, day: world.day });
  world.news.unshift({
    day: world.day,
    text: `董事会目标未完成：${divName}第 ${pos} 名（目标前 ${board.targetPos}）。罚款 ${formatMoney(board.fine)}。`,
  });
  for (const p of user.players || []) {
    p.morale = Math.max(25, (p.morale || 70) - 5);
  }

  // 赛季末解雇：警告≥2，或名次远差于目标（+5 名以上）
  const warnings = board.sackWarnings || 0;
  const farMiss = pos > board.targetPos + 5;
  const shouldSack = warnings >= 2 || farMiss;
  if (shouldSack) {
    const sack = sackManager(
      world,
      `赛季结束${divName}第 ${pos}（目标前 ${board.targetPos}），董事会不再续约。`
    );
    return { ok: false, status: "failed", money: -board.fine, sacked: true, sack };
  }

  return { ok: false, status: "failed", money: -board.fine, sacked: false };
}

export function boardObjectiveLabel(board) {
  return board?.label || "—";
}

/** UI 一行摘要 */
export function boardStatusLine(board) {
  if (!board) return "—";
  if (board.sacked) {
    return `${board.label} · 已解雇`;
  }
  if (board.settled) {
    const st = board.status === "success" || board.status === "achieved" ? "已完成" : "未完成";
    return `${board.label} · ${st}（赛季末第 ${board.finalPos ?? "—"}）`;
  }
  const w = board.sackWarnings || 0;
  const warn = w > 0 ? ` · 警告 ${w}/4` : "";
  const plan = board.planLabel ? ` · 计划「${board.planLabel}」` : "";
  return `${board.label} · ${boardStatusLabel(board.status)}${warn}${plan} · 奖 ${formatMoney(board.bonus)} / 罚 ${formatMoney(board.fine)}`;
}

/** UI 样式：ok | warn | danger | "" */
export function boardTone(board) {
  if (!board) return "";
  if (board.settled) {
    return board.status === "success" || board.status === "achieved" ? "ok" : "danger";
  }
  const s = board.status;
  if (s === "met" || s === "on_track" || s === "success" || s === "achieved") return "ok";
  if (s === "tight" || s === "warn") return "warn";
  if (s === "danger" || s === "at_risk" || s === "failed") return "danger";
  return "";
}

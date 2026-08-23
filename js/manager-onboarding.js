/**
 * First-week manager onboarding.
 *
 * The state is intentionally small and stored with the world so a refresh or
 * a save transfer cannot restart the guide. Older saves are treated as
 * already-established careers and skip the guide automatically.
 */

export const MANAGER_ONBOARDING_VERSION = 1;

export const MANAGER_ONBOARDING_STEPS = Object.freeze([
  Object.freeze({
    id: "squad",
    tab: "squad",
    icon: "👥",
    title: "检查阵容",
    titleEn: "Review the squad",
    detail: "先确认可用球员、体能和出场定位。",
    detailEn: "Check availability, fitness and playing-time status before the first match.",
    action: "打开阵容",
    actionEn: "Open squad",
  }),
  Object.freeze({
    id: "tactics",
    tab: "tactics",
    icon: "🧭",
    title: "确认比赛计划",
    titleEn: "Set the match plan",
    detail: "查看基础阵型、角色与攻防阶段形态。",
    detailEn: "Review the formation, roles and possession phases.",
    action: "打开战术",
    actionEn: "Open tactics",
  }),
  Object.freeze({
    id: "training",
    tab: "training",
    icon: "🏋️",
    title: "安排本周训练",
    titleEn: "Set this week's training",
    detail: "在恢复、成长和伤病风险之间做一次取舍。",
    detailEn: "Choose a trade-off between recovery, growth and injury risk.",
    action: "打开训练",
    actionEn: "Open training",
  }),
  Object.freeze({
    id: "match",
    tab: "fixtures",
    icon: "⚽",
    title: "完成第一场比赛",
    titleEn: "Complete the first match",
    detail: "赛前查看简报，中场可以调整，赛后查看真实比赛分析。",
    detailEn: "Read the briefing, make a half-time adjustment if needed, then review the analysis.",
    action: "查看下一场",
    actionEn: "View next match",
  }),
]);

/**
 * 只靠打开对应页签就能完成的步骤。从步骤表派生而不是另抄一份，
 * 这样改页签名或步骤 id 时两边不会走散。比赛步骤的页签是赛程，
 * 但它要真的打完一场才算数，所以自然被这里排除。
 */
export const MANAGER_ONBOARDING_TAB_STEPS = Object.freeze(
  MANAGER_ONBOARDING_STEPS.filter((step) => step.tab === step.id).map((step) => step.id)
);

function hasPlayedUserMatch(world) {
  const userClubId = world?.userClubId;
  return !!(userClubId && (world.fixtures || []).some(
    (fixture) => fixture.played && (fixture.home === userClubId || fixture.away === userClubId)
  ));
}

function isEstablishedCareer(world) {
  return Number(world?.day) > 1 || Number(world?.managerCareer?.matches) > 0 || hasPlayedUserMatch(world);
}

function normalizeSteps(steps) {
  const source = steps && typeof steps === "object" ? steps : {};
  return Object.fromEntries(MANAGER_ONBOARDING_STEPS.map((step) => [step.id, source[step.id] === true]));
}

export function ensureManagerOnboarding(world) {
  if (!world) return null;
  const existing = world.managerOnboarding;
  const needsInitialization = !existing || Number(existing.version) !== MANAGER_ONBOARDING_VERSION;
  if (needsInitialization) {
    world.managerOnboarding = {
      version: MANAGER_ONBOARDING_VERSION,
      // 版本迁移保留玩家已经表达过的选择和进度：跳过过引导、或已经走完几步的
      // 存档，不该因为一次版本号变更又被从头引导一遍。生涯推断继续兜底，
      // 这样字段损坏的老存档也不会被重新引导。
      // normalizeSteps 会丢掉不再存在的步骤，新步骤默认未完成。
      dismissed: existing?.dismissed === true || isEstablishedCareer(world),
      steps: existing?.steps,
    };
  }
  const state = world.managerOnboarding;
  state.version = MANAGER_ONBOARDING_VERSION;
  state.steps = normalizeSteps(state.steps);
  if (state.dismissed) state.steps.match = true;
  return state;
}

export function completeManagerOnboardingStep(world, stepId) {
  const state = ensureManagerOnboarding(world);
  if (!state || state.dismissed || !MANAGER_ONBOARDING_STEPS.some((step) => step.id === stepId)) return false;
  if (state.steps[stepId]) return false;
  state.steps[stepId] = true;
  if (stepId === "match") state.dismissed = true;
  return true;
}

export function dismissManagerOnboarding(world) {
  const state = ensureManagerOnboarding(world);
  if (!state || state.dismissed) return false;
  state.dismissed = true;
  return true;
}

export function managerOnboardingView(world) {
  const state = ensureManagerOnboarding(world);
  if (!state || state.dismissed) return null;
  const steps = MANAGER_ONBOARDING_STEPS.map((step) => ({
    ...step,
    done: state.steps[step.id] === true,
  }));
  const completed = steps.filter((step) => step.done).length;
  return {
    version: state.version,
    completed,
    total: steps.length,
    steps,
  };
}

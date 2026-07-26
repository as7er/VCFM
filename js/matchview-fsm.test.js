/**
 * MatchView FSM 单元测试
 *
 * 运行方式：node js/matchview-fsm.test.js
 */

import { MatchViewFSM } from './matchview-fsm.js';

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || 'Assertion failed'}\nExpected: ${expected}\nActual: ${actual}`
    );
  }
}

// ============ 测试用例 ============

test('初始状态应该是 IDLE', () => {
  const fsm = new MatchViewFSM();
  assert(fsm.is('IDLE'), 'Initial state should be IDLE');
  assertEqual(fsm.state, 'IDLE');
  assertEqual(fsm.subState, null);
});

test('从 IDLE 只能转换到 PRE_MATCH', () => {
  const fsm = new MatchViewFSM();

  assert(fsm.transition('PRE_MATCH'), 'Should allow IDLE -> PRE_MATCH');
  assert(fsm.is('PRE_MATCH'), 'State should be PRE_MATCH');

  const fsm2 = new MatchViewFSM();
  assert(!fsm2.transition('PLAYING'), 'Should reject IDLE -> PLAYING');
  assert(fsm2.is('IDLE'), 'Should remain in IDLE after invalid transition');
});

test('PRE_MATCH 可以进入 PLAYING 或 PAUSED', () => {
  const fsm = new MatchViewFSM();
  fsm.transition('PRE_MATCH');

  assert(fsm.transition('PLAYING'), 'Should allow PRE_MATCH -> PLAYING');

  const fsm2 = new MatchViewFSM();
  fsm2.transition('PRE_MATCH');
  assert(fsm2.transition('PAUSED'), 'Should allow PRE_MATCH -> PAUSED');
});

test('PLAYING 可以有子状态', () => {
  const fsm = new MatchViewFSM();
  fsm.transition('PRE_MATCH');
  fsm.transition('PLAYING', 'FREE_PLAY');

  assert(fsm.is('PLAYING', 'FREE_PLAY'), 'Should be in PLAYING.FREE_PLAY');
  assert(fsm.isIn('PLAYING'), 'Should be in PLAYING family');

  fsm.transition('PLAYING', 'SIM_DRIVEN');
  assert(fsm.is('PLAYING', 'SIM_DRIVEN'), 'Should transition to SIM_DRIVEN');
});

test('GOAL_SEQUENCE 子状态按顺序流转', () => {
  const fsm = new MatchViewFSM();
  fsm.transition('PRE_MATCH');
  fsm.transition('PLAYING', 'FREE_PLAY');

  assert(fsm.transition('GOAL_SEQUENCE', 'BUILDUP'), 'Should enter BUILDUP');
  assert(fsm.transition('GOAL_SEQUENCE', 'STRIKE'), 'Should advance to STRIKE');
  assert(fsm.transition('GOAL_SEQUENCE', 'CELEBRATE'), 'Should advance to CELEBRATE');

  // 不能后退
  const fsm2 = new MatchViewFSM();
  fsm2.transition('PRE_MATCH');
  fsm2.transition('PLAYING', 'FREE_PLAY');
  fsm2.transition('GOAL_SEQUENCE', 'CELEBRATE');
  assert(
    !fsm2.transition('GOAL_SEQUENCE', 'BUILDUP'),
    'Should not allow backward transition'
  );
});

test('GOAL_SEQUENCE 完成后回到 PLAYING', () => {
  const fsm = new MatchViewFSM();
  fsm.transition('PRE_MATCH');
  fsm.transition('PLAYING', 'FREE_PLAY');
  fsm.transition('GOAL_SEQUENCE', 'CELEBRATE');

  assert(fsm.transition('PLAYING'), 'Should allow CELEBRATE -> PLAYING');

  // 未完成庆祝时不能回 PLAYING
  const fsm2 = new MatchViewFSM();
  fsm2.transition('PRE_MATCH');
  fsm2.transition('PLAYING', 'FREE_PLAY');
  fsm2.transition('GOAL_SEQUENCE', 'BUILDUP');
  assert(!fsm2.transition('PLAYING'), 'Should reject BUILDUP -> PLAYING');
});

test('canAIAct() 只在 FREE_PLAY 时返回 true', () => {
  const fsm = new MatchViewFSM();
  fsm.transition('PRE_MATCH');
  assert(!fsm.canAIAct(), 'Should not allow AI in PRE_MATCH');

  fsm.transition('PLAYING', 'FREE_PLAY');
  assert(fsm.canAIAct(), 'Should allow AI in FREE_PLAY');

  fsm.transition('PLAYING', 'SCRIPTED');
  assert(!fsm.canAIAct(), 'Should not allow AI in SCRIPTED');

  fsm.transition('PAUSED');
  assert(!fsm.canAIAct(), 'Should not allow AI when PAUSED');
});

test('shouldShowPauseUI() 在 PAUSED 和 PRE_MATCH 时返回 true', () => {
  const fsm = new MatchViewFSM();

  assert(!fsm.shouldShowPauseUI(), 'IDLE should not show pause UI');

  fsm.transition('PRE_MATCH');
  assert(fsm.shouldShowPauseUI(), 'PRE_MATCH should show pause UI');

  fsm.transition('PLAYING');
  assert(!fsm.shouldShowPauseUI(), 'PLAYING should not show pause UI');

  fsm.transition('PAUSED');
  assert(fsm.shouldShowPauseUI(), 'PAUSED should show pause UI');
});

test('状态监听器应该被触发', () => {
  const fsm = new MatchViewFSM();
  let exitCalled = false;
  let enterCalled = false;

  fsm.on('exit:IDLE', (data) => {
    exitCalled = true;
    assertEqual(data.from, 'IDLE');
    assertEqual(data.to, 'PRE_MATCH');
  });

  fsm.on('enter:PRE_MATCH', (data) => {
    enterCalled = true;
    assertEqual(data.from, 'IDLE');
    assertEqual(data.to, 'PRE_MATCH');
  });

  fsm.transition('PRE_MATCH');

  assert(exitCalled, 'Exit listener should be called');
  assert(enterCalled, 'Enter listener should be called');
});

test('describe() 应该返回可读的状态描述', () => {
  const fsm = new MatchViewFSM();
  assertEqual(fsm.describe(), 'IDLE');

  fsm.transition('PRE_MATCH');
  assertEqual(fsm.describe(), 'PRE_MATCH');

  fsm.transition('PLAYING', 'FREE_PLAY');
  assertEqual(fsm.describe(), 'PLAYING.FREE_PLAY');
});

test('FULL_TIME 是终态', () => {
  const fsm = new MatchViewFSM();
  fsm.transition('PRE_MATCH');
  fsm.transition('PLAYING');
  fsm.transition('FULL_TIME');

  assert(fsm.is('FULL_TIME'), 'Should be in FULL_TIME');
  assert(!fsm.transition('PLAYING'), 'Should not allow transition from FULL_TIME');
  assert(fsm.is('FULL_TIME'), 'Should remain in FULL_TIME');
});

test('完整的比赛流程', () => {
  const fsm = new MatchViewFSM();

  // 开场
  assert(fsm.transition('PRE_MATCH'), 'Start: IDLE -> PRE_MATCH');
  assert(fsm.transition('PLAYING', 'FREE_PLAY'), 'Kickoff: PRE_MATCH -> PLAYING.FREE_PLAY');

  // 进球
  assert(fsm.transition('GOAL_SEQUENCE', 'BUILDUP'), 'Goal starts');
  assert(fsm.transition('GOAL_SEQUENCE', 'STRIKE'), 'Shot');
  assert(fsm.transition('GOAL_SEQUENCE', 'CELEBRATE'), 'Celebrate');
  assert(fsm.transition('PLAYING', 'FREE_PLAY'), 'Resume play');

  // 暂停
  assert(fsm.transition('PAUSED'), 'User pauses');
  assert(fsm.transition('PLAYING', 'FREE_PLAY'), 'User resumes');

  // 中场
  assert(fsm.transition('HALF_TIME'), 'Half time');
  assert(fsm.transition('PLAYING', 'FREE_PLAY'), 'Second half');

  // 结束
  assert(fsm.transition('FULL_TIME'), 'Full time');
  assert(fsm.is('FULL_TIME'), 'Match ended');
});

// ============ 运行测试 ============

console.log('\n🧪 Running MatchViewFSM Tests...\n');

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   ${error.message}`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${tests.length} total\n`);

if (failed > 0) {
  process.exit(1);
}

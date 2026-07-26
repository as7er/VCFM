/**
 * DirectorScript 单元测试
 * 测试配置驱动的叙事系统
 */

import { GOAL_NARRATIVE, DirectorScript } from './matchview-director.js';

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assertApprox(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}\n  Expected: ~${expected}\n  Actual: ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

let testCount = 0;
let passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
  }
}

console.log('🧪 Running DirectorScript Tests...\n');

// ========== 配置结构测试 ==========

test('GOAL_NARRATIVE.rewatch 配置存在', () => {
  assertTrue(GOAL_NARRATIVE.rewatch, 'rewatch配置应该存在');
  assertTrue(Array.isArray(GOAL_NARRATIVE.rewatch.phases), 'phases应该是数组');
  assertTrue(GOAL_NARRATIVE.rewatch.phases.length > 0, 'phases不应该为空');
});

test('GOAL_NARRATIVE.rewatch 阶段完整性', () => {
  const phases = GOAL_NARRATIVE.rewatch.phases;
  const names = phases.map(p => p.name);

  assertTrue(names.includes('setup'), '应包含setup阶段');
  assertTrue(names.includes('pass'), '应包含pass阶段');
  assertTrue(names.includes('receive'), '应包含receive阶段');
  assertTrue(names.includes('shot'), '应包含shot阶段');
  assertTrue(names.includes('flight'), '应包含flight阶段');
  assertTrue(names.includes('net'), '应包含net阶段');
  assertTrue(names.includes('celebrate'), '应包含celebrate阶段');
});

test('每个阶段都有必需字段', () => {
  const phases = GOAL_NARRATIVE.rewatch.phases;

  for (const phase of phases) {
    assertTrue(phase.name, `阶段应有name字段: ${JSON.stringify(phase)}`);
    assertTrue(typeof phase.duration === 'number', `${phase.name}应有duration字段`);
    assertTrue(phase.duration > 0, `${phase.name}的duration应大于0`);
  }
});

// ========== DirectorScript 类测试 ==========

test('DirectorScript 初始化', () => {
  const script = new DirectorScript(GOAL_NARRATIVE.rewatch, { test: true });

  assertEqual(script.elapsed, 0, '初始elapsed应为0');
  assertTrue(script.context.test === true, 'context应被保存');
});

test('DirectorScript 获取当前阶段', () => {
  const script = new DirectorScript(GOAL_NARRATIVE.rewatch, {});

  const phase = script.currentPhase();
  assertEqual(phase.name, 'setup', '初始阶段应为setup');
});

test('DirectorScript tick 推进时间', () => {
  const script = new DirectorScript(GOAL_NARRATIVE.rewatch, {});
  const setupDuration = GOAL_NARRATIVE.rewatch.phases[0].duration;

  script.tick(setupDuration / 2);
  assertApprox(script.elapsed, setupDuration / 2, 0.01, 'elapsed应为duration的一半');

  let phase = script.currentPhase();
  assertEqual(phase.name, 'setup', '应仍在setup阶段');

  script.tick(setupDuration / 2 + 0.01);
  phase = script.currentPhase();
  assertEqual(phase.name, 'pass', '应进入pass阶段');
});

test('DirectorScript phaseProgress 进度计算', () => {
  const script = new DirectorScript(GOAL_NARRATIVE.rewatch, {});
  const setupDuration = GOAL_NARRATIVE.rewatch.phases[0].duration;

  script.tick(0);
  assertApprox(script.phaseProgress(), 0, 0.01, '阶段开始时进度应为0');

  script.tick(setupDuration / 2);
  assertApprox(script.phaseProgress(), 0.5, 0.05, '阶段中间进度应为0.5');

  script.tick(setupDuration / 2);
  assertApprox(script.phaseProgress(), 0, 0.05, '下一阶段开始进度应重置为0');
});

test('DirectorScript 完整流程', () => {
  const script = new DirectorScript(GOAL_NARRATIVE.rewatch, {});
  const phases = GOAL_NARRATIVE.rewatch.phases;

  const visitedPhases = [];

  for (const phase of phases) {
    const current = script.currentPhase();
    if (current) {
      visitedPhases.push(current.name);
    }
    script.tick(phase.duration + 0.01);
  }

  assertEqual(visitedPhases[0], 'setup', '第1阶段应为setup');
  assertEqual(visitedPhases[1], 'pass', '第2阶段应为pass');
  assertEqual(visitedPhases[2], 'receive', '第3阶段应为receive');
  assertEqual(visitedPhases[6], 'celebrate', '第7阶段应为celebrate');

  const finalPhase = script.currentPhase();
  assertEqual(finalPhase, null, '所有阶段完成后应返回null');
});

test('DirectorScript isComplete 状态', () => {
  const script = new DirectorScript(GOAL_NARRATIVE.rewatch, {});

  assertEqual(script.isComplete(), false, '初始状态不应完成');

  const totalDuration = GOAL_NARRATIVE.rewatch.phases.reduce((sum, p) => sum + p.duration, 0);
  script.tick(totalDuration + 1);

  assertEqual(script.isComplete(), true, '所有阶段完成后应标记为完成');
  assertEqual(script.currentPhase(), null, '完成后currentPhase应返回null');
});

test('DirectorScript 阶段时长总和合理', () => {
  const totalDuration = GOAL_NARRATIVE.rewatch.phases.reduce((sum, p) => sum + p.duration, 0);

  assertTrue(totalDuration > 5, '总时长应大于5秒');
  assertTrue(totalDuration < 10, '总时长应小于10秒（避免过长）');
});

test('DirectorScript speed 字段存在', () => {
  const phases = GOAL_NARRATIVE.rewatch.phases;

  for (const phase of phases) {
    assertTrue(
      typeof phase.speed === 'number' || phase.speed === undefined,
      `${phase.name}的speed字段类型应为number或undefined`
    );

    if (phase.speed !== undefined) {
      assertTrue(phase.speed > 0, `${phase.name}的speed应大于0`);
      assertTrue(phase.speed <= 1, `${phase.name}的speed应小于等于1（慢动作）`);
    }
  }
});

test('DirectorScript camera 字段存在', () => {
  const phases = GOAL_NARRATIVE.rewatch.phases;
  const validCameras = ['follow', 'box', 'wide', 'tactical'];

  for (const phase of phases) {
    if (phase.camera !== undefined) {
      assertTrue(
        validCameras.includes(phase.camera),
        `${phase.name}的camera应为有效值: ${phase.camera}`
      );
    }
  }
});

// ========== 边界情况测试 ==========

test('DirectorScript 处理零时长tick', () => {
  const script = new DirectorScript(GOAL_NARRATIVE.rewatch, {});

  script.tick(0);
  assertEqual(script.elapsed, 0, 'tick(0)不应改变elapsed');

  const phase = script.currentPhase();
  assertEqual(phase.name, 'setup', '阶段不应改变');
});

test('DirectorScript 处理负数tick', () => {
  const script = new DirectorScript(GOAL_NARRATIVE.rewatch, {});

  script.tick(-1);
  assertEqual(script.elapsed, 0, '负数tick不应改变elapsed');
});

test('DirectorScript 处理极大tick', () => {
  const script = new DirectorScript(GOAL_NARRATIVE.rewatch, );

  script.tick(999999);
  assertEqual(script.isComplete(), true, '超大tick应直接完成');
  assertEqual(script.currentPhase(), null, '应返回null');
});

// ========== 结果统计 ==========

console.log(`\n${passCount}/${testCount} tests passed`);

if (passCount === testCount) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log(`❌ ${testCount - passCount} test(s) failed`);
  process.exit(1);
}

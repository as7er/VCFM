# Phase 1: 状态机迁移计划

## 目标
将 `matchview.js` 中的 5 个状态标志重构为使用 `MatchViewFSM`，提升可维护性和状态转换的安全性。

## 当前状态标志分析

### 1. `this.phase` - 主要状态
- **值域**: `"pre"` | `"play"` | `"goal"` | `"pause"` | `"idle"`
- **用途**: 控制比赛的主要阶段
- **使用频率**: ~35 处

### 2. `this.scriptLock` - 脚本锁定
- **类型**: boolean
- **用途**: 阻止 AI 决策，允许导演脚本控制
- **使用频率**: ~10 处

### 3. `this.frozen` - 暂停标志
- **类型**: boolean
- **用途**: 完全暂停比赛（用户暂停或调试）
- **使用频率**: ~12 处

### 4. `this.aftermathUntil` - 延迟时间戳
- **类型**: number (performance.now())
- **用途**: 事件后短暂延迟（如犯规后 900ms）
- **使用频率**: ~5 处

### 5. `this.holdUntil` - (grep 未显示)
- 可能已弃用或使用较少

---

## 状态映射表

| 旧状态组合 | FSM 状态 | FSM 子状态 |
|-----------|---------|-----------|
| `phase="pre"` | `PRE_MATCH` | - |
| `phase="play" && !scriptLock && !frozen` | `PLAYING` | `FREE_PLAY` |
| `phase="play" && scriptLock` | `PLAYING` | `SCRIPTED` |
| `phase="goal"` | `GOAL_SEQUENCE` | `STRIKE` / `CELEBRATE` |
| `phase="pause"` | `PAUSED` | - |
| `frozen=true` (任意 phase) | `PAUSED` | - |

---

## 迁移策略

### 阶段 1.1: 添加 FSM 并创建兼容层（最小侵入）

**目标**: 让 FSM 与旧标志并存，不破坏现有逻辑

**步骤**:
1. 在构造函数中初始化 `this.fsm = new MatchViewFSM()`
2. 创建 getter/setter 代理旧标志到 FSM
3. 添加双向同步：旧标志变更时更新 FSM，FSM 转换时更新旧标志

**代码示例**:
```javascript
// 在构造函数中
import { MatchViewFSM } from './matchview-fsm.js';

constructor(root) {
  // ... 现有代码 ...
  
  // 初始化 FSM
  this.fsm = new MatchViewFSM();
  this._legacyPhase = "pre";
  this._legacyScriptLock = false;
  this._legacyFrozen = false;
  
  // FSM 状态监听器：同步回旧标志
  this.fsm.on('enter:PRE_MATCH', () => { this._legacyPhase = 'pre'; });
  this.fsm.on('enter:PLAYING', () => { this._legacyPhase = 'play'; });
  this.fsm.on('enter:GOAL_SEQUENCE', () => { this._legacyPhase = 'goal'; });
  this.fsm.on('enter:PAUSED', () => { this._legacyPhase = 'pause'; });
}

// Getter/Setter 代理
get phase() { return this._legacyPhase; }
set phase(val) {
  this._legacyPhase = val;
  // 同步到 FSM
  if (val === 'pre') this.fsm.transition('PRE_MATCH');
  else if (val === 'play') this.fsm.transition('PLAYING', 'FREE_PLAY');
  else if (val === 'goal') this.fsm.transition('GOAL_SEQUENCE', 'STRIKE');
  else if (val === 'pause') this.fsm.transition('PAUSED');
}

get scriptLock() { return this._legacyScriptLock; }
set scriptLock(val) {
  this._legacyScriptLock = val;
  if (this.phase === 'play') {
    this.fsm.transition('PLAYING', val ? 'SCRIPTED' : 'FREE_PLAY');
  }
}

get frozen() { return this._legacyFrozen; }
set frozen(val) {
  this._legacyFrozen = val;
  if (val) {
    this.fsm.transition('PAUSED');
  } else if (this._legacyPhase === 'play') {
    this.fsm.transition('PLAYING', 'FREE_PLAY');
  }
}
```

---

### 阶段 1.2: 逐步替换状态查询（高频优先）

**高频查询点** (按使用次数排序):

#### 1. AI 决策条件检查 (~15 处)
```javascript
// 旧代码
if (this.phase === "play" && !this.frozen && !this.scriptLock) {
  // AI 决策
}

// 新代码
if (this.fsm.canAIAct()) {
  // AI 决策
}
```

**需替换的方法**:
- `_tickAI()` (行 2087)
- `_tryPassOrShoot()` (行 2029)
- `_updateCarrier()` (行 3512, 3559)

#### 2. 时间推进条件 (~8 处)
```javascript
// 旧代码
if (this.phase === "play" && !this.frozen) {
  // 推进时间
}

// 新代码
if (this.fsm.shouldAdvanceTime()) {
  // 推进时间
}
```

#### 3. 进球序列判断 (~10 处)
```javascript
// 旧代码
if (this.phase === "goal") {
  // 进球相关逻辑
}

// 新代码
if (this.fsm.isIn('GOAL_SEQUENCE')) {
  // 进球相关逻辑
}
```

#### 4. 暂停/播放切换 (~5 处)
```javascript
// 旧代码
if (this.phase === "pause" || this.phase === "goal" || this.phase === "pre") return;

// 新代码
if (!this.fsm.canAIAct()) return;
```

---

### 阶段 1.3: 替换状态赋值（转换点）

**关键转换点**:

#### 开球
```javascript
// 旧代码 (行 1427)
this.phase = "play";

// 新代码
this.fsm.transition('PLAYING', 'FREE_PLAY');
```

#### 进球
```javascript
// 旧代码 (行 613)
this.phase = "goal";

// 新代码
this.fsm.transition('GOAL_SEQUENCE', 'STRIKE');
```

#### 暂停
```javascript
// 旧代码 (行 1532-1533)
this.frozen = !!v;
this.fieldEl?.classList.toggle("mp-ui-paused", this.frozen);

// 新代码
if (v) {
  this.fsm.transition('PAUSED');
} else {
  this.fsm.transition('PLAYING', 'FREE_PLAY');
}
this.fieldEl?.classList.toggle("mp-ui-paused", this.fsm.is('PAUSED'));
```

#### 重置
```javascript
// 旧代码 (行 1118, 1127-1129)
this.phase = "pre";
this.frozen = false;
this.scriptLock = false;
this.aftermathUntil = 0;

// 新代码
this.fsm.transition('PRE_MATCH');
this.aftermathUntil = 0;
```

---

## 测试清单

迁移完成后，需验证以下场景：

### 基础流程
- [ ] 开场：PRE_MATCH → PLAYING
- [ ] 正常比赛推进（FREE_PLAY 状态）
- [ ] 用户暂停/恢复（PAUSED ↔ PLAYING）

### 进球序列
- [ ] 进球触发：PLAYING → GOAL_SEQUENCE
- [ ] 进球庆祝动画完整播放
- [ ] 恢复比赛：GOAL_SEQUENCE → PLAYING

### 脚本控制
- [ ] 导演脚本锁定（SCRIPTED 子状态）
- [ ] 定位球慢镜头
- [ ] 回放播放

### 特殊情况
- [ ] 中场休息（如果支持）
- [ ] 比赛结束（FULL_TIME）
- [ ] 红牌/点球场景

### 性能
- [ ] 状态查询无明显性能下降
- [ ] 无内存泄漏（FSM 事件监听器正确清理）

---

## 风险评估

### 中等风险 ⚠️
- **双重状态维护**: 兼容层期间，旧标志和 FSM 同时存在，可能不同步
  - **缓解**: 严格使用 getter/setter，禁止直接访问 `_legacy*` 字段
  
- **事件监听器内存泄漏**: FSM 的 `on()` 监听器未清理
  - **缓解**: 在 `destroy()` 方法中调用 `fsm.off()`

### 低风险 ✅
- **状态转换逻辑错误**: FSM 单元测试已覆盖
- **性能下降**: FSM 是轻量对象，查询开销可忽略

---

## 实施时间估计

- **阶段 1.1** (兼容层): 2-3 小时
- **阶段 1.2** (查询替换): 3-4 小时
- **阶段 1.3** (赋值替换): 2-3 小时
- **测试**: 2-3 小时

**总计**: 9-13 小时

---

## 回滚计划

如果迁移出现严重问题：

1. 移除 FSM 初始化代码
2. 恢复 getter/setter 为直接字段访问
3. Git revert 到迁移前的 commit

建议在新分支 `feature/fsm-migration` 上进行，验证稳定后再合并到 master。

---

## 下一步

完成 Phase 1 后，可以进入：
- **Phase 2**: DirectorScript 迁移（配置驱动叙事）
- **Phase 3**: coordSystem 集成（消除魔法数字）

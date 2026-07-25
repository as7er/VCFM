# VCFM — 会话记忆点

> **最高设计原则：游戏机制与数据表现应尽可能接近现实足球。** 球员、俱乐部、国家队、赛事、转会、财政和比赛模拟优先采用现实中可解释且彼此一致的规则；避免为了得到预设结果而添加只影响某个界面的隐藏能力或特殊加权。同一事实应由同一份数据驱动，必要的性能取舍也要保留真实因果关系。

> 仓库：https://github.com/as7er/vcfm.git · `master`  
> 预览：`python -m http.server 8765 --bind 127.0.0.1`  
> 缓存：**vcfm-v146**（头像与球队球衣统一配色；前序 v145 国家队全局搜索）

## 已完成路线

### FM ①–⑤
角色 · 讲话 · Inbox · 球探雾/对手报告 · 中场换阵+角色复盘

### ABCD 扩展（v59）

| 线 | 内容 | 文件 |
|----|------|------|
| **A** | 关系 -2..+2、约谈、氛围、对立发信 | `relations.js` |
| **B** | 紧急信箱门闸、球探任务、关注过滤 | `worldpulse.js`, `main.js` |
| **C** | 战术板 pointer 拖拽、Harbourgate/Steelborough/Millford 队服 | `main.js`, `clubs.js`, `models.js`, `avatar.js` |
| **D** | 财政简报、青训周报、世界新闻、成就徽章 | `worldpulse.js`, 概览 UI |

### 比赛引擎 v2（P0–P5）

| 阶段 | 内容 | 文件 |
|------|------|------|
| P0–P4 | 空间模拟、决策、防守、裁判、平衡缩放 | `js/sim/engine.js`, `sim-viewer.html` |
| **P5** | 用户场接入主游戏；AI 后台仍概率引擎 | `js/sim/adapt.js`, `js/match.js` |
| **直播投影** | 录帧 + `applySimSnapshot`，关导演 AI | `matchview.js`, `main.js` driveMatchEvent |

- 用户场判定：`shouldUseSim = !!state?.userSide`（P6 起永久默认 v2，无总开关）
- 用户场：`SimEngine` 跑半场 → `directResult` → 现有 event/报告/积分（比分与直播帧同源）
- **直播**：用户场 10Hz 录帧 → 高光窗切片真投影；进球只走一次横幅/底栏文案
- AI 场：仍 `tryAttack` 概率，保证推进日不卡
- 预览手感：`sim-viewer.html`（raw 手感）
- 缓存 **vcfm-v146**
- **头像球衣配色 v146**：删除 `sunset` / `harbor` / `steel` / `mill` 四个旧 ID 的历史头像主题覆盖；俱乐部与国家队头像统一只读取当前 `kit.primary` / `kit.secondary`，188 队自动审计保证与号码徽章一致
- **全局搜索国家队 v145**：国家中英文名与三字代码进入全局搜索；结果显示本地国旗、人才池和首发能力，点击直接打开现有 23 人国家队名单
- **五国现实映射 v144**：188 支球队保留完全虚构的双语名称、队徽和球衣；每队通过唯一匿名席位（如 `ENG-T1-01`）映射现实竞争层级，不保存或展示现实俱乐部身份；五国顶级联赛使用不同的非线性实力/财政曲线，档案同步决定开局青训、训练和球场层级，旧档只补档案而不重置经营成果
- **能力稀缺标尺 v144**：每个 3572 人一线队世界严格约 2 名 OVR 20、24 名 19、110 名 18；位置生成已归一化，潜力、身价和工资同步更新，国家队与俱乐部继续共享同一球员对象与能力
- **后台强弱响应 v144**：防反改为低控球、低频但具转换质量的策略，不再无代价同时增强攻防；AI 后台比赛依据双方实际首发、体能和士气温和放大 1–20 标尺下的相对差距（上下限 ±14%），不读取名望或现实映射档案
- **国家队视觉上下文 v143**：36 队拥有独立主场球衣；每期 23 人名单按位置分配唯一 1–23 号（门将优先 1/12/23），不覆盖俱乐部号码；从国家队名单打开球员时资料页保持国家队球衣/号码，所属俱乐部与现役赛季历史均可点击进入俱乐部详情
- **现实国家队征召 v142**：先按位置选 23 人、再从名单排 `1-4-3-3` 首发；能力为主体，赛季场均/上一场评分、俱乐部出场率、位置数据、体能、士气、潜力及国家队连续性共同形成可见征召分；伤病硬性排除，俱乐部停赛不跨赛事；国家队页显示状态、体能与征召分
- **国家队共享能力 v141**：现实人才层级进入球员生成；一线队按俱乐部级别形成约 45%–68% 本土比例、青训约 72% 本土；国家队排行、资格与比赛只读取同一俱乐部球员的首发 `OVR`，不再叠加国家队隐藏修正；旧档一次性同步校准球员属性、总评、潜力、身价与工资，不改姓名/国籍
- **头像 v5.4**：状态表情与天生五官分离；眉/眼/目光/鼻/嘴按种子稳定变化，默认由统一怒眉坏笑改为平静、专注或友善
- **青训详情**：青训名单的姓名/详情按钮可打开完整资料；不显示仅适用于一线队的约谈、续约与外租操作
- **全局搜索**：顶部放大镜或 `Ctrl+K` / `/` 搜索一线队球员、俱乐部与本队青训；最多 10 条分组结果，对手能力继续受球探雾限制
- **netHit**：仅脉冲一帧 + 球门线附近才播网效
- **角球**：高光窗半场≤3；禁区约 5v5 不糊；**主罚人显示层钉在角旗球旁**；徽章开出后 ~2s 清掉（不粘整段）
- 战术涌现：前锋回撤、边锋内切、边卫套边、核心绝对权（`ensureCorePlayer` 主客都有）
- 表现层：`compactSimFrame.ball.z` → 空中球阴影/缩放；simDrive **软跟镜**；球轨迹丝带
- **持球光环**：只认 ball.owner 且贴球；飞行中绝不亮；sim 驱动不用 touchUntil 拖影
- **进球直播**：真实射门/入网帧 → 短 hold → 引擎真实庆祝；`_beginGoalBeat` 仅留给旧编舞路径
- **画面分离**：sim `_separateAgents` 双轮；Canvas 圆点半径 6–8px，不再二次改逻辑坐标
- 导演：高光慢镜；**FMM 全场稳镜**；进球 hold 中不灌后续 sim 帧冲散庆祝
- FMM UI：横条棋盘草坪 + 两侧看台；底栏 **解说 ticker ↔ 控球条**；自动重播+跳过
- 门架：端线外侧；入网撞击加强
- 庆祝：最多 5 人分槽自然围拢；无半瞬移；高光在开球复位前结束
- 进球/慢镜：`mp-goal-flash` 与 `mp-replay-slow::after` 同时存在时重置徽章边界，禁止全场紫色遮罩
- 越位：按出脚瞬间快照所有越位位置球员；回到线上接球仍吹；角球/界外球/门球首脚豁免
- 边界判罚：防守方最后触球→角球给进攻方，进攻方触球→门球给防守方（`_resolveBounds` 曾判反已修）；角球真实来源＝门将托救 ~40% 托过底线 + 后卫封堵 ~30% 挡过底线，频率约 0.7/场（归属已正确，未追真实量级 8-12，属设计取舍）
- 纪律空间化（P3）：犯规从**真实抢断失败+贴身接触**涌现（`_commitFoul`）→ 禁区内点球 / 其余任意球；黄红牌按严重度掷，第二黄有谨慎抑制；真红牌 `a.sentOff` 罚下实现 11v10；点球 `_penaltyKick` 罚球点单挑门将（finishing vs reflexes），进球走 `_goal(penalty)`；人墙任意球 AI 已完成（direct/cross/simple）。量级：犯规 ~22/场、黄 ~3/场、红 ~1/6-7 场、点球 ~1/2-3 场。`adapt.js` 全量翻译 foul→card/red/penalty（不采样，喂 `discipline.js`）；`match.js` sim 路径已停调旧 `tryCardOrFoul`
- 伤病空间化（P3 收尾）：接触伤从犯规涌现（严重度 none 1% / 黄 6% / 直红 20%），疲劳伤每模拟分钟抽查体能最低者（引擎体能是开场快照——带伤/低体能上阵才有风险）；伤员真实退场（复用 `sentOff` 减员）→ ~40s 后**热替换**替补从中线进场恢复 11v11（`substituteAgent` + `onInjurySub` 回调），无名额/无人选则少人作战；门将不受伤。`match.js` `wireSimInjuries`：队医×训练×天气 → `eng.injuryMul`；替补自动选人（同位置优先；**用户队也自动**——半场预跑无法中途询问，事件可见、中场可调；AI 静默）；伤情落账复用旧通道（天数 contact 2-6/fatigue 1-3、`injuredOut`、`applySubstitution`）。量级 ~0.45-0.5/场。探针 `js/sim/_injury.mjs`
- 防死锁看门狗 `_antiDeadlock`：球权/球位 20s 零进展 → 强制大脚解围（emit `stall_clear`）。僵持根因已专项修（队射门冷却豁免/press 迟滞/松球 clamp/sentOff 接管等）；看门狗保留作保险（~0 次/场）。连带修：`_resolvePossession` 自由球接管、死球摆位全部过滤 `sentOff`
- **A 批修复（v107）**：`directResult` 透传 `penalty`；`addSimGoal` 禁止 `pickAssister` 回退、点球文案「点球破门」；SW 预缓存补 media/staff/board/training 等；`index.html` 保护键与 CACHE 对齐；autosave 失败 toast
- **乌龙记账**：`_goal` 标 `ownGoal`（lastKicker 属失球方）；`directResult` / `addSimGoal` 透传；比分始终给得分方，文案「乌龙」，触球者不进个人进球榜；找不到球员也涨分。探针 `js/sim/_owngoal.mjs`
- 传球：直接回传降权；直塞只在最后防线附近生成；门将主动处理低平身后球
- 抢断：仅球队指定 presser 下脚；球权转换后 4s 组织窗；个人/全队抢断冷却
- 进攻站位：边锋保持左右宽度，中场按固定 lane 接应；最后三区仅一名中场前插
- 门将：轨迹扑救；空门降扑救；抱稳/托出；圆点侧移残影；压迫必大脚
- 助攻：lastPasser → assistId；高光窗提前
- 球：落地弹跳 + 射门橙黄轨迹

## 关键 API

- `applyPlayerTalk` / `clubAtmosphere` / `relationLabel`
- `startScoutMission(region)` region: `div3`|`div2`|`intl`
- `financeSnapshot(world)`
- `checkManagerBadges` / `noteUserMatchResult`
- `world.scoutMissions[]` · `managerCareer.badges[]`
- `shouldUseSim` / `ensureSimEngine` / `SimEngine.directResult({tMin,tMax})`
- （P6 已删）`scaledResult` / `USE_SIM_ENGINE` — 勿再调用

## 注意

- 勿用 PowerShell `Set-Content` 写中文源码
- 主目录 `F:\VCFM`；说推 GitHub 再 push
- 用户场单场模拟约 1.5–3s（手机可接受）；勿对全联赛后台启用 v2
- **头像**：全场景统一热血程序脸 2.0（`js/avatar.js`）；正式肖像资产池已弃用删除，同队球衣色由 kit 直接绘制。

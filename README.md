# VCFM

[中文](#中文) · [English](#english)

---

## 中文

VCFM（**V**C **F**ootball **M**anager）是一款轻量网页足球经理游戏，灵感来自 [Football Manager](https://www.footballmanager.com/)。项目完全运行在浏览器中，无后端、无构建步骤，手机、平板和电脑都可以直接游玩。

> 粉丝向简化娱乐作品，与 Sports Interactive / SEGA 无关联。俱乐部、球员与赛事品牌均为虚构内容。

### 在线游玩

**https://as7er.github.io/vcfm/**

| 说明 | 详情 |
|------|------|
| 当前版本 | **v193** · 持久化球探知识体系 |
| 设备 | 手机 / 平板 / 电脑浏览器 |
| 存档 | 当前浏览器 `localStorage`，3 个槽位 |
| 换机 | 游戏内导出 / 导入 JSON；清理浏览器数据前请先导出 |
| 安装 | 支持 PWA，可使用浏览器“添加到主屏幕” |
| 语言与主题 | 中文 / English · 日间 / 夜间 |

仓库：https://github.com/as7er/vcfm

### v193 更新亮点

- 球员、俱乐部、联赛和国家知识会随观察持久化；旧报告会随时间衰减，球员成长不会自动改写尚未更新的估计。
- 球探任务可按位置、培养潜力/即战力/合同将尽和转会费预算筛选，候选排序只使用球探估计而非隐藏真实能力。
- 球员资料、全局搜索、俱乐部与国家队名单、关注列表、转会市场和初始报价共用同一份能力、潜力与估值区间；高能力球探也必须先完成观察。
- 存档 schema v3 校验球探知识结构；专项审计覆盖估计持久化、时效衰减、条件筛选和隐藏能力泄漏。

### 快速开始

1. 从五国任一低级别联赛选择一家俱乐部，创建经理并开始赛季。
2. 在阵容和战术板安排首发、阵型、槽位角色与核心球员。
3. 推进一天或推进到比赛日；紧急信箱、伤病和比赛会自动中断推进。
4. 比赛日选择直播、快速高光或一键完赛：直播和快速高光使用同一套空间事件，一键完赛直接生成纯战报。
5. 中场可以换人、换阵和调整战术；赛后查看评分、xG、上座率和完整报告。
6. 经营转会、职员、训练、设施和财政，也可以请辞、待业并接受其他俱乐部邀请。

### 游戏世界

- **五国联赛体系**：11 个联赛、每个联赛 18 队，共 198 家虚构俱乐部；包含升降级、国内杯赛和完整赛程。
- **俱乐部洲际赛事**：欧冠、欧联和欧协联采用 8 场联赛阶段与淘汰赛，资格由五国顶级联赛排名决定。
- **国家队**：俱乐部球员与国家队共享同一能力、状态和伤病数据；包含世界国家杯、欧洲杯、国际比赛日、征召与赛事数据榜。
- **联赛与赛事中心**：可查看积分、赛程、赛果、射手、助攻、评分和门将榜；国内联赛、杯赛、洲际赛分别记账。
- **现实层级、虚构品牌**：球队实力、财政和人才分布参考现实竞争层级，但不保存或展示现实俱乐部身份。

### 比赛日

- **用户比赛使用空间引擎**：`SimEngine` 模拟持球决策、跑位、压迫、传射、门将、越位、犯规、伤病和定位球；比分、画面、统计与战报来自同一批事件。
- **三种观看方式**：直播保留完整高光节奏；快速高光跳过平淡时段但细看真实进球与扑救；一键完赛不播放球场动画，直接进入赛后报告。
- **真实战术因果**：主客队运行同一套 AI；阵型、角色、能力、状态、体能、士气和战术共同影响场上表现，没有只为界面结果服务的隐藏球队加权。
- **可读的转播表现**：俯视球场、真空间录帧、倍速、暂停、中场调整、进球回放、庆祝、球轨迹、xG、控球和射门统计。
- **空间事件比赛分析**：赛后战报从同一批空间事件派生出脚前 xG、射门图、推进、压迫、行动热区和完成传球网络；分析随比赛报告保存，可回看且不使用赛后结果修饰机会质量。
- **真实性与可复现性**：每场比赛保存确定性随机种子；远射、射门高度、门将反应、抢断、点球、角球和强弱队表现经过固定种子批量审计。
- **统一临场因果**：教练、天气、备战、队内讲话、真实阵容和定位球训练共同进入空间模拟；下半场按 46–60、61–75、76–90 分段计算，换人和战术调整会影响尚未模拟的区间。
- **赛前票房因果**：上座与门票系数只读取开赛前状态，不受本场赛果倒灌；战报和财政概览展示杯赛、德比、争冠、联赛层级等收入系数。
- **后台比赛保持轻量**：非用户场次使用快速概率引擎，避免推进赛程时为整轮比赛运行空间模拟。

### 球队管理

- **阵容与球员**：体能、士气、伤病、停赛、潜力、号码、合同、赛季数据和近 5 场滚动状态；五档出场定位按逐场真实分钟滚动复核，训练、青训成长和年龄曲线会留下可解释的属性变化记录；联赛与洲际赛事使用 25 人报名名单、本土培养名额和 U21/B 名单资格。
- **战术**：阵型、风格、压迫、节奏、宽度、防线、槽位角色、核心球员与战术板拖拽换位。
- **训练与青训**：训练重点、强度、赛前备战、青训名单和球员成长；可委托助理教练按赛程与阵容短板安排。
- **转会与合同**：夏窗、冬窗、续约、租借、自由球员和 AI 报价；买入、出售、续约与租借均按现实参与方逐阶段审核，永久转会支持分期、出场奖金、二次转会分成和青训补偿。
- **职员体系**：主教练、球探和队医拥有能力、工资、合同、稳定国籍与完整任职履历；可以签自由职员、接触其他俱乐部在职职员并支付补偿。
- **经理生涯**：董事会目标、名望、成就与执教历史；被解雇或主动请辞后进入待业市场，也可能在任时收到更高水平球队邀请。

### 经营与体验

- **财政**：用户与 AI 俱乐部共同使用统一总账，结算门票、零售、接待、赞助、赛事奖金、转会、工资、设施、转播和联赛层级补助；财政页显示未来应收应付、债务本金与利息、现金储备和合规状态。
- **设施**：球场、训练、青训、医疗等设施可以升级，并影响收入、成长、恢复和伤病。
- **信息系统**：信箱、世界新闻、媒体、球探任务、关注列表、球员对话、全局搜索和可连续浏览的球员资料。
- **存档**：3 个槽位、自动保存、手动保存、JSON 导出与导入；旧存档会在加载时补齐新增字段。
- **存档可靠性**：Worker 压缩失败时同步保存各槽最新快照，页面退出前冲刷待存队列；版本化 Schema、深层引用检查与数值校验保护旧档迁移和导入。
- **球员路径**：出场承诺按可用比赛、首发、替补和实际分钟评估，连续违约会影响关系、士气与离队意愿；训练、青训、年龄变化和实际出场均留下可解释记录。
- **双精度人物肖像**：名单和战术板使用 32×32 程序脸，资料页从同一外貌生成原生 48×48 高精度肖像并显示为 96px；伤病外观读取实际诊断，无效结果会安全回退。
- **职责委托与经营模式**：训练、首发、战术、临场与培养职责可交由教练团队；支持阵型、关键球员和培养原则锁定。俱乐部经营模式下主教练全权带队，玩家专注转会、合同、财政、设施、青训和聘帅。
- **长期经营可靠性**：玩家经理与受聘主教练分别记录职业履历，AI 会进行债务处置；自动决策只读取真实能力、体能、状态、赛程和职员能力，不写入隐藏胜率或能力修正。
- **离线与性能**：Service Worker 按资源独立预缓存，单项失败不再清空整批离线资源；大型比赛视图只在进入比赛或战报时加载。
- **统一验证**：核心审计由 `node scripts/verify.mjs` 统一执行，`--full` 追加 24 场真实性校准；GitHub Actions 覆盖 push、PR、手动与定时验证。

### 本地运行

ES Modules 必须通过 HTTP 提供，不要直接双击 `index.html`。

以下启动方式需要 **Python 3**。Windows 一键启动脚本还需要 **PowerShell 7**（`pwsh`）；脚本会终止占用 `127.0.0.1:8765` 的现有进程，然后启动 no-store 服务并打开浏览器。

Windows 推荐使用仓库自带脚本：

```powershell
pwsh -File start-local.ps1
# http://127.0.0.1:8765/
```

其他环境可以直接使用 Python：

```bash
python -m http.server 8765 --bind 127.0.0.1
# http://127.0.0.1:8765/
```

原始空间引擎手感预览：`http://127.0.0.1:8765/sim-viewer.html`

### 验证与审计

开发与验证建议使用 **Node.js 22**。首次运行先安装开发依赖：

```bash
npm ci
npm test
npm run test:full
npm run test:browser
```

`npm test` 运行语法检查和核心审计，通常需要数分钟；`npm run test:full` 额外运行 24 场固定种子真实性校准。`npm run test:browser` 使用本机 Microsoft Edge，并通过 Python 在 `127.0.0.1:8876` 启动临时测试服务，覆盖桌面/手机布局、导航和弹窗焦点。

比赛真实性审计检查进球、射门距离与转化率、抢断、犯规、点球、角球、伤病、卡死和强弱队差距。直接调用统一入口也受支持：`node scripts/verify.mjs [--full]`。

### 技术栈

- HTML + CSS + 原生 ES Modules，无框架、无构建步骤
- `js/sim/engine.js`：用户比赛空间模拟
- `js/sim/adapt.js`：比赛系统、统计与高光接入
- `localStorage`：本地存档
- GitHub Pages：在线部署
- Web App Manifest + Service Worker：安装与离线缓存

### 许可证与反馈

**[MIT License](./LICENSE)**：可自由使用、修改和分发（包括商业用途），请保留版权和许可证声明。

问题与建议：https://github.com/as7er/vcfm/issues

---

## English

VCFM (**V**C **F**ootball **M**anager) is a lightweight browser football-management game inspired by [Football Manager](https://www.footballmanager.com/). It runs entirely in the browser with no backend and no build step, on phones, tablets, and desktop browsers.

> A fan-made simplified game, not affiliated with Sports Interactive or SEGA. Clubs, players, and competition brands are fictional.

### Play online

**https://as7er.github.io/vcfm/**

| | |
|--|--|
| Current version | **v193** · persistent scouting knowledge |
| Devices | Phone, tablet, or desktop browser |
| Saves | Browser `localStorage`, 3 slots |
| Move devices | In-game JSON export / import; export before clearing browser data |
| Install | PWA support through “Add to Home Screen” |
| Language and theme | Chinese / English · day / night |

Repository: https://github.com/as7er/vcfm

### What's new in v193

- Player, club, competition, and nation knowledge persists after observation. Reports decay over time, and unobserved player development no longer rewrites saved estimates.
- Assignments can target a position, development/first-team/expiring profiles, and a transfer-fee budget. Candidate ranking uses observed estimates rather than hidden true ability.
- Profiles, global search, club and national-team squads, watchlists, the market, and opening bids share the same ability, potential, and value ranges. Even elite scouts need current observations.
- Save schema v3 validates scouting records, with a dedicated audit for persistence, decay, criteria, and hidden-ability leaks.

### Quick start

1. Choose a club from any of the five nations' lower divisions and create your manager.
2. Set the lineup, formation, slot roles, and core player on the tactics board.
3. Advance one day or to matchday; urgent inbox items, injuries, and matches stop progression automatically.
4. Choose Live, Quick Highlights, or Instant Finish. Live and Quick Highlights share the same spatial events; Instant Finish opens a report without playing the pitch animation.
5. Make substitutions and tactical changes at half-time, then review ratings, xG, attendance, and the full match report.
6. Manage transfers, staff, training, facilities, and finances, or resign and continue your career at another club.

### Game world

- **Five-nation pyramid**: 11 leagues, 18 clubs per league, and 198 fictional clubs in total, with promotion, relegation, domestic cups, and full schedules.
- **Continental club competitions**: Champions League, Europa League, and Conference League with an eight-match league phase and knockouts. Qualification comes from top-flight finishes.
- **International football**: national teams share the same player ability, form, fitness, and injury data as clubs. Includes the World Nations Cup, European Championship, international breaks, call-ups, and competition leaderboards.
- **Competition centres**: tables, fixtures, results, scorers, assists, ratings, and goalkeeper rankings, with separate domestic-league, cup, and continental stat ledgers.
- **Realistic hierarchy, fictional identity**: competitive level, finances, and talent distribution follow explainable real-world tiers without storing or displaying real club identities.

### Matchday

- **Spatial engine for user matches**: `SimEngine` handles on-ball choices, off-ball movement, pressing, passing, shooting, goalkeepers, offside, fouls, injuries, and restarts. Score, visuals, statistics, and reports use the same events.
- **Three viewing modes**: Live keeps the full highlight rhythm; Quick Highlights skips quiet periods while showing real goals and saves; Instant Finish goes straight to the report.
- **Shared tactical causality**: both teams run the same AI. Formation, roles, ability, form, fitness, morale, and tactics drive performance without UI-only team weighting.
- **Broadcast presentation**: top-down pitch, recorded spatial frames, speed controls, pause, half-time changes, replays, celebrations, ball trails, xG, possession, and shot statistics.
- **Spatial-event match analysis**: post-match reports derive pre-shot xG, shot maps, progression, pressing, action heatmaps, and completed-pass networks from the same event stream. Saved analysis remains available in archived reports and never uses the shot outcome to rewrite chance quality.
- **Realism and reproducibility**: every fixture stores a deterministic seed. Long shots, shot height, goalkeeper reactions, tackles, penalties, corners, and strong-vs-weak performance are covered by seeded batch audits.
- **Unified live causality**: coaching, weather, preparation, team talks, the actual lineup, and set-piece training feed the spatial simulation. The second half is calculated in 46–60, 61–75, and 76–90 windows, so substitutions and tactical changes affect only the remaining play.
- **Pre-match gate causality**: attendance and gate modifiers use only information known before kickoff; match reports and the finance overview expose cup, derby, title-race, league-tier, and other income factors.
- **Fast background simulation**: non-user fixtures retain the probabilistic engine so advancing a full round remains quick.

### Club management

- **Squad and players**: fitness, morale, injuries, suspensions, potential, numbers, contracts, season statistics, and rolling five-match form. Five playing-time roles are reviewed against real match minutes, while training, academy growth, and ageing create explainable attribute-change records. League and continental matches use 25-player registrations, homegrown quotas, and U21/List B eligibility.
- **Tactics**: formation, style, pressing, tempo, width, defensive line, slot roles, core player, and drag-and-drop changes.
- **Training and youth**: training focus, intensity, match preparation, youth development, and assistant-manager delegation based on schedule and squad weaknesses.
- **Transfers and contracts**: summer and winter windows, renewals, loans, free agents, and AI bids. Purchases, sales, renewals, and loans use staged reviews, while permanent deals support installments, appearance bonuses, sell-on clauses, and training compensation.
- **Staff**: managers, scouts, and physios have ability, wages, contracts, stable nationalities, and complete employment histories. Hire free agents or approach employed staff with compensation.
- **Manager career**: board objectives, reputation, achievements, and job history. Sacking or resignation leads to unemployment and new offers; successful employed managers may receive prestige approaches.

### Operations and usability

- **Finances**: user and AI clubs share one ledger for tickets, retail, hospitality, sponsorships, competition awards, transfers, wages, facilities, broadcasts, and league-transition support. The finance page exposes future receivables/payables, debt principal and interest, cash reserves, and compliance status.
- **Facilities**: stadium, training, youth, and medical upgrades affect revenue, development, recovery, and injuries.
- **Information systems**: inbox, world news, media, scouting missions, shortlist, player talks, global search, and continuous player-profile browsing.
- **Saves**: 3 slots, autosave, manual save, and JSON export/import. Older saves are migrated with defaults for new fields.
- **Save reliability**: compression-worker failures synchronously persist each slot's newest snapshot, pending jobs flush before unload, and a versioned schema with deep-reference and numeric checks protects migrations and imports.
- **Player pathways**: playing-time promises use availability, starts, substitute appearances, and actual minutes; repeated breaches affect morale, relationships, and willingness to stay. Training, academy development, ageing, and real appearances all leave explainable records.
- **Dual-detail portraits**: lists and the tactics board use 32×32 procedural faces; profiles render a native 48×48 high-detail portrait from the same identity at 96px. Injury appearance follows the actual diagnosis, with safe fallback for invalid output.
- **Delegation and club-director mode**: coaching staff can handle training, selection, tactics, matchday changes, and development, with formation, key-player, and development principles available as locks. In club-director mode the head coach runs the team while the player manages transfers, contracts, finances, facilities, youth, and coaching appointments.
- **Long-term operating reliability**: the player's manager career and the employed head coach have separate records, while AI clubs take explicit debt actions. Automated decisions use only real ability, fitness, form, schedules, and staff quality, without hidden win-probability or ability modifiers.
- **Offline and performance**: Service Worker assets are precached independently so one failure cannot discard the batch; the large match view loads only when entering a match or archived report.
- **Unified verification**: `node scripts/verify.mjs` runs the core audits, while `--full` adds the 24-match realism calibration. GitHub Actions covers pushes, pull requests, manual runs, and a schedule.

### Run locally

ES Modules must be served over HTTP; do not open `index.html` directly.

The commands below require **Python 3**. The Windows launcher also requires **PowerShell 7** (`pwsh`); it stops any existing process listening on `127.0.0.1:8765`, then starts a no-store server and opens the browser.

On Windows, use the included launcher:

```powershell
pwsh -File start-local.ps1
# http://127.0.0.1:8765/
```

On other platforms:

```bash
python -m http.server 8765 --bind 127.0.0.1
# http://127.0.0.1:8765/
```

Raw spatial-engine preview: `http://127.0.0.1:8765/sim-viewer.html`

### Validation and audits

Development and validation are tested with **Node.js 22**. Install the development dependencies before the first run:

```bash
npm ci
npm test
npm run test:full
npm run test:browser
```

`npm test` runs syntax checks and the core audits and can take several minutes. `npm run test:full` adds the seeded 24-match realism calibration. `npm run test:browser` uses the locally installed Microsoft Edge and starts a temporary Python server on `127.0.0.1:8876` to cover desktop/mobile layout, navigation, and modal focus.

The realism audit measures goals, shot distance and conversion, tackles, fouls, penalties, corners, injuries, stalls, and strong-vs-weak performance. The unified runner can also be called directly as `node scripts/verify.mjs [--full]`.

### Stack

- HTML + CSS + native ES Modules, with no framework or build step
- `js/sim/engine.js`: spatial simulation for user matches
- `js/sim/adapt.js`: match-system, statistics, and highlight integration
- `localStorage`: local saves
- GitHub Pages: deployment
- Web App Manifest + Service Worker: installation and offline cache

### License and feedback

**[MIT License](./LICENSE)**: free to use, modify, and distribute, including commercially, with the copyright and license notice retained.

Issues and suggestions: https://github.com/as7er/vcfm/issues

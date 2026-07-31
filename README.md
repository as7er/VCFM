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
| 当前版本 | **v179** · 报名名单、本土培养与赛事资格 |
| 设备 | 手机 / 平板 / 电脑浏览器 |
| 存档 | 当前浏览器 `localStorage`，3 个槽位 |
| 换机 | 游戏内导出 / 导入 JSON；清理浏览器数据前请先导出 |
| 安装 | 支持 PWA，可使用浏览器“添加到主屏幕” |
| 语言与主题 | 中文 / English · 日间 / 夜间 |

仓库：https://github.com/as7er/vcfm

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
- **v165 真实性校准**：远射意愿随距离衰减，射门高度与门将反应时间进入结算；抢断、点球、角球和开球站位经过固定种子批量审计。
- **v166 赛前票房因果**：上座与门票系数只读取开赛前状态，不再受本场赛果倒灌；战报和财政概览展示杯赛、德比、争冠、联赛层级等收入系数。
- **后台比赛保持轻量**：非用户场次使用快速概率引擎，避免推进赛程时为整轮比赛运行空间模拟。

### 球队管理

- **阵容与球员**：体能、士气、伤病、停赛、潜力、号码、合同、赛季数据和近 5 场滚动状态；联赛与洲际赛事使用 25 人报名名单、本土培养名额和 U21/B 名单资格，自动阵容与比赛替补读取同一资格结果。
- **战术**：阵型、风格、压迫、节奏、宽度、防线、槽位角色、核心球员与战术板拖拽换位。
- **训练与青训**：训练重点、强度、赛前备战、青训名单和球员成长；可委托助理教练按赛程与阵容短板安排。
- **转会与合同**：夏窗、冬窗、续约、租借、自由球员和 AI 报价；买入、出售、续约与租借均按现实参与方逐阶段审核、还价或拒绝，成交前不会移动球员。
- **职员体系**：主教练、球探和队医拥有能力、工资与合同；可以签自由职员、接触其他俱乐部在职职员并支付补偿。
- **经理生涯**：董事会目标、名望、成就与执教历史；被解雇或主动请辞后进入待业市场，也可能在任时收到更高水平球队邀请。

### 经营与体验

- **财政**：用户与 AI 俱乐部共同结算门票、商业收入、转会、工资、设施、转播和排名奖金；AI 转会必须保留真实运营储备。
- **设施**：球场、训练、青训、医疗等设施可以升级，并影响收入、成长、恢复和伤病。
- **信息系统**：信箱、世界新闻、媒体、球探任务、关注列表、球员对话、全局搜索和可连续浏览的球员资料。
- **存档**：3 个槽位、自动保存、手动保存、JSON 导出与导入；旧存档会在加载时补齐新增字段。
- **离线支持**：Web App Manifest + Service Worker；版本缓存由入口和审计脚本统一检查。

### 本地运行

ES Modules 必须通过 HTTP 提供，不要直接双击 `index.html`。

Windows 推荐使用仓库自带脚本，它会清理占用端口、启动 no-store 服务并打开浏览器：

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

```bash
node scripts/match-realism-audit.mjs 24
node scripts/transfer-negotiations-audit.mjs
node scripts/cache-audit.mjs
node _smoke_p1.mjs
```

比赛真实性审计使用固定随机种子，检查进球、射门距离与转化率、抢断、犯规、点球、角球、伤病、卡死和强弱队差距。v165 的 24 场等强校准样本为 3.04 球/场、10.5% 射门转化率、37.5% 禁区外射门，30+ 距离零进球。

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
| Current version | **v179** · squad registration, homegrown status, and competition eligibility |
| Devices | Phone, tablet, or desktop browser |
| Saves | Browser `localStorage`, 3 slots |
| Move devices | In-game JSON export / import; export before clearing browser data |
| Install | PWA support through “Add to Home Screen” |
| Language and theme | Chinese / English · day / night |

Repository: https://github.com/as7er/vcfm

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
- **v165 realism calibration**: long-shot intent decays with distance; shot height and goalkeeper reaction time affect outcomes; tackles, penalties, corners, and kickoff positions are covered by seeded batch audits.
- **v166 pre-match gate causality**: attendance and gate modifiers now use only information known before kickoff; match reports and the finance overview expose cup, derby, title-race, league-tier, and other income factors.
- **Fast background simulation**: non-user fixtures retain the probabilistic engine so advancing a full round remains quick.

### Club management

- **Squad and players**: fitness, morale, injuries, suspensions, potential, numbers, contracts, season statistics, and rolling five-match form. League and continental matches use 25-player registrations, homegrown quotas, and U21/List B eligibility; lineup and substitution selection consume the same eligibility result.
- **Tactics**: formation, style, pressing, tempo, width, defensive line, slot roles, core player, and drag-and-drop changes.
- **Training and youth**: training focus, intensity, match preparation, youth development, and assistant-manager delegation based on schedule and squad weaknesses.
- **Transfers and contracts**: summer and winter windows, renewals, loans, free agents, and AI bids. Purchases, sales, renewals, and loans pass through the relevant clubs and players in staged reviews, counters, or rejections; players do not move before completion.
- **Staff**: managers, scouts, and physios have ability, wages, and contracts. Hire free agents or approach employed staff with compensation.
- **Manager career**: board objectives, reputation, achievements, and job history. Sacking or resignation leads to unemployment and new offers; successful employed managers may receive prestige approaches.

### Operations and usability

- **Finances**: user and AI clubs share the same ticket, commercial, transfer, wage, facility, broadcast, and prize ledger; AI transfer spending preserves a real operating reserve.
- **Facilities**: stadium, training, youth, and medical upgrades affect revenue, development, recovery, and injuries.
- **Information systems**: inbox, world news, media, scouting missions, shortlist, player talks, global search, and continuous player-profile browsing.
- **Saves**: 3 slots, autosave, manual save, and JSON export/import. Older saves are migrated with defaults for new fields.
- **Offline support**: Web App Manifest and Service Worker, with cache versions checked by an audit script.

### Run locally

ES Modules must be served over HTTP; do not open `index.html` directly.

On Windows, the included script clears the configured port, starts a no-store server, and opens the browser:

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

```bash
node scripts/match-realism-audit.mjs 24
node scripts/transfer-negotiations-audit.mjs
node scripts/deal-negotiations-audit.mjs
node scripts/cache-audit.mjs
node _smoke_p1.mjs
```

The seeded realism audit measures goals, shot distance and conversion, tackles, fouls, penalties, corners, injuries, stalls, and strong-vs-weak performance. The v165 24-match equal-strength baseline produced 3.04 goals per match, 10.5% shot conversion, 37.5% shots from outside the box, and no goals from 30+ distance.

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

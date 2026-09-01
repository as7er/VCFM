"""量化对比 FM26 Mobile 与 VCFM 的 2D 画面行为。

只用无需身份追踪就稳健的指标（检测不完整时仍可比）：
  1. 禁区占用    —— 任一禁区内的球员数分布。直接检验主线诊断
                     「support 目标把人钉在禁区里」在真实游戏里是什么量级。
  2. 队形纵向长度 —— 每队沿球场长向的铺开（AGENTS.md v238 记过 VCFM 进攻三区
                     被拉到 58.9m，真实 30-40m）。
  3. 最近队友距离 —— 站位是否互相挤在一起。
  4. 位移速度    —— 用最近邻匹配估算，检验「静止占位 vs 持续跑动」。

分队用 (hue, sat) 做 2-means，不手填配色；输出簇心与人数比供核对。
检测不完整（FM 中位 13/22、VCFM 17/22）是已知限制，所以：
  · 一切指标都用**分布/比例**，不用绝对计数
  · 禁区占用改报「占检测到球员的比例」，并同时给原始计数供参考
"""
import csv
import os
import numpy as np

OUT_DIR = r"F:\VCFM\.tmp-video"
PITCH_L, PITCH_W = 105.0, 68.0
# 真实禁区：纵深 16.5m、宽 40.32m（居中）
BOX_DEPTH, BOX_WIDTH = 16.5, 40.32
BOX_W0, BOX_W1 = (PITCH_W - BOX_WIDTH) / 2, (PITCH_W + BOX_WIDTH) / 2


def load(tag):
    path = os.path.join(OUT_DIR, f"cmp_dots_{tag}.csv")
    by_t = {}
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            t = float(r["t"])
            by_t.setdefault(t, []).append((
                float(r["len_m"]), float(r["wid_m"]),
                float(r["hue"]), float(r["sat"]), float(r["val"]),
            ))
    return by_t


def kmeans2(pts, iters=40):
    """在 (hue_sin, hue_cos, sat) 上做 2-means。色相是圆环量，必须转向量。"""
    X = np.array([[np.sin(np.radians(h * 2)), np.cos(np.radians(h * 2)), s / 255.0]
                  for (h, s) in pts])
    c = np.array([X[np.argmin(X[:, 2])], X[np.argmax(X[:, 2])]])
    lab = np.zeros(len(X), dtype=int)
    for _ in range(iters):
        d = ((X[:, None, :] - c[None, :, :]) ** 2).sum(axis=2)
        new = d.argmin(axis=1)
        if (new == lab).all():
            break
        lab = new
        for k in (0, 1):
            if (lab == k).any():
                c[k] = X[lab == k].mean(axis=0)
    return lab, c


def in_box(lm, wm):
    if not (BOX_W0 <= wm <= BOX_W1):
        return False
    return lm <= BOX_DEPTH or lm >= PITCH_L - BOX_DEPTH


def nn_match_speed(prev, cur, dt, max_move=6.0):
    """最近邻匹配估位移速度（m/s）。超过 max_move 视为换人/误配，丢弃。"""
    if not prev or not cur:
        return []
    P = np.array([[p[0], p[1]] for p in prev])
    C = np.array([[c[0], c[1]] for c in cur])
    d = np.sqrt(((C[:, None, :] - P[None, :, :]) ** 2).sum(axis=2))
    out = []
    for i in range(len(C)):
        j = d[i].argmin()
        if d[i][j] <= max_move:
            out.append(d[i][j] / dt)
    return out
def analyse(tag):
    by_t = load(tag)
    times = sorted(by_t)
    # 全局分队：拿所有点的 (hue,sat) 聚类，得到稳定簇心后逐帧套用
    allpts = [(p[2], p[3]) for t in times for p in by_t[t]]
    lab_all, centres = kmeans2(allpts)
    share = [int((lab_all == k).sum()) for k in (0, 1)]

    box_counts = []
    box_shares = []
    team_len = []
    nn_dists = []
    speeds = []
    detected = []

    idx = 0
    prev_pts = None
    prev_t = None
    for t in times:
        pts = by_t[t]
        n = len(pts)
        detected.append(n)
        labs = lab_all[idx:idx + n]
        idx += n

        nb = sum(1 for p in pts if in_box(p[0], p[1]))
        box_counts.append(nb)
        if n >= 12:
            box_shares.append(nb / n)

        for k in (0, 1):
            sel = [pts[i] for i in range(n) if labs[i] == k]
            if len(sel) >= 6:
                ls = [p[0] for p in sel]
                team_len.append(max(ls) - min(ls))

        if n >= 8:
            A = np.array([[p[0], p[1]] for p in pts])
            d = np.sqrt(((A[:, None, :] - A[None, :, :]) ** 2).sum(axis=2))
            np.fill_diagonal(d, 1e9)
            nn_dists.extend(d.min(axis=1).tolist())

        if prev_pts is not None and prev_t is not None:
            dt = t - prev_t
            if 0 < dt <= 0.5:
                speeds.extend(nn_match_speed(prev_pts, pts, dt))
        prev_pts, prev_t = pts, t

    def q(a, ps=(10, 25, 50, 75, 90)):
        if not len(a):
            return {}
        a = np.array(a, dtype=float)
        return {f"p{p}": round(float(np.percentile(a, p)), 2) for p in ps}

    print(f"\n{'='*74}\n{tag.upper()}  采样 {len(times)} 帧  "
          f"检测到球员/帧 中位 {int(np.median(detected))}")
    print(f"  分队簇心(sin2h,cos2h,sat) {np.round(centres,2).tolist()}  人数比 {share}")

    print(f"\n  [1] 禁区内球员数（两个禁区合计）")
    print(f"      原始计数 {q(box_counts)}  均值 {np.mean(box_counts):.2f}")
    if box_shares:
        print(f"      占当帧检测到球员的比例 {q(box_shares)} "
              f"均值 {np.mean(box_shares)*100:.1f}%")

    print(f"\n  [2] 单队纵向长度 (m)   {q(team_len)}  均值 {np.mean(team_len):.1f}"
          f"   样本 {len(team_len)}")
    print(f"  [3] 最近队友距离 (m)   {q(nn_dists)}  均值 {np.mean(nn_dists):.2f}"
          f"   样本 {len(nn_dists)}")
    print(f"  [4] 位移速度 (m/s)     {q(speeds)}  均值 {np.mean(speeds):.2f}"
          f"   样本 {len(speeds)}")
    sp = np.array(speeds)
    if len(sp):
        print(f"      慢于 0.5 m/s 占比 {100*(sp<0.5).mean():.1f}%   "
              f"慢于 1.0 m/s 占比 {100*(sp<1.0).mean():.1f}%   "
              f"快于 4 m/s 占比 {100*(sp>4).mean():.1f}%")
    return dict(box_counts=box_counts, box_shares=box_shares,
                team_len=team_len, nn=nn_dists, speeds=speeds)


if __name__ == "__main__":
    res = {tag: analyse(tag) for tag in ("fm", "vc")}
    print(f"\n{'='*74}\n对比摘要（中位数）")
    rows = [
        ("禁区内球员占比 %",
         100 * np.median(res["fm"]["box_shares"]),
         100 * np.median(res["vc"]["box_shares"])),
        ("单队纵向长度 m",
         np.median(res["fm"]["team_len"]), np.median(res["vc"]["team_len"])),
        ("最近队友距离 m",
         np.median(res["fm"]["nn"]), np.median(res["vc"]["nn"])),
        ("位移速度 m/s",
         np.median(res["fm"]["speeds"]), np.median(res["vc"]["speeds"])),
    ]
    print(f"  {'指标':<20}{'FM26':>10}{'VCFM':>10}   差异")
    for name, a, b in rows:
        print(f"  {name:<20}{a:>10.2f}{b:>10.2f}   {b-a:+.2f}")

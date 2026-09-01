"""按色相双峰分队（替代 cmp4 里失败的 2-means），并重算依赖分队的指标。

cmp4 的教训：把 H(0-179) 翻倍成角度后用 (sin,cos,sat) 做 2-means，
橙红 H≈18(36°) 与粉红 H≈167(334°) 的 cos 都接近 +1，被判成同一队
（VCFM 实测 1311 vs 19111，等于没分开）。
改为：先从色相直方图找两个主模态（要求圆环距离足够远），
再按圆环距离把每个点分到最近模态。模态与人数比全部打印出来供核对。
"""
import csv
import os
import numpy as np

OUT_DIR = r"F:\VCFM\.tmp-video"
PITCH_L, PITCH_W = 105.0, 68.0
BOX_DEPTH, BOX_WIDTH = 16.5, 40.32
BOX_W0, BOX_W1 = (PITCH_W - BOX_WIDTH) / 2, (PITCH_W + BOX_WIDTH) / 2


def load(tag):
    path = os.path.join(OUT_DIR, f"cmp_dots_{tag}.csv")
    by_t = {}
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            by_t.setdefault(float(r["t"]), []).append((
                float(r["len_m"]), float(r["wid_m"]), float(r["hue"]),
                float(r["sat"]), float(r["val"]),
            ))
    return by_t


def circ_dist(a, b, period=180.0):
    d = np.abs(a - b) % period
    return np.minimum(d, period - d)


def two_modes(hues, min_sep=25.0):
    """色相直方图的两个主模态，要求圆环距离 >= min_sep。"""
    hist = np.bincount(np.asarray(hues).astype(int), minlength=180).astype(float)
    # 圆环平滑，避免单像素噪声成峰
    k = np.array([1, 2, 3, 2, 1], dtype=float)
    k /= k.sum()
    sm = np.convolve(np.r_[hist[-2:], hist, hist[:2]], k, mode="same")[2:-2]
    first = int(np.argmax(sm))
    masked = sm.copy()
    for i in range(180):
        if circ_dist(np.array([i]), np.array([first]))[0] < min_sep:
            masked[i] = -1
    second = int(np.argmax(masked))
    return first, second, sm[first], sm[second]


def assign(hues, m0, m1):
    h = np.asarray(hues)
    d0 = circ_dist(h, np.full_like(h, m0))
    d1 = circ_dist(h, np.full_like(h, m1))
    return (d1 < d0).astype(int)


def in_box(lm, wm):
    return BOX_W0 <= wm <= BOX_W1 and (lm <= BOX_DEPTH or lm >= PITCH_L - BOX_DEPTH)


def q(a, ps=(10, 25, 50, 75, 90)):
    if not len(a):
        return {}
    a = np.asarray(a, float)
    return {f"p{p}": round(float(np.percentile(a, p)), 1) for p in ps}
def analyse(tag):
    by_t = load(tag)
    times = sorted(by_t)
    hues = [p[2] for t in times for p in by_t[t]]
    m0, m1, w0, w1 = two_modes(hues)
    labs_all = assign(hues, m0, m1)
    n0, n1 = int((labs_all == 0).sum()), int((labs_all == 1).sum())

    print(f"\n{'='*74}\n{tag.upper()}  帧 {len(times)}  点 {len(hues)}")
    print(f"  色相模态 H={m0}(权重{w0:.0f}) / H={m1}(权重{w1:.0f})  "
          f"圆环距离 {circ_dist(np.array([m0]), np.array([m1]))[0]:.0f}")
    print(f"  分队人数 {n0} / {n1}  比例 {min(n0,n1)/max(n0,n1):.2f}"
          f"  （越接近 1 越可信，两队人数本应相当）")

    team_len, team_wid, team_area = [], [], []
    box_by_team = []
    idx = 0
    for t in times:
        pts = by_t[t]
        n = len(pts)
        labs = labs_all[idx:idx + n]
        idx += n
        for k in (0, 1):
            sel = [pts[i] for i in range(n) if labs[i] == k]
            if len(sel) < 7:
                continue
            ls = np.array([p[0] for p in sel])
            ws = np.array([p[1] for p in sel])
            team_len.append(ls.max() - ls.min())
            team_wid.append(ws.max() - ws.min())
            team_area.append((ls.max() - ls.min()) * (ws.max() - ws.min()))
            box_by_team.append(sum(1 for p in sel if in_box(p[0], p[1])))

    print(f"\n  单队纵向长度 (m)  {q(team_len)}  均值 {np.mean(team_len):.1f}"
          f"  样本 {len(team_len)}")
    print(f"  单队横向宽度 (m)  {q(team_wid)}  均值 {np.mean(team_wid):.1f}")
    print(f"  单队覆盖面积 (m²) {q(team_area)}  均值 {np.mean(team_area):.0f}")
    print(f"  单队在禁区内人数  {q(box_by_team)}  均值 {np.mean(box_by_team):.2f}")
    return dict(team_len=team_len, team_wid=team_wid,
                team_area=team_area, box=box_by_team,
                ratio=min(n0, n1) / max(n0, n1))


if __name__ == "__main__":
    res = {tag: analyse(tag) for tag in ("fm", "vc")}
    print(f"\n{'='*74}\n对比（中位数）真实足球参考：单队纵向长度 30-40m")
    print(f"  {'指标':<20}{'FM26':>10}{'VCFM':>10}   差异")
    for name, key in (("单队纵向长度 m", "team_len"),
                      ("单队横向宽度 m", "team_wid"),
                      ("单队覆盖面积 m²", "team_area"),
                      ("单队禁区内人数", "box")):
        a = float(np.median(res["fm"][key]))
        b = float(np.median(res["vc"][key]))
        print(f"  {name:<20}{a:>10.1f}{b:>10.1f}   {b-a:+.1f}")
    print(f"\n  分队可信度（人数比，越接近1越好）: "
          f"FM {res['fm']['ratio']:.2f}  VCFM {res['vc']['ratio']:.2f}")

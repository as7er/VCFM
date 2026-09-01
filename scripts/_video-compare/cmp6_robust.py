"""稳健版队形对比：剔除门将、用分位距代替极值，并加「球队重心是否随比赛移动」。

为什么必须重算：cmp5 的「单队纵向长度」用 max-min，门将站在球门线附近会把它整体拉长，
而两边门将的配色与检测率不同（FM 门将是独立黄色，极可能被误分到某一队），
这会把差异做大。本脚本三重防护：
  · 剔除距任一球门线 8m 内的点（门将所在带）
  · 用 p10-p90 分位距代替 max-min，对残留离群点不敏感
  · 同时报 max-min 供对照，两者同向才采信

新增指标「球队重心沿长向的标准差」——这是**时间尺度无关**的（只看空间分布），
用于检验 AGENTS.md v238 记的「引擎缺少 team block 随球整体平移」：
若球队是静态阵型模板，重心几乎不动 → 标准差小；
若球队跟着比赛整体前后移动 → 标准差大。
"""
import csv
import os
import numpy as np

OUT_DIR = r"F:\VCFM\.tmp-video"
PITCH_L, PITCH_W = 105.0, 68.0
GK_BAND = 8.0  # 距球门线多少米内视为门将带，予以剔除


def load(tag):
    path = os.path.join(OUT_DIR, f"cmp_dots_{tag}.csv")
    by_t = {}
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            by_t.setdefault(float(r["t"]), []).append((
                float(r["len_m"]), float(r["wid_m"]), float(r["hue"]),
            ))
    return by_t


def circ_dist(a, b, period=180.0):
    d = np.abs(np.asarray(a) - np.asarray(b)) % period
    return np.minimum(d, period - d)


def two_modes(hues, min_sep=25.0):
    hist = np.bincount(np.asarray(hues).astype(int), minlength=180).astype(float)
    k = np.array([1., 2., 3., 2., 1.]); k /= k.sum()
    sm = np.convolve(np.r_[hist[-2:], hist, hist[:2]], k, mode="same")[2:-2]
    first = int(np.argmax(sm))
    masked = sm.copy()
    for i in range(180):
        if circ_dist(i, first) < min_sep:
            masked[i] = -1
    return first, int(np.argmax(masked))


def q(a, ps=(10, 25, 50, 75, 90)):
    if not len(a):
        return {}
    a = np.asarray(a, float)
    return {f"p{p}": round(float(np.percentile(a, p)), 1) for p in ps}
def analyse(tag):
    by_t = load(tag)
    times = sorted(by_t)
    hues = [p[2] for t in times for p in by_t[t]]
    m0, m1 = two_modes(hues)

    spread_q, spread_mm, centroids = {0: [], 1: []}, {0: [], 1: []}, {0: [], 1: []}
    idx = 0
    for t in times:
        pts = by_t[t]
        n = len(pts)
        hs = np.array([p[2] for p in pts])
        labs = (circ_dist(hs, m1) < circ_dist(hs, m0)).astype(int)
        idx += n
        for k in (0, 1):
            sel = [pts[i] for i in range(n) if labs[i] == k]
            # 剔除门将带
            sel = [p for p in sel if GK_BAND < p[0] < PITCH_L - GK_BAND]
            if len(sel) < 7:
                continue
            ls = np.array([p[0] for p in sel])
            spread_q[k].append(np.percentile(ls, 90) - np.percentile(ls, 10))
            spread_mm[k].append(ls.max() - ls.min())
            centroids[k].append(ls.mean())

    allq = spread_q[0] + spread_q[1]
    allmm = spread_mm[0] + spread_mm[1]
    print(f"\n{'='*74}\n{tag.upper()}  模态 H={m0}/{m1}  有效队帧 {len(allq)}")
    print(f"  纵向铺开 p90-p10 (m)  {q(allq)}  均值 {np.mean(allq):.1f}")
    print(f"  纵向铺开 max-min (m)  {q(allmm)}  均值 {np.mean(allmm):.1f}  （对照）")
    for k in (0, 1):
        c = np.array(centroids[k])
        if len(c) > 10:
            print(f"  队{k} 重心沿长向: 均值 {c.mean():.1f}m  标准差 {c.std():.1f}m  "
                  f"范围 {c.min():.1f}~{c.max():.1f}m  样本 {len(c)}")
    return dict(q=allq, mm=allmm,
                cstd=[np.std(centroids[k]) for k in (0, 1) if len(centroids[k]) > 10])


if __name__ == "__main__":
    res = {tag: analyse(tag) for tag in ("fm", "vc")}
    print(f"\n{'='*74}\n对比（中位数）  真实足球单队纵向铺开约 30-40m")
    for name, key in (("纵向铺开 p90-p10 m", "q"), ("纵向铺开 max-min m", "mm")):
        a, b = np.median(res["fm"][key]), np.median(res["vc"][key])
        print(f"  {name:<22}FM {a:6.1f}   VCFM {b:6.1f}   差 {b-a:+.1f}")
    fa, va = np.mean(res["fm"]["cstd"]), np.mean(res["vc"]["cstd"])
    print(f"  {'重心移动标准差 m':<22}FM {fa:6.1f}   VCFM {va:6.1f}   差 {va-fa:+.1f}")
    print("\n  读法：重心标准差小 = 球队整体不随比赛前后移动（静态阵型模板的特征）；"
          "\n        纵向铺开大 = 队形被拉长、没有紧凑的 team block。")

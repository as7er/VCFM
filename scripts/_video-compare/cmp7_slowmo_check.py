"""关键校验：VCFM 的低速度是真实引擎行为，还是录屏里的慢镜/暂停造成的假象？

必须查这一条，否则结论会站不住：
  · 本次视频实测 VCFM 位移中位 1.10 m/s、近静止(<0.5) 占 37.8%
  · 但 AGENTS.md v238 的**引擎内**实测是「位移中位 2.05 m/s、几乎静止占比 13.0%」
  · 两者差一倍。而这段录屏是「快速高光」，其中包含 mp-replay-slow 慢镜回放
    与进球 hold —— 慢镜帧会被逐帧差分当成「球员走得慢」。

做法：算每帧的中位速度时间序列，找出持续的低速段（疑似慢镜/暂停/死球），
分别报「全部帧」与「剔除低速段后」的速度分布。若剔除后 VCFM 接近 2.05 m/s，
则原结论是伪影；若仍显著低于 FM，则差异为真。
FM 同样处理，口径一致。
"""
import csv
import os
import numpy as np

OUT_DIR = r"F:\VCFM\.tmp-video"


def load(tag):
    path = os.path.join(OUT_DIR, f"cmp_dots_{tag}.csv")
    by_t = {}
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            by_t.setdefault(float(r["t"]), []).append(
                (float(r["len_m"]), float(r["wid_m"])))
    return by_t


def frame_speeds(prev, cur, dt, max_move=6.0):
    if not prev or not cur:
        return []
    P = np.array(prev)
    C = np.array(cur)
    d = np.sqrt(((C[:, None, :] - P[None, :, :]) ** 2).sum(axis=2))
    out = []
    for i in range(len(C)):
        j = int(d[i].argmin())
        if d[i][j] <= max_move:
            out.append(d[i][j] / dt)
    return out


def analyse(tag):
    by_t = load(tag)
    times = sorted(by_t)
    series = []          # (t, 该帧中位速度, 该帧速度列表)
    prev, prev_t = None, None
    for t in times:
        pts = by_t[t]
        if prev is not None and prev_t is not None:
            dt = t - prev_t
            if 0 < dt <= 0.5:
                sp = frame_speeds(prev, pts, dt)
                if len(sp) >= 6:
                    series.append((t, float(np.median(sp)), sp))
        prev, prev_t = pts, t

    med = np.array([s[1] for s in series])
    print(f"\n{'='*74}\n{tag.upper()}  可用帧对 {len(series)}")
    print(f"  每帧中位速度的分布 (m/s): "
          f"{[round(float(np.percentile(med,p)),2) for p in (10,25,50,75,90)]}")

    # 低速段判定：该帧中位速度 < 0.6 m/s，且连续 >= 4 帧（>=1 秒）
    low = med < 0.6
    runs, i = [], 0
    while i < len(low):
        if low[i]:
            j = i
            while j < len(low) and low[j]:
                j += 1
            if j - i >= 4:
                runs.append((i, j))
            i = j
        else:
            i += 1
    in_run = np.zeros(len(series), dtype=bool)
    for a, b in runs:
        in_run[a:b] = True
    covered = 100 * in_run.mean() if len(in_run) else 0
    print(f"  持续低速段: {len(runs)} 段，覆盖 {covered:.1f}% 的帧"
          f"（疑似慢镜/暂停/死球摆位）")
    if runs:
        durs = [(series[b-1][0] - series[a][0]) for a, b in runs]
        print(f"    段长(秒): 中位 {np.median(durs):.1f}  最长 {max(durs):.1f}")

    allsp = np.array([v for s in series for v in s[2]])
    keep = np.array([v for k, s in zip(in_run, series) if not k for v in s[2]])
    for name, arr in (("全部帧", allsp), ("剔除低速段", keep)):
        if not len(arr):
            continue
        print(f"  {name}: 中位 {np.median(arr):.2f} 均值 {arr.mean():.2f}  "
              f"<0.5 占 {100*(arr<0.5).mean():.1f}%  "
              f"<1.0 占 {100*(arr<1.0).mean():.1f}%  "
              f">4 占 {100*(arr>4).mean():.1f}%  n={len(arr)}")
    return allsp, keep


if __name__ == "__main__":
    out = {t: analyse(t) for t in ("fm", "vc")}
    print(f"\n{'='*74}\n结论对比（剔除低速段后的中位速度）")
    fa, va = np.median(out["fm"][1]), np.median(out["vc"][1])
    print(f"  FM26 {fa:.2f} m/s   VCFM {va:.2f} m/s   差 {va-fa:+.2f}")
    print(f"  AGENTS.md v238 引擎内实测基准: 2.05 m/s（近静止 13.0%）")
    print("  若 VCFM 剔除后接近 2.05，则视频里的低速主要来自慢镜，非引擎缺陷。")

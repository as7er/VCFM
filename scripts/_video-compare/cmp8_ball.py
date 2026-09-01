"""提取球的轨迹，量化「足球行为」而非运动学：球速、球在禁区的时长、球的三区分布。

为什么改量球：用户指出真正的差距是跑位目的性、传球选择、射门时机与真实足球还原度。
球的轨迹是这些决策的直接产物——传多长、往哪传、球在哪停留，比球员速度更能反映足球智能。

关键可对账指标：VCFM 引擎侧实测「球在禁区内 1092 秒/场」（AGENTS.md v239 遗留 #1），
真实足球应为 60~90 秒。FM 这段录屏给出真实参照值，这是项目此前没有的外部基准。

球的检测：小面积、高亮度、低饱和、近圆的连通域。
本脚本先报检测率与速度分布做自检——球速应落在 0~35 m/s，
若检测率过低或速度荒谬则不出结论。
"""
import csv
import os
import numpy as np
import cv2

OUT_DIR = r"F:\VCFM\.tmp-video"
PITCH_L, PITCH_W = 105.0, 68.0
BOX_DEPTH, BOX_WIDTH = 16.5, 40.32
BOX_W0, BOX_W1 = (PITCH_W - BOX_WIDTH) / 2, (PITCH_W + BOX_WIDTH) / 2

CFG = {
    "fm": {
        "path": r"C:\Users\WXX\Desktop\2D比赛画面对比\FM26 Mobile  的2D比赛画面.mp4",
        "hue": (34, 70), "grass": (212, 114, 1063, 609),
        "rect": (38.5, 16.0, 810.5, 475.5), "axis": "h",
        "start": 60.0, "end": 700.0,
    },
    "vc": {
        "path": r"C:\Users\WXX\Desktop\2D比赛画面对比\VCFM 的2D比赛画面.mp4",
        "hue": (52, 88), "grass": (48, 150, 573, 937),
        "rect": (0.0, 0.0, 525.0, 787.0), "axis": "v",
        "start": 30.0, "end": 330.0,
    },
}


def to_metres(cx, cy, cfg):
    rx0, ry0, rx1, ry1 = cfg["rect"]
    fx = (cx - rx0) / (rx1 - rx0)
    fy = (cy - ry0) / (ry1 - ry0)
    return (fx * PITCH_L, fy * PITCH_W) if cfg["axis"] == "h" else (fy * PITCH_L, fx * PITCH_W)


def find_ball(img, cfg):
    """球 = 球场内小面积、高亮度、低饱和、近圆的连通域。返回候选列表。"""
    gx0, gy0, gx1, gy1 = cfg["grass"]
    sub = img[gy0:gy1 + 1, gx0:gx1 + 1]
    hsv = cv2.cvtColor(sub, cv2.COLOR_BGR2HSV)
    s, v = hsv[:, :, 1], hsv[:, :, 2]
    m = ((s < 110) & (v > 150)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, lab, stats, cent = cv2.connectedComponentsWithStats(m, 8)
    rx0, ry0, rx1, ry1 = cfg["rect"]
    out = []
    for i in range(1, n):
        a = int(stats[i, cv2.CC_STAT_AREA])
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        h = int(stats[i, cv2.CC_STAT_HEIGHT])
        if a < 8 or a > 130 or w > 18 or h > 18:
            continue
        if max(w, h) / max(1, min(w, h)) > 1.8:
            continue
        if a / float(w * h) < 0.5:
            continue
        cx, cy = float(cent[i][0]), float(cent[i][1])
        if not (rx0 - 2 <= cx <= rx1 + 2 and ry0 - 2 <= cy <= ry1 + 2):
            continue
        out.append((a, cx, cy))
    return out


def track(tag, cfg, step_s=0.2):
    cap = cv2.VideoCapture(cfg["path"])
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    t1 = min(cfg["end"], total / fps)
    rows, miss, multi = [], 0, 0
    last = None
    t = cfg["start"]
    while t < t1:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, img = cap.read()
        if not ok:
            break
        cands = find_ball(img, cfg)
        if not cands:
            miss += 1
            t += step_s
            continue
        if len(cands) > 1:
            multi += 1
        if last is not None and len(cands) > 1:
            lm_last, wm_last = last
            best, bd = None, 1e9
            for (a, cx, cy) in cands:
                lm, wm = to_metres(cx, cy, cfg)
                d = (lm - lm_last) ** 2 + (wm - wm_last) ** 2
                if d < bd:
                    bd, best = d, (a, cx, cy)
            cand = best
        else:
            cand = min(cands, key=lambda c: c[0])
        lm, wm = to_metres(cand[1], cand[2], cfg)
        rows.append((round(t, 2), round(lm, 2), round(wm, 2), cand[0]))
        last = (lm, wm)
        t += step_s
    cap.release()

    path = os.path.join(OUT_DIR, f"cmp_ball_{tag}.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["t", "len_m", "wid_m", "area"])
        w.writerows(rows)
    tot = len(rows) + miss
    print(f"\n{tag.upper()}  帧 {tot}  检出 {len(rows)} ({100*len(rows)/max(1,tot):.0f}%)  "
          f"未检出 {miss}  多候选 {multi}")
    return rows


def metrics(tag, rows, step_s=0.2):
    if len(rows) < 50:
        print(f"  {tag}: 样本不足，不出结论")
        return None
    a = np.array([[r[0], r[1], r[2]] for r in rows])
    t, lm, wm = a[:, 0], a[:, 1], a[:, 2]
    dt = np.diff(t)
    step = np.sqrt(np.diff(lm) ** 2 + np.diff(wm) ** 2)
    ok = (dt > 0) & (dt <= step_s * 2.5)
    sp = step[ok] / dt[ok]
    good = sp[sp <= 35]
    inbox = (wm >= BOX_W0) & (wm <= BOX_W1) & ((lm <= BOX_DEPTH) | (lm >= PITCH_L - BOX_DEPTH))
    third = np.digitize(lm, [PITCH_L / 3, 2 * PITCH_L / 3])
    print(f"  球速 (m/s): 中位 {np.median(good):.2f}  p75 {np.percentile(good,75):.2f}  "
          f"p90 {np.percentile(good,90):.2f}  max {good.max():.1f}  n={len(good)}")
    print(f"  球近静止占比 (<0.5 m/s): {100*(good<0.5).mean():.1f}%")
    print(f"  球在禁区内的帧占比: {100*inbox.mean():.1f}%  "
          f"（折算每 90 分钟 ≈ {inbox.mean()*5400:.0f} 秒）")
    print(f"  球的三区分布: 后场 {100*(third==0).mean():.0f}% / "
          f"中场 {100*(third==1).mean():.0f}% / 前场 {100*(third==2).mean():.0f}%")
    return dict(sp=good, inbox=float(inbox.mean()))


if __name__ == "__main__":
    res = {}
    for tag, cfg in CFG.items():
        rows = track(tag, cfg)
        res[tag] = metrics(tag, rows)
    if all(res.values()):
        print(f"\n{'='*74}\n对比")
        print(f"  球速中位      FM {np.median(res['fm']['sp']):.2f}  "
              f"VCFM {np.median(res['vc']['sp']):.2f} m/s")
        print(f"  球在禁区时长  FM {res['fm']['inbox']*5400:.0f}s  "
              f"VCFM {res['vc']['inbox']*5400:.0f}s  (每 90 分钟折算)")
        print("  参照：真实足球 60~90 秒；VCFM 引擎侧实测 1092 秒（AGENTS.md v239 #1）")

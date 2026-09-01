"""提取两段录屏的球员坐标并换算到米制，输出逐帧 CSV。

标定已由 cmp2b_diag.py 用白色标线定出，并用真实禁区深度 16.5m 交叉验证：
  FM26  横屏：草皮盒(212,114)-(1063,609)，子坐标底线 x=38.5/810.5、边线 y=16/475.5
              禁区线 x=160 距底线 121.5px，772px=105m → 16.5m ✓
  VCFM  竖屏：草皮盒(48,150)-(573,937)，子坐标球场 x 0-525、y 0-787
              禁区端线 y=123.5 占全长 15.7% → 16.5m ✓（禁区宽 56.8% = 引擎 x22-78 口径）

球员检测：球场内的非草皮连通域，按面积与长宽比筛圆点；球队按色相自动聚成两簇
（不手填配色，避免我猜错）。输出米制坐标，长向 0-105、宽向 0-68。
"""
import csv
import os
import numpy as np
import cv2

PITCH_L, PITCH_W = 105.0, 68.0
OUT_DIR = r"F:\VCFM\.tmp-video"

CFG = {
    "fm": {
        "path": r"C:\Users\WXX\Desktop\2D比赛画面对比\FM26 Mobile  的2D比赛画面.mp4",
        "hue": (34, 70),
        "grass": (212, 114, 1063, 609),
        # 子坐标下的球场矩形：长向沿 x，宽向沿 y
        "rect": (38.5, 16.0, 810.5, 475.5),
        "axis": "h",           # 横屏：x 是长度方向
        "area": (150, 900),
        "start": 60.0,
        "end": 700.0,
    },
    "vc": {
        "path": r"C:\Users\WXX\Desktop\2D比赛画面对比\VCFM 的2D比赛画面.mp4",
        "hue": (52, 88),
        "grass": (48, 150, 573, 937),
        "rect": (0.0, 0.0, 525.0, 787.0),
        "axis": "v",           # 竖屏：y 是长度方向
        "area": (150, 900),
        "start": 30.0,
        "end": 330.0,
    },
}


def detect(img, cfg):
    """返回该帧的圆点列表 [(len_m, wid_m, hue, area)]。"""
    gx0, gy0, gx1, gy1 = cfg["grass"]
    sub = img[gy0:gy1 + 1, gx0:gx1 + 1]
    hsv = cv2.cvtColor(sub, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    hlo, hhi = cfg["hue"]
    grass = ((h >= hlo) & (h <= hhi) & (s > 40) & (v > 40))
    nong = (~grass).astype(np.uint8)
    nong = cv2.morphologyEx(nong, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, cent = cv2.connectedComponentsWithStats(nong, 8)
    amin, amax = cfg["area"]
    rx0, ry0, rx1, ry1 = cfg["rect"]
    span_x, span_y = rx1 - rx0, ry1 - ry0
    out = []
    for i in range(1, n):
        a = int(stats[i, cv2.CC_STAT_AREA])
        if a < amin or a > amax:
            continue
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        hh = int(stats[i, cv2.CC_STAT_HEIGHT])
        if w < 8 or hh < 8 or w > 44 or hh > 52:
            continue
        ar = max(w, hh) / max(1, min(w, hh))
        if ar > 2.2:                      # 排除标线残片与文字条
            continue
        fill = a / float(w * hh)
        if fill < 0.45:                   # 圆点填充度应较高
            continue
        cx, cy = float(cent[i][0]), float(cent[i][1])
        # 必须落在球场矩形内（留 2px 容差）
        if not (rx0 - 2 <= cx <= rx1 + 2 and ry0 - 2 <= cy <= ry1 + 2):
            continue
        mask = (lab == i)
        hue = float(np.median(h[mask]))
        sat = float(np.median(s[mask]))
        val = float(np.median(v[mask]))
        # 归一化到 0-1 再换米
        fx = (cx - rx0) / span_x
        fy = (cy - ry0) / span_y
        if cfg["axis"] == "h":
            lm, wm = fx * PITCH_L, fy * PITCH_W
        else:
            lm, wm = fy * PITCH_L, fx * PITCH_W
        out.append((lm, wm, hue, sat, val, a))
    return out
def run(tag, cfg, step_s=0.25):
    cap = cv2.VideoCapture(cfg["path"])
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    t0, t1 = cfg["start"], min(cfg["end"], total / fps)
    rows = []
    counts = []
    t = t0
    while t < t1:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
        ok, img = cap.read()
        if not ok:
            break
        dots = detect(img, cfg)
        counts.append(len(dots))
        for (lm, wm, hue, sat, val, a) in dots:
            rows.append((round(t, 2), round(lm, 2), round(wm, 2),
                         round(hue, 1), round(sat, 1), round(val, 1), a))
        t += step_s
    cap.release()

    path = os.path.join(OUT_DIR, f"cmp_dots_{tag}.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["t", "len_m", "wid_m", "hue", "sat", "val", "area"])
        w.writerows(rows)

    c = np.array(counts)
    print(f"\n{tag.upper()}  帧数 {len(counts)}  圆点/帧: "
          f"中位 {int(np.median(c))} 均值 {c.mean():.1f} "
          f"p10 {int(np.percentile(c,10))} p90 {int(np.percentile(c,90))} "
          f"max {int(c.max())}")
    # 色相分布用于判断能否分出两队
    hs = np.array([r[3] for r in rows])
    if len(hs):
        hist = np.bincount(hs.astype(int), minlength=180)
        peaks = np.argsort(hist)[::-1][:8]
        print("  色相峰值(H, 次数):", [(int(p), int(hist[p])) for p in sorted(peaks)])
    print(f"  → {path}  ({len(rows)} 行)")
    return rows


if __name__ == "__main__":
    for tag, cfg in CFG.items():
        run(tag, cfg)

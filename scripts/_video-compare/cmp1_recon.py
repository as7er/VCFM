"""侦察：摸清两段录屏的球场区域与主要颜色，为后续提取球员坐标做标定。

因为无法肉眼看画面，这一步全部输出数字：
  · HSV 直方图峰值 → 找草皮绿的色相范围
  · 草皮掩膜的行列投影 → 定出球场包围盒（排除 UI 区域）
  · 球场内非草皮连通域 → 候选球员圆点的面积分布与平均颜色
后续脚本据此定阈值，不再猜。
"""
import os
import cv2
import numpy as np

VIDEOS = {
    "fm": r"C:\Users\WXX\Desktop\2D比赛画面对比\FM26 Mobile  的2D比赛画面.mp4",
    "vc": r"C:\Users\WXX\Desktop\2D比赛画面对比\VCFM 的2D比赛画面.mp4",
}


def frames(path, count=5, lo=0.2, hi=0.8):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    out = []
    for i in range(count):
        f = lo + (hi - lo) * (i / max(1, count - 1))
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * f))
        ok, img = cap.read()
        if ok:
            out.append((total * f / fps, img))
    cap.release()
    return out


def hue_profile(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    # 只统计有一定饱和度与亮度的像素，滤掉黑边与灰色 UI
    m = (s > 40) & (v > 40)
    hist = np.bincount(h[m].ravel(), minlength=180)
    top = np.argsort(hist)[::-1][:6]
    return [(int(t), int(hist[t])) for t in top], int(m.sum()), img.shape


def pitch_box(img, hlo, hhi):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    mask = ((h >= hlo) & (h <= hhi) & (s > 40) & (v > 40)).astype(np.uint8)
    rows = mask.sum(axis=1)
    cols = mask.sum(axis=0)
    # 认定为球场的行/列：绿像素占该行/列的 25% 以上
    r = np.where(rows > mask.shape[1] * 0.25)[0]
    c = np.where(cols > mask.shape[0] * 0.25)[0]
    if len(r) == 0 or len(c) == 0:
        return None, mask
    return (int(c[0]), int(r[0]), int(c[-1]), int(r[-1])), mask


def blobs(img, mask, box):
    x0, y0, x1, y1 = box
    sub = img[y0:y1 + 1, x0:x1 + 1]
    subm = mask[y0:y1 + 1, x0:x1 + 1]
    # 非草皮 = 候选球员/球/标线
    nong = (subm == 0).astype(np.uint8)
    nong = cv2.morphologyEx(nong, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, lab, stats, cent = cv2.connectedComponentsWithStats(nong, 8)
    rows = []
    for i in range(1, n):
        a = stats[i, cv2.CC_STAT_AREA]
        w, hh = stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        if a < 6 or a > 4000:
            continue
        if max(w, hh) > 60:  # 排除标线等细长物
            continue
        m = (lab == i)
        bgr = sub[m].mean(axis=0)
        rows.append((a, w, hh, tuple(round(float(x)) for x in bgr),
                     round(float(cent[i][0]), 1), round(float(cent[i][1]), 1)))
    return rows


for tag, path in VIDEOS.items():
    print(f"\n{'='*70}\n{tag.upper()}  {os.path.basename(path)}")
    fs = frames(path)
    top, satpx, shape = hue_profile(fs[0][1])
    print(f"分辨率 {shape[1]}x{shape[0]}  有效彩色像素 {satpx}")
    print(f"色相峰值(H, 像素数): {top}")
    # 用最强峰值附近 ±18 作为草皮绿范围
    hmain = top[0][0]
    hlo, hhi = max(0, hmain - 18), min(179, hmain + 18)
    print(f"草皮色相取 [{hlo}, {hhi}]")
    for t, img in fs:
        box, mask = pitch_box(img, hlo, hhi)
        if box is None:
            print(f"  t={t:6.1f}s  未找到球场区域")
            continue
        bw, bh = box[2] - box[0], box[3] - box[1]
        bl = blobs(img, mask, box)
        areas = sorted(b[0] for b in bl)
        print(f"  t={t:6.1f}s  球场盒={box} ({bw}x{bh}, 占画面 "
              f"{100*bw*bh/(shape[0]*shape[1]):.0f}%)  候选连通域={len(bl)}"
              f"  面积中位={areas[len(areas)//2] if areas else 0}")
    # 最后一帧打印若干候选域的颜色，供判断球衣配色
    box, mask = pitch_box(fs[-1][1], hlo, hhi)
    if box:
        bl = sorted(blobs(fs[-1][1], mask, box), key=lambda r: -r[0])[:24]
        print("  最大 24 个候选域 (面积, w, h, BGR均值, cx, cy):")
        for r in bl:
            print("   ", r)

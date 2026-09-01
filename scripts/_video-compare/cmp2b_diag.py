"""诊断：为什么标线矩形没找到——把白像素的行/列剖面直接打出来。

不猜阈值。先看清剖面长什么样：
  · 若边线存在，应在草皮盒的最外侧出现两个强峰（上下边线 / 左右底线）
  · 中线与禁区线会形成内部峰，不能误当边界
  · 球员号码的白字不成行，占比应远低于真正的标线
同时试几组「白色」判定阈值，看哪组能把标线从背景里分出来。
"""
import cv2
import numpy as np

VIDEOS = {
    "fm": (r"C:\Users\WXX\Desktop\2D比赛画面对比\FM26 Mobile  的2D比赛画面.mp4", 34, 70, 153.4),
    "vc": (r"C:\Users\WXX\Desktop\2D比赛画面对比\VCFM 的2D比赛画面.mp4", 52, 88, 180.3),
}


def grass_box(img, hlo, hhi):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    mask = ((h >= hlo) & (h <= hhi) & (s > 40) & (v > 40)).astype(np.uint8)
    rows, cols = mask.sum(axis=1), mask.sum(axis=0)
    r = np.where(rows > mask.shape[1] * 0.25)[0]
    c = np.where(cols > mask.shape[0] * 0.25)[0]
    return (int(c[0]), int(r[0]), int(c[-1]), int(r[-1]))


for tag, (path, hlo, hhi, t) in VIDEOS.items():
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
    ok, img = cap.read()
    cap.release()
    box = grass_box(img, hlo, hhi)
    x0, y0, x1, y1 = box
    sub = img[y0:y1 + 1, x0:x1 + 1]
    hsv = cv2.cvtColor(sub, cv2.COLOR_BGR2HSV)
    s, v = hsv[:, :, 1], hsv[:, :, 2]
    h, w = s.shape
    print(f"\n{'='*74}\n{tag.upper()} t={t}s  草皮盒={box}  子图 {w}x{h}")
    print(f"  子图 S 分位: {[int(np.percentile(s,p)) for p in (5,25,50,75,95)]}")
    print(f"  子图 V 分位: {[int(np.percentile(v,p)) for p in (5,25,50,75,95)]}")

    for slim, vmin in ((70, 140), (90, 120), (110, 110), (255, 150)):
        white = ((s < slim) & (v > vmin)).astype(np.uint8)
        rows, cols = white.sum(axis=1), white.sum(axis=0)
        print(f"\n  阈值 S<{slim} V>{vmin}: 白像素 {int(white.sum())} "
              f"({100*white.sum()/(w*h):.2f}%)")
        print(f"    行最大占比 {rows.max()/w:.3f}  列最大占比 {cols.max()/h:.3f}")
        rtop = np.argsort(rows)[::-1][:8]
        ctop = np.argsort(cols)[::-1][:8]
        print(f"    行峰 y(占比): {[(int(i), round(float(rows[i]/w),3)) for i in sorted(rtop)]}")
        print(f"    列峰 x(占比): {[(int(i), round(float(cols[i]/h),3)) for i in sorted(ctop)]}")

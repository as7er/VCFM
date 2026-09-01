"""标定：用白色标线定出两段录屏各自的「边线矩形」，换出 px/m。

为什么不用草皮包围盒：草皮会画到边线之外（FM 的绿色区域宽高比 1.72，而真实球场
105:68 = 1.54，差 11%），直接拿它换米会系统性偏大。白色标线才是边线真相。

做法：在草皮盒内取「白色」像素（低饱和 + 高亮度），逐行/逐列统计；
真正的标线会横跨整个球场，所以只保留白像素占该行/列 40% 以上的行列，
取其最小/最大即边线矩形。球员号码上的白字不成行，会被这一步滤掉。

输出每帧的矩形与 px/m，用于确认镜头是否固定、以及两轴比例是否自洽。
"""
import cv2
import numpy as np

VIDEOS = {
    "fm": (r"C:\Users\WXX\Desktop\2D比赛画面对比\FM26 Mobile  的2D比赛画面.mp4", 34, 70),
    "vc": (r"C:\Users\WXX\Desktop\2D比赛画面对比\VCFM 的2D比赛画面.mp4", 52, 88),
}
PITCH_L, PITCH_W = 105.0, 68.0  # 真实球场米制


def grass_box(img, hlo, hhi):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    mask = ((h >= hlo) & (h <= hhi) & (s > 40) & (v > 40)).astype(np.uint8)
    rows, cols = mask.sum(axis=1), mask.sum(axis=0)
    r = np.where(rows > mask.shape[1] * 0.25)[0]
    c = np.where(cols > mask.shape[0] * 0.25)[0]
    if len(r) == 0 or len(c) == 0:
        return None
    return int(c[0]), int(r[0]), int(c[-1]), int(r[-1])


def line_rect(img, box, frac=0.40):
    """草皮盒内的白色标线包围盒。"""
    x0, y0, x1, y1 = box
    sub = img[y0:y1 + 1, x0:x1 + 1]
    hsv = cv2.cvtColor(sub, cv2.COLOR_BGR2HSV)
    s, v = hsv[:, :, 1], hsv[:, :, 2]
    white = ((s < 70) & (v > 140)).astype(np.uint8)
    h, w = white.shape
    rows, cols = white.sum(axis=1), white.sum(axis=0)
    rr = np.where(rows > w * frac)[0]
    cc = np.where(cols > h * frac)[0]
    if len(rr) == 0 or len(cc) == 0:
        return None, white.sum()
    return (x0 + int(cc[0]), y0 + int(rr[0]),
            x0 + int(cc[-1]), y0 + int(rr[-1])), white.sum()
def probe(tag, path, hlo, hhi, count=9):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    print(f"\n{'='*74}\n{tag.upper()}  fps={fps:.2f}  frames={int(total)}")
    rects = []
    for i in range(count):
        f = 0.10 + 0.80 * (i / max(1, count - 1))
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * f))
        ok, img = cap.read()
        if not ok:
            continue
        t = total * f / fps
        gb = grass_box(img, hlo, hhi)
        if gb is None:
            print(f"  t={t:7.1f}s  无草皮")
            continue
        lr, wpx = line_rect(img, gb)
        gw, gh = gb[2] - gb[0], gb[3] - gb[1]
        if lr is None:
            print(f"  t={t:7.1f}s  草皮{gw}x{gh}  白像素{wpx}  未找到标线矩形")
            continue
        lw, lh = lr[2] - lr[0], lr[3] - lr[1]
        # 长边即球场长度方向：FM 横屏 → 宽是长度；VCFM 竖屏 → 高是长度
        if lw >= lh:
            px_per_m_len, px_per_m_wid = lw / PITCH_L, lh / PITCH_W
            orient = "横"
        else:
            px_per_m_len, px_per_m_wid = lh / PITCH_L, lw / PITCH_W
            orient = "竖"
        rects.append((lr, px_per_m_len, px_per_m_wid))
        print(f"  t={t:7.1f}s  草皮{gw}x{gh}  标线{lw}x{lh} {orient}  "
              f"px/m 长向{px_per_m_len:.2f} 宽向{px_per_m_wid:.2f}  "
              f"轴比{px_per_m_wid/px_per_m_len:.3f}  标线宽高比{max(lw,lh)/min(lw,lh):.3f}")
    cap.release()
    if rects:
        xs = [r[0] for r in rects]
        same = len(set(xs)) == 1
        print(f"  镜头固定: {same}（{len(set(xs))} 种标线矩形 / {len(rects)} 帧）")
        # 取出现次数最多的矩形作为标定值
        from collections import Counter
        best = Counter(xs).most_common(1)[0]
        print(f"  采用标线矩形 {best[0]}（{best[1]}/{len(rects)} 帧一致）")
        return best[0]
    return None


if __name__ == "__main__":
    out = {}
    for tag, (path, hlo, hhi) in VIDEOS.items():
        out[tag] = probe(tag, path, hlo, hhi)
    print("\n标定结果:", out)

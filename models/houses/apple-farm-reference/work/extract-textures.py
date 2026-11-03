"""Rectify planar surfaces out of the reference photos through the SOLVED photo cameras (house.json photoCams).

A plane maps to the image by a homography, so PIL's PERSPECTIVE transform is exact (QUAD is bilinear and smears
foreshortened surfaces). Usage: python3 models/houses/apple-farm-reference/work/extract-textures.py
Writes public/houses/apple-farm-reference/tex-*.jpg and work/tex-check.png (contact sheet to eyeball every crop — scratch, not committed).
"""
import json, math, os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
HOUSE = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HOUSE)))  # models/houses/<slug> → repo root
OUT = os.path.join(ROOT, "public/houses/apple-farm-reference")
spec = json.load(open(os.path.join(HOUSE, "house.json")))
cams = {c["photo"]: c for c in spec["photoCams"]}


def project(cam, p, W, H):
    (x, y, z), (lx, ly, lz) = cam["pos"], cam["lookAt"]
    dx, dy, dz = lx - x, ly - y, lz - z
    yaw, pitch = math.atan2(-dx, -dz), math.atan2(dy, math.hypot(dx, dz))
    cy, sy, cp, sp = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch)
    f = (-sy * cp, sp, -cy * cp)
    r = (cy, 0.0, -sy)
    u = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])
    q = (p[0] - x, p[1] - y, p[2] - z)
    zf = sum(a * b for a, b in zip(q, f))
    xr = sum(a * b for a, b in zip(q, r))
    yu = sum(a * b for a, b in zip(q, u))
    t = math.tan(math.radians(cam["fov"]) / 2)
    return ((xr / (zf * t * (W / H)) + 1) / 2 * W, (1 - yu / (zf * t)) / 2 * H)


def solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[piv] = M[piv], M[c]
        for r in range(n):
            if r != c:
                k = M[r][c] / M[c][c]
                M[r] = [a - k * b for a, b in zip(M[r], M[c])]
    return [M[i][n] / M[i][i] for i in range(n)]


def rectify(photo, corners, size):
    """corners: world UL, UR, LR, LL of the output image."""
    im = Image.open(os.path.join(HOUSE, "refs", f"{photo}.jpg")).convert("RGB")
    W, H = im.size
    src = [project(cams[photo], c, W, H) for c in corners]
    w, h = size
    dst = [(0, 0), (w, 0), (w, h), (0, h)]
    A, b = [], []
    for (X, Y), (u, v) in zip(dst, src):
        A.append([X, Y, 1, 0, 0, 0, -u * X, -u * Y]); b.append(u)
        A.append([0, 0, 0, X, Y, 1, -v * X, -v * Y]); b.append(v)
    return im.transform(size, Image.PERSPECTIVE, solve(A, b), Image.BICUBIC), src


PPM = 256  # output pixels per metre
JOBS = {
    # name: (photo, UL, UR, LR, LL) — u runs along plan x / along the wall, v runs along plan z / downwards
    "tex-slat": ("H05", (11.6, 2.8, 1.8), (12.35, 2.8, 1.8), (12.35, 2.8, 3.7), (11.6, 2.8, 3.7)),
    "tex-oak": ("H05", (12.8, 0, 1.55), (13.95, 0, 1.55), (13.95, 0, 2.6), (12.8, 0, 2.6)),
    "tex-ply": ("H05", (10.2, 2.75, 4.0), (10.2, 2.75, 1.95), (10.2, 1.45, 1.95), (10.2, 1.45, 4.0)),
    "tex-concrete": ("H08", (6.5, 2.6, 1.89), (8.45, 2.6, 1.89), (8.45, 0.25, 1.89), (6.5, 0.25, 1.89)),
    "tex-deck": ("H05", (12.6, 0, 4.85), (13.3, 0, 4.85), (13.3, 0, 5.85), (12.6, 0, 5.85)),
}

os.makedirs(OUT, exist_ok=True)
sheet = Image.new("RGB", (1600, 900), "white")
d = ImageDraw.Draw(sheet)
x = y = 0
for name, (photo, *corners) in JOBS.items():
    ww = math.dist(corners[0], corners[1])
    hh = math.dist(corners[1], corners[2])
    img, src = rectify(photo, corners, (round(ww * PPM), round(hh * PPM)))
    img.save(os.path.join(OUT, f"{name}.jpg"), quality=86, optimize=True)
    print(f"{name}: {ww:.2f} x {hh:.2f} m  {img.size}  from {photo} px {[tuple(round(c) for c in s) for s in src]}")
    t = img.copy(); t.thumbnail((380, 420))
    if x + t.width > 1600: x, y = 0, y + 440
    sheet.paste(t, (x, y + 20)); d.text((x + 4, y + 4), name, fill="black"); x += t.width + 20
sheet.save(os.path.join(HERE, "tex-check.png"))

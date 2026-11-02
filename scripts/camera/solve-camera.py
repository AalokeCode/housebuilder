"""
Solve a photo-match camera from point correspondences (pure Python, no deps).
Usage: python3 scripts/camera/solve-camera.py <points.json>
points.json: {"size": [1000, 495], "bounds": {"min": [x,y,z], "max": [x,y,z]}, "guess": {"pos": [x,y,z], "lookAt": [x,y,z], "fov": 62},
              "pairs": [{"p": [x,y,z], "px": [u,v], "what": "headboard TL"}, ...]}
Prints the best photoCam (pos, lookAt, vertical fov — three.js convention) and per-point pixel error.
"""
import json, math, sys

def project(cam, p, W, H):
    x, y, z, yaw, pitch, fov = cam
    dx, dy, dz = p[0] - x, p[1] - y, p[2] - z
    # camera basis from yaw (0 = looking −z) and pitch (+ = up), three.js Y-up
    cy, sy, cp, sp = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch)
    f = (-sy * cp, sp, -cy * cp)       # forward
    r = (cy, 0.0, -sy)                 # right
    u = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])  # up = r × f
    zf = dx * f[0] + dy * f[1] + dz * f[2]
    if zf <= 0.05:
        return None
    xr = dx * r[0] + dy * r[1] + dz * r[2]
    yu = dx * u[0] + dy * u[1] + dz * u[2]
    t = math.tan(math.radians(fov) / 2)
    ndc_x = xr / (zf * t * (W / H))
    ndc_y = yu / (zf * t)
    return ((ndc_x + 1) / 2 * W, (1 - ndc_y) / 2 * H)

BOUNDS = None

def cost(cam, pairs, W, H):
    e = 0.0
    if BOUNDS:
        for k, (lo, hi) in enumerate(zip(BOUNDS["min"], BOUNDS["max"])):
            if cam[k] < lo: e += 1e5 * (lo - cam[k]) ** 2 + 1e3
            if cam[k] > hi: e += 1e5 * (cam[k] - hi) ** 2 + 1e3
    for pr in pairs:
        q = project(cam, pr["p"], W, H)
        if q is None:
            return 1e12
        e += (q[0] - pr["px"][0]) ** 2 + (q[1] - pr["px"][1]) ** 2
    # keep the lens plausible for real-estate photos (vertical fov 35°–75°)
    if not 35 <= cam[5] <= 75:
        e += 1e6
    return e

def nelder_mead(f, x0, step, iters=6000):
    n = len(x0)
    pts = [list(x0)] + [[x0[j] + (step[j] if j == i else 0) for j in range(n)] for i in range(n)]
    vals = [f(p) for p in pts]
    for _ in range(iters):
        order = sorted(range(n + 1), key=lambda i: vals[i])
        pts = [pts[i] for i in order]; vals = [vals[i] for i in order]
        c = [sum(p[j] for p in pts[:-1]) / n for j in range(n)]
        xr = [c[j] + (c[j] - pts[-1][j]) for j in range(n)]; fr = f(xr)
        if fr < vals[0]:
            xe = [c[j] + 2 * (c[j] - pts[-1][j]) for j in range(n)]; fe = f(xe)
            pts[-1], vals[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < vals[-2]:
            pts[-1], vals[-1] = xr, fr
        else:
            xc = [c[j] + 0.5 * (pts[-1][j] - c[j]) for j in range(n)]; fc = f(xc)
            if fc < vals[-1]:
                pts[-1], vals[-1] = xc, fc
            else:
                pts = [pts[0]] + [[pts[0][j] + 0.5 * (p[j] - pts[0][j]) for j in range(n)] for p in pts[1:]]
                vals = [vals[0]] + [f(p) for p in pts[1:]]
    i = min(range(n + 1), key=lambda k: vals[k])
    return pts[i], vals[i]

def main():
    global BOUNDS
    d = json.load(open(sys.argv[1]))
    BOUNDS = d.get("bounds")  # camera position box (e.g. the room it was shot in, eye 1.0–1.7 m)
    W, H = d["size"]
    g = d["guess"]
    p, l = g["pos"], g["lookAt"]
    dx, dy, dz = l[0] - p[0], l[1] - p[1], l[2] - p[2]
    x0 = [p[0], p[1], p[2], math.atan2(-dx, -dz), math.atan2(dy, math.hypot(dx, dz)), g.get("fov", 55)]
    best = None
    # multi-start: jitter yaw / fov to avoid local minima
    for dyaw in (-0.4, 0, 0.4):
        for fov in (40, 50, 60):
            start = x0[:3] + [x0[3] + dyaw, x0[4], fov]
            sol, val = nelder_mead(lambda c: cost(c, d["pairs"], W, H), start, [0.3, 0.15, 0.3, 0.15, 0.08, 6])
            if best is None or val < best[1]:
                best = (sol, val)
    x, y, z, yaw, pitch, fov = best[0]
    f = (-math.sin(yaw) * math.cos(pitch), math.sin(pitch), -math.cos(yaw) * math.cos(pitch))
    look = [round(x + 3 * f[0], 2), round(y + 3 * f[1], 2), round(z + 3 * f[2], 2)]
    rms = math.sqrt(best[1] / len(d["pairs"]))
    print(json.dumps({"pos": [round(x, 2), round(y, 2), round(z, 2)], "lookAt": look, "fov": round(fov, 1)}))
    print(f"rms error: {rms:.1f} px")
    for pr in d["pairs"]:
        q = project(best[0], pr["p"], W, H)
        print(f"  {pr.get('what', ''):<28} photo {pr['px']}  model {[round(q[0]), round(q[1])] if q else 'behind'}")

main()

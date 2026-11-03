"""Ground-level valley skybox from Poly Haven "alps_field" (CC0, Andreas Mischok) — used by apple-farm-reference.

Usage: python3 scripts/skybox/build-valley.py <alps_field tonemapped .jpg> public/env
Source: https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/alps_field.jpg (md5 6693084c7fd3831ba3c183314fbb6ade)
A single-storey house sits at ground level, so the raw panorama's horizon is already at eye height (unlike the tower
skyline). Only the near ground below the horizon is softened: it is out of focus from indoors and dominates file size.
"""
import sys
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
src = Image.open(sys.argv[1]).convert("RGB")
out = sys.argv[2]
W, H = src.size
hz = int(H * 0.53)
src.paste(src.crop((0, hz, W, H)).filter(ImageFilter.GaussianBlur(3)), (0, hz))
for w, name, q in ((8192, "8k", 72), (4096, "4k", 74)):
    src.resize((w, w // 2), Image.LANCZOS).save(f"{out}/valley_bg_{name}.jpg", quality=q, optimize=True, progressive=True, subsampling=2)

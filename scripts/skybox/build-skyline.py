
"""Build a river-skyline equirect (no people / promenade) from the Shanghai Bund panorama (Poly Haven, CC0)."""
import sys
from PIL import Image, ImageChops, ImageEnhance, ImageFilter
Image.MAX_IMAGE_PIXELS = None
src = Image.open(sys.argv[1]).convert("RGB")  # 8192x4096
out_dir = sys.argv[2]
W, H = src.size
HC = int(0.496 * H)                              # water line: everything below is promenade/people
x0, x1 = int(0.362 * W), int(0.80 * W)            # river skyline segment between the Bund buildings
seg = src.crop((x0, 0, x1, HC)).resize((x1 - x0, H // 2), Image.LANCZOS)
mir = seg.transpose(Image.FLIP_LEFT_RIGHT)
# hazy underlay: blurred copies alternating original / mirrored → every tile joint is a mirror joint (seamless),
# and the softness keeps the repeats from reading as duplicates
soft = lambda im: ImageEnhance.Contrast(im.filter(ImageFilter.GaussianBlur(4))).enhance(0.85)
tiles = (soft(seg), soft(mir))
sw = seg.width
upper = Image.new("RGB", (W, H // 2))
cx = (W - sw) // 2
x, k = cx, 0
while x > -sw:
    upper.paste(tiles[k % 2], (x, 0)); x -= sw; k += 1
x, k = cx + sw, 1
while x < W:
    upper.paste(tiles[k % 2], (x, 0)); x += sw; k += 1
# the real segment in the middle, feathered 25 % into the haze on both sides
mask = Image.new("L", (sw, H // 2), 255)
fe = int(sw * 0.25)
ramp = Image.linear_gradient("L").rotate(90, expand=True).resize((fe, H // 2))  # 0→255 left to right
mask.paste(ramp.transpose(Image.FLIP_LEFT_RIGHT).point(lambda v: 255 - v), (0, 0))
mask.paste(ramp.transpose(Image.FLIP_LEFT_RIGHT), (sw - fe, 0))
upper.paste(seg, (cx, 0), mask)
# river: reflection of the skyline, darker + blue, smeared horizontally, fading to deep water
refl = upper.transpose(Image.FLIP_TOP_BOTTOM)
refl = refl.resize((W // 24, H // 2), Image.BILINEAR).resize((W, H // 2), Image.BILINEAR)
refl = refl.filter(ImageFilter.GaussianBlur(3))
refl = ImageEnhance.Brightness(refl).enhance(0.42)
water = Image.new("RGB", (W, H // 2), (14, 18, 34))
grad = Image.linear_gradient("L").resize((W, H // 2))  # 0 at top → 255 bottom
grad = grad.point(lambda v: min(255, int(v * 2.2)))
lower = Image.composite(water, ImageChops.multiply(refl, Image.new("RGB", (W, H // 2), (200, 210, 255))), grad)
pano = Image.new("RGB", (W, H)); pano.paste(upper, (0, 0)); pano.paste(lower, (0, H // 2))
for w, tag in ((4096, "4k"), (8192, "8k")):
    pano.resize((w, w // 2), Image.LANCZOS).save(f"{out_dir}/skyline_bg_{tag}.jpg", quality=84, optimize=True, progressive=True)
pano.resize((2048, 1024)).save(f"{out_dir}/skyline_preview.jpg", quality=80)
print("ok", seg.size)

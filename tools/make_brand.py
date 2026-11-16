# Crop the two shop logos for the jackpot symbol.
# usage: python make_brand.py <haolilai_src.jpg> <benzun_src.jpg>
# haolilai -> round (alpha mask + gold ring), benzun -> square. Output 256x256 PNG in ../assets
import os
import sys
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
os.makedirs(OUT, exist_ok=True)
SIZE = 256


def center_square(im):
    w, h = im.size
    s = min(w, h)
    left = (w - s) // 2
    top = (h - s) // 2
    return im.crop((left, top, left + s, top + s))


def make_round(src, dst):
    im = center_square(Image.open(src).convert("RGB")).resize((SIZE, SIZE), Image.LANCZOS)
    big = SIZE * 4
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    mask = mask.resize((SIZE, SIZE), Image.LANCZOS)
    ring = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(ring)
    d.ellipse((0, 0, big - 1, big - 1), outline=(122, 59, 0, 255), width=10)
    d.ellipse((10, 10, big - 11, big - 11), outline=(247, 197, 49, 255), width=22)
    ring = ring.resize((SIZE, SIZE), Image.LANCZOS)
    out = im.convert("RGBA")
    out.alpha_composite(ring)
    out.putalpha(mask)
    out.save(dst)
    return out.size


def make_square(src, dst):
    im = center_square(Image.open(src).convert("RGB")).resize((SIZE, SIZE), Image.LANCZOS)
    im.save(dst)
    return im.size


def make_og(src, dst):
    # link preview picture (LINE / FB): plain square, 600x600 JPG
    im = center_square(Image.open(src).convert("RGB")).resize((600, 600), Image.LANCZOS)
    im.save(dst, quality=88)
    return im.size


if __name__ == "__main__":
    for name, src in (("og_haolilai.jpg", sys.argv[1]), ("og_benzun.jpg", sys.argv[2])):
        p = os.path.join(OUT, name)
        print(name, make_og(src, p), os.path.getsize(p))
    a = os.path.join(OUT, "haolilai.png")
    b = os.path.join(OUT, "benzun.png")
    print("haolilai", make_round(sys.argv[1], a), os.path.getsize(a))
    print("benzun", make_square(sys.argv[2], b), os.path.getsize(b))

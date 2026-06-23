#!/usr/bin/env python3
"""Generate WSJ-style monogram avatars for the GWJ writer roster."""
import os, re, unicodedata
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__)) + "/avatars"
os.makedirs(OUT, exist_ok=True)

WRITERS = [
    "Eleanor Vance", "Ji-ho Park", "Daniel Okafor", "Priya Nair", "Marcus Lin",
    "Ada Whitfield", "Sofia Marchetti", "Harper Reyes", "Thomas Brennan",
    "Lucía Ferrer", "J. P. Sutherland", "Margaret Holloway", "Camille Dubois",
    "Oliver Bennett", "Nathan Cole", "Yuki Tanaka", "Amara Diallo", "Robert Hale",
]

def slugify(value: str) -> str:
    # Fediverse username: lowercase, strip accents (NFKD), keep ONLY [a-z0-9]
    # (no hyphens/dots/spaces) — Mastodon's acct local part requires this.
    # e.g. "Eleanor Vance"->"eleanorvance", "J. P. Sutherland"->"jpsutherland".
    v = unicodedata.normalize("NFKD", value.lower())
    v = "".join(c for c in v if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", v)

def initials(name: str) -> str:
    toks = [t for t in re.split(r"[\s.]+", name) if t and t[0].isalpha()]
    if not toks:
        return "GWJ"
    if len(toks) == 1:
        return toks[0][0].upper()
    return (toks[0][0] + toks[-1][0]).upper()

# Muted, classy palette (deep editorial tones) — keyed deterministically by name.
PALETTE = [
    (26, 32, 44), (45, 55, 72), (44, 42, 56), (30, 41, 59), (40, 44, 52),
    (53, 38, 38), (33, 48, 48), (38, 44, 38), (48, 40, 30), (36, 36, 46),
]
ACCENT = (179, 18, 23)  # GWJ accent red

def fnv1a(s: str) -> int:
    h = 0x811c9dc5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xffffffff
    return h

SIZE = 512
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", 230)

manifest = []
for name in WRITERS:
    slug = slugify(name)
    bg = PALETTE[fnv1a(slug) % len(PALETTE)]
    img = Image.new("RGB", (SIZE, SIZE), bg)
    d = ImageDraw.Draw(img)
    # thin accent ring
    inset = 14
    d.ellipse([inset, inset, SIZE - inset, SIZE - inset], outline=ACCENT, width=6)
    txt = initials(name)
    bbox = d.textbbox((0, 0), txt, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((SIZE - tw) / 2 - bbox[0], (SIZE - th) / 2 - bbox[1]), txt,
           font=font, fill=(245, 243, 238))
    path = f"{OUT}/{slug}.png"
    img.save(path, "PNG", optimize=True)
    manifest.append((slug, name, initials(name), path))

for slug, name, ini, path in manifest:
    print(f"{slug:24} {ini:3} {name}  -> {os.path.getsize(path)}B")
print(f"\n{len(manifest)} avatars in {OUT}")

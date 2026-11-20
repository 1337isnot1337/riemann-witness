"""Build Worker-ready certificate plates and type from local open-source fonts.

Requires Pillow, fontTools, rsvg-convert and the Noto Serif Display / DejaVu
Sans Mono fonts. No fonts or image tools are loaded by the deployed Worker.
"""

import base64
from io import BytesIO
import json
import math
from pathlib import Path
import struct
import subprocess
import unicodedata
import zlib

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "art/generated"
SERIF = "/usr/share/fonts/noto/NotoSerifDisplay-Regular.ttf"
ITALIC = "/usr/share/fonts/noto/NotoSerifDisplay-Italic.ttf"
MONO = "/usr/share/fonts/TTF/DejaVuSansMono.ttf"
PAPER = (231, 228, 206)
INK = (19, 37, 32)
CREAM = (244, 239, 218)
GOLD = (198, 165, 107)
MINT = (176, 207, 177)


def font(size, face=SERIF):
    return ImageFont.truetype(face, size)


def label(draw, pos, text, *, size=13, gap=2, fill=GOLD):
    x, y = pos
    face = font(size, MONO)
    baseline = y - face.getbbox("A", anchor="ls")[1]
    for character in text:
        draw.text((x, baseline), character, font=face, fill=fill, anchor="ls")
        x += face.getlength(character) + gap


def rosette(draw, x, y, r):
    for phase in (0, math.pi / 6, math.pi / 3):
        points = []
        for i in range(721):
            a = 2 * math.pi * i / 720
            radius = r * (0.86 + 0.12 * math.cos(12 * a + phase))
            points.append((x + radius * math.cos(a), y + radius * math.sin(a)))
        draw.line(points, fill=GOLD)
    draw.ellipse((x - r * 0.65, y - r * 0.65, x + r * 0.65, y + r * 0.65), outline=GOLD)
    draw.text(
        (x, y - 1), "ζ", anchor="mm", font=font(round(1.05 * r), ITALIC), fill=CREAM
    )


def plate(portrait):
    w, h = (900, 1200) if portrait else (1200, 630)
    im = Image.new("RGB", (w, h), INK)
    d = ImageDraw.Draw(im)
    # Archive sleeve: double rules, folio number, etched plate and a paper label.
    d.rectangle((15, 15, w - 16, h - 16), outline=(137, 144, 112), width=1)
    d.rectangle((20, 20, w - 21, h - 21), outline=(65, 84, 68), width=1)
    for x in (15, w - 16):
        for y in (15, h - 16):
            sx = 1 if x < 100 else -1
            sy = 1 if y < 100 else -1
            d.line((x, y, x + sx * 26, y), fill=GOLD, width=2)
            d.line((x, y, x, y + sy * 26), fill=GOLD, width=2)
    margin = 59
    rosette(d, margin + 15, 70, 22)
    event_size = 46 if portrait else 64
    d.text(
        (margin + 51, 69),
        "RIEMANN HYPOTHESIS SOLVED.",
        font=font(event_size),
        fill=CREAM,
        anchor="lm",
    )
    d.line((margin, 109, w - margin, 109), fill=(100, 113, 88))
    if portrait:
        label(d, (margin, 137), "NOVEMBER 20, 2026", size=25, gap=1, fill=MINT)
        d.text((margin - 5, 174), "I was", font=font(145), fill=CREAM, anchor="lt")
        d.text(
            (margin + 183, 303),
            "here.",
            font=font(170, ITALIC),
            fill=CREAM,
            anchor="lt",
        )
        px, py, pw = margin - 2, 475, w - 2 * margin + 4
        label(d, (margin, 882), "1859 — 2026", size=25, fill=GOLD, gap=2)
        panel_top = 934
    else:
        label(d, (margin, 131), "NOVEMBER 20, 2026", size=24, gap=1, fill=MINT)
        d.text((margin - 3, 177), "I was", font=font(99), fill=CREAM, anchor="lt")
        d.text(
            (margin + 62, 251), "here.", font=font(114, ITALIC), fill=CREAM, anchor="lt"
        )
        px, py, pw = 499, 112, 615
        label(d, (margin, 367), "1859 — 2026", size=20, fill=GOLD, gap=1)
        panel_top = 404
    engraving = Image.open(
        BytesIO(
            subprocess.check_output(
                [
                    "rsvg-convert",
                    "-w",
                    str(pw),
                    str(ROOT / "public/art/critical-strip.svg"),
                ]
            )
        )
    ).convert("RGBA")
    im.paste(engraving, (px, py), engraving)
    caption_y = py + engraving.height - (4 if portrait else 88)
    caption_x = w - margin - (226 if portrait else 138)
    if portrait:
        label(
            d,
            (caption_x, caption_y),
            "PLATE I  /  THE CRITICAL STRIP",
            size=10,
            gap=1,
            fill=MINT,
        )
    else:
        # The sparse lower right of the engraving leaves room for its folio.
        label(
            d, (caption_x, caption_y), "THE CRITICAL STRIP", size=10, gap=1, fill=MINT
        )
    left, right = 33, w - 34
    d.rectangle((left, panel_top, right, h - 34), fill=PAPER)
    d.line((left, panel_top + 6, right, panel_top + 6), fill=(158, 157, 127))
    base = panel_top
    divider = 581 if portrait else 822
    d.line((divider, base + 24, divider, h - 99), fill=(176, 176, 148))
    label(d, (margin, base + 31), "REGISTERED WITNESS", size=16, fill=INK)
    label(d, (divider + 28, base + 31), "REGISTRY NUMBER", size=16, fill=INK)
    d.line((margin, h - 94, w - margin, h - 94), fill=(153, 157, 131))
    return im


def encode(data):
    return base64.b64encode(data).decode("ascii")


def make_plate(portrait):
    image = plate(portrait)
    # Reserve a 16-step ink ramp on paper for type added after registration.
    base = image.quantize(
        colors=104, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
    )
    static_palette = base.getpalette()[: 104 * 3]
    static_palette += [0] * (104 * 3 - len(static_palette))
    for alpha in range(16):
        static_palette.extend(
            round(a + (b - a) * alpha / 15) for a, b in zip(PAPER, INK)
        )
    w, h = base.size
    raw = base.tobytes()
    rows = b"".join(b"\0" + raw[i : i + w] for i in range(0, len(raw), w))
    # Cache the complete upper plate as an independently flushed deflate prefix.
    # Worker requests only inflate, personalize and recompress the paper label.
    top = 934 if portrait else 404
    head, tail = rows[: top * (w + 1)], rows[top * (w + 1) :]
    compressor = zlib.compressobj(9, wbits=-15)
    compressed = compressor.compress(head) + compressor.flush(zlib.Z_FULL_FLUSH)

    def chunk(tag, payload):
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload))
        )

    png_signature = bytes((137, 80, 78, 71, 13, 10, 26, 10))
    prefix = (
        png_signature
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 3, 0, 0, 0))
        + chunk(b"PLTE", bytes(static_palette))
        + chunk(b"IDAT", b"\x78\x9c" + compressed)
    )
    return dict(
        w=w,
        h=h,
        top=top,
        prefix=encode(prefix),
        adler=zlib.adler32(head),
        z=encode(zlib.compress(tail, 9)),
    )


def atlas(face, height, chars):
    face = font(height, face)
    glyphs = {}
    ink = bytearray()
    for char in chars:
        mask, offset = face.getmask2(char, mode="L", anchor="ls")
        w, h = mask.size
        glyphs[char] = [len(ink), w, h, *offset, round(face.getlength(char) * 16)]
        # Four-bit alpha is enough for printed ink at social card resolutions.
        coverage = bytes(mask)
        ink.extend(
            (coverage[i] >> 4) * 16
            + (coverage[i + 1] >> 4 if i + 1 < len(coverage) else 0)
            for i in range(0, len(coverage), 2)
        )
    return dict(g=glyphs, z=encode(zlib.compress(ink, 9)))


def write(name, data):
    (OUTPUT / (name + ".js")).write_text(
        "export default "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )


def main():
    OUTPUT.mkdir(exist_ok=True)
    cmap = TTFont(SERIF).getBestCmap()
    ascii_chars = [chr(i) for i in range(32, 127)]
    extra = ["·", "–", "—", "‘", "’", "“", "”"]
    letters = [
        chr(i)
        for i in range(0xA0, 0x530)
        if i in cmap
        and unicodedata.category(chr(i)).startswith("L")
        and any(
            s in unicodedata.name(chr(i), "") for s in ("LATIN", "GREEK", "CYRILLIC")
        )
    ]
    write("names", atlas(ITALIC, 64, ascii_chars + extra + letters))
    write("numbers", atlas(MONO, 60, ascii_chars))
    write("landscape", make_plate(False))
    write("portrait", make_plate(True))


if __name__ == "__main__":
    main()

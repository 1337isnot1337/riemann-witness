"""Rebuild the homepage share cards with Pillow, fontTools, librsvg and Liberation Sans."""

from argparse import ArgumentParser
from io import BytesIO
from pathlib import Path
import subprocess

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

PUBLIC = Path(__file__).resolve().parents[1] / "public"
INK = "#101e1b"
PAPER = "#f4eddf"
MINT = "#b5e5c8"
RULE = "#526458"


def svg(path, width):
    raster = subprocess.check_output(["rsvg-convert", "--width", str(width), str(PUBLIC / path)])
    return Image.open(BytesIO(raster)).convert("RGBA")


def render_card(output, status, headline, *, size, top, leading):
    with TTFont(PUBLIC / "fonts/gloock.woff2") as font:
        font.flavor = None
        display = BytesIO()
        font.save(display)
    display.seek(0)
    title = ImageFont.truetype(display, size)
    display.seek(0)
    wordmark = ImageFont.truetype(display, 41)
    label = ImageFont.truetype("/usr/share/fonts/liberation/LiberationSans-Bold.ttf", 40)

    card = Image.new("RGB", (1200, 630), INK)
    seal = svg("seal.svg", 54)
    card.paste(seal, (56, 52), seal)
    engraving = svg("art/critical-strip.svg", 560)
    card.paste(engraving, (586, 184), engraving)

    draw = ImageDraw.Draw(card)
    draw.text((124, 64), "I Was Here.", font=wordmark, fill=PAPER, anchor="lt")
    draw.text((1144, 65), status, font=label, fill=MINT, anchor="rt")
    draw.line((56, 124, 1144, 124), fill=RULE, width=2)
    for index, line in enumerate(headline):
        color = MINT if index == len(headline) - 1 else PAPER
        draw.text((56, top + index * leading), line, font=title, fill=color, anchor="lt")
    draw.line((56, 486, 1144, 486), fill=RULE, width=2)
    draw.text((56, 522), "riemannsolved.com", font=label, fill=PAPER, anchor="lt")
    card.save(PUBLIC / output, optimize=True)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--open", action="store_true", help="generate registry-card.png")
    if parser.parse_args().open:
        render_card("registry-card.png", "Sign the register", ("Riemann", "Hypothesis", "Solved"),
                    size=105, top=157, leading=107)
    else:
        render_card("coming-soon.png", "Coming soon", ("Riemann", "Hypothesis"),
                    size=110, top=192, leading=110)


if __name__ == "__main__":
    main()

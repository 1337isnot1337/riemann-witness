"""Generate an engraved perspective section of the Riemann zeta function.

Only Python's standard library is required. Run from any working directory.
"""

from __future__ import annotations

import base64
import cmath
import json
import math
from pathlib import Path
import struct

OUT = Path(__file__).resolve().parents[1] / "public" / "art" / "critical-strip.svg"
LOG = [math.log(k) for k in range(1, 33)]
ZERO = (14.134725, 21.022040, 25.010858, 30.424876, 32.935062)
T_MIN, T_MAX = 9, 36


def zeta(s):
    """Euler–Maclaurin sum, with three Bernoulli correction terms."""
    tail = cmath.exp(-s * LOG[-1])
    terms = sum(cmath.exp(-s * a) for a in LOG[:-1])
    return terms + tail * (
        32 / (s - 1)
        + 0.5
        + s / 384
        - s * (s + 1) * (s + 2) / (720 * 32**3)
        + s * (s + 1) * (s + 2) * (s + 3) * (s + 4) / (30240 * 32**5)
    )


def project(t, sigma, h=0):
    x = (t - T_MIN) / (T_MAX - T_MIN)
    # Stretch the critical strip across the plate and tilt its two axes.
    return (30 + 443 * x + sigma * 223, 346 + 72 * x - 136 * sigma - h * 48)


def sample(t, sigma):
    return project(t, sigma, abs(zeta(complex(sigma, t))))


def coordinates(points):
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in points)


def line(points, color, thickness=0.8, **attributes):
    extra = " ".join(f'{k}="{v}"' for k, v in attributes.items())
    return f'<polyline points="{coordinates(points)}" stroke="{color}" stroke-width="{thickness}" {extra}/>'


def create():
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 105 736 348" role="img" aria-labelledby="t d">',
        '<title id="t">A section of the critical strip</title>',
        '<desc id="d">Perspective engraving of the magnitude of the Riemann zeta function. Five zeros touch the floor along the critical line.</desc>',
        '<g fill="none" stroke-linecap="round" stroke-linejoin="round">',
    ]
    # The wire floor is slightly larger than the surface, like a drafting plate.
    for s in (-0.09, 0.25, 0.5, 0.75, 1.09):
        parts.append(
            line(
                [project(t, s) for t in (T_MIN - 0.5, T_MAX + 0.5)],
                "#9c9875",
                0.7,
                opacity=".54",
            )
        )
    for t in range(10, 37, 2):
        parts.append(
            line([project(t, s) for s in (-0.09, 1.09)], "#9c9875", 0.6, opacity=".42")
        )
    ts = [T_MIN + (T_MAX - T_MIN) * i / 169 for i in range(170)]
    # Hide contour segments obscured by a closer slice. The resulting drawing
    # remains transparent, even when printed onto different badge backgrounds.
    horizon = [500.0] * 721
    rows = []
    cross_sections = []
    cross_ts = [T_MIN + (T_MAX - T_MIN) * i / 40 for i in range(41)]
    previous = [None] * len(cross_ts)
    for i in range(83):
        s = i / 82
        pts = [sample(t, s) for t in ts]
        color = "#caf3cf" if i % 5 == 0 else "#9acdb3"
        if i == 41:
            color = "#e6cfa0"
        visible = []
        for p in pts:
            x, y = p
            if y <= horizon[round(x)] + 1.2:
                visible.append(p)
            elif visible:
                if len(visible) > 1:
                    rows.append(line(visible, color, 1.45 if i == 41 else 0.85))
                visible = []
        if len(visible) > 1:
            rows.append(line(visible, color, 1.45 if i == 41 else 0.85))
        for k, t in enumerate(cross_ts):
            x, y = sample(t, s)
            if y <= horizon[round(x)] + 1.2:
                if previous[k] is not None:
                    cross_sections.append((previous[k], (x, y)))
                previous[k] = x, y
            else:
                previous[k] = None
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            for x in range(math.ceil(ax), math.floor(bx) + 1):
                horizon[x] = min(horizon[x], ay + (by - ay) * (x - ax) / (bx - ax))
    parts.extend(reversed(rows))
    strokes = " ".join(
        f"M{a[0]:.1f},{a[1]:.1f}L{b[0]:.1f},{b[1]:.1f}" for a, b in cross_sections
    )
    parts.append(
        f'<path d="{strokes}" stroke="#abcfaf" stroke-width=".44" opacity=".65"/>'
    )
    parts.append(
        line(
            [project(t, 0.5) for t in (T_MIN - 0.5, T_MAX + 0.6)],
            "#dfbb80",
            0.8,
            opacity=".8",
            **{"stroke-dasharray": "3 5"},
        )
    )
    for t in (10, 15, 20, 25, 30, 35):
        x, y = project(t, -0.09)
        parts.append(line([(x, y), (x - 4, y + 5)], "#afab88", 0.8))
        parts.append(
            f'<text x="{x-8:.1f}" y="{y+16:.1f}" fill="#c9c4a7" font-size="8" font-family="monospace">{t}</text>'
        )
    x, y = project(T_MAX + 0.6, 0.5)
    parts.append(
        f'<text x="{x+4:.1f}" y="{y+2:.1f}" fill="#d8be8f" font-size="10" font-style="italic" font-family="serif">σ = ½</text>'
    )
    for t in ZERO:
        x, y = project(t, 0.5)
        parts.append(
            f'<circle cx="{x:.2f}" cy="{y:.2f}" r="2.2" fill="#edc888" stroke="#35372c" stroke-width=".8"/>'
        )
    parts.extend(["</g></svg>"])
    return "\n".join(parts)


def orbit_mesh():
    rows = 61
    ts = sorted([T_MIN + (T_MAX - T_MIN) * i / 120 for i in range(121)] + list(ZERO))
    heights = [
        round(8192 * abs(zeta(complex(row / (rows - 1), t))))
        for row in range(rows)
        for t in ts
    ]
    packed = base64.b64encode(struct.pack(f"<{len(heights)}H", *heights)).decode("ascii")
    return "export default " + json.dumps(
        {"rows": rows, "ts": ts, "zeros": ZERO, "heights": packed}, separators=(",", ":")
    ) + ";\n"


if __name__ == "__main__":
    OUT.write_text(create() + "\n")
    OUT.with_name("plate-mesh.js").write_text(orbit_mesh())

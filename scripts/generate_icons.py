#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = Path(__file__).resolve().parent.parent / "icons"
SIZES = [16, 32, 48, 128, 256, 512]
BASE_SIZE = 1024


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def blend(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t))


def generate_master_icon() -> Image.Image:
    img = Image.new("RGBA", (BASE_SIZE, BASE_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Gradient background.
    top = (44, 130, 255)
    bottom = (11, 24, 61)
    for y in range(BASE_SIZE):
        t = y / (BASE_SIZE - 1)
        color = blend(top, bottom, t)
        draw.line([(0, y), (BASE_SIZE, y)], fill=color)

    # Rounded clip look + subtle border.
    radius = int(BASE_SIZE * 0.24)
    mask = Image.new("L", (BASE_SIZE, BASE_SIZE), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((0, 0, BASE_SIZE - 1, BASE_SIZE - 1), radius=radius, fill=255)
    img.putalpha(mask)

    border = Image.new("RGBA", (BASE_SIZE, BASE_SIZE), (0, 0, 0, 0))
    border_draw = ImageDraw.Draw(border)
    border_draw.rounded_rectangle(
        (12, 12, BASE_SIZE - 13, BASE_SIZE - 13),
        radius=radius,
        outline=(255, 255, 255, 90),
        width=14,
    )
    img = Image.alpha_composite(img, border)

    # Soft top glow.
    glow = Image.new("RGBA", (BASE_SIZE, BASE_SIZE), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse(
        (int(BASE_SIZE * 0.08), int(BASE_SIZE * -0.35), int(BASE_SIZE * 0.92), int(BASE_SIZE * 0.45)),
        fill=(255, 255, 255, 80),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(28))
    img = Image.alpha_composite(img, glow)

    # Shield body.
    shield = Image.new("RGBA", (BASE_SIZE, BASE_SIZE), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shield)
    pts = [
        (BASE_SIZE * 0.50, BASE_SIZE * 0.16),
        (BASE_SIZE * 0.76, BASE_SIZE * 0.26),
        (BASE_SIZE * 0.74, BASE_SIZE * 0.58),
        (BASE_SIZE * 0.50, BASE_SIZE * 0.84),
        (BASE_SIZE * 0.26, BASE_SIZE * 0.58),
        (BASE_SIZE * 0.24, BASE_SIZE * 0.26),
    ]
    sdraw.polygon(pts, fill=(244, 248, 255, 255))
    sdraw.line(pts + [pts[0]], fill=(210, 225, 250, 255), width=14)

    inner = [
        (BASE_SIZE * 0.50, BASE_SIZE * 0.21),
        (BASE_SIZE * 0.70, BASE_SIZE * 0.29),
        (BASE_SIZE * 0.68, BASE_SIZE * 0.55),
        (BASE_SIZE * 0.50, BASE_SIZE * 0.75),
        (BASE_SIZE * 0.32, BASE_SIZE * 0.55),
        (BASE_SIZE * 0.30, BASE_SIZE * 0.29),
    ]
    sdraw.polygon(inner, fill=(219, 234, 255, 220))

    # Check mark.
    check_color = (18, 88, 219, 255)
    sdraw.line(
        [
            (BASE_SIZE * 0.37, BASE_SIZE * 0.47),
            (BASE_SIZE * 0.47, BASE_SIZE * 0.57),
            (BASE_SIZE * 0.63, BASE_SIZE * 0.41),
        ],
        fill=check_color,
        width=50,
        joint="curve",
    )

    img = Image.alpha_composite(img, shield)

    # Ad-block badge (red no-entry circle) for recognizability.
    badge = Image.new("RGBA", (BASE_SIZE, BASE_SIZE), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(badge)
    cx, cy = BASE_SIZE * 0.76, BASE_SIZE * 0.74
    r = BASE_SIZE * 0.14
    bdraw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(230, 51, 66, 255), outline=(255, 255, 255, 245), width=22)
    bdraw.line((cx - r * 0.62, cy + r * 0.62, cx + r * 0.62, cy - r * 0.62), fill=(255, 255, 255, 255), width=32)

    badge = badge.filter(ImageFilter.GaussianBlur(0.2))
    img = Image.alpha_composite(img, badge)

    return img


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    master = generate_master_icon()

    for size in SIZES:
        out = master.resize((size, size), Image.Resampling.LANCZOS)
        out_path = OUT_DIR / f"icon{size}.png"
        out.save(out_path, format="PNG", optimize=True)
        print(f"wrote {out_path}")


if __name__ == "__main__":
    main()

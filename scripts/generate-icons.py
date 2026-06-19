from PIL import Image, ImageDraw
from pathlib import Path


def generate_icon(size, output):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    r = size // 8
    draw.rounded_rectangle((0, 0, size, size), radius=r, fill="#22c55e")

    # Draw a simple stylized mushroom in white.
    pad = size // 5
    cap_top = pad
    cap_bottom = size // 2 + pad // 2
    center_x = size // 2
    cap_radius = (cap_bottom - cap_top) // 2

    # Mushroom cap (semi-circle)
    draw.ellipse(
        [center_x - cap_radius * 2, cap_top, center_x + cap_radius * 2, cap_bottom + cap_radius],
        fill="white",
    )
    # Stem
    stem_w = size // 6
    stem_h = size // 3
    stem_left = center_x - stem_w // 2
    stem_top = cap_bottom
    draw.rounded_rectangle(
        [stem_left, stem_top, stem_left + stem_w, stem_top + stem_h],
        radius=stem_w // 4,
        fill="white",
    )

    img.save(output)
    print(f"Generated {output}")


if __name__ == "__main__":
    out_dir = Path("public/icons")
    out_dir.mkdir(exist_ok=True)
    generate_icon(192, out_dir / "icon-192.png")
    generate_icon(512, out_dir / "icon-512.png")

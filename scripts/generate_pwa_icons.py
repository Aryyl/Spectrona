"""
generate_pwa_icons.py
=====================
Generates responsive PWA app icons (192x192, 512x512, maskable, and apple-touch-icon)
from the Jeev One / Spectrona branding assets.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

STATIC_DIR = Path(__file__).resolve().parent.parent / "dashboard" / "static"
ICONS_DIR = STATIC_DIR / "icons"
LOGO_PATH = STATIC_DIR / "images" / "jeev_one_logo.png"

ICONS_DIR.mkdir(parents=True, exist_ok=True)


def create_pwa_icon(size: int, is_maskable: bool = False) -> Image.Image:
    """Create a high-resolution dark-themed PWA icon with centered logo."""
    # Background canvas
    canvas = Image.new("RGBA", (size, size), (9, 9, 11, 255))
    draw = ImageDraw.Draw(canvas)

    # Subtle modern background depth: radial glow in the center
    center_glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(center_glow)
    radius = int(size * 0.42)
    cx, cy = size // 2, size // 2
    
    # Soft concentric circles for ambient medical glow
    for r in range(radius, 0, -8):
        alpha = int(25 * (1 - r / radius))
        glow_draw.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            fill=(139, 92, 246, alpha)  # Soft purple ambient
        )
    canvas = Image.alpha_composite(canvas, center_glow)

    # Subtle pulse accent ring if not maskable
    if not is_maskable:
        ring_box = [int(size * 0.08), int(size * 0.08), int(size * 0.92), int(size * 0.92)]
        draw = ImageDraw.Draw(canvas)
        draw.rounded_rectangle(ring_box, radius=int(size * 0.22), outline=(139, 92, 246, 70), width=max(2, size // 120))

    # Load logo
    if LOGO_PATH.exists():
        logo = Image.open(LOGO_PATH).convert("RGBA")
        bbox = logo.getbbox()
        if bbox:
            logo = logo.crop(bbox)

        # Calculate fit within safe area
        # For maskable icons, safe area is inner 60-70%
        target_ratio = 0.55 if is_maskable else 0.72
        target_w = int(size * target_ratio)
        target_h = int(size * target_ratio)

        # Scale logo maintaining aspect ratio
        logo_w, logo_h = logo.size
        scale = min(target_w / logo_w, target_h / logo_h)
        new_w = max(1, int(logo_w * scale))
        new_h = max(1, int(logo_h * scale))

        resized_logo = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)
        paste_x = (size - new_w) // 2
        paste_y = (size - new_h) // 2
        canvas.paste(resized_logo, (paste_x, paste_y), resized_logo)

    return canvas


def main():
    print("Generating PWA icons...")
    # Standard 192x192 and 512x512
    icon_192 = create_pwa_icon(192, is_maskable=False)
    icon_192.save(ICONS_DIR / "icon-192x192.png", "PNG", optimize=True)
    print("[+] Saved icon-192x192.png")

    icon_512 = create_pwa_icon(512, is_maskable=False)
    icon_512.save(ICONS_DIR / "icon-512x512.png", "PNG", optimize=True)
    print("[+] Saved icon-512x512.png")

    # Maskable icons (for Android adaptive icons)
    mask_192 = create_pwa_icon(192, is_maskable=True)
    mask_192.save(ICONS_DIR / "icon-maskable-192x192.png", "PNG", optimize=True)
    print("[+] Saved icon-maskable-192x192.png")

    mask_512 = create_pwa_icon(512, is_maskable=True)
    mask_512.save(ICONS_DIR / "icon-maskable-512x512.png", "PNG", optimize=True)
    print("[+] Saved icon-maskable-512x512.png")

    # Apple touch icon (180x180)
    apple_icon = create_pwa_icon(180, is_maskable=False)
    apple_icon.save(ICONS_DIR / "apple-touch-icon.png", "PNG", optimize=True)
    print("[+] Saved apple-touch-icon.png")

    # Also save as favicon.png in static/icons/
    fav = create_pwa_icon(64, is_maskable=False)
    fav.save(ICONS_DIR / "favicon.png", "PNG", optimize=True)
    print("[+] Saved icons/favicon.png")


if __name__ == "__main__":
    main()

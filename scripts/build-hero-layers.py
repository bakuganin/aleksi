"""Build the layered artwork of the opening hero.

The opening frame used to be one baked 1672x941 picture with an AI-redrawn Sasha
in it (hero-sasha-spotlight-v5.png). This script splits that frame into layers and
replaces the redrawn figure with a real photograph:

  hero-stage-plate-v1.webp  the empty dark stage
  hero-shard-*-v1.webp      five red/cream shard groups that float at the edges
  hero-stage-light-v1.webp  the spotlight, haze and stone floor of v5 (screen blend)
  hero-athlete-v3.webp      Sasha at full length from the studio photo, face untouched
  hero-athlete-phone-v1.webp  half-length Sasha for phones, from the second studio photo
  ../hero-slide-2/sasha-flex-phone-v1.webp  Sasha flexing, the second slide on phones
  ../og-hero-v1.jpg         1200x630 link preview composed from the same layers

Sources (all in the repository; the studio photos are not published):
  assets/images/sasha-studio-topten.jpg                  studio photo, full length
  assets/images/sasha-studio-punch.jpg                   studio photo, half length, punching
  assets/images/sasha-studio-flex.jpg                    studio photo, half length, flexing
  assets/images/hero-layers/hero-sasha-spotlight-v5.png  the old composite (light, floor)
  assets/images/hero-layers/broadcast-field-v4.png       its shard plate without a person

Requires Pillow, numpy, scipy, pymatting and rembg with the cached
"birefnet-portrait" and "u2net_human_seg" models. Segmentation takes a few
minutes on CPU, so the masks are cached in tmp/hero-layers/. Run from the
repository root:

  python scripts/build-hero-layers.py

The script prints the shard boxes and the athlete box in plate pixels;
hero-scene.css positions the layers with exactly these numbers.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/images/hero-layers"
CACHE = ROOT / "tmp/hero-layers"

PHOTO = ROOT / "assets/images/sasha-studio-topten.jpg"
PHONE_PHOTO = ROOT / "assets/images/sasha-studio-punch.jpg"
TRUST_PHONE_PHOTO = ROOT / "assets/images/sasha-studio-flex.jpg"
COMPOSITE = OUT / "hero-sasha-spotlight-v5.png"
PLATE = OUT / "broadcast-field-v4.png"

# Where Sasha stands in the 1672x941 plate: top of the head, sole line (the floor
# of v5) and the middle of her body, on the axis of the v5 spotlight.
FIGURE_TOP, FIGURE_FEET, FIGURE_CENTRE = 110, 910, 1000
# On phones the half-length photo stands in the same light: top of the head at the
# same height, the cut at her waist lower down (it fades out behind the copy).
PHONE_TOP, PHONE_CUT = 110, 852


def desktop_athlete_x(width, height):
    """Where hero-scene.css puts the middle of Sasha on desktop, as a share of the width:
    her fist 24px after the Russian headline, her left foot clear of the start cards."""
    rig_u = height / 941
    copy_left = max(24, (width - 1240) / 2)
    headline = copy_left + 5.04 * min(max(60, 0.064 * width), 110) + 24 + 118 * rig_u
    cards = copy_left + min(0.42 * width, 520) + 16 + 98 * rig_u
    return max(headline, cards) / width


SHARD_PAD = 32  # plate px extruded past the frame edge so floating never opens a gap


def smoothstep(edge0, edge1, value):
    t = np.clip((value - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def cached_mask(name, image, model):
    cached = CACHE / name
    if not cached.exists():
        from rembg import new_session, remove

        CACHE.mkdir(parents=True, exist_ok=True)
        remove(image, session=new_session(model), only_mask=True).save(cached)
    return np.asarray(Image.open(cached).convert("L"), dtype=np.float32) / 255


def normalised_fill(image, known, sigmas=(60, 24, 8)):
    """Fill unknown pixels from their known neighbourhood, coarse to fine."""
    fill = np.zeros_like(image)
    for sigma in sigmas:
        numerator = np.stack([ndimage.gaussian_filter(image[..., c] * known, sigma) for c in range(3)], -1)
        weight = ndimage.gaussian_filter(known, sigma)[..., None]
        fill = np.where(weight > 0.02, numerator / np.maximum(weight, 1e-4), fill)
    return fill


def row_fill(image, hole, edge=6):
    """Fill every run of hole pixels with a straight blend between its two sides.

    Across a spotlight the brightness changes along the row, so a blend between the
    two sides keeps the beam bright where a blurred neighbourhood would leave a dark
    silhouette of what used to stand there.
    """
    fill = image.copy()
    width = hole.shape[1]
    for y in range(hole.shape[0]):
        xs = np.nonzero(hole[y])[0]
        if not len(xs):
            continue
        breaks = np.nonzero(np.diff(xs) > 1)[0]
        for x0, x1 in zip(np.r_[xs[0], xs[breaks + 1]], np.r_[xs[breaks], xs[-1]]):
            left = image[y, max(x0 - edge, 0):x0].mean(axis=0) if x0 > 0 else None
            right = image[y, x1 + 1:x1 + 1 + edge].mean(axis=0) if x1 < width - 1 else None
            left = right if left is None else left
            right = left if right is None else right
            t = np.linspace(0, 1, x1 - x0 + 3)[1:-1, None]
            fill[y, x0:x1 + 1] = left * (1 - t) + right * t
    # Rows were filled one by one: soften the steps between them.
    soft = np.stack([ndimage.gaussian_filter(fill[..., c], (7, 2)) for c in range(3)], -1)
    return np.where(hole[..., None], soft, image)


ATHLETE_SCALE = 1.25  # the studio photo is small: enlarge once here, then only downscale
LUMA = np.array([0.299, 0.587, 0.114], np.float32)


def relight_for_stage(colour, alpha, falloff=0.56, red_light=0.2, balance=0.2, face_end=0.24):
    """Relight a flat studio photo for the stage it stands on.

    The studio lit her evenly from the front. On the stage one spotlight hits her from
    straight above, the floor and the shards around her are red, and haze hangs in the
    beam. Only light and colour change: no pixel of the face is redrawn.

    falloff and red_light say how much the light fades and reddens towards the bottom
    of the picture (less for a half-length photo that ends at the waist); balance lifts
    the side the studio key light left in shade; face_end is where the face ends.
    """
    height, width = alpha.shape
    rows = np.nonzero(alpha.max(axis=1) > 0.05)[0]
    cols = np.nonzero(alpha.max(axis=0) > 0.05)[0]
    # y: 0 at the top of the head, 1 at the bottom of the figure; x: -1 at the left
    # edge of the picture, 0 on her axis, 1 at the right edge.
    y = ((np.arange(height, dtype=np.float32) - rows.min()) / (rows.max() - rows.min()))[:, None]
    centre, half = (cols.min() + cols.max()) / 2, (cols.max() - cols.min()) / 2
    x = ((np.arange(width, dtype=np.float32) - centre) / half)[None, :]
    below_face = smoothstep(face_end - 0.11, face_end, y)

    # A deeper, warmer and more contrasty base than the soft studio light.
    colour = np.clip(colour * np.array([1.04, 0.99, 0.9], np.float32), 0, 1) ** 1.22
    colour = (colour - 0.45) * 1.12 + 0.45
    grey = (colour @ LUMA)[..., None]
    colour = np.clip(grey + (colour - grey) * 0.92, 0, 1)

    # The studio key light came from the right of the camera, so her right side (the
    # left of the picture) sat in its shade. A spotlight from straight above lights
    # both sides alike: lift the shaded side.
    colour *= (1 + balance * smoothstep(0.1, 0.85, -x) * below_face)[..., None]

    # The spotlight: full light on the head and shoulders, fading down to the feet.
    colour *= (1.04 - falloff * smoothstep(0.1, 1.0, y))[..., None]

    # Volume: every arm, leg and the torso turns a little darker towards its own
    # edges, as a rounded body does under light from above.
    inside = ndimage.distance_transform_edt(alpha > 0.5)
    limb = np.maximum(ndimage.maximum_filter(inside, size=41), 1)
    rounded = 0.89 + 0.11 * smoothstep(0.0, 0.6, inside / limb)
    colour *= (1 - (1 - rounded) * below_face)[..., None]

    # Red light from the floor and the shards: the lower body takes on a little of
    # the red, most of all in its shadows.
    shadow = 1 - smoothstep(0.08, 0.5, colour @ LUMA)
    red = (smoothstep(0.35, 1.0, y) * (0.35 + 0.65 * shadow))[..., None] * red_light
    colour = colour * (1 - red) + colour * np.array([1.16, 0.8, 0.82], np.float32) * red

    # The spotlight catches the edges that face up (hair, shoulders, fists); the rest
    # of the outline settles into the dark stage instead of keeping the studio glow.
    facing_up = np.clip(ndimage.gaussian_filter(alpha, 2.0, order=(1, 0)) * 5, 0, 1)
    colour += (facing_up * (1 - smoothstep(0.2, 0.45, y)))[..., None] * np.array([1.0, 0.9, 0.76], np.float32) * 0.14
    outline = np.clip(ndimage.gaussian_filter(1 - alpha, 1.5) * 2, 0, 1) * alpha
    colour *= (1 - 0.12 * outline)[..., None]

    # Haze of the beam in front of her, thickest near the light.
    haze = (0.03 * (1 - smoothstep(0.0, 0.85, y)) + 0.01)[..., None]
    colour = colour + (np.array([0.6, 0.53, 0.48], np.float32) - colour) * haze
    return np.clip(colour, 0, 1)


def cut_out(path, mask_name):
    """Sasha without the studio wall: colours and a soft matte."""
    from pymatting import estimate_foreground_ml

    photo = Image.open(path).convert("RGB")
    rgb = np.asarray(photo, dtype=np.float32)
    alpha = cached_mask(mask_name, photo, "birefnet-portrait")
    # The light grey studio wall shows through every soft edge (hair, arms, feet):
    # drop the faintest fringe, then take the edge colours from Sasha herself.
    alpha = np.clip((alpha - 0.05) / 0.95, 0, 1)
    colour = estimate_foreground_ml(rgb.astype(np.float64) / 255, alpha.astype(np.float64)).astype(np.float32)
    return colour, alpha


def save_figure(colour, alpha, name, scale):
    """Crop to the figure, resize, add the stage grain and save; returns the matte."""
    ys, xs = np.nonzero(alpha > 0.004)
    pad = 6
    height, width = alpha.shape
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad, width), min(ys.max() + pad, height))
    colour_img = Image.fromarray((colour * 255).astype(np.uint8)).crop(box)
    matte = Image.fromarray((alpha * 255).astype(np.uint8)).crop(box)

    target = (round(colour_img.width * scale), round(colour_img.height * scale))
    colour_img = colour_img.resize(target, Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=35, threshold=2))
    matte = matte.resize(target, Image.LANCZOS)
    # Fine grain like the stage texture hides the softness of the compressed photo.
    grain = ndimage.gaussian_filter(np.random.default_rng(11).normal(0, 2.2, target[::-1]), 0.5)[..., None]
    colour_arr = np.clip(np.asarray(colour_img, np.float32) + grain, 0, 255).astype(np.uint8)
    figure = Image.fromarray(colour_arr).convert("RGBA")
    figure.putalpha(matte)
    figure.save(OUT / name, quality=88, alpha_quality=100, method=6)
    return np.asarray(matte, dtype=np.float32) / 255


def build_phone_athlete():
    """The half-length photo for phones, in the same stage light. It ends at her
    waist, so the light fades and reddens less towards the bottom; the studio lit
    this one from the front, so neither side needs lifting."""
    colour, alpha = cut_out(PHONE_PHOTO, "birefnet-portrait-mask-punch.png")
    colour = relight_for_stage(colour, alpha, falloff=0.3, red_light=0.08, balance=0.0, face_end=0.27)
    a = save_figure(colour, alpha, "hero-athlete-phone-v1.webp", 1.0)

    solid = a > 0.3
    cols = np.nonzero(solid.max(axis=0))[0]
    rows = np.nonzero(solid.max(axis=1))[0]
    fig_top, fig_bottom = int(rows.min()), a.shape[0]
    scale = (PHONE_CUT - PHONE_TOP) / (fig_bottom - fig_top)
    left = FIGURE_CENTRE - (int(cols.min()) + int(cols.max())) / 2 * scale
    top_px = PHONE_TOP - fig_top * scale
    height = a.shape[0] * scale
    return {
        "size": [a.shape[1], a.shape[0]],
        "box": {
            "left": round(left, 1), "top": round(top_px, 1),
            "width": round(a.shape[1] * scale, 1), "height": round(height, 1),
            "bottom": round(941 - top_px - height, 1),
        },
    }


def build_trust_phone():
    """The second slide on phones: Sasha flexing, half length, in the same light.

    hero-scene.css is not involved; styles.css centres the head of this picture and
    fades it out towards the cut at the waist, so report where both are.
    """
    colour, alpha = cut_out(TRUST_PHONE_PHOTO, "birefnet-portrait-mask-flex.png")
    colour = relight_for_stage(colour, alpha, falloff=0.3, red_light=0.08, balance=0.0, face_end=0.27)
    a = save_figure(colour, alpha, "../hero-slide-2/sasha-flex-phone-v1.webp", 1.0)

    solid = a > 0.3
    rows = np.nonzero(solid.max(axis=1))[0]
    head_top = int(rows.min())
    head = solid[head_top:head_top + round(0.06 * a.shape[0])]
    head_cols = np.nonzero(head.max(axis=0))[0]
    cols = np.nonzero(solid.max(axis=0))[0]
    return {
        "size": [a.shape[1], a.shape[0]],
        "head_x": round((head_cols.min() + head_cols.max()) / 2 / a.shape[1], 4),
        "head_top": round(head_top / a.shape[0], 4),
        "figure_x": [round(cols.min() / a.shape[1], 4), round(cols.max() / a.shape[1], 4)],
    }


def build_athlete():
    colour, alpha = cut_out(PHOTO, "birefnet-portrait-mask-studio.png")
    colour = relight_for_stage(colour, alpha)
    a = save_figure(colour, alpha, "hero-athlete-v3.webp", ATHLETE_SCALE)
    athlete = Image.open(OUT / "hero-athlete-v3.webp")

    solid = a > 0.3
    cols = np.nonzero(solid.max(axis=0))[0]
    rows = np.nonzero(solid.max(axis=1))[0]
    fig_top, fig_bottom = int(rows.min()), int(rows.max())
    fig_centre = (int(cols.min()) + int(cols.max())) / 2

    # The athlete box in plate pixels, so the soles land on the floor line of v5.
    scale = (FIGURE_FEET - FIGURE_TOP) / (fig_bottom - fig_top)
    width, height = athlete.width * scale, athlete.height * scale
    left = FIGURE_CENTRE - fig_centre * scale
    top_px = FIGURE_TOP - fig_top * scale

    def plate_x(x):
        return round(left + x * scale, 1)

    feet = solid[fig_bottom - round(0.08 * (fig_bottom - fig_top)):fig_bottom + 1]
    feet_cols = np.nonzero(feet.max(axis=0))[0]
    contour = {}
    for plate_y in range(250, 900, 50):
        row = round((plate_y - top_px) / scale)
        hits = np.nonzero(solid[row])[0] if 0 <= row < solid.shape[0] else []
        contour[plate_y] = plate_x(hits[0]) if len(hits) else None
    return {
        "size": athlete.size,
        "figure_y": [fig_top, fig_bottom],
        "box": {
            "left": round(left, 1), "top": round(top_px, 1),
            "width": round(width, 1), "height": round(height, 1),
            "bottom": round(941 - top_px - height, 1),
        },
        "feet_x": [plate_x(feet_cols.min()), plate_x(feet_cols.max())],
        "left_contour": contour,
    }


def build_shards():
    image = np.asarray(Image.open(PLATE).convert("RGB"), dtype=np.float32)
    height, width, _ = image.shape
    brightest = image.max(axis=2)
    red_excess = image[..., 0] - np.maximum(image[..., 1], image[..., 2])
    # Bright paint plus the dark-red shadow side of the shards; the empty stage is neutral.
    alpha = np.maximum(smoothstep(24, 92, brightest), smoothstep(5, 26, red_excess))

    # Local stage colour under the shards: normalised convolution over empty pixels.
    empty = (alpha < 0.02).astype(np.float32)
    fill = np.minimum(normalised_fill(image, empty, (96, 32, 10)), 22)

    grain = ndimage.gaussian_filter(np.random.default_rng(7).normal(0, 3.2, (height, width)), 0.7)[..., None]
    plate = image * (1 - alpha[..., None]) + np.clip(fill + grain, 0, 255) * alpha[..., None]
    Image.fromarray(np.clip(plate, 0, 255).astype(np.uint8)).save(
        OUT / "hero-stage-plate-v1.webp", quality=82, method=6
    )

    # Un-mix the shard colour from the dark stage so the layers recompose exactly.
    paint = np.clip((image - fill * (1 - alpha[..., None])) / np.maximum(alpha[..., None], 1e-3), 0, 255)

    grown = ndimage.binary_dilation(alpha > 0.08, iterations=3)
    labels, count = ndimage.label(grown)
    ids = range(1, count + 1)
    areas = ndimage.sum(alpha, labels, ids)
    centres = ndimage.center_of_mass(grown, labels, ids)

    def group_of(cx, cy):
        if cx < width / 2:
            return "lt" if cy < height / 2 else "lb"
        if cy < 400:
            return "rt"
        return "rm" if cy < 760 else "rb"

    # Small debris follows the nearest large shard, so nothing drifts away on its own.
    major = [i for i in np.argsort(-areas) if areas[i] > 5000]
    groups = {}
    for index in range(count):
        cy, cx = centres[index]
        if index not in major:
            nearest = min(major, key=lambda m: (centres[m][0] - cy) ** 2 + (centres[m][1] - cx) ** 2)
            cy, cx = centres[nearest]
        groups.setdefault(group_of(cx, cy), []).append(index + 1)

    boxes = {}
    for name, members in sorted(groups.items()):
        layer_alpha = alpha * np.isin(labels, members)
        ys, xs = np.nonzero(layer_alpha > 0.01)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        rgba = np.dstack([paint, layer_alpha * 255])[y0:y1, x0:x1]
        pads = (
            SHARD_PAD if y0 == 0 else 0,
            SHARD_PAD if y1 == height else 0,
            SHARD_PAD if x0 == 0 else 0,
            SHARD_PAD if x1 == width else 0,
        )
        rgba = np.pad(rgba, ((pads[0], pads[1]), (pads[2], pads[3]), (0, 0)), mode="edge")
        Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA").save(
            OUT / f"hero-shard-{name}-v1.webp", quality=84, alpha_quality=90, method=6
        )
        boxes[name] = {
            "x": int(x0 - pads[2]), "y": int(y0 - pads[0]),
            "w": int(rgba.shape[1]), "h": int(rgba.shape[0]),
            "right": int(width - x1 - pads[3]), "bottom": int(height - y1 - pads[1]),
        }
    return {"plate": [width, height], "shards": boxes}


def build_stage_light():
    """Everything v5 adds to the shard plate (light cone, haze, stone floor), minus the AI figure."""
    composite_img = Image.open(COMPOSITE).convert("RGB")
    composite = np.asarray(composite_img, dtype=np.float32)
    plate = np.asarray(Image.open(PLATE).convert("RGB"), dtype=np.float32)
    height, width, _ = composite.shape

    # The AI figure, found in the middle of the frame and grown generously.
    centre = composite_img.crop((600, 0, 1350, height))
    figure = np.zeros((height, width), np.float32)
    figure[:, 600:1350] = cached_mask("v5-ai-figure-mask.png", centre, "u2net_human_seg")
    hole = ndimage.binary_fill_holes(ndimage.binary_dilation(figure > 0.2, iterations=16))

    # Light is what the composite adds. The two pictures were rendered separately, so
    # along every shard edge they disagree a little: no light over the shards at all,
    # otherwise floating shards would drag a ghost outline behind them.
    brightest = plate.max(axis=2)
    red_excess = plate[..., 0] - np.maximum(plate[..., 1], plate[..., 2])
    shards = np.maximum(smoothstep(24, 92, brightest), smoothstep(5, 26, red_excess))
    shards = ndimage.gaussian_filter(ndimage.grey_dilation(shards, size=7), 1.5)[..., None]
    light = np.clip(composite - plate - 5, 0, 255) * (1 - np.clip(shards, 0, 1))

    known = (~hole).astype(np.float32)
    fill = row_fill(light, hole)
    # The beam keeps its haze grain and the floor its stone texture: brightness detail
    # borrowed from both sides, applied without changing the local colour.
    luma = light @ np.array([0.299, 0.587, 0.114], np.float32)
    detail = luma - ndimage.gaussian_filter(luma, 6)
    borrowed = np.zeros((height, width), np.float32)
    weight = np.zeros((height, width), np.float32)
    for shift in (-260, -190, -120, 120, 190, 260):
        source_known = np.roll(known, shift, axis=1)
        borrowed += np.roll(detail, shift, axis=1) * source_known
        weight += source_known
    borrowed = np.clip(borrowed / np.maximum(weight, 1), -24, 24)
    fill_luma = np.maximum(fill @ np.array([0.299, 0.587, 0.114], np.float32), 4)
    fill = np.clip(fill * (1 + borrowed / fill_luma)[..., None], 0, 255)
    soft_hole = ndimage.gaussian_filter(hole.astype(np.float32), 3)[..., None]
    light = light * (1 - soft_hole) + fill * soft_hole
    Image.fromarray(np.clip(light, 0, 255).astype(np.uint8)).save(
        OUT / "hero-stage-light-v1.webp", quality=84, method=6
    )


def compose(report, width, height, athlete_x):
    """Render the desktop scene the way hero-scene.css lays it out (plate pixels).

    athlete_x is where the middle of Sasha (FIGURE_CENTRE) stands, as a share of the width.
    """
    plate_w, plate_h = report["plate"]
    shard_u = min(height / plate_h, width / 1400)
    rig_u = height / plate_h
    canvas = Image.new("RGBA", (width, height), (5, 5, 6, 255))
    plate = Image.open(OUT / "hero-stage-plate-v1.webp").convert("RGBA")
    cover = max(width / plate_w, height / plate_h)
    plate = plate.resize((round(plate_w * cover), round(plate_h * cover)), Image.LANCZOS)
    canvas.alpha_composite(plate, ((width - plate.width) // 2, (height - plate.height) // 2))
    for name, box in report["shards"].items():
        layer = Image.open(OUT / f"hero-shard-{name}-v1.webp").convert("RGBA")
        layer = layer.resize((round(box["w"] * shard_u), round(box["h"] * shard_u)), Image.LANCZOS)
        x = round(box["x"] * shard_u) if name[0] == "l" else width - round(box["right"] * shard_u) - layer.width
        y = round(box["y"] * shard_u) if name[1] == "t" else height - round(box["bottom"] * shard_u) - layer.height
        canvas.alpha_composite(layer, (x, y))

    rig_left = athlete_x * width - FIGURE_CENTRE * rig_u
    light = Image.open(OUT / "hero-stage-light-v1.webp").convert("RGB")
    light = light.resize((round(plate_w * rig_u), round(plate_h * rig_u)), Image.LANCZOS)
    light_full = Image.new("RGB", (width, height), (0, 0, 0))
    light_full.paste(light, (round(rig_left), 0))
    base = np.asarray(canvas.convert("RGB"), np.float32) / 255
    lit = 1 - (1 - base) * (1 - np.asarray(light_full, np.float32) / 255)
    x = np.linspace(0, 1, width, dtype=np.float32)[None, :, None]
    lit *= 1 - np.interp(x, [0, 0.34, 0.57, 1.0], [0.62, 0.46, 0.07, 0.12])
    canvas = Image.fromarray((lit * 255).astype(np.uint8)).convert("RGBA")

    box = report["athlete"]["box"]
    feet_left, feet_right = report["athlete"]["feet_x"]
    feet_y = FIGURE_FEET * rig_u
    shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(
        [rig_left + (feet_left - 30) * rig_u, feet_y - 16 * rig_u, rig_left + (feet_right + 30) * rig_u, feet_y + 12 * rig_u],
        fill=(0, 0, 0, 170),
    )
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(9 * rig_u)))
    athlete = Image.open(OUT / "hero-athlete-v3.webp").convert("RGBA")
    athlete = athlete.resize((round(box["width"] * rig_u), round(box["height"] * rig_u)), Image.LANCZOS)
    canvas.alpha_composite(athlete, (round(rig_left + box["left"] * rig_u), round(box["top"] * rig_u)))
    return canvas.convert("RGB")


if __name__ == "__main__":
    report = {
        **build_shards(),
        "athlete": build_athlete(),
        "phone": build_phone_athlete(),
        "trust_phone": build_trust_phone(),
    }
    build_stage_light()
    og = compose(report, 1792, 941, athlete_x=0.6).resize((1200, 630), Image.LANCZOS)
    og.save(OUT.parent / "og-hero-v1.jpg", quality=86, optimize=True, progressive=True)
    compose(report, 1672, 941, athlete_x=desktop_athlete_x(1672, 941)).save(CACHE / "preview-1672x941.jpg", quality=88)
    print(json.dumps(report, indent=2))

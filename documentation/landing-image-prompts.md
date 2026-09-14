# Landing & login image prompts

Prompts for Gemini (Imagen), ChatGPT (GPT Image), or Midjourney, plus how each result gets
imported. **How the code uses each image drives every constraint below** — read the "how it is
used" line before changing a prompt.

---

## 1. Hero background — `public/landingpage.webp`

**How it is used:** full-bleed behind the hero, `object-cover`, with `bg-slate-950/75` plus a
top-to-bottom gradient over it. Only about a quarter of the image survives to the eye, and the
headline sits dead centre in white. So the image must be **dark already**, **quiet in the
middle**, and **carry zero text**. A bright or busy centre is what makes a hero look cheap.

- **Aspect / size:** 16:9, render at 2560 × 1440 (retina-safe down to 1440p laptops)
- **Must not contain:** any lettering, numerals, logos, watermarks, or UI screenshots — the
  headline is real text and competing fake text is the single most common giveaway

### Option A — editorial photography (recommended)

```
A cinematic wide-angle photograph of a modern Nigerian secondary school courtyard at golden
hour, shot on a 35mm lens at f/2.8. Students in neat uniforms walk in the mid-ground and
background, deliberately soft-focused and anonymous — no faces in sharp detail. Clean
contemporary school architecture with covered walkways and warm terracotta and sandstone
tones. Deep shadows in the foreground, warm rim light from the low sun catching the edges of
the building. Muted, desaturated colour grade with rich blacks, like an architectural
magazine feature. The centre of the frame is open sky and empty courtyard, uncluttered.
Photorealistic, high dynamic range, natural light only, no flash.

Negative: text, letters, words, signage, logos, watermarks, cartoon, illustration, 3D render,
oversaturated colours, harsh midday light, faces in focus, crowded composition, busy centre,
lens flare, HDR halos.
```

### Option B — architectural / calm authority

```
A wide architectural photograph of a modern school building exterior at dusk, shot from a low
angle. Warm interior lights glow from classroom windows against a deep blue-black evening
sky. Clean geometric lines, concrete and glass, a few silhouetted trees. Nobody in frame.
Moody, premium, restrained — the visual language of an enterprise software brand, not a
brochure. Rich shadow detail, subtle warm-to-cool contrast between the lit windows and the
sky. Photorealistic, long exposure, tripod-steady.

Negative: text, letters, signage, logos, watermarks, people, cars, clutter, daytime, bright
sky, oversaturation, cartoon, illustration, 3D render, tilted horizon.
```

### Option C — abstract, if you would rather not use a photo of a school

```
An abstract dark technology background: deep navy and near-black gradient with a faint
geometric grid receding into perspective, and soft volumetric blue light blooming from the
upper left. Subtle film grain. Extremely minimal, generous empty space through the centre.
The mood of an enterprise SaaS hero section — restrained, expensive, quiet.

Negative: text, letters, numbers, logos, icons, charts, UI elements, screenshots, people,
bright colours, neon, cyberpunk, busy patterns, circuit boards, glowing wireframe globes.
```

---

## 2. Login side panel — `public/image-login.webp`

**How it is used:** `components/auth/login-form.tsx` renders it `object-cover` at
**`opacity-20`** behind the centred "DigiSchool-Pro" wordmark and feature list. At 20% opacity
any detail turns to mud, so this one must be **simple, large-shape, low-frequency**. A detailed
photo here reads as grey noise.

- **Aspect / size:** 4:3, render at 1600 × 1200
- **Must not contain:** text, and nothing fine-grained — no crowds, no foliage, no textures

### Option A — soft abstract (recommended for 20% opacity)

```
A minimal abstract background of large soft overlapping geometric shapes — rounded rectangles
and wide arcs — in a narrow palette of deep indigo, royal blue and pale slate. Very smooth
gradients, no hard edges, no fine detail, generous negative space. Flat and calm, like a
premium onboarding illustration reduced to pure shape. Even lighting, no focal point.

Negative: text, letters, logos, icons, people, faces, photographs, fine detail, texture,
noise, busy patterns, high contrast, dark vignette.
```

### Option B — single quiet object

```
A clean, minimal photograph of a single stack of school exercise books and one pencil on a
plain pale desk, shot directly from above with soft diffused daylight. Muted blue and warm
neutral palette, lots of empty desk around the subject, very shallow detail. Simple, calm,
lots of negative space. Photorealistic but almost graphic in its simplicity.

Negative: text, letters, writing on the books, logos, brands, people, hands, clutter,
multiple objects, harsh shadows, dark background, busy composition.
```

---

## Importing the result

The code already points at these two filenames, so **no code change is needed** if you keep the
names:

1. Generators return PNG or JPEG. Convert to WebP before committing — the hero is the largest
   asset on first paint, and the current `landingpage.webp` is already 467 KB:
   - <https://squoosh.app> → drop the file → **WebP**, quality **72–80** → aim for **under 300 KB**
     for the hero and **under 120 KB** for the login image.
2. Save over the existing files, exact names:
   - `public/landingpage.webp`
   - `public/image-login.webp`
3. Hard-refresh (`Ctrl+Shift+R`) — Next caches optimised images aggressively in dev.

### Checking the hero actually works

The hero is judged **through** its overlay, not on its own. After swapping it:

- The white headline must stay readable across the full width — if any part of the image is
  light behind the text, either regenerate darker or raise the wash from `bg-slate-950/75`
  toward `/80` in `app/page.tsx`.
- Check a narrow window too. `object-cover` crops the sides on mobile, so anything you care
  about must sit near the centre.

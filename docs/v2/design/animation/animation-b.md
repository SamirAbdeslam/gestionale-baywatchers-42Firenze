# Animation B: taking and leaving a shift (v2.3.2)

Approved by Ismail on 2026-10-22. This file holds everything needed to rebuild it
in the SvelteKit app (milestone M14).

- Prototype: `conferma-v2.3.2.html` in this folder (plain HTML + JS, open it from disk, press the button).
- Screens: `../screens/biglietto-conferma-b.png`; markup source `../reference/ConfirmB.dc.html`.
- Older variants (v2, v2.2, v2.3, v2.3.1, 3D tear) were discarded and are not part of the design.

## Anatomy of the ticket

- Two shapes: vertical (desktop week column, stub on top, 228 px wide, stub 92 px high in the calendar (108 px in the prototype),
  radius 14) and horizontal (mobile day list, stub on the left, 96 px wide, radius 16).
- Perforation: CSS masks with half-holes every 10 px, radius 3 px (soft edge to 3.6 px).
  The stub carries the outer half (`nb` / `nr`), the body the inner half (`nt` / `nl`):
  together they show whole holes.
  `radial-gradient(circle at 50% 100%, transparent 3px, #000 3.6px) 0 0/10px 100% repeat-x`.
- Stub colour = event kind colour (exam `#3d3aa8` with white ink, rush `#ffcf2e` with `#1f1700` ink).

## Take ("Prendo il turno") — total ≈ 1.1 s

1. **Flyer.** A copy of the stub (same size, padding, radius, colour and mask) placed over it.
   The real stub becomes transparent (background and text). The flyer gets:
   - paper grain: `feTurbulence` fractalNoise, baseFrequency .8, 3 octaves, white at opacity .055,
     as a background layer. Use `background-color` for the stub colour, never the `background`
     shorthand, or it wipes the grain;
   - a torn paper edge on the perforation side: an SVG polygon, 4 px deep, colour `#e8dfc9`,
     opacity .85, irregular profile `depth(at) = .5 + (sin(at·2.31)+1)·.65 + (sin(at·.79)+1)·.4`,
     one point per px. The body gets the mirror edge (same profile, `d` instead of `4−d`).
2. **Tear (400 ms).** The flyer stays rigid and turns on the end of the perforation that is
   still attached (bottom-right corner): +7° for the vertical ticket (the left end lifts),
   −7° for the horizontal one (the top lifts).
   - Easing `cubic-bezier(.45,0,.75,.75)`: it ends with speed, no ease-out, so the flight takes over
     without stopping.
   - Write the turn as `translate(x,y) rotate(θ)` around the centre, not with `transform-origin`,
     so that the tear and the flight keyframes use the same functions:
     `x = px − px·cosθ + py·sinθ`, `y = py − px·sinθ − py·cosθ`, with `px = w/2`, `py = h/2`.
   - Same 400 ms (ease-in): the body's paper edge is revealed with
     `clip-path: inset(0 100% 0 0) → inset(0)` (horizontal: `inset(0 0 100% 0)`).
   - Fibers: one every 30 px along the seam (from 10 px), 1 px × (2 + 2p) px, `#e8dfc9`,
     falling 32 px with a random drift (±10 px) and spin (±60°), 480 ms ease-in,
     delay `400 · √p` (p = position along the seam 0..1, the front speeds up like the rotation).
3. **Release.** `navigator.vibrate(10)`; the body recoils 2 px (down / right) and back in 220 ms.
   The body's paper edge fades out (400 ms, delay 120) **while** the "in tasca tua" outline fades in
   (400 ms, delay 120); then remove it. If it stays, its white dots clash with the red dashes.
4. **Flight (680 ms, linear over 13 sampled keyframes).**
   - Quadratic arc to the next free square of the counter, control point
     = midpoint + (−40, −90).
   - Progress `e = .2·s + .8·easeInOutQuad(s)`: the `.2` glide keeps the speed left by the tear.
   - Pose per frame: translate = tear offset·(1−e) + arc point; rotate from 7° (or −7°) to 8°;
     scale from 1 to `slot width / stub width`; opacity .9 on the last frame.
   - It never goes back to 0° on the way: that straightening was the ugly "reload" in v2.3.
5. **End.** Remove the flyer, mark the seat as mine, counter +1 with a pop on the new square:
   scale .3 → 1.35 (60%) → 1, 420 ms, `cubic-bezier(.3,1.4,.5,1)`.

## "In tasca tua" outline (ghost)

- It fills the empty stub area: 2 px dashed `#ff6a3d`, text `#ff8a63`, fill `rgba(255,106,61,.06)`.
  The tag reads "in tasca tua" (vertical) or "tuo" (horizontal).
- On the perforation side the dashed border is removed and replaced by a background drawn on the
  10 px hole pattern, so the red dashes fall between the body's holes.
  Vertical: `linear-gradient(90deg, #ff6a3d 2px, transparent 2px 8px, #ff6a3d 8px) 0 100%/10px 2px repeat-x`.
  Horizontal: `180deg`, `100% 0/2px 10px repeat-y`.
  Both use `background-origin: border-box`.
  A plain `dashed` border has its own rhythm and never matches the holes.

## Leave ("Lascio il turno") — 1.1 s, the canvas "magic" restore

- Counter −1 at once. The ghost fades out in 300 ms.
- A restore layer is a **sibling** of the stub (not a child: the stub's mask would clip the glow
  and the stars), same box. It contains:
  - a filled stub that grows from the perforation:
    `clip-path: inset(100% 0 0 0 round 14px 14px 0 0) → inset(0 … round …)`,
    1 s `cubic-bezier(.3,.7,.2,1)`, delay .05 s (horizontal: from the right);
  - a white sweep band moving the same way;
  - a `drop-shadow` glow 0 → 14 px `rgba(255,180,120,.6)` → 0 over 1.1 s;
  - 7 four-point stars rising from the seam, 0.85 s each, staggered 0–0.26 s.
- Wait for every animation of the layer to finish (`getAnimations({subtree:true})`), not a timer.
  Then, in the same frame, give the stub its colour back and remove the layer.
- **No CSS transition on the stub's background or colour.** With
  `transition: background-color .25s`, the stub restarted from transparent after the layer left:
  it appeared, vanished and reappeared (the "refresh" bug).

## Reduced motion

`prefers-reduced-motion: reduce`: no tear, flight or sparks. The stub becomes the ghost at once
on take, and comes back at once (or with a 250 ms fade) on leave.

## Pitfalls met while building it

- A flyer with `position: fixed` stays offset if the page scrolls during the flight.
  In the app, prefer coordinates relative to a common positioned ancestor.
- Every `.animate(..., {fill:'forwards'})` must be cancelled at the end, or it keeps holding styles.
- A mask on an element also clips its box-shadow and its children: hence the restore layer as a sibling.
- Testing in headless Chromium (Playwright e2e): CDP `Animation.setPlaybackRate` (e.g. 0.1) slows WAAPI and CSS
  animations, but not `requestAnimationFrame` loops. Drive those by hand (override rAF and feed timestamps).

## Where the ticket shapes are used

- Vertical, stub on top: desktop calendar week columns (`reference/Calendar.dc.html`), foundations `reference/Alt.dc.html` §05.
- Horizontal, stub on the left: mobile calendar, mobile "Il turno è tuo" dialog, admin day list, foundations §05.
- Every ticket uses the 10 px half-hole masks; the old dashed line with two notches is gone.
- "Mine" state everywhere: no orange border on the ticket; the stub shows the dashed "in tasca tua"
  outline (vertical) or "tuo" (horizontal), fill `rgba(255,106,61,.06)`, text `#ff8a63`.
  The dialog keeps the coloured stub: it is the stub you just took.

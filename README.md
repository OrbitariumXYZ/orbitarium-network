# Orbitarium

Static marketing site for Orbitarium — prepaid model access, priced under list.
Plain HTML, one stylesheet split into tokens + layout, one small progressive-
enhancement script. No build step, no framework.

## Run

```
npm run build      # wipe + recreate dist/ (index.html, assets/, data/)
npm run gates      # checks dist/ — must exit 0 — see below
npm run serve      # static server on http://localhost:4173
```

`npm run build` is a plain copy, no transform. `npm run gates` reads the built
`dist/` tree, so run the build first. Or just open `index.html` to view.

## Layout

```
index.html               the page
assets/css/tokens.css     the ONLY file with colour literals; every hex carries
                          its sampling provenance (k-means centre -> snapped pixel)
assets/css/site.css       layout, section rhythm, breakpoints, reduced-motion
assets/js/site.js         tab groups; contract-address copy (bound only when stated);
                          registry reconciliation warnings
assets/favicon.svg        32x32, one <rect> per covered cell of the logo's real
                          pixel grid (premultiplied downscale, colours snapped)
assets/logo-*.png         premultiplied resizes of the RGBA master
data/registry.json        every external fact as one record: stated | absent | unconfirmed
scripts/gates.mjs         the five build gates
brand/  reference/        source material (untracked by the gates' scans)
```

## The register

Nothing external is written straight into the markup. Each fact lives once in
`data/registry.json` with a `state`:

- **stated** — client-confirmed; may render live, may carry a link.
- **absent** — never provided; the slot stays, filled with an em dash, a state
  word and the date it was checked.
- **unconfirmed** — candidates exist but none is confirmed; rendered inert like
  `absent`.

Counts shown on the page are the length of a list in the register, never a
number typed into the template.

Current states: `chain` stated; `contract_address` absent; `social_x` stated
(@OrbitariumXYZ, read logged-out 2026-09-10); `social_github` unconfirmed
(supplied URL returned HTTP 404, so not wired); all market / catalogue /
telemetry figures absent.

## Gates (`npm run gates`)

1. **palette** — no colour literal outside `assets/css/tokens.css` (favicon
   excepted; it is a pixel trace, not a token surface).
2. **addresses** — every address-shaped string in the rendered page must map to
   a *stated* register value. The contract-address slot must be anchored to its
   record and carry no link while unstated.
3. **links** — every external `href` must map to a *stated* register URL; the
   inert social marks must carry no `href`.
4. **counts** — every `absent` / `unconfirmed` slot renders the dash, never a
   written-in figure (ISO dates aside).
5. **hygiene** — no build-assistant fingerprints anywhere in tracked source.

Before the real files are checked, a self-test runs each gate against throwaway
copy that *should* trip it and fails loudly if any gate stays silent.

## Measurement

Checked with no horizontal overflow and 44x44 minimum tap targets at viewport
widths 360, 390, 430, 1366 and 1440. Wide tables scroll inside their own
`overflow-x` container. `prefers-reduced-motion` disables the entrance fade and
all transitions.

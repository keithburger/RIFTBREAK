---
paths:
  - "src/ui/**"
  - "src/input/**"
  - "index.html"
---
# UI & mobile responsiveness

- UI is plain DOM in `ui/ui.ts` + `ui/styles.css`; it reaches the game only through `UIHost`.
  No gameplay rules in UI code.
- Every overlay that can appear mid-run must: call `input.reset()` when opening and closing (the
  app does this), and ignore input for ~380 ms after opening (`.choices.wait`) so held movement or a
  stray tap cannot select something.
- Touch targets ≥ 44 px. Layouts must work at 390×844 (portrait), 844×390 (landscape) and
  1366×768. Use `clamp()`/flex-wrap; respect `env(safe-area-inset-*)` (the `--sa*` variables).
- Scrollable overlays use `justify-content: flex-start` with auto margins (centred flex + overflow
  hides the top of the content).
- The HUD never blocks play: `pointer-events: none` except the pause and dash buttons; keep the
  centre of the screen clear.
- HUD updates are throttled (every 4th frame); rebuild slot HTML only when the build key changes.
- Verify with `npm run e2e` (covers both touch layouts) and look at `screenshots/mobile-*.png`.

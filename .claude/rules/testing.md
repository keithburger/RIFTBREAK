---
paths:
  - "tests/**"
  - "scripts/**"
---
# Testing & performance

- Tests run headless in Node: build worlds with `tests/helpers.ts` (`mkWorld`, `run`, `dummy`,
  `equip`, `strongBuild`, `digest`). Always pass a fixed seed.
- Content tests are generated from the registries, so new content is covered automatically; add a
  focused test only for a new *mechanic*.
- `tests/sim.fullrun.test.ts` is the slow pacing guard. If a balance change breaks it, re-tune with
  `npm run balance` rather than loosening the assertion without evidence.
- A simulation proves mechanics, not fun or looks. Visual/UI claims need `npm run e2e` screenshots.
- Performance: `npm run bench -- 500 20` reports ms/step (budget: < 4 ms at 500 enemies);
  `__rift.bench(n, seconds)` in a `?dev` browser session reports real frame times. Always record
  the renderer string — headless CI uses a software rasterizer and its GPU numbers are not
  representative.
- Never weaken a test to make it pass without stating why in the commit message.

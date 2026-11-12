---
name: verify
description: Run RIFTBREAK's full verification pipeline (types, content validation, tests, manifest, build, browser e2e) and report evidence. Use before declaring any work complete or when asked "does it work?".
---
# Verify

Run in order; stop and fix at the first failure.

```bash
npm run typecheck
npm run validate
npm test                      # writes test-results.json
npm run manifest              # content-manifest.json from registries + test results
npm run build
(npm run preview > /dev/null 2>&1 &) ; sleep 2
npm run e2e                   # browser checks + screenshots/ + screenshots/e2e-report.json
npm run bench -- 500 20       # sim ms/step
```
`npm run verify` runs the first five steps in one command.

## Then actually look
Open at least: `screenshots/01-menu.png`, `06-combat-chromebook.png`, one `boss-*.png`,
`mobile-portrait-levelup.png`, `10-canvas-fallback.png`.

## Report format
- typecheck / validate: pass, or the errors
- tests: `N passed / M failed` (name the failures)
- manifest: `verified / failing / no record` counts
- e2e: `x/54`, plus any runtime errors captured
- performance: sim ms/step at 500 enemies; browser frame stats **with the renderer string**
  (software-rasterizer numbers are not GPU numbers — say so)
- anything not run, and why

Never report a step as passing unless you ran it in this session.

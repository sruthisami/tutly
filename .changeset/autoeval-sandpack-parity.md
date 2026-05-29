---
"runner-orchestrator": minor
---

Replace the Jest + jsdom autoeval runner with a Playwright-driven container that boots the same Sandpack bundler the editor uses. Tests now execute byte-identically to what the student sees in the preview, eliminating the "passes in editor, fails in autoeval" class of bugs (structuredClone, fetch, spec-strict spread, jsdom shims, etc.). New image: `ghcr.io/tutlylabs/tutly-browser-runner`. Per-job memory bumped to 640 MB to fit Chromium + bundler + headroom.

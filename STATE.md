# SDR Copilot — Project State

## Current Version
v1.1.0

## Branch
`main` — pushed to `origin/main` at commit `daf6e3b`

## Milestone Status

### v1.1 Polish — 9/10 complete
| # | Issue | Status |
|---|-------|--------|
| 1 | Add oauth2 config to manifest.json | ✅ Closed |
| 2 | Demo mode from popup | ✅ Closed |
| 3 | Sender profile config | ✅ Closed |
| 4 | Dashboard date picker | ✅ Closed |
| 5 | AudioWorklet migration | ✅ Closed |
| 6 | Speaker diarization | ✅ Closed |
| 7 | Test Orum DOM selectors | ⏭ Skipped (requires real Orum access) |
| 8 | Offscreen document | ✅ Closed |
| 9 | Dead code cleanup | ✅ Closed |
| 10 | Stitch UI redesign | ✅ Closed |

## What's Deployed
All changes pushed to `main` and auto-deploying isn't applicable (Chrome extension — manual load via `chrome://extensions`).

## Open Issue
- **#7** — Test and fix Orum DOM selectors against real Orum interface. Requires an active Orum account to verify CSS selectors match the actual DOM.

## Key Artifacts
- `DESIGN.md` — Complete design system (colors, typography, spacing, components)
- `stitch-designs/` — 4 Stitch-generated HTML reference screens (gitignored)
- `.gitignore` — Now in place

## Setup Reminder
- Replace `YOUR_GOOGLE_OAUTH_CLIENT_ID` in `manifest.json` with a real Google Cloud OAuth client ID
- Load unpacked at `chrome://extensions` to test

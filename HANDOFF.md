# SDR Copilot — Handoff Notes

## Last Session: 2026-03-23

### What Was Done
Completed the v1.1 polish milestone — 9 of 10 issues implemented, committed, pushed, and closed on GitHub.

### Changes Summary

**Issue #1 — OAuth2 manifest config**
- Added `oauth2` block to `manifest.json` with Gmail compose/send scopes
- Service worker already used `chrome.identity.getAuthToken()` — no SW changes needed
- **Action required:** Replace placeholder client ID with real Google Cloud OAuth client ID

**Issue #2 — Standalone demo**
- Created `demo/demo.html` + `demo/demo.js` — full demo without needing Orum
- Added "Launch Demo" button to popup
- Demo runs scripted conversation, detects objections, saves call to history

**Issue #3 — Sender profile**
- Added "Your Profile" section to options page (name, title, company, phone, email)
- Stored in `settings.senderProfile` in chrome.storage.sync
- `gmail-draft.js` loads profile before building drafts, replaces `[Your Name]` etc.

**Issue #4 — Date picker**
- Dashboard now has ← / → date navigation (7 days back)
- All widgets (stats, objections, talk time, history) filter by selected date
- Shows "Today", "Yesterday", or formatted date

**Issue #5 — AudioWorklet**
- Created `audio/audio-processor.js` (PCM processor worklet)
- `deepgram-client.js` tries AudioWorklet first, falls back to ScriptProcessorNode
- Runs audio processing off main thread when supported

**Issue #6 — Speaker diarization**
- Added `diarize=true` to Deepgram WebSocket URL
- Parses speaker ID from response words
- First-speaker heuristic: first speaker after connect = SDR
- Overlay shows accurate "You" vs "Prospect" labels

**Issue #7 — Skipped**
- Requires real Orum access to verify DOM selectors
- Still open on GitHub

**Issue #8 — Offscreen document**
- Created `offscreen/offscreen.html` + `offscreen/offscreen.js`
- Service worker creates offscreen doc on demand for tab audio capture
- Handles MV3 restriction where service workers can't access media APIs

**Issue #9 — Cleanup**
- Removed unused `fullTranscript` variable in dashboard.js
- Merged `stopDemoMode()` into `stopTranscription()`, removed dead function
- Created `.gitignore`
- Bumped version to 1.1.0

**Issue #10 — UI redesign**
- Generated 4 screens via Stitch MCP (Gemini 3.1 Pro)
- Created `DESIGN.md` with full design system
- Updated all CSS tokens across popup, overlay, dashboard, options:
  - Old accent: `#6366f1` (indigo) → New: `#4D8EFF` (electric blue)
  - Backgrounds aligned to `#111319` / `#1E1F26` / `#282A30`
  - Blue focus glows on inputs
  - Updated logo gradients

### What's Left
1. **Issue #7** — Test Orum DOM selectors against real Orum interface
2. **Google OAuth setup** — Create Chrome extension OAuth client in Google Cloud Console, paste client ID into `manifest.json`
3. **End-to-end testing** — Load extension in Chrome, verify all features work together
4. **Roadmap items** (from README): Claude API integration, HubSpot connector, Slack notifications, weekly digest

### Architecture Notes
- **No build step** — vanilla JS, CSS loaded directly
- **Manifest V3** — service worker (not background page), offscreen doc for audio
- **Audio pipeline**: tab → offscreen doc → PCM → Deepgram WebSocket (with AudioWorklet when available)
- **Diarization**: Deepgram assigns speaker IDs, first-speaker = SDR heuristic
- **Storage**: settings in `chrome.storage.sync`, call history in `chrome.storage.local` (max 500)

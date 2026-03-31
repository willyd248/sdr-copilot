# SDR Copilot — Sales call Chrome extension for SDRs

## Stack
- Extension: Chrome Manifest V3, vanilla JavaScript (no framework, no build tool, no bundler)
- Transcription: Deepgram Nova-2 (WebSocket streaming)
- AI: Anthropic Claude API (planned — objection detection is keyword-based for now)
- CRM: Salesforce REST API
- Email: Gmail API (draft + send)
- Auth: Chrome Identity API (Google OAuth), Salesforce OAuth2
- Storage: chrome.storage.sync (settings, tokens), chrome.storage.local (call history, max 500)
- No package.json, no npm, no build step

## Commands
- **Load unpacked (dev)**: Chrome → `chrome://extensions` → Developer mode → Load unpacked → select repo root
- **Reload after edits**: Click refresh icon at `chrome://extensions` (content scripts need tab reload)
- **Build for store**: Zip repo root with manifest.json at root — no bundling needed
- **Version bump**: Edit `manifest.json` `version` field and commit
- No `npm run dev` — pure file editing workflow

## Architecture
- `manifest.json` — MV3 config: permissions, content scripts, oauth2 client ID, CSP
- `background/service-worker.js` — Core: OAuth flows, storage, message routing, alarm scheduling
- `content/orum-overlay.js` — Injected into orum.io: floating overlay UI, call lifecycle, DOM watchers
- `content/deepgram-client.js` — Deepgram WebSocket client with silence-on-open + keepalive fixes
- `offscreen/` — MV3 audio capture: tab audio → PCM 16kHz mono via ScriptProcessorNode
- `utils/ai-coach.js` — Real-time objection detection (keyword matching, 6 categories + emoji)
- `utils/gmail-draft.js` — Post-call email template + Gmail API calls
- `utils/salesforce.js` — Salesforce Task upsert
- `utils/pdm-audit.js` — DOM scan for missing Orum disposition/notes/next steps
- `popup/` — Extension icon popup panel
- `dashboard/` — Full-page call analytics and history
- `options/` — Settings: API keys, OAuth flows, sender profile
- `assets/styles/overlay.css` — All styling in one file; all classes prefixed `.sdrc-`
- All cross-context communication routes through service worker via `chrome.runtime.sendMessage()`

## Environment Variables
No .env files. All config lives in `chrome.storage.sync` (Google-encrypted):
- `settings.deepgramApiKey` — User enters in Options page
- `settings.salesforceInstanceUrl` — User enters in Options page
- `settings.senderProfile` — Name, title, company, phone, email (used for Gmail draft signatures)
- `tokens.google.accessToken` — Set via Chrome Identity API OAuth flow
- `tokens.salesforce.*` — Set via Salesforce OAuth2 flow

**Hardcoded in source:**
- `manifest.json` `oauth2.client_id` — Google OAuth client ID; must be replaced before Chrome Web Store submission and must match the extension's registered ID in Google Cloud Console

## Deployment
- Dev: Load unpacked at `chrome://extensions`
- Prod: Zip repo root → upload to Chrome Web Store (Anthropic developer account required)
- No Vercel, no Railway, no CI/CD
- `vercel alias set` does not apply here

## Known Gotchas
- Deepgram WebSocket rejects Authorization headers — pass API key as subprotocol: `new WebSocket(url, ['token', apiKey])`
- Send 100ms of silence immediately on WebSocket `onopen` or Deepgram closes the connection within ~1s
- Send `KeepAlive` JSON every 8 seconds to prevent Deepgram timeout
- Offscreen document is required for tab audio in MV3 — service workers cannot call `getUserMedia()`
- `audio/audio-processor.js` is an AudioWorklet but offscreen uses ScriptProcessorNode for compatibility
- Orum DOM selectors in `utils/pdm-audit.js` may drift if Orum updates their UI
- CSP blocks all remote scripts and inline scripts — no CDN imports in extension pages
- `chrome.identity.getAuthToken()` caches tokens; call with `{interactive: false}` first to avoid unwanted popups

## Current Status
- v1.1.0 — UI polish complete, load unpacked (not on Chrome Web Store yet)
- Deepgram transcription, objection detection, Gmail drafts, Salesforce logging all working
- Claude API integration planned but not yet active

## Rules
- NEVER commit .env files (no .env here, but never hardcode API keys in source)
- NEVER edit env vars directly in Vercel or Railway. Always edit in Infisical and let it sync.
- Chrome MV3. Offscreen document required for AudioWorklet. No document access in background service worker.

# SDR Copilot

A production-quality Chrome extension for Sales Development Representatives (SDRs) that provides real-time AI coaching during Orum calls, automated follow-up workflows, and a nightly performance dashboard.

---

## Features

- **Live call overlay** — floating panel on orum.io with real-time transcription, speaker labels, and talk-time tracking
- **Deepgram transcription** — WebSocket streaming via Deepgram Nova-2; fixes for the common "connection closes immediately" issue
- **AI objection detection** — 6 objection categories (Price, Timing, Authority, Need, Competitor, Trust) with suggested talk-tracks, no API call required
- **Nightly dashboard** — call summary, talk time split, objection chart, follow-up action list
- **Gmail Drafts** — auto-generates post-call follow-up emails and saves to Gmail Drafts via Gmail API
- **Salesforce sync** — creates Task records after calls with transcript snippets
- **PDM Audit** — highlights Orum contacts missing disposition, notes, or next steps

---

## Setup

### 1. Load the extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. The SDR Copilot icon will appear in your toolbar

### 2. Configure API keys

Open the extension popup → click **Settings** (or right-click the icon → Options)

| Setting | Where to get it |
|---|---|
| Deepgram API Key | [console.deepgram.com](https://console.deepgram.com) — free tier available |
| Google / Gmail | Click "Connect Google" — uses Chrome Identity API (OAuth2) |
| Salesforce | Create a Connected App in your Salesforce org, paste the Client ID and Secret |

### 3. Use it

1. Navigate to [app.orum.io](https://app.orum.io)
2. When a call becomes active, the overlay appears automatically (bottom-right)
3. Transcription begins streaming within ~1 second of call start
4. Objection cards appear as keywords are detected
5. Click any **Talk Track** chip to copy it to your clipboard
6. After the call ends, use the post-call panel to create a Gmail draft or sync to Salesforce
7. Open the **Dashboard** from the popup or overlay footer to see today's stats

---

## Architecture

```
SDR Copilot/
├── manifest.json              # MV3 manifest
├── background/
│   └── service-worker.js      # OAuth, storage, alarm scheduling, API proxying
├── content/
│   ├── orum-overlay.js        # Injected into orum.io — overlay UI and call lifecycle
│   └── deepgram-client.js     # Deepgram WebSocket client with keepalive fix
├── popup/
│   ├── popup.html
│   └── popup.js               # Status indicators, quick config
├── dashboard/
│   ├── dashboard.html
│   └── dashboard.js           # Nightly stats, call table, objection chart
├── options/
│   ├── options.html
│   └── options.js             # Full settings page
├── utils/
│   ├── ai-coach.js            # Keyword-based objection detection + talk-track suggestions
│   ├── pdm-audit.js           # DOM scan for missing disposition/notes/next steps
│   ├── gmail-draft.js         # Post-call email template + Gmail API
│   └── salesforce.js          # Salesforce Task upsert helper
└── assets/
    ├── icons/                 # 16/32/48/128px PNGs
    └── styles/
        └── overlay.css        # Overlay + audit highlight styles
```

---

## Deepgram WebSocket Fix

The Deepgram WebSocket "closes immediately" issue has three root causes — all fixed in `content/deepgram-client.js`:

**1. Browser cannot set custom `Authorization` headers on WebSocket**

Fix: pass the API key via the WebSocket subprotocol array:
```js
new WebSocket(url, ['token', apiKey])
```
Deepgram accepts this as an alternative to the `Authorization: Token` header.

**2. Deepgram closes the connection if no audio arrives within ~1 second**

Fix: send a silent PCM chunk immediately on `ws.onopen`:
```js
ws.onopen = () => {
  const silence = new Int16Array(1600); // 100ms of silence @16kHz
  ws.send(silence.buffer);
  // then wire up the real audio pipeline
};
```

**3. Keepalive required for idle periods**

Fix: send a `KeepAlive` JSON message every 8 seconds:
```js
setInterval(() => ws.send(JSON.stringify({ type: 'KeepAlive' })), 8000);
```

---

## Permissions

| Permission | Reason |
|---|---|
| `tabs` | Detect active Orum tab |
| `storage` | Store API keys, call history, settings |
| `identity` | Google OAuth flow |
| `tabCapture` | Capture tab audio for transcription |
| `alarms` | Nightly dashboard data refresh at 6 PM |
| `notifications` | Daily summary notification |
| `scripting` | Inject overlay into Orum pages |

API keys are stored in `chrome.storage.sync` (Google-encrypted, synced across devices).

---

## Demo Mode

If no Deepgram API key is configured, the extension runs in **Demo Mode** — a scripted fake call plays out with pre-written transcript lines, objection detections, and follow-up suggestions. All UI features work identically. Disable via Settings once you add your key.

---

## Development Notes

- **No build step** — pure vanilla JS, load unpacked directly
- All API calls go through the background service worker (avoids CORS issues in content scripts)
- The overlay is injected via content script into `*://*.orum.io/*` and is scoped to avoid style conflicts using `.sdrc-` prefixed class names
- PDM audit selectors in `utils/pdm-audit.js` may need updates if Orum changes its DOM

---

## Roadmap

- [ ] Claude API integration for smarter talk-track generation
- [ ] Speaker diarization (separate your voice from prospect's)
- [ ] HubSpot connector
- [ ] Slack notification with call summary
- [ ] Weekly digest email

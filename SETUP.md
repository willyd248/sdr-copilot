# SDR Copilot — Setup Guide

Before loading the extension you must replace two placeholders.

---

## 1. Google OAuth Client ID

SDR Copilot uses `chrome.identity` to connect Gmail. Chrome extensions require
a real Google OAuth client ID registered in the Google Cloud Console.

### Steps

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create
   a new project (or select an existing one).

2. Enable the **Gmail API**:
   - Navigate to **APIs & Services → Library**
   - Search for "Gmail API" and click **Enable**

3. Create an OAuth 2.0 Client ID:
   - Navigate to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth client ID**
   - Application type: **Chrome App**
   - Under "Application ID", enter your extension's ID (see note below)
   - Click **Create**

4. Copy the generated **Client ID** — it looks like:
   ```
   123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
   ```

5. Open `manifest.json` and replace the placeholder:
   ```json
   "oauth2": {
     "client_id": "REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com",
     ...
   }
   ```
   with your actual client ID:
   ```json
   "oauth2": {
     "client_id": "123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com",
     ...
   }
   ```

### Finding your Extension ID

Load the extension unpacked first (without a working OAuth ID — you can skip
Gmail for now):

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this folder
4. Copy the **Extension ID** shown under the extension name

Use that ID when creating the OAuth client in Google Cloud Console.

---

## 2. Deepgram API Key

Required for live call transcription. Without it the extension runs in demo
mode only.

1. Sign up at [deepgram.com](https://deepgram.com)
2. Create an API key in the Deepgram Console
3. Paste it into the SDR Copilot popup or Options page — it is stored locally
   and never synced

---

## 3. Salesforce Connected App (optional)

Required only if you want to sync call activity to Salesforce.

1. In Salesforce: **Setup → App Manager → New Connected App**
2. Enable OAuth Settings
3. Callback URL: paste the value of `chrome.identity.getRedirectURL('salesforce')`
   (you can log this from the Options page)
4. Scopes: `api`, `refresh_token`, `offline_access`
5. Copy the **Consumer Key** (Client ID) and **Consumer Secret** (Client Secret)
6. Enter them in **Options → Salesforce** — the secret is stored in local
   storage only and is never synced to your Google account

---

## Quick Start

```
1. npm run build  (or just load the folder unpacked — no build step required)
2. chrome://extensions → Load unpacked → select this folder
3. Copy the Extension ID
4. Create Google Cloud OAuth client with that Extension ID
5. Paste the client_id into manifest.json
6. Reload the extension
7. Open the popup → paste your Deepgram API key → connect Gmail
8. Navigate to app.orum.io — the overlay will appear on your first call
```

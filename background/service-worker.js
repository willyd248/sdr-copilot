/**
 * SDR Copilot — Background Service Worker
 * Handles OAuth flows, message routing, alarm scheduling,
 * and persistent call history storage.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const ALARM_NIGHTLY_REFRESH = 'nightly-dashboard-refresh';
const STORAGE_CALL_HISTORY  = 'callHistory';
const STORAGE_SETTINGS      = 'settings';
const STORAGE_TOKENS        = 'tokens';

// Salesforce OAuth config (user fills client_id in options)
const SF_AUTH_BASE = 'https://login.salesforce.com/services/oauth2';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

// ─── Alarm Setup ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  scheduleNightlyAlarm();
  initDefaultSettings();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NIGHTLY_REFRESH) {
    handleNightlyRefresh();
    scheduleNightlyAlarm(); // reschedule for next night
  }
});

function scheduleNightlyAlarm() {
  // Fire at 6 PM local time each day
  const now = new Date();
  const target = new Date();
  target.setHours(18, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delayMs = target.getTime() - now.getTime();

  chrome.alarms.create(ALARM_NIGHTLY_REFRESH, {
    delayInMinutes: delayMs / 60000,
    periodInMinutes: 24 * 60
  });
}

async function initDefaultSettings() {
  const existing = await chrome.storage.sync.get(STORAGE_SETTINGS);
  if (!existing[STORAGE_SETTINGS]) {
    await chrome.storage.sync.set({
      [STORAGE_SETTINGS]: {
        deepgramApiKey: '',
        googleConnected: false,
        salesforceConnected: false,
        salesforceInstanceUrl: '',
        orumDomain: 'app.orum.io',
        overlayEnabled: true,
        demoMode: true,
        dashboardPrefs: {
          showObjChart: true,
          showFollowUps: true,
          showTalkTime: true
        }
      }
    });
  }
}

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case 'GET_SETTINGS':
      handleGetSettings(sendResponse);
      return true;

    case 'SAVE_SETTINGS':
      handleSaveSettings(payload, sendResponse);
      return true;

    case 'SAVE_CALL_RECORD':
      handleSaveCallRecord(payload, sendResponse);
      return true;

    case 'GET_CALL_HISTORY':
      handleGetCallHistory(sendResponse);
      return true;

    case 'CLEAR_CALL_HISTORY':
      handleClearCallHistory(sendResponse);
      return true;

    case 'GOOGLE_AUTH':
      handleGoogleAuth(sendResponse);
      return true;

    case 'SALESFORCE_AUTH':
      handleSalesforceAuth(payload, sendResponse);
      return true;

    case 'REVOKE_GOOGLE':
      handleRevokeGoogle(sendResponse);
      return true;

    case 'REVOKE_SALESFORCE':
      handleRevokeSalesforce(sendResponse);
      return true;

    case 'GET_TOKENS':
      handleGetTokens(sendResponse);
      return true;

    case 'CREATE_GMAIL_DRAFT':
      handleCreateGmailDraft(payload, sendResponse);
      return true;

    case 'SALESFORCE_UPSERT_ACTIVITY':
      handleSalesforceUpsertActivity(payload, sendResponse);
      return true;

    case 'LINKEDIN_CONTACT_CAPTURED':
      handleLinkedInContact(payload, sendResponse);
      return true;

    case 'GET_LINKEDIN_CONTACTS':
      handleGetLinkedInContacts(sendResponse);
      return true;

    case 'OFFSCREEN_AUDIO_CHUNK':
      // Relay PCM audio chunk from offscreen document to the active Orum tab
      relayAudioChunkToOrumTab(payload || message.buffer);
      return false;

    case 'OPEN_DASHBOARD':
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
      sendResponse({ ok: true });
      return false;

    case 'CAPTURE_TAB_AUDIO':
      handleCaptureTabAudio(sender.tab, sendResponse);
      return true;

    default:
      sendResponse({ error: `Unknown message type: ${type}` });
      return false;
  }
});

// ─── Settings Handlers ────────────────────────────────────────────────────────

async function handleGetSettings(sendResponse) {
  try {
    const data = await chrome.storage.sync.get(STORAGE_SETTINGS);
    sendResponse({ ok: true, settings: data[STORAGE_SETTINGS] || {} });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleSaveSettings(newSettings, sendResponse) {
  try {
    const data = await chrome.storage.sync.get(STORAGE_SETTINGS);
    const merged = { ...(data[STORAGE_SETTINGS] || {}), ...newSettings };
    await chrome.storage.sync.set({ [STORAGE_SETTINGS]: merged });
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ─── Call History Handlers ────────────────────────────────────────────────────

async function handleSaveCallRecord(record, sendResponse) {
  try {
    const data = await chrome.storage.local.get(STORAGE_CALL_HISTORY);
    const history = data[STORAGE_CALL_HISTORY] || [];

    const enriched = {
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      ...record
    };

    history.unshift(enriched);
    // Keep last 500 records
    const trimmed = history.slice(0, 500);
    await chrome.storage.local.set({ [STORAGE_CALL_HISTORY]: trimmed });
    sendResponse({ ok: true, id: enriched.id });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleGetCallHistory(sendResponse) {
  try {
    const data = await chrome.storage.local.get(STORAGE_CALL_HISTORY);
    sendResponse({ ok: true, history: data[STORAGE_CALL_HISTORY] || [] });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleClearCallHistory(sendResponse) {
  try {
    await chrome.storage.local.remove(STORAGE_CALL_HISTORY);
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ─── Token Storage Helpers ────────────────────────────────────────────────────

async function getTokens() {
  const data = await chrome.storage.local.get(STORAGE_TOKENS);
  return data[STORAGE_TOKENS] || {};
}

async function saveTokens(update) {
  const current = await getTokens();
  await chrome.storage.local.set({ [STORAGE_TOKENS]: { ...current, ...update } });
}

async function handleGetTokens(sendResponse) {
  try {
    const tokens = await getTokens();
    // Never expose raw tokens — just return status flags
    sendResponse({
      ok: true,
      googleConnected: !!tokens.googleAccessToken,
      salesforceConnected: !!tokens.salesforceAccessToken,
      salesforceInstanceUrl: tokens.salesforceInstanceUrl || ''
    });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

async function handleGoogleAuth(sendResponse) {
  try {
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true, scopes: GOOGLE_SCOPES.split(' ') }, (tok) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(tok);
      });
    });

    await saveTokens({ googleAccessToken: token });
    await chrome.storage.sync.set({
      [STORAGE_SETTINGS]: {
        ...(await chrome.storage.sync.get(STORAGE_SETTINGS))[STORAGE_SETTINGS],
        googleConnected: true
      }
    });
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleRevokeGoogle(sendResponse) {
  try {
    const tokens = await getTokens();
    if (tokens.googleAccessToken) {
      // Revoke via Google endpoint
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${tokens.googleAccessToken}`);
      chrome.identity.removeCachedAuthToken({ token: tokens.googleAccessToken }, () => {});
    }
    await saveTokens({ googleAccessToken: null });
    const data = await chrome.storage.sync.get(STORAGE_SETTINGS);
    const settings = data[STORAGE_SETTINGS] || {};
    settings.googleConnected = false;
    await chrome.storage.sync.set({ [STORAGE_SETTINGS]: settings });
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ─── Salesforce OAuth ─────────────────────────────────────────────────────────

async function handleSalesforceAuth(payload, sendResponse) {
  try {
    const { clientId, environment } = payload || {};
    if (!clientId) throw new Error('Salesforce client_id is required');

    const baseUrl = environment === 'sandbox'
      ? 'https://test.salesforce.com'
      : 'https://login.salesforce.com';

    const redirectUri = chrome.identity.getRedirectURL('salesforce');
    const authUrl = `${baseUrl}/services/oauth2/authorize`
      + `?response_type=code`
      + `&client_id=${encodeURIComponent(clientId)}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&scope=api+refresh_token+offline_access`;

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (url) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(url);
      });
    });

    const url = new URL(responseUrl);
    const code = url.searchParams.get('code');
    if (!code) throw new Error('No authorization code returned from Salesforce');

    // Exchange code for tokens — requires client_secret from settings
    const settingsData = await chrome.storage.sync.get(STORAGE_SETTINGS);
    const settings = settingsData[STORAGE_SETTINGS] || {};
    const clientSecret = settings.salesforceClientSecret || '';

    const tokenRes = await fetch(`${baseUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Salesforce token exchange failed: ${errText}`);
    }

    const tokenData = await tokenRes.json();
    await saveTokens({
      salesforceAccessToken: tokenData.access_token,
      salesforceRefreshToken: tokenData.refresh_token,
      salesforceInstanceUrl: tokenData.instance_url
    });

    settings.salesforceConnected = true;
    settings.salesforceInstanceUrl = tokenData.instance_url;
    await chrome.storage.sync.set({ [STORAGE_SETTINGS]: settings });

    sendResponse({ ok: true, instanceUrl: tokenData.instance_url });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleRevokeSalesforce(sendResponse) {
  try {
    const tokens = await getTokens();
    if (tokens.salesforceAccessToken && tokens.salesforceInstanceUrl) {
      await fetch(`${tokens.salesforceInstanceUrl}/services/oauth2/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tokens.salesforceAccessToken })
      });
    }
    await saveTokens({ salesforceAccessToken: null, salesforceRefreshToken: null, salesforceInstanceUrl: null });
    const data = await chrome.storage.sync.get(STORAGE_SETTINGS);
    const settings = data[STORAGE_SETTINGS] || {};
    settings.salesforceConnected = false;
    await chrome.storage.sync.set({ [STORAGE_SETTINGS]: settings });
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ─── Salesforce Token Refresh ─────────────────────────────────────────────────

async function refreshSalesforceToken() {
  const tokens = await getTokens();
  if (!tokens.salesforceRefreshToken) throw new Error('No Salesforce refresh token');

  const settingsData = await chrome.storage.sync.get(STORAGE_SETTINGS);
  const settings = settingsData[STORAGE_SETTINGS] || {};
  const baseUrl = settings.salesforceEnvironment === 'sandbox'
    ? 'https://test.salesforce.com'
    : 'https://login.salesforce.com';

  const res = await fetch(`${baseUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.salesforceRefreshToken,
      client_id: settings.salesforceClientId || '',
      client_secret: settings.salesforceClientSecret || ''
    })
  });

  if (!res.ok) throw new Error('Salesforce token refresh failed');
  const data = await res.json();
  await saveTokens({ salesforceAccessToken: data.access_token });
  return data.access_token;
}

// ─── Gmail Draft Handler ──────────────────────────────────────────────────────

async function handleCreateGmailDraft(payload, sendResponse) {
  try {
    const tokens = await getTokens();
    if (!tokens.googleAccessToken) throw new Error('Google not connected');

    const { to, subject, body } = payload;
    const emailContent = buildEmailRFC2822({ to, subject, body });
    const encoded = btoa(unescape(encodeURIComponent(emailContent)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.googleAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: { raw: encoded } })
    });

    if (res.status === 401) {
      // Token expired — refresh via chrome.identity
      const newToken = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: false }, (tok) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(tok);
        });
      });
      await saveTokens({ googleAccessToken: newToken });
      return handleCreateGmailDraft(payload, sendResponse);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gmail API error: ${errText}`);
    }

    const data = await res.json();
    sendResponse({ ok: true, draftId: data.id });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

function buildEmailRFC2822({ to, subject, body }) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body
  ];
  return lines.join('\r\n');
}

// ─── Salesforce Activity Upsert ───────────────────────────────────────────────

async function handleSalesforceUpsertActivity(payload, sendResponse) {
  try {
    let tokens = await getTokens();
    if (!tokens.salesforceAccessToken) throw new Error('Salesforce not connected');

    const result = await upsertSalesforceActivity(tokens, payload);
    sendResponse({ ok: true, result });
  } catch (err) {
    if (err.message.includes('INVALID_SESSION_ID') || err.message.includes('401')) {
      try {
        const newToken = await refreshSalesforceToken();
        const tokens = await getTokens();
        const result = await upsertSalesforceActivity(tokens, payload);
        sendResponse({ ok: true, result });
      } catch (refreshErr) {
        sendResponse({ ok: false, error: refreshErr.message });
      }
    } else {
      sendResponse({ ok: false, error: err.message });
    }
  }
}

async function upsertSalesforceActivity(tokens, payload) {
  const { instanceUrl, salesforceAccessToken } = tokens;
  if (!instanceUrl) throw new Error('Salesforce instance URL not set');

  const {
    subject,
    description,
    whoId,
    whatId,
    activityDate,
    durationInMinutes,
    callType
  } = payload;

  const body = {
    Subject: subject || 'SDR Copilot Call',
    Description: description || '',
    ActivityDate: activityDate || new Date().toISOString().split('T')[0],
    Status: 'Completed',
    Type: 'Call',
    CallDurationInSeconds: (durationInMinutes || 0) * 60,
    CallType: callType || 'Outbound'
  };

  if (whoId) body.WhoId = whoId;
  if (whatId) body.WhatId = whatId;

  const res = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Task`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${salesforceAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Salesforce API error: ${errText}`);
  }

  return await res.json();
}

// ─── Tab Audio Capture (via Offscreen Document) ──────────────────────────────

let _offscreenCreated = false;

async function ensureOffscreenDocument() {
  if (_offscreenCreated) return;

  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (existingContexts.length > 0) {
    _offscreenCreated = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Capture tab audio for real-time transcription'
  });
  _offscreenCreated = true;
}

async function handleCaptureTabAudio(tab, sendResponse) {
  try {
    if (!tab || !tab.id) throw new Error('No tab to capture');

    const streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(id);
      });
    });

    // Create offscreen document and start capture there
    await ensureOffscreenDocument();
    const result = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_START_CAPTURE',
      streamId
    });

    if (result?.ok) {
      sendResponse({ ok: true, streamId, offscreen: true });
    } else {
      // Fall back to returning streamId for content script to handle
      sendResponse({ ok: true, streamId });
    }
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ─── Nightly Dashboard Refresh ────────────────────────────────────────────────

async function handleNightlyRefresh() {
  try {
    const data = await chrome.storage.local.get(STORAGE_CALL_HISTORY);
    const history = data[STORAGE_CALL_HISTORY] || [];
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCalls = history.filter(c => (c.startTime || '').startsWith(todayStr));

    const summary = {
      date: todayStr,
      totalCalls: todayCalls.length,
      totalTalkSeconds: todayCalls.reduce((s, c) => s + (c.durationSeconds || 0), 0),
      objections: todayCalls.reduce((acc, c) => {
        (c.objections || []).forEach(o => {
          acc[o] = (acc[o] || 0) + 1;
        });
        return acc;
      }, {}),
      topFollowUps: todayCalls.flatMap(c => c.followUps || []).slice(0, 5)
    };

    // Store daily summary
    const summaries = (await chrome.storage.local.get('dailySummaries')).dailySummaries || [];
    summaries.unshift(summary);
    await chrome.storage.local.set({ dailySummaries: summaries.slice(0, 90) });

    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icons/icon48.png',
      title: 'SDR Copilot — Daily Summary',
      message: `${summary.totalCalls} calls today. ${Math.round(summary.totalTalkSeconds / 60)} min total talk time.`
    });
  } catch (err) {
    console.error('[SDR Copilot] Nightly refresh error:', err);
  }
}

// ─── LinkedIn Contact Handlers ────────────────────────────────────────────────

const STORAGE_LINKEDIN_CONTACTS = 'linkedinContacts';

/**
 * Save a LinkedIn profile captured by the content script.
 * De-duplicates by linkedinUrl.
 */
async function handleLinkedInContact(profile, sendResponse) {
  try {
    const data = await chrome.storage.local.get(STORAGE_LINKEDIN_CONTACTS);
    const contacts = data[STORAGE_LINKEDIN_CONTACTS] || [];

    // De-duplicate by LinkedIn URL
    const normalUrl = (profile.linkedinUrl || '').split('?')[0].replace(/\/$/, '');
    const existingIdx = contacts.findIndex(
      c => (c.linkedinUrl || '').split('?')[0].replace(/\/$/, '') === normalUrl
    );

    if (existingIdx >= 0) {
      // Merge: keep existing email if we don't have a new one
      contacts[existingIdx] = {
        ...contacts[existingIdx],
        ...profile,
        email: profile.email || contacts[existingIdx].email,
        updatedAt: new Date().toISOString(),
      };
    } else {
      contacts.unshift({ ...profile, id: `li-${Date.now()}` });
    }

    // Cap at 500 contacts
    await chrome.storage.local.set({ [STORAGE_LINKEDIN_CONTACTS]: contacts.slice(0, 500) });
    sendResponse({ saved: true, total: contacts.length });
  } catch (err) {
    console.error('[SDR Copilot] LinkedIn contact save error:', err);
    sendResponse({ saved: false, error: err.message });
  }
}

async function handleGetLinkedInContacts(sendResponse) {
  try {
    const data = await chrome.storage.local.get(STORAGE_LINKEDIN_CONTACTS);
    sendResponse({ ok: true, contacts: data[STORAGE_LINKEDIN_CONTACTS] || [] });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// ─── Audio Chunk Relay ──────────────────────────────────────────────────────

function relayAudioChunkToOrumTab(buffer) {
  chrome.tabs.query({ url: '*://*.orum.io/*' }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'OFFSCREEN_AUDIO_CHUNK',
        buffer
      }).catch(() => {});
    }
  });
}

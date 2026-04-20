/**
 * SDR Copilot — Background Service Worker
 * Handles OAuth flows, message routing, alarm scheduling,
 * and persistent call history storage.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const PH_KEY         = 'phc_nbJYTmmAEAmKmnmYKFsUZnLt4cpPxbFUmG8dQEFjSvxZ';
const PH_ENDPOINT    = 'https://us.i.posthog.com/capture/';
const SENTRY_KEY     = 'f7202c3f38ae91f64b037e833b2f9a0b';
const SENTRY_STORE   = 'https://o4511073877229568.ingest.us.sentry.io/api/4511140406034432/store/';
const EXT_VERSION    = '1.1.0';

const ALARM_NIGHTLY_REFRESH  = 'nightly-dashboard-refresh';
const STORAGE_CALL_HISTORY   = 'callHistory';
const STORAGE_SETTINGS       = 'settings';
const STORAGE_TOKENS         = 'tokens';
const STORAGE_LOCAL_SECRETS  = 'localSecrets'; // Sensitive creds never written to sync

// Salesforce OAuth config (user fills client_id in options)
const SF_AUTH_BASE = 'https://login.salesforce.com/services/oauth2';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

// ─── Analytics & Error Reporting ─────────────────────────────────────────────

async function getOrCreateDistinctId() {
  const data = await chrome.storage.local.get('ph_distinct_id');
  if (data.ph_distinct_id) return data.ph_distinct_id;
  const id = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await chrome.storage.local.set({ ph_distinct_id: id });
  return id;
}

async function posthog(event, properties = {}) {
  try {
    const distinct_id = await getOrCreateDistinctId();
    await fetch(PH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: PH_KEY,
        event,
        distinct_id,
        properties: { $lib: 'sdr-copilot', extension_version: EXT_VERSION, ...properties }
      })
    });
  } catch {
    // Non-fatal
  }
}

async function captureError(err, context = {}) {
  try {
    const eventId = crypto.randomUUID().replace(/-/g, '');
    await fetch(SENTRY_STORE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=sdr-copilot/${EXT_VERSION}, sentry_key=${SENTRY_KEY}`
      },
      body: JSON.stringify({
        event_id: eventId,
        timestamp: new Date().toISOString(),
        message: err?.message || String(err),
        level: 'error',
        logger: context.logger || 'service-worker',
        tags: { extension_version: EXT_VERSION },
        extra: context
      })
    });
  } catch {
    // Non-fatal
  }
}

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

// ─── Keyboard Shortcut Handler ────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-overlay') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
    }
  }
});

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

    case 'CLAUDE_ANALYZE':
      handleClaudeAnalyze(payload, sendResponse);
      return true;

    case 'TRACK_EVENT':
      posthog(payload?.event, payload?.properties || {});
      sendResponse({ ok: true });
      return false;

    default:
      sendResponse({ error: `Unknown message type: ${type}` });
      return false;
  }
});

// ─── Settings Handlers ────────────────────────────────────────────────────────

async function handleGetSettings(sendResponse) {
  try {
    const data = await chrome.storage.sync.get(STORAGE_SETTINGS);
    const settings = data[STORAGE_SETTINGS] || {};
    const secrets = await getLocalSecrets();
    if (secrets.deepgramApiKey) settings.deepgramApiKey = secrets.deepgramApiKey;
    if (secrets.anthropicApiKey) settings.anthropicApiKey = secrets.anthropicApiKey;
    sendResponse({ ok: true, settings });
  } catch (err) {
    captureError(err, { logger: 'get-settings' });
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleSaveSettings(newSettings, sendResponse) {
  try {
    const { salesforceClientSecret, deepgramApiKey, anthropicApiKey, ...syncableSettings } = newSettings;
    if (salesforceClientSecret) await saveLocalSecrets({ salesforceClientSecret });
    if (deepgramApiKey !== undefined) await saveLocalSecrets({ deepgramApiKey });
    if (anthropicApiKey !== undefined) await saveLocalSecrets({ anthropicApiKey });

    const data = await chrome.storage.sync.get(STORAGE_SETTINGS);
    // Also remove any sensitive key that may have been written to sync previously
    const existing = data[STORAGE_SETTINGS] || {};
    delete existing.salesforceClientSecret;
    delete existing.deepgramApiKey;
    delete existing.anthropicApiKey;
    const merged = { ...existing, ...syncableSettings };
    await chrome.storage.sync.set({ [STORAGE_SETTINGS]: merged });
    sendResponse({ ok: true });
  } catch (err) {
    captureError(err, { logger: 'save-settings' });
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
    const trimmed = history.slice(0, 500);
    await chrome.storage.local.set({ [STORAGE_CALL_HISTORY]: trimmed });

    const segs = enriched.talkSegments || [];
    const youMs = segs.filter(s => s.speaker === 'you').reduce((a, s) => a + (s.durationMs || 0), 0);
    const prospectMs = segs.filter(s => s.speaker !== 'you').reduce((a, s) => a + (s.durationMs || 0), 0);
    const totalMs = youMs + prospectMs || 1;
    posthog('call_saved', {
      duration_seconds: enriched.durationSeconds || 0,
      objection_count: (enriched.objections || []).length,
      talk_you_pct: Math.round((youMs / totalMs) * 100),
      demo_mode: !!enriched.demoMode
    });

    sendResponse({ ok: true, id: enriched.id });
  } catch (err) {
    captureError(err, { logger: 'save-call-record' });
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

async function getLocalSecrets() {
  const data = await chrome.storage.local.get(STORAGE_LOCAL_SECRETS);
  return data[STORAGE_LOCAL_SECRETS] || {};
}

async function saveLocalSecrets(update) {
  const current = await getLocalSecrets();
  await chrome.storage.local.set({ [STORAGE_LOCAL_SECRETS]: { ...current, ...update } });
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

    // Exchange code for tokens — requires client_secret from local secrets
    const settingsData = await chrome.storage.sync.get(STORAGE_SETTINGS);
    const settings = settingsData[STORAGE_SETTINGS] || {};
    const secrets = await getLocalSecrets();
    const clientSecret = secrets.salesforceClientSecret || '';

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
  const secrets = await getLocalSecrets();
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
      client_secret: secrets.salesforceClientSecret || ''
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
    posthog('email_drafted', {});
    sendResponse({ ok: true, draftId: data.id });
  } catch (err) {
    captureError(err, { logger: 'create-gmail-draft' });
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
    posthog('salesforce_logged', {});
    sendResponse({ ok: true, result });
  } catch (err) {
    if (err.message.includes('INVALID_SESSION_ID') || err.message.includes('401')) {
      try {
        const newToken = await refreshSalesforceToken();
        const tokens = await getTokens();
        const result = await upsertSalesforceActivity(tokens, payload);
        posthog('salesforce_logged', {});
        sendResponse({ ok: true, result });
      } catch (refreshErr) {
        captureError(refreshErr, { logger: 'salesforce-upsert-refresh' });
        sendResponse({ ok: false, error: refreshErr.message });
      }
    } else {
      captureError(err, { logger: 'salesforce-upsert' });
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
    reasons: ['AUDIO_PLAYBACK'],
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

    posthog('daily_summary', {
      total_calls: summary.totalCalls,
      total_talk_seconds: summary.totalTalkSeconds,
      unique_objection_types: Object.keys(summary.objections).length
    });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icons/icon48.png',
      title: 'SDR Copilot — Daily Summary',
      message: `${summary.totalCalls} calls today. ${Math.round(summary.totalTalkSeconds / 60)} min total talk time.`
    });
  } catch (err) {
    captureError(err, { logger: 'nightly-refresh' });
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

// ─── Claude AI Analysis ───────────────────────────────────────────────────────

let _claudeRateLimitedUntil = 0;

async function handleClaudeAnalyze(payload, sendResponse) {
  if (Date.now() < _claudeRateLimitedUntil) {
    sendResponse({ ok: false, error: 'rate_limited' });
    return;
  }

  try {
    const secrets = await getLocalSecrets();
    const apiKey = secrets.anthropicApiKey;
    if (!apiKey) {
      sendResponse({ ok: false, error: 'no_key' });
      return;
    }

    const { text } = payload;
    const safeText = (text || '').replace(/"/g, "'").slice(0, 500);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: `You are analyzing a B2B sales call. The prospect just said: "${safeText}"

Identify any sales objections. Reply with valid JSON only, no explanation:
{"objections":[{"type":"price|timing|authority|need|competitor|trust","confidence":0.0,"suggestion":"one concise talk-track response"}]}
If no objections, return {"objections":[]}`
        }]
      })
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '60', 10);
      _claudeRateLimitedUntil = Date.now() + retryAfter * 1000;
      posthog('claude_rate_limited', { retry_after_seconds: retryAfter });
      sendResponse({ ok: false, error: 'rate_limited' });
      return;
    }

    if (!res.ok) {
      const errText = await res.text();
      captureError(new Error(`Claude API ${res.status}`), { logger: 'claude-analyze', status: res.status });
      sendResponse({ ok: false, error: errText });
      return;
    }

    const data = await res.json();
    const content = data.content?.[0]?.text || '{"objections":[]}';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { objections: [] };
    }

    sendResponse({ ok: true, objections: parsed.objections || [] });
  } catch (err) {
    captureError(err, { logger: 'claude-analyze' });
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

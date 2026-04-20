/**
 * SDR Copilot — Options Page Script
 */

(async function () {
  'use strict';

  // ─── Elements ─────────────────────────────────────────────────────────────────

  const el = {
    profileName:    document.getElementById('profile-name'),
    profileTitle:   document.getElementById('profile-title'),
    profileCompany: document.getElementById('profile-company'),
    profilePhone:   document.getElementById('profile-phone'),
    profileEmail:   document.getElementById('profile-email'),

    dgKey:          document.getElementById('dg-key'),
    dgRevealBtn:    document.getElementById('dg-reveal-btn'),
    dgAlert:        document.getElementById('dg-alert'),

    anthropicKey:       document.getElementById('anthropic-key'),
    anthropicRevealBtn: document.getElementById('anthropic-reveal-btn'),
    demoModeToggle: document.getElementById('demo-mode-toggle'),
    orumDomain:     document.getElementById('orum-domain'),
    overlayToggle:  document.getElementById('overlay-toggle'),
    pdmAuditToggle: document.getElementById('pdm-audit-toggle'),

    googleBadge:    document.getElementById('google-badge'),
    googleDot:      document.getElementById('google-dot'),
    googleBadgeText:document.getElementById('google-badge-text'),
    googleConnectBtn:document.getElementById('google-connect-btn'),
    googleAlert:    document.getElementById('google-alert'),
    autoDraftToggle:document.getElementById('auto-draft-toggle'),

    sfBadge:        document.getElementById('sf-badge'),
    sfDot:          document.getElementById('sf-dot'),
    sfBadgeText:    document.getElementById('sf-badge-text'),
    sfConnectBtn:   document.getElementById('sf-connect-btn'),
    sfClientId:     document.getElementById('sf-client-id'),
    sfClientSecret: document.getElementById('sf-client-secret'),
    sfSecretReveal: document.getElementById('sf-secret-reveal'),
    sfEnvironment:  document.getElementById('sf-environment'),
    autoSFToggle:   document.getElementById('auto-sf-toggle'),
    sfAlert:        document.getElementById('sf-alert'),

    prefObjChart:   document.getElementById('pref-obj-chart'),
    prefTalktime:   document.getElementById('pref-talktime'),
    prefFollowups:  document.getElementById('pref-followups'),

    clearHistoryBtn:document.getElementById('clear-history-btn'),
    saveBar:        document.getElementById('save-bar'),
    saveStatus:     document.getElementById('save-status'),
    saveBtn:        document.getElementById('save-btn'),
    discardBtn:     document.getElementById('discard-btn'),
  };

  // ─── State ────────────────────────────────────────────────────────────────────

  let settings = {};
  let tokens = {};
  let isDirty = false;

  // ─── Init ─────────────────────────────────────────────────────────────────────

  async function init() {
    [settings, tokens] = await Promise.all([fetchSettings(), fetchTokens()]);
    populateForm();
    bindEvents();
  }

  function fetchSettings() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, res => resolve(res?.settings || {}));
    });
  }

  function fetchTokens() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, res => resolve(res || {}));
    });
  }

  // ─── Populate form from settings ──────────────────────────────────────────────

  function populateForm() {
    // Profile
    const profile = settings.senderProfile || {};
    el.profileName.value = profile.name || '';
    el.profileTitle.value = profile.title || '';
    el.profileCompany.value = profile.company || '';
    el.profilePhone.value = profile.phone || '';
    el.profileEmail.value = profile.email || '';

    // Deepgram
    if (settings.deepgramApiKey) {
      el.dgKey.placeholder = '••••••••••••••••  (saved)';
    }

    // Anthropic
    if (settings.anthropicApiKey) {
      el.anthropicKey.placeholder = '••••••••••••••••  (saved)';
    }
    el.demoModeToggle.checked = settings.demoMode !== false;

    // Orum
    el.orumDomain.value = settings.orumDomain || 'app.orum.io';
    el.overlayToggle.checked = settings.overlayEnabled !== false;
    el.pdmAuditToggle.checked = settings.pdmAuditEnabled !== false;

    // Google
    updateGoogleStatus(tokens.googleConnected || settings.googleConnected);
    el.autoDraftToggle.checked = settings.autoDraft === true;

    // Salesforce
    updateSFStatus(tokens.salesforceConnected || settings.salesforceConnected);
    el.sfClientId.value = settings.salesforceClientId || '';
    el.sfEnvironment.value = settings.salesforceEnvironment || 'production';
    el.autoSFToggle.checked = settings.autoSalesforce === true;

    // Dashboard prefs
    const prefs = settings.dashboardPrefs || {};
    el.prefObjChart.checked = prefs.showObjChart !== false;
    el.prefTalktime.checked = prefs.showTalkTime !== false;
    el.prefFollowups.checked = prefs.showFollowUps !== false;
  }

  function updateGoogleStatus(connected) {
    if (connected) {
      el.googleBadge.className = 'conn-badge connected';
      el.googleDot.className = 'conn-dot on';
      el.googleBadgeText.textContent = 'Connected';
      el.googleConnectBtn.textContent = 'Disconnect';
      el.googleConnectBtn.className = 'btn btn-danger';
    } else {
      el.googleBadge.className = 'conn-badge disconnected';
      el.googleDot.className = 'conn-dot off';
      el.googleBadgeText.textContent = 'Not connected';
      el.googleConnectBtn.textContent = 'Connect Google';
      el.googleConnectBtn.className = 'btn btn-ghost';
    }
  }

  function updateSFStatus(connected) {
    if (connected) {
      el.sfBadge.className = 'conn-badge connected';
      el.sfDot.className = 'conn-dot on';
      el.sfBadgeText.textContent = 'Connected';
      el.sfConnectBtn.textContent = 'Disconnect';
      el.sfConnectBtn.className = 'btn btn-danger';
    } else {
      el.sfBadge.className = 'conn-badge disconnected';
      el.sfDot.className = 'conn-dot off';
      el.sfBadgeText.textContent = 'Not connected';
      el.sfConnectBtn.textContent = 'Connect Salesforce';
      el.sfConnectBtn.className = 'btn btn-ghost';
    }
  }

  // ─── Events ───────────────────────────────────────────────────────────────────

  function bindEvents() {
    // Track changes
    const changeEls = [
      el.profileName, el.profileTitle, el.profileCompany, el.profilePhone, el.profileEmail,
      el.dgKey, el.anthropicKey, el.demoModeToggle, el.orumDomain, el.overlayToggle,
      el.pdmAuditToggle, el.autoDraftToggle, el.sfClientId,
      el.sfClientSecret, el.sfEnvironment, el.autoSFToggle,
      el.prefObjChart, el.prefTalktime, el.prefFollowups
    ];
    changeEls.forEach(e => e.addEventListener('change', markDirty));
    changeEls.forEach(e => e.addEventListener('input', markDirty));

    // Save / discard
    el.saveBtn.addEventListener('click', saveAll);
    el.discardBtn.addEventListener('click', () => {
      populateForm();
      markClean();
    });

    // Deepgram key reveal
    el.dgRevealBtn.addEventListener('click', () => {
      if (el.dgKey.type === 'password') {
        el.dgKey.type = 'text';
        el.dgRevealBtn.textContent = 'Hide';
      } else {
        el.dgKey.type = 'password';
        el.dgRevealBtn.textContent = 'Show';
      }
    });

    // Anthropic key reveal
    el.anthropicRevealBtn.addEventListener('click', () => {
      if (el.anthropicKey.type === 'password') {
        el.anthropicKey.type = 'text';
        el.anthropicRevealBtn.textContent = 'Hide';
      } else {
        el.anthropicKey.type = 'password';
        el.anthropicRevealBtn.textContent = 'Show';
      }
    });

    // SF secret reveal
    el.sfSecretReveal.addEventListener('click', () => {
      if (el.sfClientSecret.type === 'password') {
        el.sfClientSecret.type = 'text';
        el.sfSecretReveal.textContent = 'Hide';
      } else {
        el.sfClientSecret.type = 'password';
        el.sfSecretReveal.textContent = 'Show';
      }
    });

    // Google connect
    el.googleConnectBtn.addEventListener('click', handleGoogleAuth);

    // Salesforce connect
    el.sfConnectBtn.addEventListener('click', handleSFAuth);

    // Clear history
    el.clearHistoryBtn.addEventListener('click', async () => {
      if (confirm('Permanently delete all call history? This cannot be undone.')) {
        const res = await sendMsg('CLEAR_CALL_HISTORY');
        if (res?.ok) showAlert(document.getElementById('data-alert'), 'Call history cleared.', 'success');
      }
    });
  }

  function markDirty() {
    if (!isDirty) {
      isDirty = true;
      el.saveBar.classList.add('visible');
      el.saveStatus.textContent = 'Unsaved changes';
      el.saveStatus.className = 'save-status';
    }
  }

  function markClean() {
    isDirty = false;
    el.saveBar.classList.remove('visible');
  }

  // ─── Save ─────────────────────────────────────────────────────────────────────

  async function saveAll() {
    el.saveBtn.disabled = true;
    el.saveBtn.textContent = 'Saving…';

    const newSettings = {
      senderProfile: {
        name: el.profileName.value.trim(),
        title: el.profileTitle.value.trim(),
        company: el.profileCompany.value.trim(),
        phone: el.profilePhone.value.trim(),
        email: el.profileEmail.value.trim()
      },
      deepgramApiKey: el.dgKey.value.trim() || settings.deepgramApiKey || '',
      anthropicApiKey: el.anthropicKey.value.trim() || settings.anthropicApiKey || '',
      demoMode: el.demoModeToggle.checked,
      orumDomain: el.orumDomain.value.trim() || 'app.orum.io',
      overlayEnabled: el.overlayToggle.checked,
      pdmAuditEnabled: el.pdmAuditToggle.checked,
      autoDraft: el.autoDraftToggle.checked,
      salesforceClientId: el.sfClientId.value.trim(),
      salesforceClientSecret: el.sfClientSecret.value.trim() || settings.salesforceClientSecret || '',
      salesforceEnvironment: el.sfEnvironment.value,
      autoSalesforce: el.autoSFToggle.checked,
      dashboardPrefs: {
        showObjChart: el.prefObjChart.checked,
        showTalkTime: el.prefTalktime.checked,
        showFollowUps: el.prefFollowups.checked
      }
    };

    // Auto-disable demo mode if key is now set
    if (newSettings.deepgramApiKey) newSettings.demoMode = false;

    const res = await sendMsg('SAVE_SETTINGS', newSettings);

    el.saveBtn.disabled = false;
    el.saveBtn.textContent = 'Save Settings';

    if (res?.ok) {
      settings = { ...settings, ...newSettings };
      el.saveStatus.textContent = '✓ Saved!';
      el.saveStatus.className = 'save-status saved';
      setTimeout(markClean, 1500);

      // Clear password fields after save
      if (el.dgKey.value) {
        el.dgKey.value = '';
        el.dgKey.placeholder = '••••••••••••••••  (saved)';
      }
      if (el.anthropicKey.value) {
        el.anthropicKey.value = '';
        el.anthropicKey.placeholder = '••••••••••••••••  (saved)';
      }
      if (el.sfClientSecret.value) {
        el.sfClientSecret.value = '';
      }
    } else {
      el.saveStatus.textContent = '✗ Save failed';
      el.saveStatus.className = 'save-status';
    }
  }

  // ─── Google Auth ──────────────────────────────────────────────────────────────

  async function handleGoogleAuth() {
    const connected = tokens.googleConnected || settings.googleConnected;

    if (connected) {
      if (!confirm('Disconnect your Google account? Follow-up drafts will stop working.')) return;
      el.googleConnectBtn.disabled = true;
      el.googleConnectBtn.textContent = 'Disconnecting…';
      const res = await sendMsg('REVOKE_GOOGLE');
      el.googleConnectBtn.disabled = false;
      if (res?.ok) {
        tokens.googleConnected = false;
        settings.googleConnected = false;
        updateGoogleStatus(false);
        showAlert(el.googleAlert, 'Google account disconnected.', 'info');
      } else {
        showAlert(el.googleAlert, `Error: ${res?.error || 'Unknown'}`, 'error');
      }
    } else {
      el.googleConnectBtn.disabled = true;
      el.googleConnectBtn.textContent = 'Connecting…';
      const res = await sendMsg('GOOGLE_AUTH');
      el.googleConnectBtn.disabled = false;
      if (res?.ok) {
        tokens.googleConnected = true;
        settings.googleConnected = true;
        updateGoogleStatus(true);
        showAlert(el.googleAlert, 'Google account connected successfully!', 'success');
      } else {
        updateGoogleStatus(false);
        showAlert(el.googleAlert, `Auth failed: ${res?.error || 'Popup blocked or denied'}`, 'error');
      }
    }
  }

  // ─── Salesforce Auth ──────────────────────────────────────────────────────────

  async function handleSFAuth() {
    const connected = tokens.salesforceConnected || settings.salesforceConnected;

    if (connected) {
      if (!confirm('Disconnect Salesforce? Activity sync will stop.')) return;
      el.sfConnectBtn.disabled = true;
      el.sfConnectBtn.textContent = 'Disconnecting…';
      const res = await sendMsg('REVOKE_SALESFORCE');
      el.sfConnectBtn.disabled = false;
      if (res?.ok) {
        tokens.salesforceConnected = false;
        settings.salesforceConnected = false;
        updateSFStatus(false);
        showAlert(el.sfAlert, 'Salesforce disconnected.', 'info');
      }
    } else {
      const clientId = el.sfClientId.value.trim();
      if (!clientId) {
        showAlert(el.sfAlert, 'Please enter your Salesforce Connected App Client ID first.', 'error');
        el.sfClientId.focus();
        return;
      }

      // Save credentials first
      await sendMsg('SAVE_SETTINGS', {
        salesforceClientId: clientId,
        salesforceClientSecret: el.sfClientSecret.value.trim() || settings.salesforceClientSecret || '',
        salesforceEnvironment: el.sfEnvironment.value
      });

      el.sfConnectBtn.disabled = true;
      el.sfConnectBtn.textContent = 'Connecting…';

      const res = await sendMsg('SALESFORCE_AUTH', {
        clientId,
        environment: el.sfEnvironment.value
      });

      el.sfConnectBtn.disabled = false;

      if (res?.ok) {
        tokens.salesforceConnected = true;
        settings.salesforceConnected = true;
        updateSFStatus(true);
        showAlert(el.sfAlert, `Connected to Salesforce! (${res.instanceUrl})`, 'success');
      } else {
        updateSFStatus(false);
        showAlert(el.sfAlert, `Auth failed: ${res?.error || 'Unknown error'}`, 'error');
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function showAlert(el, msg, type) {
    el.textContent = msg;
    el.className = `alert alert-${type} visible`;
    setTimeout(() => el.classList.remove('visible'), 5000);
  }

  function sendMsg(type, payload) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type, payload }, res => resolve(res || {}));
    });
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────────

  init();
})();

/**
 * SDR Copilot — Popup Script
 */

(async function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────────

  let settings = {};
  let tokens = {};
  let orumTabId = null;

  // ─── Elements ─────────────────────────────────────────────────────────────────

  const el = {
    demoBadge:       document.getElementById('demo-badge'),
    overlayToggle:   document.getElementById('overlay-toggle'),
    dgKeyInput:      document.getElementById('dg-key-input'),
    dgSaveBtn:       document.getElementById('dg-save-btn'),
    dgSaveMsg:       document.getElementById('dg-save-msg'),
    launchDemo:      document.getElementById('launch-demo-btn'),
    openDashboard:   document.getElementById('open-dashboard-btn'),
    connectGoogle:   document.getElementById('connect-google-btn'),
    connectSF:       document.getElementById('connect-sf-btn'),
    openOptions:     document.getElementById('open-options-btn'),
    openOptionsLink: document.getElementById('open-options-link'),

    // Status indicators
    siOrum:       document.getElementById('si-orum'),
    svOrum:       document.getElementById('sv-orum'),
    siDG:         document.getElementById('si-deepgram'),
    svDG:         document.getElementById('sv-deepgram'),
    siGoogle:     document.getElementById('si-google'),
    svGoogle:     document.getElementById('sv-google'),
    siSF:         document.getElementById('si-salesforce'),
    svSF:         document.getElementById('sv-salesforce')
  };

  // ─── Init ─────────────────────────────────────────────────────────────────────

  async function init() {
    [settings, tokens] = await Promise.all([fetchSettings(), fetchTokenStatus()]);
    orumTabId = await detectOrumTab();
    renderAll();
    bindEvents();
  }

  function fetchSettings() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, res => {
        resolve(res?.settings || {});
      });
    });
  }

  function fetchTokenStatus() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_TOKENS' }, res => {
        resolve(res || {});
      });
    });
  }

  async function detectOrumTab() {
    return new Promise(resolve => {
      chrome.tabs.query({ url: '*://*.orum.io/*' }, tabs => {
        resolve(tabs?.[0]?.id || null);
      });
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  function renderAll() {
    const hasKey = !!settings.deepgramApiKey;
    const isDemo = settings.demoMode !== false || !hasKey;

    // Demo badge
    el.demoBadge.style.display = isDemo ? 'inline-block' : 'none';

    // Overlay toggle
    el.overlayToggle.checked = settings.overlayEnabled !== false;

    // Deepgram key input — show masked version if set
    if (hasKey) {
      el.dgKeyInput.placeholder = '••••••••••••••••';
      el.dgKeyInput.value = '';
    }

    // Status: Orum
    if (orumTabId) {
      setStatus(el.siOrum, el.svOrum, 'active', 'Tab open');
    } else {
      setStatus(el.siOrum, el.svOrum, '', 'Not detected');
    }

    // Status: Deepgram
    if (hasKey) {
      setStatus(el.siDG, el.svDG, 'connected', 'API key set', 'ok');
    } else if (isDemo) {
      setStatus(el.siDG, el.svDG, 'warning', 'Demo mode', 'warn');
    } else {
      setStatus(el.siDG, el.svDG, '', 'No key');
    }

    // Status: Google
    if (tokens.googleConnected || settings.googleConnected) {
      setStatus(el.siGoogle, el.svGoogle, 'connected', 'Connected', 'ok');
      el.connectGoogle.textContent = '✉ Gmail: Connected';
    } else {
      setStatus(el.siGoogle, el.svGoogle, '', 'Not connected');
      el.connectGoogle.textContent = '✉ Connect Gmail';
    }

    // Status: Salesforce
    if (tokens.salesforceConnected || settings.salesforceConnected) {
      setStatus(el.siSF, el.svSF, 'connected', 'Connected', 'ok');
      el.connectSF.textContent = '☁ SF: Connected';
    } else {
      setStatus(el.siSF, el.svSF, '', 'Not connected');
      el.connectSF.textContent = '☁ Salesforce';
    }
  }

  function setStatus(indicatorEl, valueEl, indicatorClass, valueText, valueClass = '') {
    indicatorEl.className = `status-indicator ${indicatorClass}`.trim();
    valueEl.textContent = valueText;
    valueEl.className = `status-value ${valueClass}`.trim();
  }

  // ─── Events ───────────────────────────────────────────────────────────────────

  function bindEvents() {
    // Overlay toggle
    el.overlayToggle.addEventListener('change', async () => {
      settings.overlayEnabled = el.overlayToggle.checked;
      await saveSettings({ overlayEnabled: settings.overlayEnabled });
      // Notify active Orum tabs
      notifyOrumTab('TOGGLE_OVERLAY', { enabled: settings.overlayEnabled });
    });

    // Save Deepgram key
    el.dgSaveBtn.addEventListener('click', saveDeepgramKey);
    el.dgKeyInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveDeepgramKey();
    });

    // Launch demo
    el.launchDemo.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('demo/demo.html') });
      window.close();
    });

    // Open dashboard
    el.openDashboard.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
      window.close();
    });

    // Connect Google
    el.connectGoogle.addEventListener('click', async () => {
      if (tokens.googleConnected || settings.googleConnected) {
        if (confirm('Disconnect Gmail?')) {
          await sendMsg('REVOKE_GOOGLE');
          tokens.googleConnected = false;
          settings.googleConnected = false;
          renderAll();
        }
      } else {
        el.connectGoogle.textContent = 'Connecting…';
        const res = await sendMsg('GOOGLE_AUTH');
        if (res?.ok) {
          tokens.googleConnected = true;
          settings.googleConnected = true;
        } else {
          alert(`Gmail auth failed: ${res?.error || 'Unknown error'}`);
        }
        renderAll();
      }
    });

    // Connect Salesforce
    el.connectSF.addEventListener('click', async () => {
      if (tokens.salesforceConnected || settings.salesforceConnected) {
        if (confirm('Disconnect Salesforce?')) {
          await sendMsg('REVOKE_SALESFORCE');
          tokens.salesforceConnected = false;
          settings.salesforceConnected = false;
          renderAll();
        }
      } else {
        // Open options to configure SF client ID first
        chrome.runtime.openOptionsPage();
        window.close();
      }
    });

    // Open options
    el.openOptions.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });
    el.openOptionsLink.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });
  }

  async function saveDeepgramKey() {
    const key = el.dgKeyInput.value.trim();
    if (!key) return;

    await saveSettings({ deepgramApiKey: key, demoMode: false });
    settings.deepgramApiKey = key;
    settings.demoMode = false;
    el.dgKeyInput.value = '';
    el.dgKeyInput.placeholder = '••••••••••••••••';
    el.dgSaveMsg.classList.add('visible');
    setTimeout(() => el.dgSaveMsg.classList.remove('visible'), 2500);

    notifyOrumTab('SETTINGS_UPDATED', { deepgramApiKey: key, demoMode: false });
    renderAll();
  }

  function saveSettings(update) {
    return sendMsg('SAVE_SETTINGS', update);
  }

  function sendMsg(type, payload) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type, payload }, res => {
        resolve(res || {});
      });
    });
  }

  function notifyOrumTab(type, payload) {
    if (!orumTabId) return;
    chrome.tabs.sendMessage(orumTabId, { type, payload }).catch(() => {});
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────────

  init();
})();

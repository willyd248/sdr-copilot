/**
 * SDR Copilot — Orum Overlay
 *
 * Injected into orum.io pages. Watches the DOM for an active call state,
 * then renders a floating overlay with:
 *   - Live Deepgram transcript
 *   - AI objection detection cards
 *   - Suggested responses
 *   - Talk-time indicator
 *   - Post-call automation triggers
 */

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────────

  const state = {
    overlayVisible: false,
    callActive: false,
    recording: false,
    settings: null,
    demoMode: true,
    deepgramClient: null,
    aiCoach: null,
    audioStream: null,
    transcriptLines: [],
    activeObjections: [],
    callStartTime: null,
    callEndTime: null,
    talkSegments: [],
    currentSpeaker: 'unknown',
    speechStartTs: null,
    prospectInfo: { name: 'Prospect', email: '', company: '' },
    overlayEl: null,
    transcriptEl: null,
    objectionsEl: null,
    suggestionsEl: null,
    statusDotEl: null,
    timerInterval: null,
    pdmWatcher: null,
    draftId: null
  };

  // ─── Orum DOM selectors ───────────────────────────────────────────────────────

  const ORUM_SELECTORS = {
    activeCallBanner: [
      '[data-testid="active-call"]',
      '[class*="activeCall"]',
      '[class*="ActiveCall"]',
      '[class*="call-active"]',
      '[class*="dialer-active"]',
      '.call-in-progress',
      '[aria-label*="active call"]'
    ].join(', '),
    endCallButton: [
      '[data-testid="end-call"]',
      '[aria-label*="end call"]',
      '[class*="endCall"]',
      'button[class*="hangup"]',
      'button[class*="HangUp"]'
    ].join(', '),
    contactName: [
      '[data-testid="contact-name"]',
      '[class*="ContactName"]',
      '[class*="contactName"]',
      '[class*="prospect-name"]'
    ].join(', '),
    contactEmail: [
      '[data-testid="contact-email"]',
      '[class*="ContactEmail"]',
      'input[name="email"]'
    ].join(', '),
    companyName: [
      '[data-testid="company-name"]',
      '[class*="CompanyName"]',
      '[class*="accountName"]'
    ].join(', ')
  };

  // ─── Initialisation ───────────────────────────────────────────────────────────

  async function init() {
    try {
      state.settings = await getSettings();
      state.demoMode = state.settings.demoMode !== false
        || !state.settings.deepgramApiKey;

      if (state.settings.overlayEnabled === false) return;

      state.aiCoach = new AICoach();

      buildOverlayDOM();
      watchForCallState();

      // Start PDM audit watcher if on the contacts/sessions page
      if (window.PDMAudit && /session|contacts|dialer/i.test(window.location.pathname)) {
        state.pdmWatcher = PDMAudit.watchAndAudit(8000);
      }

      // Listen for messages from service worker / popup
      chrome.runtime.onMessage.addListener(onExtensionMessage);

      console.info('[SDR Copilot] Overlay initialized — demo mode:', state.demoMode);
    } catch (err) {
      console.error('[SDR Copilot] Init error:', err);
    }
  }

  function getSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (resp) => {
        if (chrome.runtime.lastError || !resp?.ok) resolve({});
        else resolve(resp.settings || {});
      });
    });
  }

  // ─── Call State Detection ─────────────────────────────────────────────────────

  function watchForCallState() {
    const observer = new MutationObserver(() => checkCallState());
    observer.observe(document.body, { childList: true, subtree: true });
    checkCallState();
  }

  function checkCallState() {
    const activeEl = document.querySelector(ORUM_SELECTORS.activeCallBanner);
    const isActive = !!activeEl || isCallActiveByURL();

    if (isActive && !state.callActive) {
      onCallStart();
    } else if (!isActive && state.callActive) {
      onCallEnd();
    }
  }

  function isCallActiveByURL() {
    return /call|dialing|active|connected/i.test(window.location.href);
  }

  function extractProspectInfo() {
    const nameEl = document.querySelector(ORUM_SELECTORS.contactName);
    const emailEl = document.querySelector(ORUM_SELECTORS.contactEmail);
    const companyEl = document.querySelector(ORUM_SELECTORS.companyName);

    state.prospectInfo.name = nameEl?.textContent?.trim() || 'Prospect';
    state.prospectInfo.email = emailEl?.value || emailEl?.textContent?.trim() || '';
    state.prospectInfo.company = companyEl?.textContent?.trim() || '';
  }

  // ─── Call Lifecycle ───────────────────────────────────────────────────────────

  function onCallStart() {
    state.callActive = true;
    state.callStartTime = new Date().toISOString();
    state.transcriptLines = [];
    state.activeObjections = [];
    state.talkSegments = [];
    state.draftId = null;

    if (state.aiCoach) state.aiCoach.reset();
    extractProspectInfo();

    showOverlay();
    startTimer();
    updateStatusDot(true);
    setProspectLabel(state.prospectInfo.name);

    if (state.demoMode) {
      startDemoMode();
    } else {
      startRealTranscription();
    }

    console.info('[SDR Copilot] Call started');
  }

  async function onCallEnd() {
    state.callActive = false;
    state.callEndTime = new Date().toISOString();

    stopTimer();
    stopTranscription();
    updateStatusDot(false);

    const durationMs = state.callStartTime
      ? Date.now() - new Date(state.callStartTime).getTime()
      : 0;
    const durationSeconds = Math.round(durationMs / 1000);

    const fullTranscript = state.transcriptLines.map(l => l.text).join(' ');
    const objectionIds = state.activeObjections.map(o => o.id);
    const followUps = AICoach.suggestFollowUps(fullTranscript);

    const callRecord = {
      startTime: state.callStartTime,
      endTime: state.callEndTime,
      durationSeconds,
      prospectName: state.prospectInfo.name,
      prospectEmail: state.prospectInfo.email,
      companyName: state.prospectInfo.company,
      transcript: fullTranscript,
      objections: objectionIds,
      followUps,
      talkSegments: state.talkSegments
    };

    // Save to local history
    chrome.runtime.sendMessage({ type: 'SAVE_CALL_RECORD', payload: callRecord });

    // Show post-call panel in overlay
    showPostCallPanel(callRecord, followUps);

    // Auto-sync to Gmail + Salesforce if connected
    if (!state.demoMode && state.settings.googleConnected) {
      autoCreateDraft(callRecord);
    }
    if (!state.demoMode && state.settings.salesforceConnected) {
      autoSyncSalesforce(callRecord);
    }

    console.info('[SDR Copilot] Call ended — duration:', durationSeconds, 's');
  }

  // ─── Transcription ────────────────────────────────────────────────────────────

  async function startRealTranscription() {
    try {
      // Request tab audio stream ID from service worker
      const resp = await new Promise(resolve =>
        chrome.runtime.sendMessage({ type: 'CAPTURE_TAB_AUDIO' }, resolve)
      );

      if (!resp?.ok || !resp.streamId) {
        console.warn('[SDR Copilot] Tab capture unavailable:', resp?.error);
        startDemoMode();
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: resp.streamId
          }
        }
      });

      state.audioStream = stream;
      state.recording = true;

      const client = new DeepgramClient();
      state.deepgramClient = client;

      client.onTranscript = ({ transcript, isFinal, speechStarted, utteranceEnd, speaker }) => {
        if (speechStarted) {
          trackSpeechStart(speaker || 'prospect');
          return;
        }
        if (utteranceEnd) {
          trackSpeechEnd();
          return;
        }
        if (transcript) {
          const spk = speaker || 'prospect';
          trackSpeechStart(spk);
          handleTranscriptChunk(transcript, isFinal, spk);
          if (isFinal) trackSpeechEnd();
        }
      };

      client.onError = (msg) => {
        console.error('[SDR Copilot] Deepgram error:', msg);
        appendTranscriptLine('⚠ Transcription error — reconnecting…', 'system');
      };

      client.onClose = ({ code }) => {
        if (code !== 1000 && state.callActive) {
          appendTranscriptLine('⚠ Connection lost — reconnecting…', 'system');
        }
      };

      client.start(state.settings.deepgramApiKey, stream);
    } catch (err) {
      console.warn('[SDR Copilot] Transcription start failed:', err);
      startDemoMode();
    }
  }

  function stopTranscription() {
    // Clear demo timers
    _demoTimers.forEach(t => clearTimeout(t));
    _demoTimers = [];

    if (state.deepgramClient) {
      state.deepgramClient.stop();
      state.deepgramClient = null;
    }
    if (state.audioStream) {
      state.audioStream.getTracks().forEach(t => t.stop());
      state.audioStream = null;
    }
    state.recording = false;
  }

  // ─── Demo Mode ────────────────────────────────────────────────────────────────

  const DEMO_SCRIPT = [
    { delay: 2000,  speaker: 'prospect', text: 'Hey, how are you doing today?' },
    { delay: 4000,  speaker: 'you',      text: "I'm doing great, thanks for taking the call! I wanted to show you what we've been building." },
    { delay: 7000,  speaker: 'prospect', text: "Sure, I have about 15 minutes. What's this about?" },
    { delay: 10000, speaker: 'you',      text: "We help sales teams like yours increase connect rates by 3x using AI-powered dialing." },
    { delay: 14000, speaker: 'prospect', text: "That sounds interesting but honestly we're pretty happy with what we have right now." },
    { delay: 18000, speaker: 'you',      text: "I hear you — what does your current outreach stack look like?" },
    { delay: 21000, speaker: 'prospect', text: "We're using a combination of tools. The main thing is pricing — it's always too expensive with these platforms." },
    { delay: 25000, speaker: 'you',      text: "Totally understand. When we talk about cost, what does it cost you today NOT having this in place?" },
    { delay: 29000, speaker: 'prospect', text: "Hmm, I hadn't thought of it that way. I'd need to run this by my manager and probably the VP of Sales." },
    { delay: 33000, speaker: 'you',      text: "Makes complete sense. What if I put together a one-pager you could share internally?" },
    { delay: 37000, speaker: 'prospect', text: "Yeah that would actually be helpful. Budget approvals are tough right now but maybe next quarter." },
    { delay: 41000, speaker: 'you',      text: "Perfect — I'll send that over. When does Q4 budget planning typically kick off for you?" }
  ];

  let _demoTimers = [];

  function startDemoMode() {
    _demoTimers.forEach(t => clearTimeout(t));
    _demoTimers = [];

    appendTranscriptLine('🎭 Demo mode — live data would appear here', 'system');

    DEMO_SCRIPT.forEach(({ delay, speaker, text }) => {
      const t = setTimeout(() => {
        if (state.callActive) {
          handleTranscriptChunk(text, true, speaker);
        }
      }, delay);
      _demoTimers.push(t);
    });
  }

  // ─── Transcript Handling ──────────────────────────────────────────────────────

  function handleTranscriptChunk(text, isFinal, speaker) {
    if (!isFinal) {
      updateInterimLine(text, speaker);
      return;
    }

    appendTranscriptLine(text, speaker);

    // Run AI analysis only on prospect speech
    if (speaker === 'prospect' && state.aiCoach) {
      const { newObjections, activeSuggestions } = state.aiCoach.analyze(text, speaker);
      state.activeObjections = activeSuggestions;

      if (newObjections.length > 0) {
        newObjections.forEach(obj => renderObjectionCard(obj));
      }
      renderSuggestions(activeSuggestions);
    }
  }

  function appendTranscriptLine(text, speaker) {
    if (!text.trim()) return;

    const entry = { text, speaker, ts: Date.now() };
    state.transcriptLines.push(entry);

    if (!state.transcriptEl) return;

    // Remove interim line if present
    const interimEl = state.transcriptEl.querySelector('.sdrc-transcript-interim');
    if (interimEl) interimEl.remove();

    const line = document.createElement('div');
    line.className = `sdrc-transcript-line sdrc-speaker-${speaker}`;
    line.innerHTML = `
      <span class="sdrc-speaker-badge">${getSpeakerLabel(speaker)}</span>
      <span class="sdrc-transcript-text">${escapeHTML(text)}</span>
    `;
    state.transcriptEl.appendChild(line);

    // Auto-scroll, keep last 50 lines visible
    const lines = state.transcriptEl.querySelectorAll('.sdrc-transcript-line');
    if (lines.length > 50) lines[0].remove();
    state.transcriptEl.scrollTop = state.transcriptEl.scrollHeight;
  }

  function updateInterimLine(text, speaker) {
    if (!state.transcriptEl) return;
    let interimEl = state.transcriptEl.querySelector('.sdrc-transcript-interim');
    if (!interimEl) {
      interimEl = document.createElement('div');
      interimEl.className = `sdrc-transcript-line sdrc-transcript-interim sdrc-speaker-${speaker}`;
      state.transcriptEl.appendChild(interimEl);
    }
    interimEl.innerHTML = `
      <span class="sdrc-speaker-badge">${getSpeakerLabel(speaker)}</span>
      <span class="sdrc-transcript-text sdrc-interim">${escapeHTML(text)}</span>
    `;
    state.transcriptEl.scrollTop = state.transcriptEl.scrollHeight;
  }

  function getSpeakerLabel(speaker) {
    if (speaker === 'you') return 'You';
    if (speaker === 'prospect') return state.prospectInfo.name || 'Prospect';
    return 'System';
  }

  // ─── Talk-time Tracking ───────────────────────────────────────────────────────

  function trackSpeechStart(speaker) {
    state.speechStartTs = Date.now();
    state.currentSpeaker = speaker;
  }

  function trackSpeechEnd() {
    if (state.speechStartTs) {
      const durationMs = Date.now() - state.speechStartTs;
      state.talkSegments.push({ speaker: state.currentSpeaker, durationMs });
      state.speechStartTs = null;
    }
  }

  // ─── Overlay DOM ──────────────────────────────────────────────────────────────

  function buildOverlayDOM() {
    if (document.getElementById('sdrc-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'sdrc-overlay';
    overlay.className = 'sdrc-overlay sdrc-hidden';

    overlay.innerHTML = `
      <div class="sdrc-header">
        <div class="sdrc-header-left">
          <span class="sdrc-status-dot" id="sdrc-status-dot"></span>
          <span class="sdrc-title">SDR Copilot</span>
          <span class="sdrc-prospect-name" id="sdrc-prospect-name"></span>
        </div>
        <div class="sdrc-header-right">
          <span class="sdrc-timer" id="sdrc-timer">00:00</span>
          <button class="sdrc-btn-icon" id="sdrc-minimize-btn" title="Minimize">−</button>
          <button class="sdrc-btn-icon" id="sdrc-close-btn" title="Hide overlay">×</button>
        </div>
      </div>

      <div class="sdrc-body" id="sdrc-body">
        <!-- Transcript Panel -->
        <div class="sdrc-panel sdrc-panel-transcript">
          <div class="sdrc-panel-header">
            <span class="sdrc-panel-title">Live Transcript</span>
            <span class="sdrc-talk-time-bar" id="sdrc-talk-time-bar">
              <span class="sdrc-talktime-you" id="sdrc-talktime-you" style="width:50%"></span>
              <span class="sdrc-talktime-prospect" id="sdrc-talktime-prospect" style="width:50%"></span>
            </span>
          </div>
          <div class="sdrc-transcript" id="sdrc-transcript"></div>
        </div>

        <!-- Objections Panel -->
        <div class="sdrc-panel sdrc-panel-objections" id="sdrc-objections-panel">
          <div class="sdrc-panel-header">
            <span class="sdrc-panel-title">Objections Detected</span>
          </div>
          <div class="sdrc-objections" id="sdrc-objections"></div>
        </div>

        <!-- Suggestions Panel -->
        <div class="sdrc-panel sdrc-panel-suggestions" id="sdrc-suggestions-panel">
          <div class="sdrc-panel-header">
            <span class="sdrc-panel-title">Talk Tracks</span>
          </div>
          <div class="sdrc-suggestions" id="sdrc-suggestions"></div>
        </div>

        <!-- Post-call Panel (hidden until call ends) -->
        <div class="sdrc-panel sdrc-panel-postcall sdrc-hidden" id="sdrc-postcall-panel">
          <div class="sdrc-panel-header">
            <span class="sdrc-panel-title">Call Complete</span>
          </div>
          <div class="sdrc-postcall-content" id="sdrc-postcall-content"></div>
        </div>
      </div>

      <div class="sdrc-footer">
        <button class="sdrc-btn sdrc-btn-ghost" id="sdrc-audit-btn">PDM Audit</button>
        <button class="sdrc-btn sdrc-btn-ghost" id="sdrc-dashboard-btn">Dashboard</button>
        <button class="sdrc-btn sdrc-btn-primary" id="sdrc-draft-btn">Draft Email</button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Cache element refs
    state.overlayEl     = overlay;
    state.transcriptEl  = overlay.querySelector('#sdrc-transcript');
    state.objectionsEl  = overlay.querySelector('#sdrc-objections');
    state.suggestionsEl = overlay.querySelector('#sdrc-suggestions');
    state.statusDotEl   = overlay.querySelector('#sdrc-status-dot');

    // Wire up controls
    overlay.querySelector('#sdrc-minimize-btn').addEventListener('click', toggleMinimize);
    overlay.querySelector('#sdrc-close-btn').addEventListener('click', hideOverlay);
    overlay.querySelector('#sdrc-dashboard-btn').addEventListener('click', openDashboard);
    overlay.querySelector('#sdrc-draft-btn').addEventListener('click', triggerDraftEmail);
    overlay.querySelector('#sdrc-audit-btn').addEventListener('click', triggerAudit);

    // Drag to reposition
    makeDraggable(overlay);
  }

  function showOverlay() {
    if (!state.overlayEl) buildOverlayDOM();
    state.overlayEl.classList.remove('sdrc-hidden');
    state.overlayEl.classList.remove('sdrc-minimized');
    state.overlayVisible = true;
  }

  function hideOverlay() {
    if (!state.overlayEl) return;
    state.overlayEl.classList.add('sdrc-hidden');
    state.overlayVisible = false;
  }

  function toggleMinimize() {
    if (!state.overlayEl) return;
    state.overlayEl.classList.toggle('sdrc-minimized');
    const btn = state.overlayEl.querySelector('#sdrc-minimize-btn');
    if (btn) {
      btn.textContent = state.overlayEl.classList.contains('sdrc-minimized') ? '+' : '−';
    }
  }

  function updateStatusDot(active) {
    if (!state.statusDotEl) return;
    state.statusDotEl.className = `sdrc-status-dot ${active ? 'sdrc-recording' : ''}`;
  }

  function setProspectLabel(name) {
    const el = state.overlayEl?.querySelector('#sdrc-prospect-name');
    if (el) el.textContent = name ? `— ${name}` : '';
  }

  // ─── Timer ────────────────────────────────────────────────────────────────────

  function startTimer() {
    stopTimer();
    const startMs = Date.now();
    const timerEl = state.overlayEl?.querySelector('#sdrc-timer');

    state.timerInterval = setInterval(() => {
      const elapsed = Date.now() - startMs;
      const mm = String(Math.floor(elapsed / 60000)).padStart(2, '0');
      const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mm}:${ss}`;

      // Update talk-time bar
      updateTalkTimeBar();
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function updateTalkTimeBar() {
    const { youPct, prospectPct } = AICoach.calcTalkTime(state.talkSegments);
    const youEl = state.overlayEl?.querySelector('#sdrc-talktime-you');
    const proEl = state.overlayEl?.querySelector('#sdrc-talktime-prospect');
    if (youEl) youEl.style.width = `${youPct}%`;
    if (proEl) proEl.style.width = `${prospectPct}%`;
  }

  // ─── Objection Cards ──────────────────────────────────────────────────────────

  function renderObjectionCard(objection) {
    if (!state.objectionsEl) return;

    // Show the panel
    const panel = state.overlayEl?.querySelector('#sdrc-objections-panel');
    if (panel) panel.classList.remove('sdrc-hidden');

    const existing = state.objectionsEl.querySelector(`[data-obj-id="${objection.id}"]`);
    if (existing) return;

    const card = document.createElement('div');
    card.className = 'sdrc-objection-card';
    card.setAttribute('data-obj-id', objection.id);
    card.style.setProperty('--obj-color', objection.color);

    card.innerHTML = `
      <div class="sdrc-obj-header">
        <span class="sdrc-obj-emoji">${objection.emoji}</span>
        <span class="sdrc-obj-label">${escapeHTML(objection.label)}</span>
        <button class="sdrc-obj-dismiss" data-obj-id="${objection.id}" title="Dismiss">×</button>
      </div>
    `;

    card.querySelector('.sdrc-obj-dismiss').addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-obj-id');
      if (state.aiCoach) state.aiCoach.dismiss(id);
      card.remove();
      renderSuggestions(state.aiCoach?.getActiveObjections() || []);
    });

    state.objectionsEl.appendChild(card);

    // Pulse animation
    requestAnimationFrame(() => card.classList.add('sdrc-obj-visible'));
  }

  function renderSuggestions(activeObjections) {
    if (!state.suggestionsEl) return;

    if (activeObjections.length === 0) {
      state.suggestionsEl.innerHTML = '<p class="sdrc-no-suggestions">No objections detected yet.</p>';
      return;
    }

    const panel = state.overlayEl?.querySelector('#sdrc-suggestions-panel');
    if (panel) panel.classList.remove('sdrc-hidden');

    // Show suggestions from the most recently detected objection
    const latest = activeObjections[activeObjections.length - 1];
    const suggestions = latest.suggestions || [];

    state.suggestionsEl.innerHTML = '';
    suggestions.forEach((text) => {
      const chip = document.createElement('div');
      chip.className = 'sdrc-suggestion-chip';
      chip.textContent = text;
      chip.title = 'Click to copy';
      chip.addEventListener('click', () => {
        navigator.clipboard.writeText(text).catch(() => {});
        chip.classList.add('sdrc-chip-copied');
        chip.textContent = '✓ Copied!';
        setTimeout(() => {
          chip.classList.remove('sdrc-chip-copied');
          chip.textContent = text;
        }, 1500);
      });
      state.suggestionsEl.appendChild(chip);
    });
  }

  // ─── Post-call Panel ──────────────────────────────────────────────────────────

  function showPostCallPanel(callRecord, followUps) {
    const panel = state.overlayEl?.querySelector('#sdrc-postcall-panel');
    const content = state.overlayEl?.querySelector('#sdrc-postcall-content');
    if (!panel || !content) return;

    const durationMin = Math.round(callRecord.durationSeconds / 60);
    const talkTime = AICoach.calcTalkTime(state.talkSegments);
    const objLabels = (callRecord.objections || []).map(id => {
      const o = window.OBJECTIONS?.find(x => x.id === id);
      return o ? `${o.emoji} ${o.label}` : id;
    });

    content.innerHTML = `
      <div class="sdrc-postcall-stats">
        <div class="sdrc-postcall-stat">
          <span class="sdrc-stat-val">${durationMin}m</span>
          <span class="sdrc-stat-lbl">Duration</span>
        </div>
        <div class="sdrc-postcall-stat">
          <span class="sdrc-stat-val">${talkTime.youPct}%</span>
          <span class="sdrc-stat-lbl">You talked</span>
        </div>
        <div class="sdrc-postcall-stat">
          <span class="sdrc-stat-val">${callRecord.objections?.length || 0}</span>
          <span class="sdrc-stat-lbl">Objections</span>
        </div>
      </div>

      ${objLabels.length > 0 ? `
      <div class="sdrc-postcall-section">
        <div class="sdrc-postcall-label">Objections heard</div>
        <div class="sdrc-tag-list">${objLabels.map(l => `<span class="sdrc-tag">${escapeHTML(l)}</span>`).join('')}</div>
      </div>` : ''}

      ${followUps.length > 0 ? `
      <div class="sdrc-postcall-section">
        <div class="sdrc-postcall-label">Suggested follow-ups</div>
        <ul class="sdrc-followup-list">
          ${followUps.map(f => `<li>${escapeHTML(f)}</li>`).join('')}
        </ul>
      </div>` : ''}

      <div class="sdrc-postcall-actions">
        <button class="sdrc-btn sdrc-btn-primary sdrc-full-width" id="sdrc-create-draft-btn">
          ✉ Create Gmail Draft
        </button>
        <button class="sdrc-btn sdrc-btn-ghost sdrc-full-width" id="sdrc-sync-sf-btn">
          ☁ Sync to Salesforce
        </button>
      </div>
      <div class="sdrc-postcall-status" id="sdrc-postcall-status"></div>
    `;

    panel.classList.remove('sdrc-hidden');

    // Wire buttons
    content.querySelector('#sdrc-create-draft-btn')?.addEventListener('click', () => triggerDraftEmail(callRecord));
    content.querySelector('#sdrc-sync-sf-btn')?.addEventListener('click', () => triggerSalesforceSyncUI(callRecord));
  }

  // ─── Post-call Automations ────────────────────────────────────────────────────

  async function autoCreateDraft(callRecord) {
    if (!window.GmailDraft) return;
    const result = await GmailDraft.createPostCallDraft(callRecord);
    if (result.ok) state.draftId = result.draftId;
  }

  async function autoSyncSalesforce(callRecord) {
    if (!window.SalesforceConnector) return;
    await SalesforceConnector.syncCallToSalesforce(callRecord);
  }

  async function triggerDraftEmail(callRecord) {
    if (!window.GmailDraft) {
      showStatusMsg('Gmail draft utility not loaded', 'error');
      return;
    }

    const record = callRecord && typeof callRecord === 'object' && callRecord.startTime
      ? callRecord
      : buildCurrentCallRecord();

    const statusEl = state.overlayEl?.querySelector('#sdrc-postcall-status')
      || state.overlayEl?.querySelector('.sdrc-footer');

    if (statusEl) statusEl.textContent = 'Creating draft…';

    const result = await GmailDraft.createPostCallDraft(record);
    if (result.ok) {
      state.draftId = result.draftId;
      if (statusEl) statusEl.innerHTML = '✓ Draft saved to Gmail';
    } else {
      if (statusEl) statusEl.innerHTML = `✗ ${result.error || 'Draft failed'}`;
    }
  }

  async function triggerSalesforceSyncUI(callRecord) {
    if (!window.SalesforceConnector) {
      showStatusMsg('Salesforce connector not loaded', 'error');
      return;
    }

    const record = callRecord || buildCurrentCallRecord();
    const statusEl = state.overlayEl?.querySelector('#sdrc-postcall-status');
    if (statusEl) statusEl.textContent = 'Syncing to Salesforce…';

    const result = await SalesforceConnector.syncCallToSalesforce(record);
    if (result.ok) {
      if (statusEl) statusEl.innerHTML = '✓ Activity logged in Salesforce';
    } else {
      if (statusEl) statusEl.innerHTML = `✗ ${result.error || 'Sync failed'}`;
    }
  }

  function buildCurrentCallRecord() {
    const fullTranscript = state.transcriptLines.map(l => l.text).join(' ');
    return {
      startTime: state.callStartTime,
      endTime: state.callEndTime || new Date().toISOString(),
      durationSeconds: state.callStartTime
        ? Math.round((Date.now() - new Date(state.callStartTime).getTime()) / 1000)
        : 0,
      prospectName: state.prospectInfo.name,
      prospectEmail: state.prospectInfo.email,
      companyName: state.prospectInfo.company,
      transcript: fullTranscript,
      objections: (state.aiCoach?.getActiveObjections() || []).map(o => o.id),
      followUps: AICoach.suggestFollowUps(fullTranscript),
      talkSegments: state.talkSegments
    };
  }

  // ─── Button Handlers ──────────────────────────────────────────────────────────

  function openDashboard() {
    chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
  }

  function triggerAudit() {
    if (window.PDMAudit) {
      const summary = PDMAudit.runAudit();
      if (!summary) {
        showStatusMsg('No contact rows found on this page', 'info');
      }
    }
  }

  // ─── Draggable Overlay ────────────────────────────────────────────────────────

  function makeDraggable(el) {
    const header = el.querySelector('.sdrc-header');
    if (!header) return;

    let startX, startY, startLeft, startTop;

    header.style.cursor = 'move';
    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.left = startLeft + 'px';
      el.style.top = startTop + 'px';

      const onMove = (e2) => {
        el.style.left = (startLeft + e2.clientX - startX) + 'px';
        el.style.top = (startTop + e2.clientY - startY) + 'px';
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ─── Message Handler ──────────────────────────────────────────────────────────

  function onExtensionMessage(message) {
    const { type, payload } = message;
    if (type === 'TOGGLE_OVERLAY') {
      state.overlayVisible ? hideOverlay() : showOverlay();
    } else if (type === 'SETTINGS_UPDATED') {
      state.settings = { ...state.settings, ...payload };
      state.demoMode = !state.settings.deepgramApiKey;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showStatusMsg(msg, type = 'info') {
    const el = state.overlayEl?.querySelector('#sdrc-postcall-status');
    if (el) {
      el.textContent = msg;
      el.className = `sdrc-postcall-status sdrc-status-${type}`;
    }
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

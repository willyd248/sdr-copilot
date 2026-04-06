/**
 * SDR Copilot — Standalone Demo
 *
 * Renders the actual overlay component (same DOM structure + CSS classes
 * as the real Orum injection) and plays through a scripted demo call.
 */

(function () {
  'use strict';

  // ─── Demo Script ──────────────────────────────────────────────────────────────

  const DEMO_SCRIPT = [
    { delay: 1500,  speaker: 'prospect', text: 'Hey, how are you doing today?' },
    { delay: 3800,  speaker: 'you',      text: "Doing great — thanks for taking the call! I'll be quick." },
    { delay: 6500,  speaker: 'prospect', text: "Sure, I have about 15 minutes. What's this about?" },
    { delay: 9500,  speaker: 'you',      text: "We help sales teams like yours increase connect rates by 3x with AI-powered coaching during calls." },
    { delay: 13500, speaker: 'prospect', text: "That sounds interesting but we're pretty happy with what we have right now." },
    { delay: 17000, speaker: 'you',      text: "I hear you — what does your current outreach stack look like?" },
    { delay: 20500, speaker: 'prospect', text: "We're using a few different tools. Honestly the main thing is pricing — it's always too expensive with these platforms." },
    { delay: 25000, speaker: 'you',      text: "Totally fair. When we talk about cost, what does it cost you today NOT having better connect rates?" },
    { delay: 29500, speaker: 'prospect', text: "Hmm, I hadn't thought of it that way. I'd need to run this by my manager and probably the VP of Sales." },
    { delay: 34000, speaker: 'you',      text: "Completely makes sense. What if I put together a one-pager your team could review internally?" },
    { delay: 37500, speaker: 'prospect', text: "Yeah that would actually be helpful. Budget approvals are tough right now but maybe next quarter." },
    { delay: 41500, speaker: 'you',      text: "Perfect — I'll send it over today. When does Q4 budget planning typically kick off for you?" }
  ];

  const DEMO_DURATION_MS = 45000;
  const PROSPECT = { name: 'Sarah Chen', email: 'sarah@acmecorp.com', company: 'Acme Corp' };

  // ─── State ────────────────────────────────────────────────────────────────────

  let timers = [];
  let coach = null;
  let callActive = false;
  let transcriptLines = [];
  let activeObjections = [];
  let talkSegments = [];
  let callStartMs = 0;
  let timerInterval = null;
  let progressInterval = null;

  // ─── DOM refs ─────────────────────────────────────────────────────────────────

  const mount        = document.getElementById('demo-overlay-mount');
  const idleEl       = document.getElementById('overlay-idle');
  const startBtn     = document.getElementById('start-btn');
  const replayBtn    = document.getElementById('replay-btn');
  const statusEl     = document.getElementById('demo-status');
  const orumDot      = document.getElementById('orum-dot');
  const orumLabel    = document.getElementById('orum-call-label');
  const orumTimer    = document.getElementById('orum-timer');
  const orumNotes    = document.getElementById('orum-notes');
  const progressFill = document.getElementById('demo-progress-fill');

  // Cached overlay child elements (set after buildOverlay)
  let overlayEl     = null;
  let transcriptEl  = null;
  let objectionsEl  = null;
  let suggestionsEl = null;
  let statusDotEl   = null;
  let timerEl       = null;

  startBtn.addEventListener('click', startDemo);
  replayBtn.addEventListener('click', replayDemo);

  // ─── Build Overlay DOM ────────────────────────────────────────────────────────
  // Uses the exact same DOM structure and CSS classes as orum-overlay.js
  // so styles from overlay.css apply identically.

  function buildOverlay() {
    mount.innerHTML = '';

    const overlay = document.createElement('div');
    overlay.id = 'sdrc-overlay';

    overlay.innerHTML = `
      <div class="sdrc-header">
        <div class="sdrc-header-left">
          <span class="sdrc-status-dot sdrc-recording" id="sdrc-demo-dot"></span>
          <span class="sdrc-title">SDR Copilot</span>
          <span class="sdrc-demo-mode-badge">DEMO</span>
          <span class="sdrc-prospect-name" id="sdrc-demo-prospect">— ${escapeHTML(PROSPECT.name)}</span>
        </div>
        <div class="sdrc-header-right">
          <span class="sdrc-talk-time-bar" id="sdrc-demo-talkbar">
            <span class="sdrc-talktime-you"      id="sdrc-demo-talktime-you"      style="width:50%"></span>
            <span class="sdrc-talktime-prospect" id="sdrc-demo-talktime-prospect" style="width:50%"></span>
          </span>
          <span class="sdrc-timer" id="sdrc-demo-timer">00:00</span>
          <button class="sdrc-btn-icon" title="Minimize" style="cursor:default;">−</button>
        </div>
      </div>

      <div class="sdrc-body" id="sdrc-demo-body">

        <!-- Live Transcript Panel -->
        <div class="sdrc-panel">
          <div class="sdrc-panel-header">
            <span class="sdrc-panel-title">Live Transcript</span>
          </div>
          <div class="sdrc-transcript" id="sdrc-demo-transcript"></div>
        </div>

        <!-- Objections Panel -->
        <div class="sdrc-panel sdrc-hidden" id="sdrc-demo-obj-panel">
          <div class="sdrc-panel-header">
            <span class="sdrc-panel-title">Objections Detected</span>
          </div>
          <div class="sdrc-objections" id="sdrc-demo-objections"></div>
        </div>

        <!-- Suggestions Panel -->
        <div class="sdrc-panel sdrc-hidden" id="sdrc-demo-sug-panel">
          <div class="sdrc-panel-header">
            <span class="sdrc-panel-title">Talk Tracks</span>
          </div>
          <div class="sdrc-suggestions" id="sdrc-demo-suggestions"></div>
        </div>

        <!-- Post-call Panel (hidden until call ends) -->
        <div class="sdrc-panel sdrc-hidden" id="sdrc-demo-postcall-panel">
          <div class="sdrc-panel-header">
            <span class="sdrc-panel-title">Call Complete</span>
          </div>
          <div class="sdrc-postcall-content" id="sdrc-demo-postcall-content"></div>
        </div>

      </div>

      <div class="sdrc-footer">
        <button class="sdrc-btn sdrc-btn-ghost" style="cursor:default;">PDM Audit</button>
        <button class="sdrc-btn sdrc-btn-ghost" id="sdrc-demo-dash-btn">Dashboard</button>
        <button class="sdrc-btn sdrc-btn-primary" id="sdrc-demo-draft-btn">Draft Email</button>
      </div>
    `;

    mount.appendChild(overlay);

    // Cache refs
    overlayEl     = overlay;
    transcriptEl  = overlay.querySelector('#sdrc-demo-transcript');
    objectionsEl  = overlay.querySelector('#sdrc-demo-objections');
    suggestionsEl = overlay.querySelector('#sdrc-demo-suggestions');
    statusDotEl   = overlay.querySelector('#sdrc-demo-dot');
    timerEl       = overlay.querySelector('#sdrc-demo-timer');

    // Footer buttons
    overlay.querySelector('#sdrc-demo-dash-btn')?.addEventListener('click', openDashboard);
    overlay.querySelector('#sdrc-demo-draft-btn')?.addEventListener('click', () => {
      triggerDraftButtonFeedback(overlay.querySelector('#sdrc-demo-draft-btn'));
    });
  }

  // ─── Start / Reset / Replay ───────────────────────────────────────────────────

  function startDemo() {
    callActive = true;
    callStartMs = Date.now();
    transcriptLines = [];
    activeObjections = [];
    talkSegments = [];
    coach = new AICoach();

    startBtn.style.display = 'none';
    replayBtn.style.display = 'none';
    statusEl.textContent = '';
    statusEl.className = '';

    // Activate Orum simulation
    if (idleEl) idleEl.style.display = 'none';
    if (orumDot) orumDot.style.opacity = '1';
    if (orumLabel) {
      orumLabel.textContent = 'Connected · Sarah Chen';
      orumLabel.style.color = 'var(--success)';
    }
    if (orumNotes) orumNotes.textContent = 'SDR Copilot is active →';

    buildOverlay();
    startTimerTick();
    startProgressBar();

    // Schedule each demo line
    DEMO_SCRIPT.forEach(({ delay, speaker, text }) => {
      const t = setTimeout(() => {
        if (!callActive) return;
        addTranscriptLine(text, speaker);
        talkSegments.push({ speaker, durationMs: 3200 });
        updateTalkBar();

        if (speaker === 'prospect' && coach) {
          const { newObjections, activeSuggestions } = coach.analyze(text, speaker);
          activeObjections = activeSuggestions;
          newObjections.forEach(obj => showObjectionCard(obj));
          showSuggestions(activeSuggestions);
        }

        // Update Orum notes with latest you-speaker line
        if (speaker === 'you' && orumNotes) {
          orumNotes.textContent = `"${text.substring(0, 70)}${text.length > 70 ? '…' : ''}"`;
        }
      }, delay);
      timers.push(t);
    });

    // End call after script finishes
    const endTimer = setTimeout(() => endDemo(), DEMO_DURATION_MS);
    timers.push(endTimer);
  }

  function endDemo() {
    callActive = false;
    stopTimerTick();
    stopProgressBar(true);

    // Update Orum UI
    if (orumDot) orumDot.style.opacity = '0';
    if (orumLabel) {
      orumLabel.textContent = 'Call ended';
      orumLabel.style.color = 'var(--text-3)';
    }
    if (orumNotes) orumNotes.textContent = 'Follow-up drafted. Activity logged.';

    // Update recording dot
    if (statusDotEl) {
      statusDotEl.classList.remove('sdrc-recording');
    }

    // Build post-call panel
    showPostCallPanel();

    // Save to call history
    const durationSecs = Math.round((Date.now() - callStartMs) / 1000);
    const callRecord = {
      startTime: new Date(callStartMs).toISOString(),
      endTime: new Date().toISOString(),
      durationSeconds: durationSecs,
      prospectName: PROSPECT.name,
      prospectEmail: PROSPECT.email,
      companyName: PROSPECT.company,
      transcript: transcriptLines.map(l => l.text).join(' '),
      objections: activeObjections.map(o => o.id),
      followUps: ['Send one-pager to Sarah', 'Schedule discovery call with VP of Sales', 'Confirm Q4 budget timeline'],
      talkSegments,
      outcome: 'connected'
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'SAVE_CALL_RECORD', payload: callRecord })
        .catch(() => {}); // graceful failure if SW not running
    }

    statusEl.textContent = '✓ Demo complete — check the dashboard for recorded data';
    statusEl.className = 'done';
    replayBtn.style.display = 'inline-flex';
  }

  function replayDemo() {
    timers.forEach(t => clearTimeout(t));
    timers = [];
    stopTimerTick();
    stopProgressBar(false);

    // Reset Orum simulation
    if (idleEl) idleEl.style.display = 'flex';
    if (orumDot) orumDot.style.opacity = '0';
    if (orumLabel) {
      orumLabel.textContent = 'Waiting for call…';
      orumLabel.style.color = 'var(--text-3)';
    }
    if (orumNotes) orumNotes.textContent = 'SDR Copilot is capturing your call in real-time →';
    if (orumTimer) orumTimer.textContent = '';

    // Clear overlay
    mount.innerHTML = '';
    overlayEl = transcriptEl = objectionsEl = suggestionsEl = statusDotEl = timerEl = null;

    statusEl.textContent = '';
    statusEl.className = '';
    replayBtn.style.display = 'none';
    startBtn.style.display = 'inline-flex';
  }

  // ─── Transcript ───────────────────────────────────────────────────────────────

  function addTranscriptLine(text, speaker) {
    if (!text.trim()) return;
    transcriptLines.push({ text, speaker, ts: Date.now() });
    if (!transcriptEl) return;

    const line = document.createElement('div');
    line.className = `sdrc-transcript-line sdrc-speaker-${speaker}`;
    line.innerHTML = `
      <span class="sdrc-speaker-badge">${getSpeakerLabel(speaker)}</span>
      <span class="sdrc-transcript-text">${escapeHTML(text)}</span>
    `;
    transcriptEl.appendChild(line);

    // Keep last 50 lines
    const lines = transcriptEl.querySelectorAll('.sdrc-transcript-line');
    if (lines.length > 50) lines[0].remove();
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  function getSpeakerLabel(speaker) {
    if (speaker === 'you') return 'You';
    if (speaker === 'prospect') return PROSPECT.name;
    return 'System';
  }

  // ─── Objection Cards ──────────────────────────────────────────────────────────

  function showObjectionCard(obj) {
    if (!objectionsEl) return;

    // Show panel
    const panel = document.getElementById('sdrc-demo-obj-panel');
    if (panel) panel.classList.remove('sdrc-hidden');

    // Don't re-add if already shown
    if (objectionsEl.querySelector(`[data-obj-id="${obj.id}"]`)) return;

    const card = document.createElement('div');
    card.className = 'sdrc-objection-card';
    card.setAttribute('data-obj-id', obj.id);
    card.style.setProperty('--obj-color', obj.color);

    card.innerHTML = `
      <div class="sdrc-obj-header">
        <span class="sdrc-obj-emoji">${obj.emoji}</span>
        <span class="sdrc-obj-label">${escapeHTML(obj.label)}</span>
        <button class="sdrc-obj-dismiss" title="Dismiss">×</button>
      </div>
    `;

    card.querySelector('.sdrc-obj-dismiss').addEventListener('click', () => {
      if (coach) coach.dismiss(obj.id);
      card.remove();
      showSuggestions(coach?.getActiveObjections() || []);
    });

    objectionsEl.appendChild(card);
    requestAnimationFrame(() => card.classList.add('sdrc-obj-visible'));
  }

  // ─── Suggestions ─────────────────────────────────────────────────────────────

  function showSuggestions(active) {
    if (!suggestionsEl) return;

    if (active.length === 0) {
      const panel = document.getElementById('sdrc-demo-sug-panel');
      if (panel) panel.classList.add('sdrc-hidden');
      return;
    }

    const panel = document.getElementById('sdrc-demo-sug-panel');
    if (panel) panel.classList.remove('sdrc-hidden');

    const latest = active[active.length - 1];
    const suggestions = latest.suggestions || [];

    suggestionsEl.innerHTML = '';
    suggestions.forEach(text => {
      const chip = document.createElement('div');
      chip.className = 'sdrc-suggestion-chip';
      chip.textContent = text;
      chip.title = 'Click to copy';
      chip.addEventListener('click', () => {
        navigator.clipboard.writeText(text).catch(() => {});
        chip.classList.add('sdrc-chip-copied');
        const orig = chip.textContent;
        chip.textContent = '✓ Copied!';
        setTimeout(() => {
          chip.classList.remove('sdrc-chip-copied');
          chip.textContent = orig;
        }, 1500);
      });
      suggestionsEl.appendChild(chip);
    });
  }

  // ─── Talk-time Bar ────────────────────────────────────────────────────────────

  function updateTalkBar() {
    let youMs = 0, proMs = 0;
    talkSegments.forEach(s => {
      if (s.speaker === 'you') youMs += s.durationMs;
      else proMs += s.durationMs;
    });
    const total = youMs + proMs || 1;
    const youPct = Math.round((youMs / total) * 100);
    const proPct = 100 - youPct;

    const youBar = document.getElementById('sdrc-demo-talktime-you');
    const proBar = document.getElementById('sdrc-demo-talktime-prospect');
    if (youBar) youBar.style.width = youPct + '%';
    if (proBar) proBar.style.width = proPct + '%';
  }

  // ─── Post-call Panel ──────────────────────────────────────────────────────────

  function showPostCallPanel() {
    const panel = document.getElementById('sdrc-demo-postcall-panel');
    const content = document.getElementById('sdrc-demo-postcall-content');
    if (!panel || !content) return;

    const durationSecs = Math.round((Date.now() - callStartMs) / 1000);
    const durationMin = Math.floor(durationSecs / 60);
    const durationS = durationSecs % 60;
    const durationLabel = `${durationMin}:${String(durationS).padStart(2, '0')}`;

    let youMs = 0, proMs = 0;
    talkSegments.forEach(s => {
      if (s.speaker === 'you') youMs += s.durationMs;
      else proMs += s.durationMs;
    });
    const total = youMs + proMs || 1;
    const youPct = Math.round((youMs / total) * 100);

    const objLabels = activeObjections.map(o => `${o.emoji} ${o.label}`);

    const followUps = [
      'Send one-pager to Sarah',
      'Schedule discovery call with VP of Sales',
      'Confirm Q4 budget planning timeline'
    ];

    content.innerHTML = `
      <div class="sdrc-postcall-stats">
        <div class="sdrc-postcall-stat">
          <span class="sdrc-stat-val">${durationLabel}</span>
          <span class="sdrc-stat-lbl">Duration</span>
        </div>
        <div class="sdrc-postcall-stat">
          <span class="sdrc-stat-val">${youPct}%</span>
          <span class="sdrc-stat-lbl">You talked</span>
        </div>
        <div class="sdrc-postcall-stat">
          <span class="sdrc-stat-val">${activeObjections.length}</span>
          <span class="sdrc-stat-lbl">Objections</span>
        </div>
      </div>

      ${objLabels.length > 0 ? `
      <div class="sdrc-postcall-section">
        <div class="sdrc-postcall-label">Objections heard</div>
        <div class="sdrc-tag-list">
          ${objLabels.map(l => `<span class="sdrc-tag">${escapeHTML(l)}</span>`).join('')}
        </div>
      </div>` : ''}

      <div class="sdrc-postcall-section">
        <div class="sdrc-postcall-label">Suggested follow-ups</div>
        <ul class="sdrc-followup-list">
          ${followUps.map(f => `<li>${escapeHTML(f)}</li>`).join('')}
        </ul>
      </div>

      <div class="sdrc-postcall-actions">
        <button class="sdrc-btn sdrc-btn-primary sdrc-full-width" id="sdrc-demo-draft-postcall">
          ✉ Create Gmail Draft
        </button>
        <button class="sdrc-btn sdrc-btn-ghost sdrc-full-width" id="sdrc-demo-sf-postcall">
          ☁ Sync to Salesforce
        </button>
      </div>
      <div class="sdrc-postcall-status" id="sdrc-demo-postcall-status"></div>
    `;

    panel.classList.remove('sdrc-hidden');

    // Scroll to post-call panel
    const body = document.getElementById('sdrc-demo-body');
    if (body) setTimeout(() => { body.scrollTop = body.scrollHeight; }, 100);

    // Wire buttons (demo — show feedback without real API call)
    content.querySelector('#sdrc-demo-draft-postcall')?.addEventListener('click', () => {
      showDemoActionFeedback('sdrc-demo-postcall-status', '✓ Draft created in Gmail — check Drafts folder', 'success');
    });

    content.querySelector('#sdrc-demo-sf-postcall')?.addEventListener('click', () => {
      showDemoActionFeedback('sdrc-demo-postcall-status', '✓ Activity logged as Task in Salesforce', 'success');
    });
  }

  function showDemoActionFeedback(statusId, msg, type) {
    const el = document.getElementById(statusId);
    if (!el) return;
    el.textContent = msg;
    el.className = `sdrc-postcall-status sdrc-status-${type}`;
  }

  function triggerDraftButtonFeedback(btn) {
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = '✓ Draft Created';
    btn.style.background = '#22c55e';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.background = '';
    }, 2000);
  }

  // ─── Timer ────────────────────────────────────────────────────────────────────

  function startTimerTick() {
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - callStartMs;
      const mm = String(Math.floor(elapsed / 60000)).padStart(2, '0');
      const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
      const label = `${mm}:${ss}`;
      if (timerEl) timerEl.textContent = label;
      if (orumTimer) orumTimer.textContent = label;
    }, 1000);
  }

  function stopTimerTick() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // ─── Progress Bar ─────────────────────────────────────────────────────────────

  function startProgressBar() {
    const start = Date.now();
    progressFill.style.width = '0%';
    progressInterval = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / DEMO_DURATION_MS) * 100);
      progressFill.style.width = pct + '%';
    }, 200);
  }

  function stopProgressBar(complete) {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    progressFill.style.transition = 'none';
    progressFill.style.width = complete ? '100%' : '0%';
    setTimeout(() => { progressFill.style.transition = ''; }, 50);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function openDashboard() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' }).catch(() => {});
    }
  }

})();

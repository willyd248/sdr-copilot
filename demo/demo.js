/**
 * SDR Copilot — Standalone Demo
 *
 * Runs the full demo conversation with objection detection
 * without needing an Orum tab or content script injection.
 */

(function () {
  'use strict';

  const DEMO_SCRIPT = [
    { delay: 1500,  speaker: 'prospect', text: 'Hey, how are you doing today?' },
    { delay: 3500,  speaker: 'you',      text: "I'm doing great, thanks for taking the call! I wanted to show you what we've been building." },
    { delay: 6000,  speaker: 'prospect', text: "Sure, I have about 15 minutes. What's this about?" },
    { delay: 9000,  speaker: 'you',      text: "We help sales teams like yours increase connect rates by 3x using AI-powered dialing." },
    { delay: 12500, speaker: 'prospect', text: "That sounds interesting but honestly we're pretty happy with what we have right now." },
    { delay: 16000, speaker: 'you',      text: "I hear you — what does your current outreach stack look like?" },
    { delay: 19000, speaker: 'prospect', text: "We're using a combination of tools. The main thing is pricing — it's always too expensive with these platforms." },
    { delay: 23000, speaker: 'you',      text: "Totally understand. When we talk about cost, what does it cost you today NOT having this in place?" },
    { delay: 27000, speaker: 'prospect', text: "Hmm, I hadn't thought of it that way. I'd need to run this by my manager and probably the VP of Sales." },
    { delay: 31000, speaker: 'you',      text: "Makes complete sense. What if I put together a one-pager you could share internally?" },
    { delay: 35000, speaker: 'prospect', text: "Yeah that would actually be helpful. Budget approvals are tough right now but maybe next quarter." },
    { delay: 39000, speaker: 'you',      text: "Perfect — I'll send that over. When does Q4 budget planning typically kick off for you?" }
  ];

  let timers = [];
  let coach = null;
  let callActive = false;
  let transcriptLines = [];
  let activeObjections = [];
  let talkSegments = [];
  let callStartMs = 0;
  let timerInterval = null;

  const container = document.getElementById('demo-overlay-container');
  const startBtn = document.getElementById('start-demo-btn');
  const resetBtn = document.getElementById('reset-demo-btn');
  const statusEl = document.getElementById('demo-status');
  const dotEl = document.getElementById('demo-dot');

  startBtn.addEventListener('click', startDemo);
  resetBtn.addEventListener('click', resetDemo);

  function startDemo() {
    callActive = true;
    callStartMs = Date.now();
    transcriptLines = [];
    activeObjections = [];
    talkSegments = [];
    coach = new AICoach();

    startBtn.style.display = 'none';
    resetBtn.style.display = 'inline-block';
    dotEl.style.display = 'block';
    statusEl.textContent = '';

    buildOverlay();
    startTimerTick();

    DEMO_SCRIPT.forEach(({ delay, speaker, text }) => {
      const t = setTimeout(() => {
        if (!callActive) return;
        addTranscriptLine(text, speaker);

        // Track talk time
        talkSegments.push({ speaker, durationMs: 3000 });

        // Run objection detection on prospect speech
        if (speaker === 'prospect' && coach) {
          const { newObjections, activeSuggestions } = coach.analyze(text, speaker);
          activeObjections = activeSuggestions;
          newObjections.forEach(obj => showObjection(obj));
          showSuggestions(activeSuggestions);
        }

        updateTalkBar();
      }, delay);
      timers.push(t);
    });

    // End call after script finishes
    const endTimer = setTimeout(() => endDemo(), 43000);
    timers.push(endTimer);
  }

  function endDemo() {
    callActive = false;
    dotEl.style.display = 'none';
    stopTimerTick();

    statusEl.textContent = 'Demo call complete. Check the dashboard for recorded data.';

    // Save to call history
    const durationSecs = Math.round((Date.now() - callStartMs) / 1000);
    const callRecord = {
      startTime: new Date(callStartMs).toISOString(),
      endTime: new Date().toISOString(),
      durationSeconds: durationSecs,
      prospectName: 'Sarah Chen',
      prospectEmail: 'sarah@acmecorp.com',
      companyName: 'Acme Corp',
      transcript: transcriptLines.map(l => l.text).join(' '),
      objections: activeObjections.map(o => o.id),
      followUps: ['Send deck', 'Schedule demo', 'Share one-pager internally'],
      talkSegments,
      outcome: 'connected'
    };

    chrome.runtime.sendMessage({ type: 'SAVE_CALL_RECORD', payload: callRecord });

    // Show post-call summary
    const summaryEl = document.createElement('div');
    summaryEl.style.cssText = 'margin-top:16px;padding:12px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:8px;font-size:12px;color:#10B981;';
    summaryEl.innerHTML = `
      <strong>Call saved!</strong> ${durationSecs}s duration, ${activeObjections.length} objections detected.
      <br>Open the <a href="#" id="demo-dashboard-link" style="color:#10B981;font-weight:600;">Dashboard</a> to review.
    `;
    container.appendChild(summaryEl);

    summaryEl.querySelector('#demo-dashboard-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
    });
  }

  function resetDemo() {
    timers.forEach(t => clearTimeout(t));
    timers = [];
    callActive = false;
    stopTimerTick();
    container.innerHTML = '';
    startBtn.style.display = 'inline-block';
    resetBtn.style.display = 'none';
    dotEl.style.display = 'none';
    statusEl.textContent = '';
  }

  // ── Overlay UI ──────────────────────────────────────────────────

  function buildOverlay() {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-size:12px;font-weight:600;color:#ADC6FF;">
          SDR Copilot <span style="color:#8C909F;font-weight:400;">— Sarah Chen, Acme Corp</span>
        </div>
        <span id="demo-timer" style="font-size:12px;color:#8C909F;font-family:monospace;">00:00</span>
      </div>

      <div id="demo-talkbar" style="display:flex;height:4px;border-radius:2px;overflow:hidden;margin-bottom:12px;background:rgba(255,255,255,0.06);">
        <div id="demo-bar-you" style="height:100%;background:#4D8EFF;width:50%;transition:width 0.5s;"></div>
        <div id="demo-bar-prospect" style="height:100%;background:#10B981;width:50%;transition:width 0.5s;"></div>
      </div>

      <div id="demo-transcript" style="max-height:250px;overflow-y:auto;margin-bottom:12px;font-size:13px;line-height:1.6;"></div>

      <div id="demo-objections" style="margin-bottom:8px;"></div>
      <div id="demo-suggestions"></div>
    `;
  }

  function addTranscriptLine(text, speaker) {
    transcriptLines.push({ text, speaker, ts: Date.now() });
    const el = document.getElementById('demo-transcript');
    if (!el) return;

    const color = speaker === 'you' ? '#ADC6FF' : '#4EDEA3';
    const label = speaker === 'you' ? 'You' : 'Sarah Chen';

    const line = document.createElement('div');
    line.style.cssText = 'margin-bottom:8px;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,0.03);';
    line.innerHTML = `<span style="font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.05em;">${label}</span><br><span style="color:#C2C6D6;">${text}</span>`;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
  }

  function showObjection(obj) {
    const el = document.getElementById('demo-objections');
    if (!el) return;

    const card = document.createElement('div');
    card.style.cssText = `padding:8px 10px;margin-bottom:6px;border-radius:6px;border-left:3px solid ${obj.color};background:rgba(255,255,255,0.04);font-size:12px;`;
    card.innerHTML = `<span style="font-weight:700;color:${obj.color};">${obj.emoji} ${obj.label}</span>`;
    el.appendChild(card);
  }

  function showSuggestions(active) {
    const el = document.getElementById('demo-suggestions');
    if (!el || active.length === 0) return;

    const latest = active[active.length - 1];
    el.innerHTML = (latest.suggestions || []).map(s =>
      `<div style="padding:6px 10px;margin-bottom:4px;border-radius:20px;background:rgba(173,198,255,0.08);border:1px solid rgba(173,198,255,0.15);font-size:11px;color:#ADC6FF;cursor:pointer;" title="Click to copy">${s}</div>`
    ).join('');
  }

  function updateTalkBar() {
    let youMs = 0, prospectMs = 0;
    talkSegments.forEach(s => {
      if (s.speaker === 'you') youMs += s.durationMs;
      else prospectMs += s.durationMs;
    });
    const total = youMs + prospectMs || 1;
    const youPct = Math.round((youMs / total) * 100);
    const prosPct = 100 - youPct;

    const youBar = document.getElementById('demo-bar-you');
    const prosBar = document.getElementById('demo-bar-prospect');
    if (youBar) youBar.style.width = youPct + '%';
    if (prosBar) prosBar.style.width = prosPct + '%';
  }

  function startTimerTick() {
    const timerEl = document.getElementById('demo-timer');
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - callStartMs;
      const mm = String(Math.floor(elapsed / 60000)).padStart(2, '0');
      const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mm}:${ss}`;
    }, 1000);
  }

  function stopTimerTick() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
})();

/**
 * SDR Copilot — Dashboard Script
 */

(async function () {
  'use strict';

  // ─── Demo Data ─────────────────────────────────────────────────────────────

  const DEMO_CALLS = [
    {
      id: 'demo_1', startTime: new Date(Date.now() - 3600000).toISOString(),
      durationSeconds: 427,
      prospectName: 'Sarah Chen', prospectEmail: 'sarah@acmecorp.com', companyName: 'Acme Corp',
      objections: ['price', 'timing'], followUps: ['Send deck', 'Schedule demo', 'Confirm next step date on calendar'],
      talkSegments: [
        { speaker: 'you', durationMs: 120000 }, { speaker: 'prospect', durationMs: 180000 },
        { speaker: 'you', durationMs: 60000 }, { speaker: 'prospect', durationMs: 67000 }
      ],
      outcome: 'connected'
    },
    {
      id: 'demo_2', startTime: new Date(Date.now() - 7200000).toISOString(),
      durationSeconds: 89,
      prospectName: 'James Okafor', prospectEmail: '', companyName: 'TechFlow Inc',
      objections: ['authority'], followUps: ['Follow-up call', 'Send one-pager for internal share'],
      talkSegments: [
        { speaker: 'you', durationMs: 40000 }, { speaker: 'prospect', durationMs: 49000 }
      ],
      outcome: 'connected'
    },
    {
      id: 'demo_3', startTime: new Date(Date.now() - 9000000).toISOString(),
      durationSeconds: 18,
      prospectName: 'Maria Lopez', prospectEmail: '', companyName: 'Vertex Systems',
      objections: [], followUps: [],
      talkSegments: [{ speaker: 'you', durationMs: 18000 }],
      outcome: 'voicemail'
    },
    {
      id: 'demo_4', startTime: new Date(Date.now() - 10800000).toISOString(),
      durationSeconds: 312,
      prospectName: 'David Park', prospectEmail: 'david@growthly.io', companyName: 'Growthly',
      objections: ['need', 'competitor'], followUps: ['Send case study', 'Book product demo', 'Confirm next step date on calendar'],
      talkSegments: [
        { speaker: 'you', durationMs: 140000 }, { speaker: 'prospect', durationMs: 172000 }
      ],
      outcome: 'connected'
    },
    {
      id: 'demo_5', startTime: new Date(Date.now() - 14400000).toISOString(),
      durationSeconds: 0,
      prospectName: 'Amy Zhang', prospectEmail: '', companyName: 'Cloudways',
      objections: [], followUps: [],
      talkSegments: [],
      outcome: 'no-answer'
    }
  ];

  const OBJECTION_META = {
    price:      { label: 'Price / Budget',     color: '#f59e0b', emoji: '💰' },
    timing:     { label: 'Timing / Not Now',   color: '#8b5cf6', emoji: '⏰' },
    authority:  { label: 'Decision Authority', color: '#06b6d4', emoji: '👤' },
    need:       { label: 'Need / Relevance',   color: '#10b981', emoji: '❓' },
    competitor: { label: 'Competitive',        color: '#ef4444', emoji: '⚔️' },
    trust:      { label: 'Trust / Credibility',color: '#f97316', emoji: '🛡️' }
  };

  // ─── Init ───────────────────────────────────────────────────────────────────

  let settings = {};
  let allCalls = [];
  let isDemoMode = false;
  let followupDoneSet = new Set();
  let selectedDate = new Date(); // currently selected date

  async function init() {
    setNavDate();

    settings = await fetchSettings();
    const historyData = await fetchCallHistory();
    allCalls = historyData.length > 0 ? historyData : [];
    isDemoMode = settings.demoMode !== false || allCalls.length === 0;

    if (isDemoMode) {
      allCalls = DEMO_CALLS;
      document.getElementById('demo-banner').style.display = 'flex';
    }

    renderStatCards();
    renderObjectionChart();
    renderTalkTime();
    renderFollowUps();
    renderCallHistory();

    bindEvents();
  }

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  function fetchSettings() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, res => {
        resolve(res?.settings || {});
      });
    });
  }

  function fetchCallHistory() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_CALL_HISTORY' }, res => {
        resolve(res?.history || []);
      });
    });
  }

  // ─── Aggregations ───────────────────────────────────────────────────────────

  function getTodayCalls() {
    const dateStr = selectedDate.toISOString().split('T')[0];
    if (isDemoMode) {
      // In demo mode, only show demo calls when viewing "today"
      const todayStr = new Date().toISOString().split('T')[0];
      return dateStr === todayStr ? allCalls : [];
    }
    return allCalls.filter(c => (c.startTime || '').startsWith(dateStr));
  }

  function calcStats(calls) {
    const total = calls.length;
    const connected = calls.filter(c => c.outcome === 'connected' || (c.durationSeconds || 0) > 30).length;
    const totalSecs = calls.reduce((s, c) => s + (c.durationSeconds || 0), 0);
    const avgSecs = total > 0 ? Math.round(totalSecs / total) : 0;

    // Talk time aggregate
    let youMs = 0, prospectMs = 0;
    calls.forEach(c => {
      (c.talkSegments || []).forEach(seg => {
        if (seg.speaker === 'you') youMs += seg.durationMs;
        else prospectMs += seg.durationMs;
      });
    });
    const totalTalkMs = youMs + prospectMs || 1;
    const youPct = Math.round((youMs / totalTalkMs) * 100);

    // Objections
    const objMap = {};
    calls.forEach(c => {
      (c.objections || []).forEach(o => { objMap[o] = (objMap[o] || 0) + 1; });
    });

    return { total, connected, totalSecs, avgSecs, youPct, prospectPct: 100 - youPct, objMap };
  }

  // ─── Stat Cards ─────────────────────────────────────────────────────────────

  function renderStatCards() {
    const calls = getTodayCalls();
    const stats = calcStats(calls);

    const totalMin = Math.floor(stats.totalSecs / 60);
    const avgMin = Math.floor(stats.avgSecs / 60);
    const avgSec = String(stats.avgSecs % 60).padStart(2, '0');

    const cards = [
      {
        icon: '📞',
        value: stats.total,
        label: 'Total Calls',
        delta: `${stats.connected} connected`,
        deltaClass: stats.connected > 0 ? 'up' : 'neutral',
        accent: '#6366f1'
      },
      {
        icon: '⏱',
        value: `${totalMin}m`,
        label: 'Total Talk Time',
        delta: `${avgMin}:${avgSec} avg duration`,
        deltaClass: 'neutral',
        accent: '#10b981'
      },
      {
        icon: '🎯',
        value: `${stats.youPct}%`,
        label: 'You Talked',
        delta: stats.youPct > 60 ? 'Try to listen more' : stats.youPct < 30 ? 'Great listening!' : 'Good balance',
        deltaClass: stats.youPct > 60 ? 'down' : 'up',
        accent: '#f59e0b'
      },
      {
        icon: '⚠️',
        value: Object.values(stats.objMap).reduce((a, b) => a + b, 0),
        label: 'Objections Heard',
        delta: `${Object.keys(stats.objMap).length} unique types`,
        deltaClass: 'neutral',
        accent: '#8b5cf6'
      }
    ];

    const grid = document.getElementById('stat-grid');
    grid.innerHTML = cards.map(c => `
      <div class="stat-card" style="--card-accent:${c.accent}">
        <span class="stat-icon">${c.icon}</span>
        <div class="stat-value">${c.value}</div>
        <div class="stat-label">${c.label}</div>
        <div class="stat-delta ${c.deltaClass}">${c.delta}</div>
      </div>
    `).join('');
  }

  // ─── Objection Chart ────────────────────────────────────────────────────────

  function renderObjectionChart() {
    const calls = getTodayCalls();
    const stats = calcStats(calls);
    const objMap = stats.objMap;
    const entries = Object.entries(objMap).sort((a, b) => b[1] - a[1]);
    const maxVal = Math.max(...Object.values(objMap), 1);
    const totalObj = Object.values(objMap).reduce((a, b) => a + b, 0);

    document.getElementById('obj-total').textContent = `${totalObj} total`;

    const chart = document.getElementById('objection-chart');

    if (entries.length === 0) {
      chart.innerHTML = '<div style="color:var(--text-3); font-size:13px; padding:8px 0;">No objections detected today.</div>';
      return;
    }

    chart.innerHTML = entries.map(([id, count]) => {
      const meta = OBJECTION_META[id] || { label: id, color: '#6366f1', emoji: '•' };
      const pct = Math.round((count / maxVal) * 100);
      return `
        <div class="obj-bar-row">
          <span class="obj-bar-label" title="${meta.label}">${meta.emoji} ${meta.label}</span>
          <div class="obj-bar-track">
            <div class="obj-bar-fill" style="width:${pct}%; background:${meta.color}; opacity:0.75;"></div>
          </div>
          <span class="obj-bar-count">${count}</span>
        </div>
      `;
    }).join('');

    // Animate bars in after paint
    requestAnimationFrame(() => {
      chart.querySelectorAll('.obj-bar-fill').forEach((el, i) => {
        const target = el.style.width;
        el.style.width = '0%';
        setTimeout(() => { el.style.width = target; }, 50 + i * 60);
      });
    });
  }

  // ─── Talk Time ──────────────────────────────────────────────────────────────

  function renderTalkTime() {
    const calls = getTodayCalls().filter(c => (c.talkSegments || []).length > 0);
    const stats = calcStats(calls);
    const { youPct, prospectPct } = stats;
    const silencePct = Math.max(0, 100 - youPct - prospectPct);

    const container = document.getElementById('talktime-bars');
    container.innerHTML = `
      <div class="talktime-row">
        <div class="talktime-meta">
          <span class="talktime-speaker">You</span>
          <span class="talktime-pct">${youPct}%</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill bar-you" style="width:0%" data-target="${youPct}%"></div>
        </div>
      </div>
      <div class="talktime-row">
        <div class="talktime-meta">
          <span class="talktime-speaker">Prospect</span>
          <span class="talktime-pct">${prospectPct}%</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill bar-prospect" style="width:0%" data-target="${prospectPct}%"></div>
        </div>
      </div>
      ${silencePct > 5 ? `
      <div class="talktime-row">
        <div class="talktime-meta">
          <span class="talktime-speaker">Silence</span>
          <span class="talktime-pct">${silencePct}%</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill bar-silence" style="width:0%" data-target="${silencePct}%"></div>
        </div>
      </div>` : ''}
      <div class="ratio-tip">
        ${youPct <= 45 ? '✅ Great balance — you\'re letting the prospect talk.' :
          youPct <= 55 ? '⚠ Slightly high talk ratio. Ask more open-ended questions.' :
          '🔴 You\'re talking too much. Aim for 40% you, 60% prospect.'}
      </div>
    `;

    // Animate
    requestAnimationFrame(() => {
      container.querySelectorAll('[data-target]').forEach((el, i) => {
        setTimeout(() => { el.style.width = el.getAttribute('data-target'); }, 100 + i * 80);
      });
    });
  }

  // ─── Follow-ups ─────────────────────────────────────────────────────────────

  function renderFollowUps() {
    const calls = getTodayCalls();
    const allFollowUps = calls.flatMap(c =>
      (c.followUps || []).map(f => ({
        text: f,
        prospect: c.prospectName,
        company: c.companyName,
        callId: c.id
      }))
    );

    const unique = [];
    const seen = new Set();
    allFollowUps.forEach(f => {
      if (!seen.has(f.text)) { seen.add(f.text); unique.push(f); }
    });

    document.getElementById('followup-meta').textContent = `${unique.length} actions`;

    const container = document.getElementById('followup-container');

    if (unique.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <div class="empty-state-title">All clear!</div>
          <div class="empty-state-desc">No follow-up actions yet today.</div>
        </div>
      `;
      return;
    }

    const list = document.createElement('div');
    list.className = 'followup-list';

    unique.slice(0, 8).forEach(item => {
      const key = `${item.callId}:${item.text}`;
      const isDone = followupDoneSet.has(key);

      const el = document.createElement('div');
      el.className = 'followup-item';
      el.innerHTML = `
        <div class="followup-check ${isDone ? 'done' : ''}" data-key="${escapeAttr(key)}">
          ${isDone ? '✓' : ''}
        </div>
        <span class="followup-text" style="${isDone ? 'text-decoration:line-through;color:var(--text-3)' : ''}">${escapeHTML(item.text)}</span>
        <span class="followup-meta">${escapeHTML(item.prospect)}</span>
      `;

      el.querySelector('.followup-check').addEventListener('click', (e) => {
        const k = e.currentTarget.getAttribute('data-key');
        if (followupDoneSet.has(k)) followupDoneSet.delete(k);
        else followupDoneSet.add(k);
        renderFollowUps();
      });

      list.appendChild(el);
    });

    container.innerHTML = '';
    container.appendChild(list);
  }

  // ─── Call History Table ─────────────────────────────────────────────────────

  function renderCallHistory() {
    const calls = getTodayCalls();
    document.getElementById('call-count-meta').textContent = `${calls.length} calls today`;

    const container = document.getElementById('call-history-container');

    if (calls.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-title">No calls yet today</div>
          <div class="empty-state-desc">Open Orum and make your first call. SDR Copilot will start tracking automatically.</div>
          <button class="btn btn-primary" onclick="window.open('https://app.orum.io', '_blank')">Open Orum →</button>
        </div>
      `;
      return;
    }

    const table = document.createElement('table');
    table.className = 'call-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Contact</th>
          <th>Time</th>
          <th>Duration</th>
          <th>Outcome</th>
          <th>Objections</th>
          <th>Follow-up</th>
        </tr>
      </thead>
      <tbody id="call-tbody"></tbody>
    `;

    const tbody = table.querySelector('#call-tbody');

    calls.forEach(call => {
      const startTime = call.startTime ? new Date(call.startTime) : null;
      const timeStr = startTime ? startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
      const durationStr = formatDuration(call.durationSeconds || 0);

      const objTags = (call.objections || []).map(id => {
        const meta = OBJECTION_META[id] || { emoji: '•', label: id };
        return `<span class="obj-tag" title="${meta.label}">${meta.emoji}</span>`;
      }).join('');

      const outcomeClass = {
        connected: 'outcome-connected',
        voicemail: 'outcome-voicemail',
        'no-answer': 'outcome-no-answer'
      }[call.outcome] || 'outcome-voicemail';

      const outcomeLabel = {
        connected: '✓ Connected',
        voicemail: '📬 Voicemail',
        'no-answer': '— No Answer'
      }[call.outcome] || '—';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <div class="call-prospect">${escapeHTML(call.prospectName || 'Unknown')}</div>
          <div class="call-company">${escapeHTML(call.companyName || '')}</div>
        </td>
        <td class="call-duration">${timeStr}</td>
        <td class="call-duration">${durationStr}</td>
        <td><span class="call-outcome ${outcomeClass}">${outcomeLabel}</span></td>
        <td><div class="call-objections">${objTags || '<span style="color:var(--text-3); font-size:11px;">None</span>'}</div></td>
        <td>
          ${call.prospectEmail
            ? `<a class="call-draft-link" data-call-id="${escapeAttr(call.id)}">Draft Email</a>`
            : '<span style="color:var(--text-3);font-size:11px;">No email</span>'
          }
        </td>
      `;

      // Wire draft button
      const draftLink = row.querySelector('.call-draft-link');
      if (draftLink) {
        draftLink.addEventListener('click', () => triggerDraft(call));
      }

      tbody.appendChild(row);
    });

    container.innerHTML = '';
    container.appendChild(table);
  }

  // ─── Draft trigger ──────────────────────────────────────────────────────────

  async function triggerDraft(call) {
    if (!call.prospectEmail) return;

    const payload = {
      to: call.prospectEmail,
      subject: `Following up — great talking with you, ${call.prospectName?.split(' ')[0] || 'there'}`,
      body: buildEmailBody(call)
    };

    const res = await sendMsg('CREATE_GMAIL_DRAFT', payload);
    if (res?.ok) {
      alert(`Draft saved to Gmail! (ID: ${res.draftId})`);
    } else {
      alert(`Could not create draft: ${res?.error || 'Gmail not connected'}`);
    }
  }

  function buildEmailBody(call) {
    const firstName = call.prospectName?.split(' ')[0] || 'there';
    const durationMin = Math.round((call.durationSeconds || 0) / 60);
    const followUps = call.followUps || [];
    const actionLines = followUps.length > 0
      ? followUps.map(f => `  • ${f}`).join('\n')
      : '  • Sending over the relevant info we discussed';

    const profile = settings.senderProfile || {};
    const senderName = profile.name || '[Your Name]';
    const senderTitle = profile.title || '[Your Title]';
    const senderCompany = profile.company || '[Company]';
    const senderPhone = profile.phone || '[Phone]';
    const senderEmail = profile.email || '[Email]';
    const signature = `${senderName}\n${senderTitle} | ${senderCompany}\n${senderPhone} | ${senderEmail}`;

    return `Hi ${firstName},

Thanks for the time today${durationMin > 0 ? ` — ${durationMin} minutes flew by` : ''}! Really enjoyed learning about ${call.companyName || 'your team'}.

Here's what I'll be following up with:

${actionLines}

Anything you need on your end to move things forward?

Best,
${signature}`;
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  function bindEvents() {
    document.getElementById('settings-btn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    document.getElementById('banner-settings-link')?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    document.getElementById('export-btn').addEventListener('click', exportCSV);

    // Date navigation
    document.getElementById('date-prev').addEventListener('click', () => {
      selectedDate.setDate(selectedDate.getDate() - 1);
      refreshDashboard();
    });

    document.getElementById('date-next').addEventListener('click', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (selectedDate < tomorrow) {
        selectedDate.setDate(selectedDate.getDate() + 1);
        refreshDashboard();
      }
    });
  }

  function refreshDashboard() {
    updateDateLabel();
    renderStatCards();
    renderObjectionChart();
    renderTalkTime();
    renderFollowUps();
    renderCallHistory();
  }

  function updateDateLabel() {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const selStr = selectedDate.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let label;
    if (selStr === todayStr) label = 'Today';
    else if (selStr === yesterdayStr) label = 'Yesterday';
    else label = selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

    document.getElementById('date-label').textContent = label;

    // Disable next button if at today
    const nextBtn = document.getElementById('date-next');
    if (nextBtn) nextBtn.disabled = selStr >= todayStr;

    // Disable prev if 7 days back
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - 7);
    const prevBtn = document.getElementById('date-prev');
    if (prevBtn) prevBtn.disabled = selStr <= minDate.toISOString().split('T')[0];
  }

  function exportCSV() {
    const calls = getTodayCalls();
    const rows = [
      ['Date', 'Time', 'Contact', 'Company', 'Duration (s)', 'Outcome', 'Objections', 'Follow-ups'].join(','),
      ...calls.map(c => [
        (c.startTime || '').split('T')[0],
        c.startTime ? new Date(c.startTime).toLocaleTimeString() : '',
        `"${(c.prospectName || '').replace(/"/g, '""')}"`,
        `"${(c.companyName || '').replace(/"/g, '""')}"`,
        c.durationSeconds || 0,
        c.outcome || '',
        `"${(c.objections || []).join('; ')}"`,
        `"${(c.followUps || []).join('; ')}"`
      ].join(','))
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sdr-copilot-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function setNavDate() {
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('nav-date').textContent = now.toLocaleDateString(undefined, opts);
    updateDateLabel();
  }

  function formatDuration(secs) {
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function sendMsg(type, payload) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type, payload }, res => resolve(res || {}));
    });
  }

  // ─── Boot ───────────────────────────────────────────────────────────────────

  init();
})();

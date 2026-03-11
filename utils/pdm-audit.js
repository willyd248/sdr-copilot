/**
 * SDR Copilot — PDM Audit
 *
 * Scans Orum's contact list DOM and checks each contact record for:
 *   1. Disposition set (not blank / "No Disposition")
 *   2. Call notes filled (non-empty)
 *   3. Next step scheduled (next-step field populated or task created)
 *
 * Highlights failing contacts with a visual indicator and
 * shows a summary badge on the overlay.
 */

(function () {
  'use strict';

  // ─── Selectors (update if Orum changes its DOM) ──────────────────────────────

  const SELECTORS = {
    // Top-level contact row in the power-dialer list
    contactRow: '[data-testid="contact-row"], .contact-list-item, [class*="ContactRow"], [class*="contactRow"]',
    // Disposition select/display within a row
    disposition: '[data-testid="disposition"], [class*="disposition"], select[name="disposition"]',
    // Notes textarea or display
    notes: '[data-testid="call-notes"], textarea[name="notes"], [class*="CallNotes"], [class*="callNotes"]',
    // Next-step / task field
    nextStep: '[data-testid="next-step"], [class*="NextStep"], [class*="nextStep"], [placeholder*="next step"]',
    // Contact name for labeling
    contactName: '[data-testid="contact-name"], [class*="ContactName"], [class*="contactName"]'
  };

  const FAIL_CLASS = 'sdrc-audit-fail';
  const WARN_CLASS = 'sdrc-audit-warn';
  const PASS_CLASS = 'sdrc-audit-pass';
  const BADGE_ID   = 'sdrc-audit-badge';

  // ─── Audit Logic ──────────────────────────────────────────────────────────────

  /**
   * Inspect a single contact row element.
   * Returns an audit result object.
   */
  function auditRow(rowEl) {
    const result = {
      element: rowEl,
      name: '',
      dispositionSet: false,
      notesSet: false,
      nextStepSet: false,
      pass: false
    };

    // Name
    const nameEl = rowEl.querySelector(SELECTORS.contactName);
    result.name = nameEl ? nameEl.textContent.trim() : 'Unknown';

    // Disposition check
    const dispositionEl = rowEl.querySelector(SELECTORS.disposition);
    if (dispositionEl) {
      const val = (dispositionEl.value || dispositionEl.textContent || '').trim();
      result.dispositionSet = val !== '' && val.toLowerCase() !== 'no disposition' && val.toLowerCase() !== 'none';
    }

    // Notes check
    const notesEl = rowEl.querySelector(SELECTORS.notes);
    if (notesEl) {
      const val = (notesEl.value || notesEl.textContent || '').trim();
      result.notesSet = val.length >= 10; // require at least 10 chars
    }

    // Next step check
    const nextEl = rowEl.querySelector(SELECTORS.nextStep);
    if (nextEl) {
      const val = (nextEl.value || nextEl.textContent || '').trim();
      result.nextStepSet = val !== '';
    }

    result.pass = result.dispositionSet && result.notesSet && result.nextStepSet;
    return result;
  }

  /**
   * Run the full audit across all visible contact rows.
   * Returns summary statistics.
   */
  function runAudit() {
    const rows = document.querySelectorAll(SELECTORS.contactRow);
    if (rows.length === 0) return null;

    const results = [];
    rows.forEach(row => {
      const r = auditRow(row);
      results.push(r);
      applyRowHighlight(row, r);
    });

    const failed = results.filter(r => !r.pass);
    const summary = {
      total: results.length,
      passed: results.filter(r => r.pass).length,
      failed: failed.length,
      noDisposition: results.filter(r => !r.dispositionSet).length,
      noNotes: results.filter(r => !r.notesSet).length,
      noNextStep: results.filter(r => !r.nextStepSet).length,
      failedContacts: failed.map(r => ({
        name: r.name,
        issues: [
          !r.dispositionSet && 'Missing disposition',
          !r.notesSet && 'Notes too short or empty',
          !r.nextStepSet && 'No next step set'
        ].filter(Boolean)
      }))
    };

    updateAuditBadge(summary);
    return summary;
  }

  /** Apply color-coded highlight classes to a row. */
  function applyRowHighlight(rowEl, result) {
    rowEl.classList.remove(FAIL_CLASS, WARN_CLASS, PASS_CLASS);

    const issues = [result.dispositionSet, result.notesSet, result.nextStepSet]
      .filter(v => !v).length;

    if (issues === 0) {
      rowEl.classList.add(PASS_CLASS);
    } else if (issues === 1) {
      rowEl.classList.add(WARN_CLASS);
    } else {
      rowEl.classList.add(FAIL_CLASS);
    }

    // Inject a tooltip showing which fields are missing
    let tooltip = rowEl.querySelector('.sdrc-audit-tooltip');
    if (!tooltip && issues > 0) {
      tooltip = document.createElement('span');
      tooltip.className = 'sdrc-audit-tooltip';
      rowEl.style.position = 'relative';
      rowEl.appendChild(tooltip);
    }
    if (tooltip && issues > 0) {
      const missing = [
        !result.dispositionSet && 'Disposition',
        !result.notesSet && 'Notes',
        !result.nextStepSet && 'Next Step'
      ].filter(Boolean).join(', ');
      tooltip.textContent = `Missing: ${missing}`;
    } else if (tooltip && issues === 0) {
      tooltip.remove();
    }
  }

  /** Show/update the floating audit summary badge. */
  function updateAuditBadge(summary) {
    let badge = document.getElementById(BADGE_ID);
    if (!badge) {
      badge = document.createElement('div');
      badge.id = BADGE_ID;
      document.body.appendChild(badge);
    }

    const pct = summary.total > 0
      ? Math.round((summary.passed / summary.total) * 100)
      : 0;

    badge.className = `sdrc-audit-badge ${summary.failed > 0 ? 'has-issues' : 'all-pass'}`;
    badge.innerHTML = `
      <div class="sdrc-audit-badge-header">
        <span class="sdrc-audit-icon">${summary.failed > 0 ? '⚠️' : '✅'}</span>
        <span class="sdrc-audit-title">PDM Audit</span>
      </div>
      <div class="sdrc-audit-stats">
        <span class="sdrc-stat-pass">${summary.passed} pass</span>
        <span class="sdrc-stat-sep">/</span>
        <span class="sdrc-stat-fail">${summary.failed} fail</span>
        <span class="sdrc-stat-pct">${pct}%</span>
      </div>
      ${summary.failed > 0 ? `
      <div class="sdrc-audit-breakdown">
        ${summary.noDisposition > 0 ? `<div>No disposition: ${summary.noDisposition}</div>` : ''}
        ${summary.noNotes > 0 ? `<div>No notes: ${summary.noNotes}</div>` : ''}
        ${summary.noNextStep > 0 ? `<div>No next step: ${summary.noNextStep}</div>` : ''}
      </div>` : ''}
    `;
  }

  /** Remove all audit highlights from the DOM. */
  function clearAudit() {
    document.querySelectorAll(`.${FAIL_CLASS}, .${WARN_CLASS}, .${PASS_CLASS}`).forEach(el => {
      el.classList.remove(FAIL_CLASS, WARN_CLASS, PASS_CLASS);
      const tooltip = el.querySelector('.sdrc-audit-tooltip');
      if (tooltip) tooltip.remove();
    });

    const badge = document.getElementById(BADGE_ID);
    if (badge) badge.remove();
  }

  /** Watch for DOM mutations to re-run audit as contacts load. */
  function watchAndAudit(intervalMs = 5000) {
    runAudit();

    const observer = new MutationObserver(() => {
      runAudit();
    });

    const target = document.querySelector('[class*="contact-list"], [class*="ContactList"], main') || document.body;
    observer.observe(target, { childList: true, subtree: true });

    // Also poll at an interval to catch subtle state changes
    const pollTimer = setInterval(runAudit, intervalMs);

    return {
      stop() {
        observer.disconnect();
        clearInterval(pollTimer);
        clearAudit();
      }
    };
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  window.PDMAudit = {
    runAudit,
    watchAndAudit,
    clearAudit
  };
})();

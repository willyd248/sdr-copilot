/**
 * SDR Copilot — Salesforce Connector
 *
 * Creates / updates Activity (Task) records in Salesforce after calls.
 * OAuth flow is handled by the background service worker.
 * This module is a thin client that delegates to the service worker.
 */

(function () {
  'use strict';

  /**
   * Create an Activity (Task) record in Salesforce.
   *
   * @param {object} activityData
   * @param {string} activityData.subject            e.g. "SDR Call — Acme Corp"
   * @param {string} activityData.description        Full transcript snippet / notes
   * @param {string} [activityData.whoId]            Lead or Contact SFDC ID
   * @param {string} [activityData.whatId]           Account or Opportunity SFDC ID
   * @param {string} [activityData.activityDate]     ISO date string YYYY-MM-DD
   * @param {number} [activityData.durationInMinutes]
   * @param {string} [activityData.callType]         'Outbound' | 'Inbound'
   * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
   */
  function upsertActivity(activityData) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'SALESFORCE_UPSERT_ACTIVITY', payload: activityData },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  /**
   * Build a Salesforce activity from a completed call record.
   * Truncates transcript to fit SFDC description field (32k char limit).
   *
   * @param {object} callRecord
   * @returns {object} activityData ready for upsertActivity()
   */
  function buildActivityFromCall(callRecord) {
    const {
      prospectName = 'Unknown',
      companyName = '',
      transcript = '',
      durationSeconds = 0,
      objections = [],
      followUps = [],
      startTime,
      whoId,
      whatId
    } = callRecord;

    const durationMin = Math.round(durationSeconds / 60);
    const date = startTime
      ? new Date(startTime).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const objectionStr = objections.length > 0
      ? `\nObjections heard: ${objections.join(', ')}`
      : '';

    const followUpStr = followUps.length > 0
      ? `\nNext steps:\n${followUps.map(f => `- ${f}`).join('\n')}`
      : '';

    const transcriptSnippet = transcript.length > 2000
      ? transcript.slice(0, 2000) + '... [truncated]'
      : transcript;

    const description = [
      `Call with ${prospectName}${companyName ? ` @ ${companyName}` : ''} (${durationMin} min)`,
      objectionStr,
      followUpStr,
      transcriptSnippet ? `\n--- Transcript ---\n${transcriptSnippet}` : ''
    ].filter(Boolean).join('\n').slice(0, 32000);

    return {
      subject: `SDR Copilot Call — ${prospectName}${companyName ? ` | ${companyName}` : ''}`,
      description,
      activityDate: date,
      durationInMinutes: durationMin,
      callType: 'Outbound',
      whoId: whoId || undefined,
      whatId: whatId || undefined
    };
  }

  /**
   * Full pipeline: build activity from call record and push to Salesforce.
   *
   * @param {object} callRecord
   * @returns {Promise<{ ok: boolean, result?: object, error?: string }>}
   */
  async function syncCallToSalesforce(callRecord) {
    try {
      const activity = buildActivityFromCall(callRecord);
      return await upsertActivity(activity);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  window.SalesforceConnector = {
    upsertActivity,
    buildActivityFromCall,
    syncCallToSalesforce
  };
})();

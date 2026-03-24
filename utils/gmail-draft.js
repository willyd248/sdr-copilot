/**
 * SDR Copilot — Gmail Draft Utility
 *
 * Generates post-call follow-up email drafts and saves them
 * to Gmail Drafts via the service worker (which holds the OAuth token).
 */

(function () {
  'use strict';

  // ─── Sender Profile ──────────────────────────────────────────────────────────

  let _senderProfile = null;

  function loadSenderProfile() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, res => {
        _senderProfile = res?.settings?.senderProfile || {};
        resolve(_senderProfile);
      });
    });
  }

  function senderSignature() {
    const p = _senderProfile || {};
    const name = p.name || '[Your Name]';
    const title = p.title || '[Your Title]';
    const company = p.company || '[Company]';
    const phone = p.phone || '[Phone]';
    const email = p.email || '[Email]';
    return `${name}\n${title} | ${company}\n${phone} | ${email}`;
  }

  // ─── Template Engine ──────────────────────────────────────────────────────────

  /**
   * Generate a follow-up email from call data.
   *
   * @param {object} callData
   * @param {string} callData.prospectName
   * @param {string} callData.prospectEmail
   * @param {string} callData.companyName
   * @param {string} callData.transcript       Full call transcript
   * @param {string[]} callData.followUps      Action items extracted from call
   * @param {string[]} callData.objections     Objection IDs surfaced during call
   * @param {number}  callData.durationSeconds
   * @returns {{ to: string, subject: string, body: string }}
   */
  function buildFollowUpEmail(callData) {
    const {
      prospectName = 'there',
      prospectEmail = '',
      companyName = 'your company',
      transcript = '',
      followUps = [],
      objections = [],
      durationSeconds = 0
    } = callData;

    const firstName = prospectName.split(' ')[0];
    const durationMin = Math.round(durationSeconds / 60);

    // Build follow-up bullets
    const actionLines = followUps.length > 0
      ? followUps.map(f => `  • ${f}`).join('\n')
      : '  • Connecting you with a relevant case study\n  • Scheduling our next conversation';

    // Build objection acknowledgement if applicable
    let objectionBlurb = '';
    if (objections.includes('price')) {
      objectionBlurb = `\nI also want to address the investment question we touched on — I'd love to put together a custom ROI model for ${companyName} to make the business case clear.\n`;
    } else if (objections.includes('timing')) {
      objectionBlurb = `\nI completely understand the timing constraints. I'll make sure we revisit this at the right moment for your team.\n`;
    } else if (objections.includes('authority')) {
      objectionBlurb = `\nAs discussed, I'm happy to put together materials that would help you share this internally. Just let me know what would be most useful.\n`;
    }

    const subject = `Following up — great talking with you, ${firstName}`;

    const body = `Hi ${firstName},

Thanks for taking the time to chat today${durationMin > 0 ? ` (${durationMin} min flew by!)` : ''} — I really appreciated learning more about ${companyName} and what your team is working through.

Based on our conversation, here are the next steps I'll be taking on my end:

${actionLines}
${objectionBlurb}
Is there anything you need from me to move things forward on your side?

Happy to jump on a quick call or answer any questions over email — whatever's easier for you.

Looking forward to continuing the conversation.

Best,
${senderSignature()}`;

    return { to: prospectEmail, subject, body };
  }

  /**
   * Save a draft to Gmail via the background service worker.
   *
   * @param {object} emailData  { to, subject, body }
   * @returns {Promise<{ ok: boolean, draftId?: string, error?: string }>}
   */
  function saveDraftToGmail(emailData) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'CREATE_GMAIL_DRAFT', payload: emailData },
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
   * Full pipeline: build email from call data, then save to Gmail.
   *
   * @param {object} callData
   * @returns {Promise<{ ok: boolean, draftId?: string, error?: string }>}
   */
  async function createPostCallDraft(callData) {
    try {
      await loadSenderProfile();
      const email = buildFollowUpEmail(callData);
      if (!email.to) {
        return { ok: false, error: 'No prospect email address available — draft not created' };
      }
      const result = await saveDraftToGmail(email);
      return result;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  window.GmailDraft = {
    buildFollowUpEmail,
    saveDraftToGmail,
    createPostCallDraft
  };
})();

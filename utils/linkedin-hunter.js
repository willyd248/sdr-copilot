/**
 * SDR Copilot — LinkedIn Contact Hunter
 *
 * When visiting a LinkedIn profile page, extracts contact details
 * (name, title, company, email hint, LinkedIn URL) and saves them
 * to the extension's contact store so they auto-populate in the
 * call overlay and post-call email drafts.
 *
 * Activation: injected as a content script on linkedin.com/in/* URLs
 * (declared in manifest.json content_scripts).
 */

(function () {
  'use strict';

  // Only run on profile pages
  if (!window.location.pathname.startsWith('/in/')) return;

  // ─── DOM Extraction ────────────────────────────────────────────────────────

  /**
   * Wait for a selector to appear in the DOM (LinkedIn renders async).
   * @param {string} selector
   * @param {number} timeout ms
   * @returns {Promise<Element|null>}
   */
  function waitFor(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  function getText(selector, root = document) {
    const el = root.querySelector(selector);
    return el ? el.textContent.trim() : null;
  }

  /**
   * Extract profile data from the current LinkedIn profile page.
   * @returns {object}
   */
  function extractProfile() {
    // Name — in the <h1> in the top card
    const name =
      getText('h1.text-heading-xlarge') ||
      getText('.pv-top-card--list > li:first-child') ||
      getText('h1');

    // Headline / title
    const headline =
      getText('.text-body-medium.break-words') ||
      getText('.pv-top-card .t-16');

    // Current company — often in the experience section or top card
    const companyEl =
      document.querySelector('[aria-label*="Current company"]') ||
      document.querySelector('.pv-top-card--experience-list-item');
    const company = companyEl ? companyEl.textContent.trim() : null;

    // Location
    const location = getText('.text-body-small.inline.t-black--light.break-words');

    // LinkedIn profile URL (canonical)
    const linkedinUrl =
      document.querySelector('link[rel="canonical"]')?.href ||
      window.location.href.split('?')[0];

    // Connection degree
    const degree = getText('.dist-value');

    // Profile image URL
    const imgEl = document.querySelector('.pv-top-card-profile-picture__image--show');
    const photoUrl = imgEl?.src || null;

    // About / summary
    const about = getText('#about ~ .display-flex .visually-hidden') ||
                  getText('.pv-shared-text-with-see-more .visually-hidden');

    // Email — LinkedIn hides these; we surface the "Contact info" button hint
    // The actual email is gated behind the contact info modal.
    // We flag that a contact modal is available.
    const hasContactInfo = !!document.querySelector('a[href*="contact-info"]');

    return {
      name: name || 'Unknown',
      headline: headline || null,
      company: company || null,
      location: location || null,
      linkedinUrl,
      degree: degree || null,
      photoUrl,
      about: about || null,
      hasContactInfo,
      capturedAt: new Date().toISOString(),
      source: 'linkedin-hunter',
    };
  }

  /**
   * Open the Contact Info modal and attempt to scrape the email.
   * Returns the email string or null if not found / not accessible.
   */
  async function tryExtractEmail() {
    const contactBtn = document.querySelector('a[href*="contact-info"]');
    if (!contactBtn) return null;

    contactBtn.click();

    // Wait for modal
    const modal = await waitFor('.pv-contact-info__contact-type', 3000);
    if (!modal) return null;

    // Find email link
    const emailLink = document.querySelector('.pv-contact-info__contact-type a[href^="mailto:"]');
    const email = emailLink ? emailLink.href.replace('mailto:', '') : null;

    // Close modal
    const closeBtn = document.querySelector('[aria-label="Dismiss"]') ||
                     document.querySelector('button[data-test-modal-close-btn]');
    if (closeBtn) closeBtn.click();

    return email;
  }

  // ─── Main ──────────────────────────────────────────────────────────────────

  async function run() {
    // Wait for the profile header to load
    const nameEl = await waitFor('h1.text-heading-xlarge', 6000);
    if (!nameEl) {
      console.warn('[SDR Copilot] LinkedIn profile header not found — skipping extraction');
      return;
    }

    const profile = extractProfile();
    const email = await tryExtractEmail();
    if (email) profile.email = email;

    console.log('[SDR Copilot] Captured LinkedIn profile:', profile.name);

    // Send to service worker for storage
    chrome.runtime.sendMessage({
      type: 'LINKEDIN_CONTACT_CAPTURED',
      payload: profile,
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[SDR Copilot] Failed to save contact:', chrome.runtime.lastError.message);
        return;
      }
      if (response?.saved) {
        showToast(`Contact saved: ${profile.name}`);
      }
    });
  }

  // ─── Toast Notification ───────────────────────────────────────────────────

  function showToast(message) {
    const existing = document.getElementById('sdr-copilot-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'sdr-copilot-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1a1a2e;
      color: #fff;
      padding: 12px 18px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 500;
      z-index: 99999;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      border: 1px solid rgba(77,142,255,0.4);
      display: flex;
      align-items: center;
      gap: 8px;
      animation: sdrSlideIn 0.2s ease;
    `;
    toast.innerHTML = `
      <style>
        @keyframes sdrSlideIn {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      </style>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4d8eff" stroke-width="2.5">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      ${message}
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // Start extraction after a short delay to ensure React hydration is done
  setTimeout(run, 1500);
})();

/**
 * SDR Copilot — AI Coach
 *
 * Identifies objection patterns in live transcripts and returns
 * suggested talk-track responses. Uses fast keyword matching
 * (no API call needed) so suggestions appear in real time.
 * Optionally enhanced by Claude API when a key is configured.
 */

(function () {
  'use strict';

  // ─── Objection Taxonomy ──────────────────────────────────────────────────────

  const OBJECTIONS = [
    {
      id: 'price',
      label: 'Price / Budget',
      emoji: '💰',
      keywords: [
        'too expensive', 'too much', "can't afford", 'budget', 'cost',
        'price', 'pricing', 'cheap', 'cheaper', 'discount', 'out of budget',
        'no budget', 'money', 'spend', 'investment', 'roi', 'value'
      ],
      suggestions: [
        'What does it cost you today to NOT solve this problem?',
        'Budget is often flexible when the ROI is clear — can I share what similar teams have seen?',
        'I hear you on budget. Would it help to see a phased approach that fits within your current cycle?',
        'What would the business impact be if you could [key benefit] by next quarter?'
      ],
      color: '#f59e0b'
    },
    {
      id: 'timing',
      label: 'Timing / Not Now',
      emoji: '⏰',
      keywords: [
        'not now', 'not the right time', 'bad timing', 'next quarter',
        'next year', 'too busy', 'come back later', 'maybe later',
        'wait', 'hold off', 'pause', 'revisit', 'evaluate later',
        'not a priority', 'low priority', 'Q3', 'Q4', 'after the holidays'
      ],
      suggestions: [
        'What needs to change for the timing to be right? I want to make sure I follow up appropriately.',
        'Totally understand — what are the top priorities right now? Maybe we can connect this to those.',
        'What would need to be true in Q[X] for this to be a priority?',
        'If we could start small in 30 days, would that change things?'
      ],
      color: '#8b5cf6'
    },
    {
      id: 'authority',
      label: 'Decision Authority',
      emoji: '👤',
      keywords: [
        "not my decision", "need to talk", "need to check", "my manager",
        "my boss", "my ceo", "my cto", "my vp", "team decision",
        "committee", "board", "stakeholders", "get approval", "sign off",
        "procurement", "legal review", "it review", "other people involved",
        "multiple decision makers", "buying committee"
      ],
      suggestions: [
        'Absolutely — who else should be part of this conversation? I\'d love to set up a call with everyone together.',
        'That makes sense. What would help you make the strongest case internally?',
        'What\'s the typical process for a decision like this at your company?',
        'Would it be helpful if I put together a one-pager you could share with [decision maker]?'
      ],
      color: '#06b6d4'
    },
    {
      id: 'need',
      label: 'Need / Relevance',
      emoji: '❓',
      keywords: [
        "don't need", "we're fine", "happy with", "already have", "current solution",
        "not relevant", "doesn't apply", "not a fit", "not interested",
        "we handle that", "got that covered", "internal tool", "building it ourselves",
        "no problem there", "doing fine", "not a pain point", "works for us"
      ],
      suggestions: [
        'I appreciate that — what\'s your current approach to [problem area]? I want to make sure I\'m not missing something.',
        'Fair enough. Out of curiosity, if you could wave a magic wand and fix one thing about that process, what would it be?',
        'Sounds like things are working well. What does success look like for your team 12 months from now?',
        'Got it. Is there another area where you ARE feeling friction that I might be able to help with?'
      ],
      color: '#10b981'
    },
    {
      id: 'competitor',
      label: 'Competitive / Alternative',
      emoji: '⚔️',
      keywords: [
        'competitor', 'competition', 'alternative', 'already using', 'signed with',
        'using salesforce', 'using hubspot', 'using outreach', 'using salesloft',
        'contract', 'locked in', 'switching costs', 'migration', 'other vendor',
        'evaluating others', 'talking to others', 'comparing'
      ],
      suggestions: [
        'That\'s actually helpful context — what do you like most about what you\'re using today?',
        'What would have to be true for you to consider making a change?',
        'I respect that. What\'s the one thing you wish [competitor] did better?',
        'When does that contract come up for renewal? I\'d love to be on your shortlist.'
      ],
      color: '#ef4444'
    },
    {
      id: 'trust',
      label: 'Trust / Credibility',
      emoji: '🛡️',
      keywords: [
        "don't know you", "never heard of", "how long", "track record",
        "references", "case studies", "proof", "prove it", "show me",
        "trust", "security", "compliance", "soc2", "gdpr", "data",
        "small company", "startup risk", "going to be around"
      ],
      suggestions: [
        'That\'s a fair concern. Would it help to speak with a customer in a similar role at a similar company?',
        'I can share a few case studies from [relevant industry] — which would be most relevant to you?',
        'We\'re [X years] old with [Y customers]. Would a security overview or compliance doc help move things forward?',
        'What would give you the confidence you need to move forward?'
      ],
      color: '#f97316'
    }
  ];

  // ─── Transcript Window ────────────────────────────────────────────────────────

  const WINDOW_SIZE = 20; // sentences to consider

  class AICoach {
    constructor() {
      this._transcriptWindow = [];
      this._detectedObjections = new Map(); // id → {objection, detectedAt, dismissed}
    }

    /**
     * Add a new transcript segment and return any newly detected objections.
     * @param {string} text
     * @param {'you'|'prospect'} speaker
     * @returns {{ newObjections: Array, activeSuggestions: Array }}
     */
    analyze(text, speaker = 'prospect') {
      if (!text || !text.trim()) return { newObjections: [], activeSuggestions: [] };

      this._transcriptWindow.push({ text: text.toLowerCase(), speaker, ts: Date.now() });
      if (this._transcriptWindow.length > WINDOW_SIZE) {
        this._transcriptWindow.shift();
      }

      const fullText = this._transcriptWindow
        .filter(s => s.speaker === 'prospect')
        .map(s => s.text)
        .join(' ');

      const newObjections = [];

      for (const objection of OBJECTIONS) {
        const alreadyDetected = this._detectedObjections.has(objection.id);
        const matched = objection.keywords.some(kw => fullText.includes(kw));

        if (matched && !alreadyDetected) {
          const entry = {
            ...objection,
            detectedAt: Date.now(),
            dismissed: false
          };
          this._detectedObjections.set(objection.id, entry);
          newObjections.push(entry);
        } else if (!matched && alreadyDetected) {
          // Fade out after the window no longer contains the objection
          const existing = this._detectedObjections.get(objection.id);
          if (Date.now() - existing.detectedAt > 60000) {
            this._detectedObjections.delete(objection.id);
          }
        }
      }

      const activeSuggestions = Array.from(this._detectedObjections.values())
        .filter(o => !o.dismissed);

      return { newObjections, activeSuggestions };
    }

    /** Dismiss an objection card so it doesn't keep showing. */
    dismiss(objectionId) {
      const entry = this._detectedObjections.get(objectionId);
      if (entry) entry.dismissed = true;
    }

    /** Reset for a new call. */
    reset() {
      this._transcriptWindow = [];
      this._detectedObjections.clear();
    }

    /** Returns current active (non-dismissed) objections. */
    getActiveObjections() {
      return Array.from(this._detectedObjections.values()).filter(o => !o.dismissed);
    }

    /**
     * Simple talk-time tracker.
     * @param {Array<{speaker: string, durationMs: number}>} segments
     */
    static calcTalkTime(segments) {
      let youMs = 0, prospectMs = 0;
      for (const s of segments) {
        if (s.speaker === 'you') youMs += s.durationMs;
        else prospectMs += s.durationMs;
      }
      const total = youMs + prospectMs || 1;
      return {
        youPct: Math.round((youMs / total) * 100),
        prospectPct: Math.round((prospectMs / total) * 100),
        youMs,
        prospectMs
      };
    }

    /**
     * Generate follow-up actions from a completed transcript.
     * Pure keyword matching — no API call.
     * @param {string} fullTranscript
     * @returns {string[]}
     */
    static suggestFollowUps(fullTranscript) {
      const text = fullTranscript.toLowerCase();
      const actions = [];

      if (/send.{0,20}(deck|slide|proposal|overview|doc)/i.test(text)) {
        actions.push('Send deck / proposal as requested');
      }
      if (/follow.{0,10}up|check back|circle back/i.test(text)) {
        actions.push('Schedule follow-up call');
      }
      if (/demo|show me|walkthrough|see it/i.test(text)) {
        actions.push('Book product demo');
      }
      if (/reference|case study|customer story/i.test(text)) {
        actions.push('Share relevant case study');
      }
      if (/trial|pilot|proof of concept|poc/i.test(text)) {
        actions.push('Set up trial / pilot');
      }
      if (/contract|legal|procurement|vendor form/i.test(text)) {
        actions.push('Initiate vendor approval / security review');
      }
      if (/pricing|quote|proposal/i.test(text)) {
        actions.push('Send custom pricing / quote');
      }
      if (/next.{0,10}(step|call|meeting|touch)/i.test(text)) {
        actions.push('Confirm next step date on calendar');
      }

      return actions.length > 0 ? actions : ['Send recap email with key points'];
    }
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  window.AICoach = AICoach;
  window.OBJECTIONS = OBJECTIONS;
})();

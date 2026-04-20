/**
 * SDR Copilot — Unit Tests
 *
 * Runs with: node tests/run-tests.js
 * No dependencies. Tests pure logic extracted from the extension.
 */

'use strict';

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ─── Extracted pure logic from ai-coach.js ────────────────────────────────────

const OBJECTIONS = [
  {
    id: 'price', label: 'Price / Budget', emoji: '💰',
    keywords: ['too expensive','too much',"can't afford",'budget','cost','price','pricing',
      'cheap','cheaper','discount','out of budget','no budget','money','spend','investment','roi','value'],
    suggestions: ['What does it cost you today to NOT solve this?'],
    color: '#f59e0b'
  },
  {
    id: 'timing', label: 'Timing / Not Now', emoji: '⏰',
    keywords: ['not now','not the right time','bad timing','next quarter','next year','too busy',
      'come back later','maybe later','wait','hold off','pause','revisit','evaluate later',
      'not a priority','low priority','Q3','Q4','after the holidays'],
    suggestions: ['What needs to change for the timing to be right?'],
    color: '#8b5cf6'
  },
  {
    id: 'authority', label: 'Decision Authority', emoji: '👤',
    keywords: ['not my decision','need to talk','need to check','my manager','my boss','my ceo',
      'my cto','my vp','team decision','committee','board','stakeholders','get approval','sign off',
      'procurement','legal review','it review','other people involved','multiple decision makers','buying committee'],
    suggestions: ['Who else should be part of this conversation?'],
    color: '#06b6d4'
  },
  {
    id: 'need', label: 'Need / Relevance', emoji: '❓',
    keywords: ["don't need","we're fine","happy with","already have","current solution","not relevant",
      "doesn't apply","not a fit","not interested","we handle that","got that covered","internal tool",
      "building it ourselves","no problem there","doing fine","not a pain point","works for us"],
    suggestions: ['What would the business look like 12 months from now?'],
    color: '#10b981'
  },
  {
    id: 'competitor', label: 'Competitive / Alternative', emoji: '⚔️',
    keywords: ['competitor','competition','alternative','already using','signed with','using salesforce',
      'using hubspot','using outreach','using salesloft','contract','locked in','switching costs',
      'migration','other vendor','evaluating others','talking to others','comparing'],
    suggestions: ['What do you like most about what you are using today?'],
    color: '#ef4444'
  },
  {
    id: 'trust', label: 'Trust / Credibility', emoji: '🛡️',
    keywords: ["don't know you","never heard of","how long","track record","references","case studies",
      "proof","prove it","show me","trust","security","compliance","soc2","gdpr","data",
      "small company","startup risk","going to be around"],
    suggestions: ['Would it help to speak with a customer in a similar role?'],
    color: '#f97316'
  }
];

function detectObjections(text) {
  const lower = text.toLowerCase();
  return OBJECTIONS.filter(o => o.keywords.some(kw => lower.includes(kw)));
}

function calcTalkTime(segments) {
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

function suggestFollowUps(transcript) {
  const text = transcript.toLowerCase();
  const actions = [];
  if (/send.{0,20}(deck|slide|proposal|overview|doc)/i.test(text)) actions.push('Send deck / proposal as requested');
  if (/follow.{0,10}up|check back|circle back/i.test(text)) actions.push('Schedule follow-up call');
  if (/demo|show me|walkthrough|see it/i.test(text)) actions.push('Book product demo');
  if (/reference|case studi(es|y)|customer stor(y|ies)/i.test(text)) actions.push('Share relevant case study');
  if (/trial|pilot|proof of concept|poc/i.test(text)) actions.push('Set up trial / pilot');
  if (/contract|legal|procurement|vendor form/i.test(text)) actions.push('Initiate vendor approval / security review');
  if (/pricing|quote|proposal/i.test(text)) actions.push('Send custom pricing / quote');
  if (/next.{0,10}(step|call|meeting|touch)/i.test(text)) actions.push('Confirm next step date on calendar');
  return actions.length > 0 ? actions : ['Send recap email with key points'];
}

// ─── Extracted pure logic from gmail-draft.js ─────────────────────────────────

function buildFollowUpEmail({ prospectName = 'there', prospectEmail = '', companyName = 'your company',
  transcript = '', followUps = [], objections = [], durationSeconds = 0 }) {
  const firstName = prospectName.split(' ')[0];
  const durationMin = Math.round(durationSeconds / 60);
  const actionLines = followUps.length > 0
    ? followUps.map(f => `  • ${f}`).join('\n')
    : '  • Connecting you with a relevant case study\n  • Scheduling our next conversation';
  let objectionBlurb = '';
  if (objections.includes('price')) {
    objectionBlurb = `\nI also want to address the investment question we touched on.`;
  } else if (objections.includes('timing')) {
    objectionBlurb = `\nI completely understand the timing constraints.`;
  }
  const subject = `Following up — great talking with you, ${firstName}`;
  const body = `Hi ${firstName},\n\nThanks for taking the time to chat today${durationMin > 0 ? ` (${durationMin} min)` : ''}.\n\n${actionLines}\n${objectionBlurb}`;
  return { to: prospectEmail, subject, body };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\nObjection Detection');

test('detects price objection — "too expensive"', () => {
  const hits = detectObjections("That's too expensive for us right now");
  assert.ok(hits.find(o => o.id === 'price'), 'expected price objection');
});

test('detects price objection — "no budget"', () => {
  const hits = detectObjections("We have no budget allocated for this");
  assert.ok(hits.find(o => o.id === 'price'), 'expected price objection');
});

test('detects timing objection — "not the right time"', () => {
  const hits = detectObjections("It's not the right time for us to make a change");
  assert.ok(hits.find(o => o.id === 'timing'), 'expected timing objection');
});

test('detects authority objection — "need to check with my manager"', () => {
  const hits = detectObjections("I need to check with my manager before moving forward");
  assert.ok(hits.find(o => o.id === 'authority'), 'expected authority objection');
});

test('detects need objection — "we\'re fine"', () => {
  const hits = detectObjections("Honestly we're fine with what we have");
  assert.ok(hits.find(o => o.id === 'need'), 'expected need objection');
});

test('detects competitor objection — "already using outreach"', () => {
  const hits = detectObjections("We're already using outreach and happy with it");
  assert.ok(hits.find(o => o.id === 'competitor'), 'expected competitor objection');
});

test('detects trust objection — "never heard of you"', () => {
  const hits = detectObjections("I've never heard of your company before");
  assert.ok(hits.find(o => o.id === 'trust'), 'expected trust objection');
});

test('returns no objections for positive statements', () => {
  const hits = detectObjections("That sounds great, let's set up a demo");
  assert.strictEqual(hits.length, 0, 'expected no objections');
});

test('detects multiple objections in one statement', () => {
  const hits = detectObjections("The price is too high and I need to check with my manager anyway");
  assert.ok(hits.find(o => o.id === 'price'), 'expected price');
  assert.ok(hits.find(o => o.id === 'authority'), 'expected authority');
});

test('objection detection is case-insensitive', () => {
  const hits = detectObjections("IT'S TOO EXPENSIVE");
  assert.ok(hits.find(o => o.id === 'price'), 'expected price (uppercase input)');
});

console.log('\nTalk-time Calculation');

test('calculates 50/50 split correctly', () => {
  const result = calcTalkTime([
    { speaker: 'you', durationMs: 30000 },
    { speaker: 'prospect', durationMs: 30000 }
  ]);
  assert.strictEqual(result.youPct, 50);
  assert.strictEqual(result.prospectPct, 50);
});

test('handles you-only segments', () => {
  const result = calcTalkTime([{ speaker: 'you', durationMs: 60000 }]);
  assert.strictEqual(result.youPct, 100);
  assert.strictEqual(result.prospectPct, 0);
});

test('handles empty segments without dividing by zero', () => {
  const result = calcTalkTime([]);
  assert.strictEqual(typeof result.youPct, 'number');
  assert.strictEqual(typeof result.prospectPct, 'number');
});

test('rounds percentages to integers', () => {
  const result = calcTalkTime([
    { speaker: 'you', durationMs: 10000 },
    { speaker: 'prospect', durationMs: 20000 }
  ]);
  assert.strictEqual(result.youPct, 33);
  assert.strictEqual(result.prospectPct, 67);
});

console.log('\nFollow-up Suggestions');

test('detects send deck request', () => {
  const actions = suggestFollowUps('Can you send me the deck you mentioned?');
  assert.ok(actions.includes('Send deck / proposal as requested'));
});

test('detects demo request', () => {
  const actions = suggestFollowUps('I would love to see a demo of the product');
  assert.ok(actions.includes('Book product demo'));
});

test('detects case study request', () => {
  const actions = suggestFollowUps('Do you have any case studies I could share?');
  assert.ok(actions.includes('Share relevant case study'));
});

test('returns default action when no signals detected', () => {
  const actions = suggestFollowUps('Great talking to you today');
  assert.deepStrictEqual(actions, ['Send recap email with key points']);
});

test('detects multiple follow-up actions', () => {
  const actions = suggestFollowUps('Send the proposal and let\'s schedule a follow-up call');
  assert.ok(actions.includes('Send deck / proposal as requested'));
  assert.ok(actions.includes('Schedule follow-up call'));
});

console.log('\nEmail Template Generation');

test('generates correct subject line', () => {
  const { subject } = buildFollowUpEmail({ prospectName: 'Sarah Chen' });
  assert.ok(subject.includes('Sarah'), `expected "Sarah" in subject, got: ${subject}`);
});

test('uses first name only in greeting', () => {
  const { body } = buildFollowUpEmail({ prospectName: 'James Okafor' });
  assert.ok(body.startsWith('Hi James,'), `expected "Hi James," at start, got: ${body.slice(0, 20)}`);
});

test('includes duration when non-zero', () => {
  const { body } = buildFollowUpEmail({ prospectName: 'Amy', durationSeconds: 300 });
  assert.ok(body.includes('5 min'), `expected duration in body`);
});

test('includes price objection blurb when price objection present', () => {
  const { body } = buildFollowUpEmail({ prospectName: 'Tom', objections: ['price'] });
  assert.ok(body.includes('investment question'), `expected price blurb`);
});

test('routes draft to correct email address', () => {
  const { to } = buildFollowUpEmail({ prospectName: 'Dana', prospectEmail: 'dana@acme.com' });
  assert.strictEqual(to, 'dana@acme.com');
});

test('fallback actions appear when no follow-ups provided', () => {
  const { body } = buildFollowUpEmail({ prospectName: 'Sam' });
  assert.ok(body.includes('case study') || body.includes('next conversation'), 'expected fallback actions');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`);
if (failed === 0) {
  console.log(`✓ All ${passed} tests passed\n`);
} else {
  console.log(`${passed} passed, ${failed} failed\n`);
  process.exit(1);
}

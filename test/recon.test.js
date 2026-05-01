// Reconciliation math tests.
// Run with: npm test
//
// Why these tests exist: this app shipped a backwards-sign reconciliation
// formula to production once already (caught hours later by a manual code
// audit, not by users). This file locks in the correct sign convention so
// the same bug can't ship again. If you're modifying recon.js and one of
// these tests fails, STOP and re-read the sign convention at the top of
// recon.js before "fixing" the test.

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeReconciliation } = require('../recon.js');

// Realistic price catalog mirroring DEFAULT_PRICES in index.html.
const prices = {
  hotdog: [
    { name: 'Hotdogs',      price: 6 },
    { name: 'Sausage',      price: 7 },
    { name: 'Water',        price: 3 },
    { name: 'Pop (bottle)', price: 4 },
  ],
  novelty: [
    { name: 'Magnums',      price: 7 },
    { name: 'Novelties',    price: 5 },
    { name: 'Cones',        price: 6 },
  ],
};

// ──────────────────────────────────────────────────────────────────────
// SIGN CONVENTION — the bug-that-shipped-once test
// ──────────────────────────────────────────────────────────────────────

test('sign: $144 dispatched + $0 returned = -$144 (short, not +$144)', () => {
  // 24 hotdogs out × $6 = $144 dispatched. Nothing came back. We're SHORT.
  const entry = {
    category: 'hotdog',
    morning: { Hotdogs: 24 },
    evening: {},
    meals: {},
    reloads: [],
    cash: 0,
    debit: 0,
  };
  const r = computeReconciliation(entry, prices);
  assert.equal(r.dispatched, 144);
  assert.equal(r.recon, -144,
    'unrecovered money MUST be negative — not positive. ' +
    'If this fails, the sign convention got flipped.');
});

test('sign: balanced day reconciles to 0', () => {
  // 24 hotdogs out × $6 = $144 dispatched.
  // 12 hotdogs leftover × $6 = $72 + $72 cash = $144 returned. Balanced.
  const entry = {
    category: 'hotdog',
    morning: { Hotdogs: 24 },
    evening: { Hotdogs: 12 },
    meals: {},
    reloads: [],
    cash: 72,
    debit: 0,
  };
  const r = computeReconciliation(entry, prices);
  assert.equal(r.dispatched, 144);
  assert.equal(r.leftover, 72);
  assert.equal(r.recon, 0);
});

test('sign: more cash than expected = positive overage', () => {
  // 24 hotdogs out × $6 = $144 dispatched. $200 cash returned. +$56 overage.
  const entry = {
    category: 'hotdog',
    morning: { Hotdogs: 24 },
    evening: {},
    meals: {},
    reloads: [],
    cash: 200,
    debit: 0,
  };
  const r = computeReconciliation(entry, prices);
  assert.equal(r.recon, 56,
    'overages must be POSITIVE numbers (cash exceeded what went out).');
});

// ──────────────────────────────────────────────────────────────────────
// COMBO entries — both A-side and B-side count toward dispatched
// ──────────────────────────────────────────────────────────────────────

test('combo: morningA + morningB both count toward dispatched', () => {
  // 24 hotdogs ($144) + 10 magnums ($70) = $214 dispatched across both carts.
  // No returns. Should be -$214 short.
  const entry = {
    category: 'combo',
    comboCategoryA: 'hotdog',
    comboCategoryB: 'novelty',
    morningA: { Hotdogs: 24 },
    morningB: { Magnums: 10 },
    eveningA: {}, eveningB: {},
    mealsA: {},   mealsB: {},
    reloadsA: [], reloadsB: [],
    cash: 0,
    debit: 0,
  };
  const r = computeReconciliation(entry, prices);
  assert.equal(r.dispatched, 214);
  assert.equal(r.recon, -214,
    'combo entries must sum BOTH cart morning totals into dispatched.');
});

// ──────────────────────────────────────────────────────────────────────
// RELOADS — must add to dispatched (single-cart AND combo)
// ──────────────────────────────────────────────────────────────────────

test('reloads: each reload counts toward dispatched', () => {
  // Morning 24 hotdogs ($144) + reload 12 hotdogs ($72) = $216 dispatched.
  const entry = {
    category: 'hotdog',
    morning: { Hotdogs: 24 },
    reloads: [ { Hotdogs: 12 } ],
    evening: {},
    meals: {},
    cash: 0,
    debit: 0,
  };
  const r = computeReconciliation(entry, prices);
  assert.equal(r.dispatched, 216, 'reloads must be added to dispatched.');
  assert.equal(r.recon, -216);
});

test('combo reloads: reloadsA[] and reloadsB[] both count', () => {
  // 24 hotdogs ($144) + reloadA 12 hotdogs ($72) +
  // 10 magnums ($70)  + reloadB 5 magnums ($35) = $321 total dispatched.
  const entry = {
    category: 'combo',
    comboCategoryA: 'hotdog',
    comboCategoryB: 'novelty',
    morningA: { Hotdogs: 24 },
    morningB: { Magnums: 10 },
    eveningA: {}, eveningB: {},
    mealsA: {},   mealsB: {},
    reloadsA: [ { Hotdogs: 12 } ],
    reloadsB: [ { Magnums: 5 } ],
    cash: 321,
    debit: 0,
  };
  const r = computeReconciliation(entry, prices);
  assert.equal(r.dispatched, 321);
  assert.equal(r.recon, 0,
    'combo reloads must roll into dispatched on both sides — was the P1.3 bug.');
});

// ──────────────────────────────────────────────────────────────────────
// MEALS — count as "returned" (subtracted from what should-be-paid)
// ──────────────────────────────────────────────────────────────────────

test('meals: employee meals count as returned, not dispatched', () => {
  // 24 hotdogs out ($144). 4 hotdogs eaten by staff ($24). $120 cash returned.
  // Math: 120 cash + 0 debit + 0 leftover + 24 meals - 144 dispatched = 0 balanced.
  const entry = {
    category: 'hotdog',
    morning: { Hotdogs: 24 },
    evening: {},
    meals: { Hotdogs: 4 },
    reloads: [],
    cash: 120,
    debit: 0,
  };
  const r = computeReconciliation(entry, prices);
  assert.equal(r.meals, 24);
  assert.equal(r.recon, 0,
    'meals reduce the cash-owed expectation — they must be ADDED to the returned side.');
});

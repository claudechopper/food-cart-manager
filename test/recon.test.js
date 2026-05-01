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
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeReconciliation, sumItems, sumReloads } = require('../recon.js');

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

// ══════════════════════════════════════════════════════════════════════
// HAPPY PATH — realistic full-day workflows that should reconcile cleanly
// ══════════════════════════════════════════════════════════════════════

describe('happy path — full realistic shifts', () => {
  it('full single-cart day: morning + 1 reload + leftover + meals + cash + debit balances', () => {
    // Out: 50 hotdogs ($300) + reload 20 hotdogs ($120) = $420 dispatched.
    // Back: 8 leftover ($48) + 2 employee meals ($12) + $300 cash + $60 debit = $420.
    const entry = {
      category: 'hotdog',
      morning: { Hotdogs: 50 },
      reloads: [ { Hotdogs: 20 } ],
      evening: { Hotdogs: 8 },
      meals:   { Hotdogs: 2 },
      cash: 300,
      debit: 60,
    };
    const r = computeReconciliation(entry, prices);
    assert.equal(r.dispatched, 420);
    assert.equal(r.leftover, 48);
    assert.equal(r.meals, 12);
    assert.equal(r.recon, 0);
  });

  it('full combo day: both sides + reloads on each + cash + debit balances', () => {
    // A-side hotdog: 30 hotdogs ($180) + reload 10 ($60) = $240
    // B-side novelty: 20 magnums ($140) + reload 5 ($35) = $175
    // Dispatched: $415
    // Back: 5 hotdog leftover ($30) + 3 magnum leftover ($21)
    //       + 2 employee hotdogs eaten ($12) + 1 magnum eaten ($7)
    //       + $250 cash + $95 debit = $415 → balanced.
    const entry = {
      category: 'combo',
      comboCategoryA: 'hotdog',
      comboCategoryB: 'novelty',
      morningA: { Hotdogs: 30 },
      morningB: { Magnums: 20 },
      reloadsA: [ { Hotdogs: 10 } ],
      reloadsB: [ { Magnums: 5 } ],
      eveningA: { Hotdogs: 5 },
      eveningB: { Magnums: 3 },
      mealsA:   { Hotdogs: 2 },
      mealsB:   { Magnums: 1 },
      cash: 250,
      debit: 95,
    };
    const r = computeReconciliation(entry, prices);
    assert.equal(r.dispatched, 415);
    assert.equal(r.leftover,    51);  // 30 + 21
    assert.equal(r.meals,       19);  // 12 + 7
    assert.equal(r.recon, 0,
      'combo with reloads + leftover + meals must reconcile to 0.');
  });

  it('multiple stacked reloads (3 deep) all roll into dispatched', () => {
    // 24 hotdogs morning ($144) + 3 reloads of 12 each (3 × $72 = $216) = $360.
    const entry = {
      category: 'hotdog',
      morning: { Hotdogs: 24 },
      reloads: [
        { Hotdogs: 12 },
        { Hotdogs: 12 },
        { Hotdogs: 12 },
      ],
      evening: {}, meals: {},
      cash: 0, debit: 0,
    };
    const r = computeReconciliation(entry, prices);
    assert.equal(r.dispatched, 360,
      'every reload index must contribute — not just the first or last.');
    assert.equal(r.recon, -360);
  });
});

// ══════════════════════════════════════════════════════════════════════
// SAD PATH — bad/missing/garbage input must NOT crash, must degrade safely
// ══════════════════════════════════════════════════════════════════════

describe('sad path — defensive against garbage input', () => {
  it('null entry → returns zeros instead of throwing', () => {
    const r = computeReconciliation(null, prices);
    assert.deepEqual(r, { dispatched: 0, leftover: 0, meals: 0, recon: 0 });
  });

  it('undefined prices object → returns zeros (no items in any catalog)', () => {
    const entry = {
      category: 'hotdog',
      morning: { Hotdogs: 24 },
      cash: 0, debit: 0,
    };
    const r = computeReconciliation(entry, undefined);
    // No prices = nothing has a dollar value = nothing dispatched.
    // Cash/debit still register at 0.
    assert.equal(r.dispatched, 0);
    assert.equal(r.recon, 0);
  });

  it('non-inventory category (fry truck) reconciles cash/debit only', () => {
    // Fry trucks have no inventory in DEFAULT_PRICES. Just track money.
    const entry = {
      category: 'fry',
      morning: {},
      evening: {},
      cash: 200,
      debit: 50,
    };
    const r = computeReconciliation(entry, prices);
    assert.equal(r.dispatched, 0,
      'no-inventory category should report 0 dispatched even if morning has stray data.');
    assert.equal(r.recon, 250,
      'cash + debit alone produce a positive recon for non-inventory carts.');
  });

  it('string numbers in cash/debit fields (real DOM input) coerce correctly', () => {
    // DOM <input type="number"> values arrive as strings. num() must coerce.
    const entry = {
      category: 'hotdog',
      morning: { Hotdogs: 24 },
      evening: {}, meals: {},
      reloads: [],
      cash: '144',   // string, not number
      debit: '0',    // string, not number
    };
    const r = computeReconciliation(entry, prices);
    assert.equal(r.recon, 0,
      'string "144" must coerce to 144, not concatenate or NaN.');
  });

  it('NaN/garbage in cash field falls through to 0', () => {
    const entry = {
      category: 'hotdog',
      morning: { Hotdogs: 24 },
      cash: 'abc',
      debit: undefined,
    };
    const r = computeReconciliation(entry, prices);
    assert.equal(r.recon, -144,
      'garbage cash should be treated as 0, not throw or produce NaN.');
    assert.ok(!Number.isNaN(r.recon), 'recon must never be NaN.');
  });

  it('combo with no comboCategoryB (broken combo) falls back gracefully', () => {
    // Edge case: combo metadata partially present but B-side category missing.
    const entry = {
      category: 'combo',
      comboCategoryA: 'hotdog',
      // comboCategoryB intentionally omitted
      morningA: { Hotdogs: 24 },
      morningB: { Magnums: 10 },  // unreachable since itemsB will be empty
      eveningA: {}, eveningB: {},
      mealsA: {}, mealsB: {},
      reloadsA: [], reloadsB: [],
      cash: 0, debit: 0,
    };
    const r = computeReconciliation(entry, prices);
    assert.equal(r.dispatched, 144,
      'A-side still counts; B-side silently zeros out without crashing.');
    assert.equal(r.recon, -144);
  });
});

// ══════════════════════════════════════════════════════════════════════
// DRIFT / EDGE — stuff that COULD bite later if not handled
// ══════════════════════════════════════════════════════════════════════

describe('drift / edge cases', () => {
  it('entry references an item that was deleted from price catalog', () => {
    // User had "Slushies" as an item, sold 10, then deleted "Slushies" from
    // the price list. The entry still has { Slushies: 10 } in its morning dict.
    // Behavior: sumItems iterates the *price catalog*, not the dict — so the
    // deleted item silently contributes $0 to dispatched. That's the safe
    // default (don't crash, don't double-charge), but the user has a
    // hidden discrepancy. This test pins that behavior.
    const entry = {
      category: 'hotdog',
      morning: { Hotdogs: 24, Slushies: 10 },  // Slushies not in catalog
      evening: {}, meals: {}, reloads: [],
      cash: 0, debit: 0,
    };
    const r = computeReconciliation(entry, prices);
    assert.equal(r.dispatched, 144,
      'deleted-item count silently drops to $0 — no crash, no negative inventory.');
  });

  it('zero-priced item (e.g. free water) does not contribute to dispatched', () => {
    const freePrices = {
      hotdog: [
        { name: 'Hotdogs', price: 6 },
        { name: 'Water', price: 0 },  // free promo
      ],
    };
    const entry = {
      category: 'hotdog',
      morning: { Hotdogs: 24, Water: 100 },  // 100 free waters
      evening: {}, meals: {}, reloads: [],
      cash: 144, debit: 0,
    };
    const r = computeReconciliation(entry, freePrices);
    assert.equal(r.dispatched, 144,
      'zero-priced items must contribute $0 to dispatched, not be skipped or crash.');
    assert.equal(r.recon, 0);
  });

  it('floating-point precision: 24 × $6.99 + cash → recon close to 0', () => {
    const fpPrices = {
      hotdog: [{ name: 'Hotdogs', price: 6.99 }],
    };
    const entry = {
      category: 'hotdog',
      morning: { Hotdogs: 24 },  // $167.76
      evening: {}, meals: {}, reloads: [],
      cash: 167.76,
      debit: 0,
    };
    const r = computeReconciliation(entry, fpPrices);
    // Float math may produce 167.75999... — assert "close enough to 0" (within $0.01)
    assert.ok(Math.abs(r.recon) < 0.01,
      `expected recon near 0, got ${r.recon}. Float drift this large means rounding broke.`);
  });

  it('very large day: 9999 items × $7 stays accurate', () => {
    const entry = {
      category: 'hotdog',
      morning: { Sausage: 9999 },  // $69,993
      evening: {}, meals: {}, reloads: [],
      cash: 69993, debit: 0,
    };
    const r = computeReconciliation(entry, prices);
    assert.equal(r.dispatched, 69993);
    assert.equal(r.recon, 0,
      'large-volume days must not lose precision.');
  });

  it('legacy combo with reloadsA/reloadsB but ALSO stray reload0A field is robust', () => {
    // Defensive: if normalizeEntry hasn't run yet for some reason and a flat
    // reload0A field still exists alongside reloadsA[], we want the array to
    // win (since that's what the UI writes to). Stray flat fields shouldn't
    // double-count.
    const entry = {
      category: 'combo',
      comboCategoryA: 'hotdog',
      comboCategoryB: 'novelty',
      morningA: { Hotdogs: 24 },
      morningB: {},
      reloadsA: [ { Hotdogs: 12 } ],   // canonical array — $72
      reload0A: { Hotdogs: 999 },      // stray legacy flat — should be ignored by recon
      eveningA: {}, eveningB: {},
      mealsA: {}, mealsB: {},
      reloadsB: [],
      cash: 0, debit: 0,
    };
    const r = computeReconciliation(entry, prices);
    // Should be 144 + 72 = 216, NOT 144 + 72 + 5994.
    assert.equal(r.dispatched, 216,
      'recon math must read from canonical arrays only — stray legacy flat fields ignored.');
  });

  it('empty arrays vs missing arrays produce identical results', () => {
    const withEmpty = {
      category: 'hotdog',
      morning: { Hotdogs: 24 },
      evening: {}, meals: {}, reloads: [],
      cash: 0, debit: 0,
    };
    const withMissing = {
      category: 'hotdog',
      morning: { Hotdogs: 24 },
      // no evening, meals, reloads at all
      cash: 0, debit: 0,
    };
    const r1 = computeReconciliation(withEmpty,   prices);
    const r2 = computeReconciliation(withMissing, prices);
    assert.deepEqual(r1, r2,
      'undefined fields must be treated equivalent to empty fields.');
  });
});

// ══════════════════════════════════════════════════════════════════════
// FUNCTION-LEVEL — direct unit tests for sumItems / sumReloads
// ══════════════════════════════════════════════════════════════════════

describe('sumItems()', () => {
  const items = [
    { name: 'A', price: 10 },
    { name: 'B', price: 5 },
  ];

  it('sums prices × counts', () => {
    assert.equal(sumItems(items, { A: 3, B: 2 }), 40);
  });

  it('returns 0 for null dict', () => {
    assert.equal(sumItems(items, null), 0);
  });

  it('returns 0 for non-array items', () => {
    assert.equal(sumItems(null, { A: 3 }), 0);
    assert.equal(sumItems(undefined, { A: 3 }), 0);
  });

  it('ignores items not in the price catalog', () => {
    assert.equal(sumItems(items, { A: 1, X: 999 }), 10,
      'X is not in catalog — should not contribute to total.');
  });

  it('treats missing item count as 0, not NaN', () => {
    assert.equal(sumItems(items, {}), 0);
  });
});

describe('sumReloads()', () => {
  const items = [{ name: 'A', price: 10 }];

  it('sums multiple reload objects', () => {
    const reloads = [{ A: 1 }, { A: 2 }, { A: 3 }];
    assert.equal(sumReloads(items, reloads), 60);
  });

  it('returns 0 for non-array reloads', () => {
    assert.equal(sumReloads(items, null), 0);
    assert.equal(sumReloads(items, undefined), 0);
    assert.equal(sumReloads(items, {}), 0,  // object not array
      'object instead of array should fail closed (return 0), not throw.');
  });

  it('handles array containing null/undefined entries', () => {
    const reloads = [{ A: 5 }, null, undefined, { A: 3 }];
    assert.equal(sumReloads(items, reloads), 80,
      'null/undefined slots must be skipped, not crash.');
  });

  it('returns 0 for empty array', () => {
    assert.equal(sumReloads(items, []), 0);
  });
});

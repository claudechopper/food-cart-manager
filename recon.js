// Pure reconciliation math — no DOM, no globals.
// Single source of truth used by both the live UI (index.html) and the test suite.
//
// SIGN CONVENTION:
//   recon = (cash + debit + leftover + meals) - dispatched
//   • Positive = overage (more came back than went out).
//   • Negative = short (less came back than went out).
//   • Zero    = balanced.
//
// "Dispatched" = morning + all reloads (single-cart) OR
//                morningA + morningB + reloadsA[] + reloadsB[] (combo).

(function (root) {
  'use strict';

  function num(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // Sum the dollar value of an items list against a {itemName: count} dict.
  function sumItems(items, dict) {
    if (!Array.isArray(items) || !dict) return 0;
    return items.reduce(function (s, it) {
      return s + (dict[it.name] || 0) * it.price;
    }, 0);
  }

  // Sum a list of reload objects (each is a {itemName: count} dict).
  function sumReloads(items, reloads) {
    if (!Array.isArray(reloads)) return 0;
    return reloads.reduce(function (s, r) { return s + sumItems(items, r); }, 0);
  }

  // Pure reconciliation calculator.
  //
  // entry: a single entry object (single-cart or combo).
  // prices: the same shape as state.prices — { hotdog: [...], novelty: [...], ... }.
  //
  // Returns: { dispatched, leftover, meals, recon }
  function computeReconciliation(entry, prices) {
    if (!entry) return { dispatched: 0, leftover: 0, meals: 0, recon: 0 };
    var isCombo = entry.category === 'combo';
    var cash    = num(entry.cash);
    var debit   = num(entry.debit);

    var dispatched = 0;
    var leftover   = 0;
    var meals      = 0;

    if (isCombo) {
      var aKey   = entry.comboCategoryA || 'hotdog';
      var bKey   = entry.comboCategoryB;
      var itemsA = (prices && prices[aKey]) || [];
      var itemsB = (prices && bKey && prices[bKey]) || [];
      dispatched = sumItems(itemsA, entry.morningA) + sumItems(itemsB, entry.morningB)
                 + sumReloads(itemsA, entry.reloadsA) + sumReloads(itemsB, entry.reloadsB);
      leftover   = sumItems(itemsA, entry.eveningA) + sumItems(itemsB, entry.eveningB);
      meals      = sumItems(itemsA, entry.mealsA)   + sumItems(itemsB, entry.mealsB);
    } else {
      // Non-inventory categories (fry, softserve, benjerry without prices) just track cash/debit.
      var items = (prices && prices[entry.category]) || [];
      dispatched = sumItems(items, entry.morning) + sumReloads(items, entry.reloads);
      leftover   = sumItems(items, entry.evening);
      meals      = sumItems(items, entry.meals);
    }

    var recon = cash + debit + leftover + meals - dispatched;
    return { dispatched: dispatched, leftover: leftover, meals: meals, recon: recon };
  }

  var api = {
    computeReconciliation: computeReconciliation,
    sumItems: sumItems,
    sumReloads: sumReloads
  };

  // Universal module — works in browser <script> AND in Node require().
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ReconMath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

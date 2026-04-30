# Design: Combined Carts, Reloads & Employee Meals

**Date:** 2026-04-30  
**Status:** Approved  
**Scope:** Three related features that extend the entry form for food-cart-manager

---

## Overview

Three new capabilities are being added to the entry form:

1. **Combined Cart mode** — one worker, one cash, two carts (hotdog + one other) saved as a single entry
2. **Reloads** — up to two mid-day inventory restocks per entry, each added on-demand
3. **Employee Meals** — track what workers ate from inventory; deducted from reconciliation

These features apply to all inventory-based cart entries (`HAS_INVENTORY` categories: `novelty`, `hotdog`, `benjerry`).

---

## Feature 1: Combined Cart Mode

### Real-world context

The normal case is separate workers with separate cash (current behaviour, unchanged). Occasionally one worker runs two carts with a single shared cash pool. The only combos that occur are:
- **Hotdog + Novelty** (common)
- **Hotdog + Ben & Jerry's** (occasional)

Hotdog is always one of the two carts.

### UI behaviour

- A **"＋ Combine with another cart"** button appears at the top of every Hotdog entry form (below the Workers row), styled as a grey dashed inactive button.
- Tapping it opens an inline picker with two choices: **Novelty Cart** / **B&J Truck**.
- After picking, the button is replaced by an active "🔀 Combined with: [Cart Name]" indicator with a "change ▾" option.
- The banner changes to a split gradient: red (hotdog) | purple/blue (second cart), with a **COMBO** badge.
- The form expands to show **separate morning load sections per cart**, colour-coded.
- A single **cash / debit / tips** section covers both carts.
- Evening leftover is split into **separate recount sections per cart**.
- When combo mode is **activated**, any existing hotdog draft data (morning counts etc.) is preserved and becomes the `A` (hotdog) side of the combo entry. The draft's `category` is updated from `'hotdog'` to `'combo'` in place.
- When combo mode is **deactivated** (user clears it), the entry reverts to `category: 'hotdog'` and any data entered in the second-cart (`B`) sections is discarded after a confirmation prompt.

### Saved view

Combo entries appear as **one entry** in the Saved tab, labelled:  
`🌭 Hotdog Cart 1 + 🍦 Novelty Cart 2`  
with the COMBO badge. Expansion shows combined totals plus per-cart inventory breakdown.

### Reconciliation formula (combo)

```
(All Hotdog Loads) + (All Second-Cart Loads)
  − Cash − Debit
  − (Hotdog Leftover) − (Second-Cart Leftover)
  − (Hotdog Meals) − (Second-Cart Meals)
= 0
```

---

## Feature 2: Reloads

### Real-world context

Carts sometimes go back to base mid-day for a top-up of inventory. These need to be tracked so the reconciliation math stays correct (more inventory out = more expected cash in).

### UI behaviour

- Two grey dashed buttons appear after the Morning Load section:
  - **"🔄 Add Reload #1"**
  - **"🔄 Add Reload #2"**
- Tapping a button replaces it with a fully expanded inventory input section, **amber left-border** accent, header "🔄 Reload #1" (or #2).
- Both reload buttons are always present and can be activated independently in any order.
- Each reload has the same item list as Morning Load.
- Each reload shows its own **Load Total** subtotal.
- A **Combined Morning + Reloads Total** row (green) updates live above the Evening section whenever any load changes.

### For combo entries

Each reload tap opens **both carts' reload sections simultaneously** — one tap, both sections appear (labelled "Reload #1 — 🌭 Hotdog" and "Reload #1 — 🍦 Novelty"). They can't be opened independently.

### Reconciliation impact

All loads sum together as the total inventory dispatched:

```
Morning + Reload #1 + Reload #2 = Total Dispatched
```

---

## Feature 3: Employee Meals

### Real-world context

Workers eat from the inventory during their shift. This is expected and not theft — but it must be accounted for in reconciliation or the books will appear short.

### UI behaviour

- A grey dashed **"🍽️ Employee Meals"** button appears after the reload buttons (before the Evening divider).
- Tapping it expands an **amber-yellow** section with the same item list as the cart's inventory.
- Each item has a count input; the $ value is shown per line (same price as morning).
- A **Meals Total** row shows the total $ value consumed.
- For **combo entries**, there are **two separate meal buttons** — one per cart type — since they have different item lists.

### Reconciliation impact

Meals are treated like a known loss: inventory that left the cart but generated no cash.

```
Total Dispatched − Cash − Debit − Leftover − Meals = 0
```

The meals total is also surfaced in the saved entry and exports so it's visible in reporting.

---

## Data Model Changes

### Regular entries (non-combo)

Current shape:
```js
{ id, date, cart, category, location, workers,
  morning: {}, evening: {}, cash, debit, tips, notes, locked, createdAt }
```

New fields added (all optional, default to `{}`):
```js
reload1: {},   // inventory counts — same shape as morning
reload2: {},   // inventory counts — same shape as morning
meals:   {},   // inventory counts — same shape as morning
```

Backward compatibility: `normalizeState()` sets missing fields to `{}`. Existing entries without these fields behave identically to today.

### Combo entries

New entry type, `category: 'combo'`:
```js
{
  id, date, cart,            // cart = "Hotdog Cart 1 + Novelty Cart 2"
  category: 'combo',
  comboCategoryB: 'novelty', // 'novelty' | 'benjerry'
  comboCartB: 'Novelty Cart 2',

  location, workers,

  // Per-cart inventory (A = hotdog, B = second cart)
  morningA: {},  reload1A: {},  reload2A: {},  mealsA: {},  eveningA: {},
  morningB: {},  reload1B: {},  reload2B: {},  mealsB: {},  eveningB: {},

  cash, debit, tips, notes, locked, createdAt
}
```

`normalizeState()` must handle `category: 'combo'` entries — ensure all A/B fields default to `{}` if missing.

---

## Rendering Architecture

### New rendering paths

| Entry type | Render function |
|---|---|
| Normal (novelty, hotdog, benjerry) | `renderFormHTML(e)` — extended with reload/meals buttons |
| Combo | `renderComboFormHTML(e)` — new function, separate from normal |
| Normal trucks (fry, softserve) | Unchanged — no inventory, no reload/meals |

`renderEntryView()` dispatches to the correct renderer based on `entry.category`.

### Recalculation

`recalcAll()` must be updated to:
1. Sum `morning + reload1 + reload2` per cart for total dispatched
2. Subtract `meals` from expected income
3. For combo entries, sum across both carts before reconciling

### Combo picker activation

Combo mode is only accessible from a Hotdog entry. The picker shows the other cart names from `state.carts.novelty` and `state.carts.benjerry`.

---

## Saved View Changes

### Normal entries

Display existing `reload1`, `reload2`, `meals` totals in the expanded view (collapsed by default as they are today).

### Combo entries

- Single row in the grouped list: `🌭 [HotdogCart] + 🍦 [SecondCart]` with COMBO badge
- Expanded view shows per-cart inventory breakdown, then shared cash/debit, then combined reconciliation
- CSV/JSON export produces one row for the combo entry (combined totals)

---

## Out of Scope

- Splitting a combo entry back into two separate entries after locking
- Per-worker meal tracking (total per shift is sufficient)
- Combos involving carts other than hotdog as the base
- More than 2 carts in a single combo
- Realtime reload notifications to other devices (sync handles it like any other save)

---

## Open Questions (resolved)

| Question | Answer |
|---|---|
| Always hotdog + novelty, or flexible? | Hotdog + Novelty or Hotdog + B&J only |
| One combined entry or two linked entries? | One entry |
| Per-worker meals or total? | Total per shift |
| Reloads: always-present or add-on-demand? | Grey buttons, add on-demand |
| Meals: per-cart or shared in combo? | Per-cart (separate buttons) |

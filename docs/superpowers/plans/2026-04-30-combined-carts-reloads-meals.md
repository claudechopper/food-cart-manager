# Combined Carts, Reloads & Employee Meals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add combined-cart mode (1 worker, 1 cash, 2 carts saved as one entry), mid-day reloads (up to 2 per cart), and employee meals tracking to the food-cart-manager entry form.

**Architecture:** All changes are in a single file (`index.html`). New fields (`reload1`, `reload2`, `meals`) are added to entry objects with backward-compat defaults. Combo entries use a parallel field naming scheme (`morningA`/`morningB`, etc.) with `category: 'combo'`. UI state for expand/collapse is managed via module-level boolean flags reset on cart navigation.

**Tech Stack:** Vanilla JS, HTML, CSS — no build step, no test framework. Verification is manual in-browser after each task. Open `index.html` served via `npx serve` (already configured for Railway).

**Spec:** `docs/superpowers/specs/2026-04-30-combined-carts-reloads-meals-design.md`

---

## Before you start — back up existing data

- [ ] **Open the live app, go to Settings, click "Export JSON backup"**

  This downloads `food-cart-manager-backup-YYYY-MM-DD.json`. Save it somewhere safe. This is the restore point if anything goes wrong during development. The existing `btn-export-json` handler at the bottom of the `<script>` already does this.

---

## Task 1: Fix eye icon on wage input (quick win)

**Files:** `index.html` — `wirePayrollHandlers` function (~line 1554)

**Problem:** `inp.type = 'number'` silently drops the internal value on some browsers when switching from `type="password"`. Switch to `type="text"` instead — the blur handler already validates and saves the number.

- [ ] **Step 1: Find and replace the type toggle**

  Find this block inside `wirePayrollHandlers`:

  ```js
  eyeBtn.addEventListener('click', () => {
    if (inp.type === 'password') {
      inp.type = 'number';
      inp.focus();
      inp.select();
    } else {
      inp.type = 'password';
    }
  });
  ```

  Replace with:

  ```js
  eyeBtn.addEventListener('click', () => {
    if (inp.type === 'password') {
      inp.type = 'text';
      inp.focus();
      inp.select();
    } else {
      inp.type = 'password';
    }
  });
  ```

- [ ] **Step 2: Verify manually**

  - Open Payroll view
  - Set a worker's hourly rate to e.g. 18
  - Click blur (click elsewhere) — value saves and masks to ●●●●
  - Click 👁 eye — field should reveal "18", not be blank
  - Click 👁 again — masks back to ●●●●

- [ ] **Step 3: Commit**

  ```bash
  git add index.html && git commit -m "fix: wage eye icon now reveals number correctly"
  ```

---

## Task 2: `normalizeEntry` — backward compatibility for new fields

**Files:** `index.html` — add `normalizeEntry(e)` function; call it in `load()` and `pullFromCloud()`

New code will read `e.reload1`, `e.reload2`, `e.meals`, `e.morningA`, etc. Old entries don't have these. This task adds a single normalization function called at every point where entries enter the app.

- [ ] **Step 1: Add `normalizeEntry` after the existing `normalizeState` function**

  Find the end of the `normalizeState` function:

  ```js
    for (const cat of Object.keys(DEFAULT_PRICES)) {
      if (!Array.isArray(p.prices[cat])) p.prices[cat] = structuredClone(DEFAULT_PRICES[cat]);
    }
  }
  ```

  Insert immediately after the closing `}`:

  ```js
  function normalizeEntry(e) {
    // Ensure base inventory fields exist for inventory-bearing categories
    if (HAS_INVENTORY(e.category)) {
      if (!e.morning || typeof e.morning !== 'object') e.morning = {};
      if (!e.evening || typeof e.evening !== 'object') e.evening = {};
      if (!e.reload1 || typeof e.reload1 !== 'object') e.reload1 = {};
      if (!e.reload2 || typeof e.reload2 !== 'object') e.reload2 = {};
      if (!e.meals  || typeof e.meals  !== 'object') e.meals  = {};
    }
    // Ensure combo fields exist for combo entries
    if (e.category === 'combo') {
      if (!e.morningA  || typeof e.morningA  !== 'object') e.morningA  = {};
      if (!e.eveningA  || typeof e.eveningA  !== 'object') e.eveningA  = {};
      if (!e.reload1A  || typeof e.reload1A  !== 'object') e.reload1A  = {};
      if (!e.reload2A  || typeof e.reload2A  !== 'object') e.reload2A  = {};
      if (!e.mealsA    || typeof e.mealsA    !== 'object') e.mealsA    = {};
      if (!e.morningB  || typeof e.morningB  !== 'object') e.morningB  = {};
      if (!e.eveningB  || typeof e.eveningB  !== 'object') e.eveningB  = {};
      if (!e.reload1B  || typeof e.reload1B  !== 'object') e.reload1B  = {};
      if (!e.reload2B  || typeof e.reload2B  !== 'object') e.reload2B  = {};
      if (!e.mealsB    || typeof e.mealsB    !== 'object') e.mealsB    = {};
    }
    if (!Array.isArray(e.workers)) e.workers = [{ worker: '', start: '', end: '' }];
  }
  ```

- [ ] **Step 2: Call `normalizeEntry` in `load()`**

  In the `load()` function, find the line:

  ```js
    for (const cat of Object.keys(DEFAULT_PRICES)) {
      if (!Array.isArray(p.prices[cat])) p.prices[cat] = structuredClone(DEFAULT_PRICES[cat]);
    }
    return p;
  ```

  Insert before `return p;`:

  ```js
    for (const e of (p.entries || [])) normalizeEntry(e);
    return p;
  ```

- [ ] **Step 3: Call `normalizeEntry` in `pullFromCloud()` after setting `state`**

  In `pullFromCloud()`, find:

  ```js
    normalizeState(rows[0].state);
    state = rows[0].state;
    localStorage.setItem(KEY, JSON.stringify(state));
  ```

  Replace with:

  ```js
    normalizeState(rows[0].state);
    state = rows[0].state;
    for (const e of (state.entries || [])) normalizeEntry(e);
    localStorage.setItem(KEY, JSON.stringify(state));
  ```

- [ ] **Step 4: Call `normalizeEntry` in `getOrCreateDraft()` when creating a new entry**

  In `getOrCreateDraft()`, find:

  ```js
    if (!e) {
      e = {
        id: Date.now() + '-' + Math.random().toString(36).slice(2,7),
        date, cart, category: activeCategory,
        location: '',
        workers: [{ worker: '', start: '', end: '' }],
        morning: {},
        evening: {},
        cash: 0, debit: 0, tips: 0,
        notes: '',
        locked: false,
        createdAt: new Date().toISOString()
      };
      state.entries.push(e);
      save();
    }
    return e;
  ```

  Replace with:

  ```js
    if (!e) {
      e = {
        id: Date.now() + '-' + Math.random().toString(36).slice(2,7),
        date, cart, category: activeCategory,
        location: '',
        workers: [{ worker: '', start: '', end: '' }],
        morning: {},
        evening: {},
        reload1: {}, reload2: {}, meals: {},
        cash: 0, debit: 0, tips: 0,
        notes: '',
        locked: false,
        createdAt: new Date().toISOString()
      };
      normalizeEntry(e);
      state.entries.push(e);
      save();
    } else {
      normalizeEntry(e); // ensure old entries get new fields
    }
    return e;
  ```

- [ ] **Step 5: Verify**

  - Open app with existing data — no errors in console
  - The entries still display correctly in Saved view
  - The entry form still works

- [ ] **Step 6: Commit**

  ```bash
  git add index.html && git commit -m "feat: normalizeEntry ensures reload/meals fields on all entries"
  ```

---

## Task 3: Module-level UI expand/collapse state + reset on navigation

**Files:** `index.html` — near the top of JS (after the CLOUD_HEADERS block, before CONSTANTS)

The reload and meals sections are expanded/collapsed via JS flags. They reset when you navigate to a different cart.

- [ ] **Step 1: Add three boolean flags after the cloud sync vars**

  Find:

  ```js
  let lastSyncedAt = null;
  let initialPullDone = false; // Block pushes until we've pulled once
  ```

  Insert immediately after:

  ```js
  // ── Reload / Meals expand state (reset on cart navigation) ──
  let reload1Open = false;
  let reload2Open = false;
  let mealsOpen   = false;
  ```

- [ ] **Step 2: Reset flags in primary tab onclick**

  In `renderPrimaryTabs()`, find the line inside the `btn.onclick` handler:

  ```js
    btn.onclick = () => {
      activeCategory = c.key;
      activeCartIdx = 0;
      showView('entry');
  ```

  Replace with:

  ```js
    btn.onclick = () => {
      activeCategory = c.key;
      activeCartIdx = 0;
      reload1Open = false; reload2Open = false; mealsOpen = false;
      showView('entry');
  ```

- [ ] **Step 3: Reset flags in sub-tab onclick**

  In `renderSubTabs()`, find:

  ```js
    btn.onclick = () => {
      activeCartIdx = i;
      renderSubTabs();
      renderEntryView();
    };
  ```

  Replace with:

  ```js
    btn.onclick = () => {
      activeCartIdx = i;
      reload1Open = false; reload2Open = false; mealsOpen = false;
      renderSubTabs();
      renderEntryView();
    };
  ```

- [ ] **Step 4: Auto-expand if entry already has reload/meals data**

  In `renderEntryView()`, find:

  ```js
  function renderEntryView(){
    const cartName = activeCartName() || '(no cart)';
  ```

  Replace with:

  ```js
  function renderEntryView(){
    const cartName = activeCartName() || '(no cart)';
    // Auto-expand reload/meals sections if they already have data
    const _draft = state.entries.find(x =>
      x.date === ($('global-date')?.value || todayStamp()) &&
      x.cart === cartName && !x.locked
    );
    if (_draft) {
      if (Object.values(_draft.reload1 || {}).some(v => v > 0)) reload1Open = true;
      if (Object.values(_draft.reload2 || {}).some(v => v > 0)) reload2Open = true;
      if (Object.values(_draft.meals   || {}).some(v => v > 0)) mealsOpen   = true;
    }
  ```

- [ ] **Step 5: Verify**

  - Navigate between cart tabs — no errors
  - Will fully verify in Task 4 once the UI is rendered

- [ ] **Step 6: Commit**

  ```bash
  git add index.html && git commit -m "feat: add reload/meals expand-state flags with nav reset"
  ```

---

## Task 4: Reloads UI in `renderFormHTML` + `attachFormHandlers`

**Files:** `index.html` — `renderFormHTML`, `attachFormHandlers`

Adds "🔄 Add Reload #1" and "🔄 Add Reload #2" grey buttons after the Morning section. Tapping expands that reload's inventory inputs inline.

- [ ] **Step 1: Update the morning section HTML inside `renderFormHTML`**

  Find the existing morning section block (inside the `if (HAS_INVENTORY(activeCategory))` branch):

  ```js
      html += `
        <div class="section morning">
          <h3>🌅 Morning — Inventory Out</h3>
          ${morningRows}
          <div class="grand-total">
            <span>GRAND TOTAL OUT</span>
            <span class="amount" id="morning-grand">$0.00</span>
          </div>
        </div>

        <div class="section evening">
  ```

  Replace with:

  ```js
      // ── Reload row builders ──────────────────────────────────
      function reloadRowsHTML(field) {
        return items.map(it => `
          <div class="item-line">
            <div class="name">${escapeHtml(it.name)}<span class="price">$${it.price.toFixed(2)} each</span></div>
            <input type="number" inputmode="numeric" min="0" step="1"
              data-reload="${field}" data-item="${escapeHtml(it.name)}" data-price="${it.price}"
              placeholder="0" value="${(e[field]?.[it.name]) ?? ''}">
            <div class="total" data-reload-total="${field}-${escapeHtml(it.name)}">$0.00</div>
          </div>`).join('');
      }
      function reloadSectionHTML(num, field, label) {
        if ((num === 1 && !reload1Open) || (num === 2 && !reload2Open)) {
          return `<button type="button" class="add-optional-btn" id="add-reload${num}-btn">
            🔄 Add Reload #${num}</button>`;
        }
        return `<div class="section reload-section">
          <h3 class="reload-header">🔄 ${label}</h3>
          ${reloadRowsHTML(field)}
          <div class="grand-total" style="border-color:#ff9500">
            <span>Reload #${num} Total</span>
            <span class="amount" id="reload${num}-grand">$0.00</span>
          </div>
        </div>`;
      }
      // ── Meals row builder ────────────────────────────────────
      function mealsSectionHTML() {
        if (!mealsOpen) {
          return `<button type="button" class="add-optional-btn" id="add-meals-btn">
            🍽️ Employee Meals</button>`;
        }
        const mealRows = items.map(it => `
          <div class="item-line">
            <div class="name">${escapeHtml(it.name)}<span class="price">$${it.price.toFixed(2)} each</span></div>
            <input type="number" inputmode="numeric" min="0" step="1"
              data-meals="${escapeHtml(it.name)}" data-price="${it.price}"
              placeholder="0" value="${(e.meals?.[it.name]) ?? ''}">
            <div class="total" data-meals-total="${escapeHtml(it.name)}">$0.00</div>
          </div>`).join('');
        return `<div class="section meals-section">
          <h3 class="meals-header">🍽️ Employee Meals</h3>
          ${mealRows}
          <div class="grand-total" style="border-color:#f59e0b">
            <span>Meals Total (deducted)</span>
            <span class="amount" id="meals-grand">$0.00</span>
          </div>
        </div>`;
      }

      html += `
        <div class="section morning">
          <h3>🌅 Morning Load</h3>
          ${morningRows}
          <div class="grand-total">
            <span>Morning Total</span>
            <span class="amount" id="morning-grand">$0.00</span>
          </div>
        </div>
        ${reloadSectionHTML(1, 'reload1', 'Reload #1')}
        ${reloadSectionHTML(2, 'reload2', 'Reload #2')}
        ${mealsSectionHTML()}
        <div class="grand-total dispatched-total">
          <span>⬆ Total Dispatched</span>
          <span class="amount" id="dispatched-grand">$0.00</span>
        </div>

        <div class="section evening">
  ```

- [ ] **Step 2: Add CSS for the new optional-button style**

  Find the existing `<style>` section in `<head>`. Near the end of the CSS (before the closing `</style>`), add:

  ```css
  .add-optional-btn {
    width: 100%;
    padding: 10px 14px;
    background: #1a1a2a;
    border: 1px dashed #3a3a50;
    border-radius: 10px;
    color: #555;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    margin: 2px 0;
  }
  .reload-section { border-left: 3px solid #ff9500; padding-left: 10px; margin: 4px 0; }
  .reload-header { color: #ff9500; font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .meals-section { border-left: 3px solid #f59e0b; padding-left: 10px; margin: 4px 0; }
  .meals-header { color: #f59e0b; font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .dispatched-total { background: #0e1a0e; border-color: #22c55e; margin-top: 4px; }
  ```

- [ ] **Step 3: Wire up the optional-section buttons in `attachFormHandlers`**

  At the end of `attachFormHandlers`, before the closing `}`, add:

  ```js
  // Reload / Meals expand buttons
  const r1Btn = $('add-reload1-btn');
  if (r1Btn) r1Btn.addEventListener('click', () => { reload1Open = true; renderEntryView(); });
  const r2Btn = $('add-reload2-btn');
  if (r2Btn) r2Btn.addEventListener('click', () => { reload2Open = true; renderEntryView(); });
  const mBtn = $('add-meals-btn');
  if (mBtn) mBtn.addEventListener('click', () => { mealsOpen = true; renderEntryView(); });

  // Reload inputs
  document.querySelectorAll('[data-reload]').forEach(inp => {
    inp.addEventListener('input', () => {
      const field = inp.dataset.reload; // 'reload1' or 'reload2'
      const item  = inp.dataset.item;
      updateDraft(e => {
        if (!e[field]) e[field] = {};
        e[field][item] = num(inp.value);
      });
      recalcAll();
    });
  });

  // Meals inputs
  document.querySelectorAll('[data-meals]').forEach(inp => {
    inp.addEventListener('input', () => {
      const item = inp.dataset.meals;
      updateDraft(e => {
        if (!e.meals) e.meals = {};
        e.meals[item] = num(inp.value);
      });
      recalcAll();
    });
  });
  ```

- [ ] **Step 4: Verify visually**

  - Open a Novelty or Hotdog cart entry
  - The Morning Load section heading shows "🌅 Morning Load"
  - Two grey buttons appear: "🔄 Add Reload #1" and "🔄 Add Reload #2"
  - "🍽️ Employee Meals" grey button appears
  - "⬆ Total Dispatched" row appears below (shows same as morning total initially)
  - Clicking "Add Reload #1" expands the reload inputs inline
  - Typing numbers in the reload inputs updates the state (check via JSON export or Supabase)
  - Clicking "Add Reload #2" expands reload 2 independently

- [ ] **Step 5: Commit**

  ```bash
  git add index.html && git commit -m "feat: add reload and meals section buttons to entry form"
  ```

---

## Task 5: Update `recalcAll` for reloads and meals

**Files:** `index.html` — `recalcAll` function

The existing reconciliation is `morning - cash - debit - leftover`. Update it to:
`(morning + reload1 + reload2) - cash - debit - leftover - meals = 0`

- [ ] **Step 1: Replace the `recalcAll` body for inventory entries**

  Find the entire block that starts with `if (HAS_INVENTORY(activeCategory)) {` inside `recalcAll`. Replace the whole block (up to but not including the tips section) with:

  ```js
  if (HAS_INVENTORY(activeCategory)) {
    const items = state.prices[activeCategory];
    const draft = state.entries.find(x =>
      x.date === ($('global-date').value || todayStamp()) &&
      x.cart === activeCartName() && !x.locked
    );

    // Morning
    let morningTotal = 0;
    items.forEach(it => {
      const inp = document.querySelector(`[data-morning="${cssEscape(it.name)}"]`);
      const cnt = inp ? num(inp.value) : 0;
      const total = cnt * it.price;
      morningTotal += total;
      const cell = document.querySelector(`[data-morning-total="${cssEscape(it.name)}"]`);
      if (cell) cell.textContent = fmt(total);
    });
    const mg = $('morning-grand'); if (mg) mg.textContent = fmt(morningTotal);

    // Reload 1
    let reload1Total = 0;
    if (reload1Open) {
      items.forEach(it => {
        const inp = document.querySelector(`[data-reload="reload1"][data-item="${cssEscape(it.name)}"]`);
        const cnt = inp ? num(inp.value) : 0;
        const total = cnt * it.price;
        reload1Total += total;
        const cell = document.querySelector(`[data-reload-total="reload1-${cssEscape(it.name)}"]`);
        if (cell) cell.textContent = fmt(total);
      });
      const r1g = $('reload1-grand'); if (r1g) r1g.textContent = fmt(reload1Total);
    } else if (draft) {
      // Not expanded but data may exist (auto-expanded on load)
      items.forEach(it => { reload1Total += (draft.reload1?.[it.name] || 0) * it.price; });
    }

    // Reload 2
    let reload2Total = 0;
    if (reload2Open) {
      items.forEach(it => {
        const inp = document.querySelector(`[data-reload="reload2"][data-item="${cssEscape(it.name)}"]`);
        const cnt = inp ? num(inp.value) : 0;
        const total = cnt * it.price;
        reload2Total += total;
        const cell = document.querySelector(`[data-reload-total="reload2-${cssEscape(it.name)}"]`);
        if (cell) cell.textContent = fmt(total);
      });
      const r2g = $('reload2-grand'); if (r2g) r2g.textContent = fmt(reload2Total);
    } else if (draft) {
      items.forEach(it => { reload2Total += (draft.reload2?.[it.name] || 0) * it.price; });
    }

    // Meals
    let mealsTotal = 0;
    if (mealsOpen) {
      items.forEach(it => {
        const inp = document.querySelector(`[data-meals="${cssEscape(it.name)}"]`);
        const cnt = inp ? num(inp.value) : 0;
        const total = cnt * it.price;
        mealsTotal += total;
        const cell = document.querySelector(`[data-meals-total="${cssEscape(it.name)}"]`);
        if (cell) cell.textContent = fmt(total);
      });
      const mgg = $('meals-grand'); if (mgg) mgg.textContent = fmt(mealsTotal);
    } else if (draft) {
      items.forEach(it => { mealsTotal += (draft.meals?.[it.name] || 0) * it.price; });
    }

    // Leftover
    let leftoverTotal = 0;
    items.forEach(it => {
      const inp = document.querySelector(`[data-evening="${cssEscape(it.name)}"]`);
      const cnt = inp ? num(inp.value) : 0;
      const total = cnt * it.price;
      leftoverTotal += total;
      const cell = document.querySelector(`[data-evening-total="${cssEscape(it.name)}"]`);
      if (cell) cell.textContent = fmt(total);
    });
    const lg = $('leftover-grand'); if (lg) lg.textContent = fmt(leftoverTotal);

    const totalDispatched = morningTotal + reload1Total + reload2Total;
    const dg = $('dispatched-grand'); if (dg) dg.textContent = fmt(totalDispatched);

    const cash  = num(document.querySelector('[data-field="cash"]')?.value);
    const debit = num(document.querySelector('[data-field="debit"]')?.value);
    const diff  = totalDispatched - cash - debit - leftoverTotal - mealsTotal;
    const box     = $('recon-box');
    const status  = $('recon-status');
    const formula = $('recon-formula');
    if (box) {
      const absDiff = Math.abs(diff);
      const matched = absDiff <= 5.005;
      const over    = !matched && diff > 0;
      const under   = !matched && diff < 0;
      box.classList.toggle('match',      matched);
      box.classList.toggle('diff-over',  over);
      box.classList.toggle('diff-under', under);
      const ck = $('recon-checkmark');
      if (ck) ck.style.display = matched ? 'block' : 'none';
      status.textContent  = matched ? 'Balanced' : `⚠ Discrepancy: ${diff > 0 ? '+' : ''}${fmt(diff)}`;
      const dispLabel = (reload1Total + reload2Total > 0) ? 'Dispatched' : fmt(morningTotal);
      const mealsLabel = mealsTotal > 0 ? ` − Meals ${fmt(mealsTotal)}` : '';
      formula.textContent = `${fmt(totalDispatched)} − ${fmt(cash)} − ${fmt(debit)} − Leftover ${fmt(leftoverTotal)}${mealsLabel} = ${fmt(diff)}`;
    }
  }
  ```

- [ ] **Step 2: Verify reconciliation math**

  - Enter morning counts for a hotdog cart
  - Add Reload #1 and enter counts — dispatched-grand should increase
  - Enter cash and leftover — recon box should update correctly
  - Add meals — recon box should account for them
  - Remove reload (navigate away and back with no values) — math still correct

- [ ] **Step 3: Commit**

  ```bash
  git add index.html && git commit -m "feat: recalcAll accounts for reloads and meals in reconciliation"
  ```

---

## Task 6: Combo mode — `activateComboMode` and `deactivateComboMode`

**Files:** `index.html` — new functions + combo button in `renderFormHTML`

- [ ] **Step 1: Add `activateComboMode` and `deactivateComboMode` functions**

  Add these two functions immediately after `deactivateComboMode`. Place them right before the `getOrCreateDraft` function:

  ```js
  function activateComboMode(draft, categoryB, cartNameB) {
    // Migrate hotdog-side fields to A-suffixed versions
    draft.morningA  = draft.morning  || {};
    draft.eveningA  = draft.evening  || {};
    draft.reload1A  = draft.reload1  || {};
    draft.reload2A  = draft.reload2  || {};
    draft.mealsA    = draft.meals    || {};
    // Initialise B-side fields
    draft.morningB  = {};
    draft.eveningB  = {};
    draft.reload1B  = {};
    draft.reload2B  = {};
    draft.mealsB    = {};
    // Remove old unsuffixed inventory fields
    delete draft.morning; delete draft.evening;
    delete draft.reload1; delete draft.reload2; delete draft.meals;
    // Set combo metadata
    draft.comboCategoryB = categoryB;
    draft.comboCartB     = cartNameB;
    draft.category       = 'combo';
    // Reset expand state
    reload1Open = false; reload2Open = false; mealsOpen = false;
    save();
    renderEntryView();
  }

  function deactivateComboMode(draft) {
    if (!confirm('Remove combo mode?\n\nThe second cart data will be discarded.')) return;
    // Restore hotdog-side fields
    draft.morning  = draft.morningA  || {};
    draft.evening  = draft.eveningA  || {};
    draft.reload1  = draft.reload1A  || {};
    draft.reload2  = draft.reload2A  || {};
    draft.meals    = draft.mealsA    || {};
    // Remove all combo fields
    ['morningA','eveningA','reload1A','reload2A','mealsA',
     'morningB','eveningB','reload1B','reload2B','mealsB',
     'comboCategoryB','comboCartB'].forEach(k => delete draft[k]);
    draft.category = 'hotdog';
    reload1Open = false; reload2Open = false; mealsOpen = false;
    save();
    renderEntryView();
  }
  ```

- [ ] **Step 2: Add combo button to hotdog entry forms in `renderFormHTML`**

  In `renderFormHTML`, after the location and workers HTML and before the morning section block, find:

  ```js
    if (HAS_INVENTORY(activeCategory)) {
  ```

  Insert immediately before that line:

  ```js
    // ── Combo button (hotdog only, not already in combo mode) ──
    if (activeCategory === 'hotdog' && e.category !== 'combo') {
      const noveltyCartNames = state.carts.novelty || [];
      const bjCartNames      = state.carts.benjerry || [];
      const comboTargets = [
        ...noveltyCartNames.map(n => ({ label: `🍦 ${n}`, category: 'novelty', name: n })),
        ...bjCartNames.map(n      => ({ label: `🍨 ${n}`, category: 'benjerry', name: n })),
      ];
      if (comboTargets.length > 0) {
        const targetOpts = comboTargets.map((t, i) =>
          `<option value="${i}">+ ${escapeHtml(t.label)}</option>`).join('');
        html += `
          <div class="combo-trigger-row" id="combo-trigger-row">
            <select id="combo-picker" style="flex:1">
              <option value="">＋ Combine with another cart…</option>
              ${targetOpts}
            </select>
          </div>`;
        // Store targets on window for the change handler (no global state pollution needed — re-rendered each time)
        window.__comboTargets = comboTargets;
      }
    }
  ```

- [ ] **Step 3: Wire up the combo picker in `attachFormHandlers`**

  At the end of `attachFormHandlers`, before the closing `}`, add:

  ```js
  // Combo picker
  const comboPicker = $('combo-picker');
  if (comboPicker) {
    comboPicker.addEventListener('change', () => {
      const idx = parseInt(comboPicker.value, 10);
      if (isNaN(idx)) return;
      const target = window.__comboTargets?.[idx];
      if (!target) return;
      const draft = getOrCreateDraft();
      activateComboMode(draft, target.category, target.name);
    });
  }
  ```

- [ ] **Step 4: Verify combo trigger (without combo form yet)**

  - Open a Hotdog cart entry
  - A "＋ Combine with another cart…" dropdown appears below Workers
  - Selecting "Novelty Cart 1" fires `activateComboMode`
  - Check console: no errors
  - Check state via JSON export: entry now has `category: 'combo'`, `morningA`, `comboCategoryB: 'novelty'`, `comboCartB: 'Novelty Cart 1'`
  - The form will re-render incorrectly for now (combo form not yet built) — that's expected

- [ ] **Step 5: Commit**

  ```bash
  git add index.html && git commit -m "feat: combo mode activation/deactivation logic"
  ```

---

## Task 7: `renderComboFormHTML` — the full combo entry form

**Files:** `index.html` — new function + dispatch in `renderEntryView`

- [ ] **Step 1: Add `renderComboFormHTML(e)` function**

  Add immediately after `renderFormHTML`:

  ```js
  function renderComboFormHTML(e) {
    const catA = CATEGORIES.find(c => c.key === 'hotdog') || { emoji: '🌭' };
    const catB = CATEGORIES.find(c => c.key === e.comboCategoryB) || { emoji: '🚚' };
    const itemsA = state.prices['hotdog'] || [];
    const itemsB = state.prices[e.comboCategoryB] || [];
    const locOptions  = renderSelectOptions(state.locations, e.location);
    const workerRows  = e.workers.map((w, i) => renderWorkerRowHTML(w, i)).join('');

    function invRowsHTML(items, fieldPrefix, data) {
      return items.map(it => `
        <div class="item-line">
          <div class="name">${escapeHtml(it.name)}<span class="price">$${it.price.toFixed(2)}</span></div>
          <input type="number" inputmode="numeric" min="0" step="1"
            data-combo-field="${fieldPrefix}" data-item="${escapeHtml(it.name)}" data-price="${it.price}"
            placeholder="0" value="${(data?.[it.name]) ?? ''}">
          <div class="total" data-combo-total="${fieldPrefix}-${escapeHtml(it.name)}">$0.00</div>
        </div>`).join('');
    }

    function comboReloadHTML(num, fieldA, fieldB, dataA, dataB) {
      const openFlag = num === 1 ? reload1Open : reload2Open;
      if (!openFlag) {
        return `<button type="button" class="add-optional-btn" id="add-reload${num}-btn">
          🔄 Add Reload #${num} (both carts)</button>`;
      }
      return `<div class="section reload-section">
        <h3 class="reload-header">🔄 Reload #${num} — ${catA.emoji} Hotdog</h3>
        ${invRowsHTML(itemsA, fieldA, dataA)}
        <h3 class="reload-header" style="margin-top:8px">🔄 Reload #${num} — ${catB.emoji} ${escapeHtml(e.comboCategoryB)}</h3>
        ${invRowsHTML(itemsB, fieldB, dataB)}
        <div class="grand-total" style="border-color:#ff9500">
          <span>Reload #${num} Combined</span>
          <span class="amount" id="combo-reload${num}-grand">$0.00</span>
        </div>
      </div>`;
    }

    function comboMealsHTML() {
      if (!mealsOpen) {
        return `<button type="button" class="add-optional-btn" id="add-meals-btn">
          🍽️ Employee Meals</button>`;
      }
      return `<div class="section meals-section">
        <h3 class="meals-header">🍽️ Meals — ${catA.emoji} Hotdog</h3>
        ${invRowsHTML(itemsA, 'mealsA', e.mealsA)}
        <h3 class="meals-header" style="margin-top:8px">🍽️ Meals — ${catB.emoji} ${escapeHtml(e.comboCategoryB)}</h3>
        ${invRowsHTML(itemsB, 'mealsB', e.mealsB)}
        <div class="grand-total" style="border-color:#f59e0b">
          <span>Meals Total (deducted)</span><span class="amount" id="combo-meals-grand">$0.00</span>
        </div>
      </div>`;
    }

    function comboLeftoverHTML(items, fieldPrefix, data, emoji, label) {
      return `<div style="font-size:12px;font-weight:700;color:#888;margin:6px 0 2px">${emoji} ${escapeHtml(label)} leftover</div>` +
        items.map(it => `
          <div class="item-line">
            <div class="name">${escapeHtml(it.name)}</div>
            <input type="number" inputmode="numeric" min="0" step="1"
              data-combo-field="${fieldPrefix}" data-item="${escapeHtml(it.name)}" data-price="${it.price}"
              placeholder="0" value="${(data?.[it.name]) ?? ''}">
            <div class="total" data-combo-total="${fieldPrefix}-${escapeHtml(it.name)}">$0.00</div>
          </div>`).join('');
    }

    const deactivateLabel = `${catA.emoji} Hotdog + ${catB.emoji} ${e.comboCartB}`;

    return `
      <label>Location</label>
      <select id="f-location" data-field="location">
        <option value="">— Select location —</option>
        ${locOptions}
        <option value="__add_loc__">＋ Add new…</option>
      </select>

      <label>Workers on this shift</label>
      <div id="workers-list">${workerRows}</div>
      <button type="button" class="add-worker-btn" id="add-worker-btn">＋ Add another worker</button>

      <div class="combo-active-bar" id="combo-active-bar">
        <span>🔀 ${escapeHtml(deactivateLabel)}</span>
        <button type="button" id="combo-deactivate-btn" style="font-size:11px;background:none;border:none;color:#ff3b30;cursor:pointer">✕ Remove</button>
      </div>

      <h3 style="color:#e74c3c;margin:8px 0 4px">🌅 Morning — ${catA.emoji} Hotdog</h3>
      ${invRowsHTML(itemsA, 'morningA', e.morningA)}
      <div class="grand-total" style="border-color:#e74c3c">
        <span>Hotdog Morning</span><span class="amount" id="combo-morning-a-grand">$0.00</span>
      </div>

      <h3 style="color:#9b59b6;margin:8px 0 4px">🌅 Morning — ${catB.emoji} ${escapeHtml(e.comboCartB)}</h3>
      ${invRowsHTML(itemsB, 'morningB', e.morningB)}
      <div class="grand-total" style="border-color:#9b59b6">
        <span>${catB.emoji} Morning</span><span class="amount" id="combo-morning-b-grand">$0.00</span>
      </div>

      <div class="grand-total dispatched-total">
        <span>⬆ Combined Morning Total</span><span class="amount" id="dispatched-grand">$0.00</span>
      </div>

      ${comboReloadHTML(1, 'reload1A', 'reload1B', e.reload1A, e.reload1B)}
      ${comboReloadHTML(2, 'reload2A', 'reload2B', e.reload2A, e.reload2B)}
      ${comboMealsHTML()}

      <div class="section evening">
        <h3>🌆 Evening — Shared Cash</h3>
        <label>A) Cash received</label>
        <input type="number" inputmode="decimal" step="0.01" min="0" data-field="cash" placeholder="0.00" value="${e.cash || ''}">
        <label>B) Debit received</label>
        <input type="number" inputmode="decimal" step="0.01" min="0" data-field="debit" placeholder="0.00" value="${e.debit || ''}">
        <label>C) Inventory leftover (recount)</label>
        ${comboLeftoverHTML(itemsA, 'eveningA', e.eveningA, catA.emoji, 'Hotdog')}
        ${comboLeftoverHTML(itemsB, 'eveningB', e.eveningB, catB.emoji, e.comboCartB)}
        <div class="grand-total">
          <span>Combined Leftover</span><span class="amount" id="leftover-grand">$0.00</span>
        </div>
        <div class="recon-box match" id="recon-box">
          <span class="recon-checkmark" id="recon-checkmark">✅</span>
          <span id="recon-status">Balanced</span>
          <span class="formula" id="recon-formula">…</span>
        </div>
      </div>

      <div class="tips-box">
        <label>D) Tips (recorded — not part of reconciliation)</label>
        <input type="number" inputmode="decimal" step="0.01" min="0" data-field="tips" placeholder="0.00" value="${e.tips || ''}">
        <div class="split" id="tips-split">Split: —</div>
      </div>
      <label>Notes</label>
      <textarea data-field="notes" placeholder="Anything worth noting...">${escapeHtml(e.notes || '')}</textarea>`;
  }
  ```

- [ ] **Step 2: Add `combo-active-bar` CSS**

  In the `<style>` block, add:

  ```css
  .combo-active-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #1e1e30;
    border: 1px solid #ff9500;
    border-radius: 10px;
    padding: 9px 12px;
    font-size: 13px;
    font-weight: 600;
    color: #ff9500;
    margin: 4px 0;
  }
  ```

- [ ] **Step 3: Dispatch to `renderComboFormHTML` in `renderEntryView`**

  In `renderEntryView`, find:

  ```js
    const draft = getOrCreateDraft();
    const wrap = $('entry-form-content');
    wrap.innerHTML = renderFormHTML(draft);
    attachFormHandlers(draft);
  ```

  Replace with:

  ```js
    const draft = getOrCreateDraft();
    const wrap = $('entry-form-content');
    wrap.innerHTML = (draft.category === 'combo')
      ? renderComboFormHTML(draft)
      : renderFormHTML(draft);
    attachFormHandlers(draft);
  ```

- [ ] **Step 4: Wire up combo-specific handlers in `attachFormHandlers`**

  At the end of `attachFormHandlers`, add:

  ```js
  // Combo deactivate button
  const deactivateBtn = $('combo-deactivate-btn');
  if (deactivateBtn) {
    deactivateBtn.addEventListener('click', () => {
      const draft = state.entries.find(x =>
        x.date === ($('global-date').value || todayStamp()) &&
        x.cart === activeCartName() && !x.locked);
      if (draft) deactivateComboMode(draft);
    });
  }

  // Combo inventory inputs (morningA, morningB, eveningA, eveningB, reload1A, etc.)
  document.querySelectorAll('[data-combo-field]').forEach(inp => {
    inp.addEventListener('input', () => {
      const field = inp.dataset.comboField;
      const item  = inp.dataset.item;
      updateDraft(e => {
        if (!e[field]) e[field] = {};
        e[field][item] = num(inp.value);
      });
      recalcAll();
    });
  });
  ```

- [ ] **Step 5: Verify combo form renders**

  - Open a Hotdog entry, select a second cart from the combo picker
  - The banner changes to split gradient
  - The form shows two morning sections (Hotdog + second cart), colour-coded
  - The "Remove" button fires `deactivateComboMode` and reverts to normal hotdog form
  - Inputs save to state correctly (verify via JSON export)

- [ ] **Step 6: Commit**

  ```bash
  git add index.html && git commit -m "feat: combo entry form UI and field wiring"
  ```

---

## Task 8: `recalcAll` — combo reconciliation

**Files:** `index.html` — `recalcAll`

- [ ] **Step 1: Add combo branch at the top of `recalcAll`**

  At the very start of `recalcAll` (before the `if (HAS_INVENTORY(activeCategory))` block), add:

  ```js
  // Combo mode reconciliation (separate path)
  const activeDraft = state.entries.find(x =>
    x.date === ($('global-date')?.value || todayStamp()) &&
    x.cart === activeCartName() && !x.locked
  );
  if (activeDraft?.category === 'combo') {
    recalcCombo(activeDraft);
    // Still run tips calc below
  } else {
  ```

  Then wrap the entire existing `if (HAS_INVENTORY(activeCategory)) { ... }` block in the `else { ... }` (close brace after the block, before the tips section). Add the closing `}` before the tips section begins.

  Then add the `recalcCombo` function immediately before `recalcAll`:

  ```js
  function recalcCombo(e) {
    const itemsA = state.prices['hotdog']          || [];
    const itemsB = state.prices[e.comboCategoryB]  || [];

    function sumField(items, field, dataAttr) {
      let total = 0;
      items.forEach(it => {
        const inp = document.querySelector(`[data-combo-field="${field}"][data-item="${cssEscape(it.name)}"]`);
        const cnt = inp ? num(inp.value) : (e[field]?.[it.name] || 0);
        const val = cnt * it.price;
        total += val;
        const cell = document.querySelector(`[data-combo-total="${field}-${cssEscape(it.name)}"]`);
        if (cell) cell.textContent = fmt(val);
      });
      return total;
    }

    const morningA   = sumField(itemsA, 'morningA',  e.morningA);
    const morningB   = sumField(itemsB, 'morningB',  e.morningB);
    const reload1A   = reload1Open ? sumField(itemsA, 'reload1A', e.reload1A) :
                       itemsA.reduce((s,it)=>s+(e.reload1A?.[it.name]||0)*it.price, 0);
    const reload1B   = reload1Open ? sumField(itemsB, 'reload1B', e.reload1B) :
                       itemsB.reduce((s,it)=>s+(e.reload1B?.[it.name]||0)*it.price, 0);
    const reload2A   = reload2Open ? sumField(itemsA, 'reload2A', e.reload2A) :
                       itemsA.reduce((s,it)=>s+(e.reload2A?.[it.name]||0)*it.price, 0);
    const reload2B   = reload2Open ? sumField(itemsB, 'reload2B', e.reload2B) :
                       itemsB.reduce((s,it)=>s+(e.reload2B?.[it.name]||0)*it.price, 0);
    const mealsA     = mealsOpen   ? sumField(itemsA, 'mealsA',   e.mealsA)   :
                       itemsA.reduce((s,it)=>s+(e.mealsA?.[it.name]||0)*it.price, 0);
    const mealsB     = mealsOpen   ? sumField(itemsB, 'mealsB',   e.mealsB)   :
                       itemsB.reduce((s,it)=>s+(e.mealsB?.[it.name]||0)*it.price, 0);
    const eveningA   = sumField(itemsA, 'eveningA', e.eveningA);
    const eveningB   = sumField(itemsB, 'eveningB', e.eveningB);

    const dispatchedA = morningA + reload1A + reload2A;
    const dispatchedB = morningB + reload1B + reload2B;
    const dispatched  = dispatchedA + dispatchedB;
    const leftover    = eveningA + eveningB;
    const meals       = mealsA + mealsB;
    const cash        = num(document.querySelector('[data-field="cash"]')?.value);
    const debit       = num(document.querySelector('[data-field="debit"]')?.value);
    const diff        = dispatched - cash - debit - leftover - meals;

    // Update subtotal displays
    const maG = $('combo-morning-a-grand'); if (maG) maG.textContent = fmt(morningA);
    const mbG = $('combo-morning-b-grand'); if (mbG) mbG.textContent = fmt(morningB);
    const dG  = $('dispatched-grand');      if (dG)  dG.textContent  = fmt(dispatched);
    const r1G = $('combo-reload1-grand');   if (r1G) r1G.textContent = fmt(reload1A + reload1B);
    const r2G = $('combo-reload2-grand');   if (r2G) r2G.textContent = fmt(reload2A + reload2B);
    const mG  = $('combo-meals-grand');     if (mG)  mG.textContent  = fmt(meals);
    const lgG = $('leftover-grand');        if (lgG) lgG.textContent = fmt(leftover);

    const box     = $('recon-box');
    const status  = $('recon-status');
    const formula = $('recon-formula');
    if (box) {
      const matched = Math.abs(diff) <= 5.005;
      box.classList.toggle('match',     matched);
      box.classList.toggle('diff-over', !matched && diff > 0);
      box.classList.toggle('diff-under',!matched && diff < 0);
      const ck = $('recon-checkmark');
      if (ck) ck.style.display = matched ? 'block' : 'none';
      status.textContent  = matched ? 'Balanced' : `⚠ Discrepancy: ${diff > 0 ? '+' : ''}${fmt(diff)}`;
      const mealsLabel    = meals > 0 ? ` − Meals ${fmt(meals)}` : '';
      formula.textContent = `Dispatched ${fmt(dispatched)} − Cash ${fmt(cash)} − Debit ${fmt(debit)} − Leftover ${fmt(leftover)}${mealsLabel} = ${fmt(diff)}`;
    }
  }
  ```

- [ ] **Step 2: Verify combo reconciliation**

  - Create a combo entry (hotdog + novelty)
  - Enter morning counts for both carts — dispatched total updates
  - Enter cash and leftover — recon shows balanced/discrepancy correctly
  - Add a reload — dispatched increases, recon updates
  - Add meals — deducted from reconciliation

- [ ] **Step 3: Commit**

  ```bash
  git add index.html && git commit -m "feat: recalcCombo for combined entry reconciliation"
  ```

---

## Task 9: Update `renderEntryCard`, `entryRow`, `renderSaved`, `gatherAllShifts` for combo entries

**Files:** `index.html` — saved view + export functions

- [ ] **Step 1: Update `renderEntryCard` to handle combo entries**

  In `renderEntryCard`, find:

  ```js
  function renderEntryCard(e){
    const cat = CATEGORIES.find(c => c.key === e.category) || {emoji:'🚚'};
    const workers = (e.workers || []).filter(w => w.worker)
      .map(w => `${escapeHtml(w.worker)} (${fmt12(w.start) || '?'}–${fmt12(w.end) || '?'})`).join(', ');
    const items = HAS_INVENTORY(e.category) ? state.prices[e.category] : [];
    const morningTotal = items.reduce((s, it) => s + (e.morning?.[it.name] || 0) * it.price, 0);
    const leftoverTotal = items.reduce((s, it) => s + (e.evening?.[it.name] || 0) * it.price, 0);
    const recon = morningTotal - num(e.cash) - num(e.debit) - leftoverTotal;
    let inv = '';
    if (HAS_INVENTORY(e.category)) {
  ```

  Replace the opening of that function with:

  ```js
  function renderEntryCard(e){
    const isCombo = e.category === 'combo';
    const cat = isCombo
      ? { emoji: '🔀' }
      : (CATEGORIES.find(c => c.key === e.category) || { emoji: '🚚' });
    const displayCart = isCombo
      ? `${escapeHtml(e.cart)} + ${escapeHtml(e.comboCartB || '')}`
      : escapeHtml(e.cart);
    const workers = (e.workers || []).filter(w => w.worker)
      .map(w => `${escapeHtml(w.worker)} (${fmt12(w.start) || '?'}–${fmt12(w.end) || '?'})`).join(', ');

    let morningTotal = 0, leftoverTotal = 0, recon = 0;
    if (isCombo) {
      const itemsA = state.prices['hotdog'] || [];
      const itemsB = state.prices[e.comboCategoryB] || [];
      const sum = (items, field) => items.reduce((s, it) => {
        const loads = ['A','B'].filter(x => field.endsWith(x));
        return s + (e[field]?.[it.name] || 0) * it.price;
      }, 0);
      const dispA = ['morningA','reload1A','reload2A'].reduce((s,f)=>s+itemsA.reduce((ss,it)=>ss+(e[f]?.[it.name]||0)*it.price,0),0);
      const dispB = ['morningB','reload1B','reload2B'].reduce((s,f)=>s+itemsB.reduce((ss,it)=>ss+(e[f]?.[it.name]||0)*it.price,0),0);
      morningTotal = dispA + dispB;
      leftoverTotal = itemsA.reduce((s,it)=>s+(e.eveningA?.[it.name]||0)*it.price,0)
                    + itemsB.reduce((s,it)=>s+(e.eveningB?.[it.name]||0)*it.price,0);
      const mealsTotal = itemsA.reduce((s,it)=>s+(e.mealsA?.[it.name]||0)*it.price,0)
                       + itemsB.reduce((s,it)=>s+(e.mealsB?.[it.name]||0)*it.price,0);
      recon = morningTotal - num(e.cash) - num(e.debit) - leftoverTotal - mealsTotal;
    } else {
      const items = HAS_INVENTORY(e.category) ? state.prices[e.category] : [];
      const reload1Total = items.reduce((s,it)=>s+(e.reload1?.[it.name]||0)*it.price,0);
      const reload2Total = items.reduce((s,it)=>s+(e.reload2?.[it.name]||0)*it.price,0);
      const mealsTotal   = items.reduce((s,it)=>s+(e.meals?.[it.name]||0)*it.price,0);
      morningTotal  = items.reduce((s,it)=>s+(e.morning?.[it.name]||0)*it.price,0)
                    + reload1Total + reload2Total;
      leftoverTotal = items.reduce((s,it)=>s+(e.evening?.[it.name]||0)*it.price,0);
      recon = morningTotal - num(e.cash) - num(e.debit) - leftoverTotal - mealsTotal;
    }
    let inv = '';
    if (isCombo || HAS_INVENTORY(e.category)) {
  ```

  Then find the cart title HTML in `renderEntryCard`:

  ```js
    return `<div class="card">
      <h3>${cat.emoji} ${escapeHtml(e.cart)} ${e.locked ...
  ```

  Replace `${escapeHtml(e.cart)}` with `${displayCart}`, and add a COMBO badge when `isCombo`:

  ```js
    return `<div class="card">
      <h3>${cat.emoji} ${displayCart} ${isCombo ? '<span class="pill" style="background:#ff9500">COMBO</span>' : ''} ${e.locked ? '<span class="pill">LOCKED</span>' : '<span class="pill" style="background:#ff9500">DRAFT</span>'}</h3>
  ```

- [ ] **Step 2: Update `entryRow` for CSV export to handle combo entries**

  Find `function entryRow(e){` and replace the whole function:

  ```js
  function entryRow(e){
    const cat     = e.category || '';
    const isCombo = cat === 'combo';
    const workers = (e.workers || []).filter(w => w.worker)
      .map(w => `${w.worker} (${w.start || '?'}–${w.end || '?'})`).join('; ');

    let morningTotal = 0, leftoverTotal = 0, mealsTotal = 0, recon = 0;
    let itemAEntries = {}, itemBEntries = {};
    if (isCombo) {
      const itemsA = state.prices['hotdog'] || [];
      const itemsB = state.prices[e.comboCategoryB] || [];
      morningTotal = ['morningA','reload1A','reload2A'].reduce((s,f)=>
        s+itemsA.reduce((ss,it)=>ss+(e[f]?.[it.name]||0)*it.price,0),0)
        + ['morningB','reload1B','reload2B'].reduce((s,f)=>
        s+itemsB.reduce((ss,it)=>ss+(e[f]?.[it.name]||0)*it.price,0),0);
      leftoverTotal = itemsA.reduce((s,it)=>s+(e.eveningA?.[it.name]||0)*it.price,0)
                    + itemsB.reduce((s,it)=>s+(e.eveningB?.[it.name]||0)*it.price,0);
      mealsTotal    = itemsA.reduce((s,it)=>s+(e.mealsA?.[it.name]||0)*it.price,0)
                    + itemsB.reduce((s,it)=>s+(e.mealsB?.[it.name]||0)*it.price,0);
      recon = morningTotal - num(e.cash) - num(e.debit) - leftoverTotal - mealsTotal;
      itemsA.forEach(it => {
        itemAEntries[`AM ${it.name} (hotdog)`] = e.morningA?.[it.name] ?? '';
        itemAEntries[`PM ${it.name} (hotdog)`] = e.eveningA?.[it.name] ?? '';
      });
      itemsB.forEach(it => {
        itemBEntries[`AM ${it.name} (${e.comboCategoryB})`] = e.morningB?.[it.name] ?? '';
        itemBEntries[`PM ${it.name} (${e.comboCategoryB})`] = e.eveningB?.[it.name] ?? '';
      });
    } else {
      const items = HAS_INVENTORY(cat) ? state.prices[cat] : [];
      const reload1Total = items.reduce((s,it)=>s+(e.reload1?.[it.name]||0)*it.price,0);
      const reload2Total = items.reduce((s,it)=>s+(e.reload2?.[it.name]||0)*it.price,0);
      morningTotal  = items.reduce((s,it)=>s+(e.morning?.[it.name]||0)*it.price,0)+reload1Total+reload2Total;
      leftoverTotal = items.reduce((s,it)=>s+(e.evening?.[it.name]||0)*it.price,0);
      mealsTotal    = items.reduce((s,it)=>s+(e.meals?.[it.name]||0)*it.price,0);
      recon = morningTotal - num(e.cash) - num(e.debit) - leftoverTotal - mealsTotal;
      items.forEach(it => {
        itemAEntries[`AM ${it.name}`] = e.morning?.[it.name] ?? '';
        itemAEntries[`PM ${it.name}`] = e.evening?.[it.name] ?? '';
      });
    }
    return {
      Date: e.date,
      Category: isCombo ? `combo (hotdog + ${e.comboCategoryB})` : cat,
      Cart: isCombo ? `${e.cart} + ${e.comboCartB}` : e.cart,
      Location: e.location,
      Workers: workers,
      'Worker count': (e.workers || []).filter(w => w.worker).length,
      Cash:           num(e.cash).toFixed(2),
      Debit:          num(e.debit).toFixed(2),
      Tips:           num(e.tips).toFixed(2),
      'Tips per worker': (() => {
        const n = (e.workers || []).filter(w => w.worker).length;
        return n ? (num(e.tips) / n).toFixed(2) : '';
      })(),
      'Total Dispatched $': HAS_INVENTORY(cat) || isCombo ? morningTotal.toFixed(2) : '',
      'Leftover $':         HAS_INVENTORY(cat) || isCombo ? leftoverTotal.toFixed(2) : '',
      'Meals $':            mealsTotal > 0 ? mealsTotal.toFixed(2) : '',
      Reconciliation:       HAS_INVENTORY(cat) || isCombo ? recon.toFixed(2) : '',
      Locked: e.locked ? 'Y' : 'N',
      Notes: e.notes || '',
      ...itemAEntries,
      ...itemBEntries,
    };
  }
  ```

- [ ] **Step 3: Update `gatherAllShifts` to handle combo category**

  In `gatherAllShifts`, find:

  ```js
        shifts.push({
          shiftId: entry.id + '::' + w.worker,
          worker: w.worker,
          date: entry.date,
          cart: entry.cart,
          category: entry.category,
  ```

  Replace with:

  ```js
        shifts.push({
          shiftId: entry.id + '::' + w.worker,
          worker: w.worker,
          date: entry.date,
          cart: entry.category === 'combo'
            ? `${entry.cart} + ${entry.comboCartB}`
            : entry.cart,
          category: entry.category === 'combo' ? 'hotdog' : entry.category,
  ```

- [ ] **Step 4: Update `renderSaved` summary to count combo entries correctly**

  In `renderSaved`, find:

  ```js
      const catCounts = {};
      for (const e of grp){
        const cat = CATEGORIES.find(c => c.key === e.category) || {emoji:'🚚'};
        catCounts[cat.emoji] = (catCounts[cat.emoji]||0) + 1;
      }
  ```

  Replace with:

  ```js
      const catCounts = {};
      for (const e of grp){
        if (e.category === 'combo') {
          catCounts['🔀'] = (catCounts['🔀']||0) + 1;
        } else {
          const cat = CATEGORIES.find(c => c.key === e.category) || {emoji:'🚚'};
          catCounts[cat.emoji] = (catCounts[cat.emoji]||0) + 1;
        }
      }
  ```

- [ ] **Step 5: Verify saved view and export**

  - Create a combo entry, fill in data, lock it
  - In Saved view: entry shows "🔀 Hotdog Cart 1 + Novelty Cart 2 COMBO LOCKED"
  - Summary line shows "🔀" emoji count
  - Export CSV: combo entry appears as one row with combined totals and per-cart item columns
  - Export JSON: combo entry has full structure with morningA/B, eveningA/B etc.

- [ ] **Step 6: Final commit**

  ```bash
  git add index.html && git commit -m "feat: combo entries in saved view, CSV export, payroll"
  ```

---

## Task 10: Update banner for combo entries

**Files:** `index.html` — `renderEntryView`

- [ ] **Step 1: Update banner to show combo gradient and COMBO badge**

  In `renderEntryView`, find:

  ```js
    banner.innerHTML = `<span>${cat.emoji} ${escapeHtml(cartName)}</span>
      <span class="small">${HAS_INVENTORY(activeCategory) ? 'Morning + Evening' : 'Hours + cash record'}</span>`;
  ```

  Replace with:

  ```js
    if (draft.category === 'combo') {
      const catB = CATEGORIES.find(c => c.key === draft.comboCategoryB) || { emoji: '🚚' };
      banner.style.setProperty('--banner-color', '#8b1a1a');
      banner.style.background = `linear-gradient(90deg, #8b1a1a 50%, #4a1a6b 50%)`;
      banner.innerHTML = `<span style="font-size:13px">${cat.emoji} ${escapeHtml(cartName)} ＋ ${catB.emoji} ${escapeHtml(draft.comboCartB || '')}</span>
        <span class="small" style="background:#ff9500;color:#000;padding:2px 6px;border-radius:4px;font-weight:800;font-size:10px">COMBO</span>`;
    } else {
      banner.innerHTML = `<span>${cat.emoji} ${escapeHtml(cartName)}</span>
        <span class="small">${HAS_INVENTORY(activeCategory) ? 'Morning + Evening' : 'Hours + cash record'}</span>`;
    }
  ```

- [ ] **Step 2: Verify**

  - Activate combo mode on a hotdog entry
  - Banner shows split gradient and COMBO badge
  - Deactivate — banner reverts to normal red

- [ ] **Step 3: Commit**

  ```bash
  git add index.html && git commit -m "feat: combo banner with split gradient and COMBO badge"
  ```

---

## Self-review checklist

- [ ] All spec features implemented: ✅ Reloads (normal entries) ✅ Meals (normal entries) ✅ Combo activation/deactivation ✅ Combo form ✅ Combo reconciliation ✅ Combo saved view ✅ Combo CSV export ✅ Eye icon fix ✅ Backward compat via normalizeEntry
- [ ] No TODOs or placeholders in plan: confirm before executing
- [ ] Type/name consistency: `comboCartB`, `comboCategoryB`, `morningA/B`, `eveningA/B`, `reload1A/B`, `reload2A/B`, `mealsA/B` — consistent throughout all tasks
- [ ] `data-reload` attribute includes field name (`reload1` or `reload2`), `data-item` has item name — consistent between renderFormHTML and attachFormHandlers
- [ ] `data-combo-field` used for all combo inputs — consistent between renderComboFormHTML and attachFormHandlers
- [ ] `cssEscape` is used for all dynamic attribute selectors — prevents breakage on item names with special chars

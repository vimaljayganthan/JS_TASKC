(function () {
  'use strict';

  var KEY = 'budget-planner:v1';
  var CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'];
  var CURRENCY_NAMES = { USD: 'US dollar', EUR: 'Euro', GBP: 'British pound', INR: 'Indian rupee', CAD: 'Canadian dollar', AUD: 'Australian dollar' };

  var EXPENSE = [
    { id: 'housing', name: 'Housing', type: 'expense', h: 215 },
    { id: 'food', name: 'Food and groceries', type: 'expense', h: 28 },
    { id: 'transport', name: 'Transport', type: 'expense', h: 140 },
    { id: 'utilities', name: 'Utilities', type: 'expense', h: 190 },
    { id: 'health', name: 'Health', type: 'expense', h: 350 },
    { id: 'fun', name: 'Entertainment', type: 'expense', h: 50 },
    { id: 'shopping', name: 'Shopping', type: 'expense', h: 320 },
    { id: 'savings', name: 'Savings and debt', type: 'expense', h: 95 },
    { id: 'other', name: 'Other', type: 'expense', h: null }
  ];
  var INCOME = [
    { id: 'salary', name: 'Salary', type: 'income' },
    { id: 'freelance', name: 'Freelance', type: 'income' },
    { id: 'gift', name: 'Gift', type: 'income' },
    { id: 'interest', name: 'Interest', type: 'income' },
    { id: 'other-in', name: 'Other income', type: 'income' }
  ];
  var CAT = {};
  EXPENSE.concat(INCOME).forEach(function (c) { CAT[c.id] = c; });

  /* ---------- Helpers ---------- */
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function thisMonthKey() { return todayStr().slice(0, 7); }
  function monthKey(date) { return date.slice(0, 7); }
  function monthLabel(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  function shiftMonth(key, delta) {
    var p = key.split('-');
    var d = new Date(+p[0], +p[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  function shortDate(date) {
    var p = date.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function reducedMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function catColor(c) {
    return c.h === null ? 'hsl(210 14% var(--cat-l))' : 'hsl(' + c.h + ' var(--cat-s) var(--cat-l))';
  }
  function centsToInput(c) { return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2); }

  function parseMoney(str) {
    var s = String(str).trim().replace(/[\s\u00a0]/g, '').replace(/^[^\d.,]+/, '');
    if (!s) return NaN;
    var hasDot = s.indexOf('.') !== -1, hasComma = s.indexOf(',') !== -1;
    if (hasDot && hasComma) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (hasComma) {
      s = /^\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
    }
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    var n = Number(s);
    return isFinite(n) ? Math.round(n * 100) : NaN;
  }

  function h(tag, props) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === 'class') e.className = props[k];
      else if (k === 'text') e.textContent = props[k];
      else if (k === 'style') e.setAttribute('style', props[k]);
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), props[k]);
      else e.setAttribute(k, props[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      e.appendChild(typeof c === 'object' ? c : document.createTextNode(c));
    }
    return e;
  }

  /* ---------- State and storage ---------- */
  var state = {
    currency: 'INR',
    currencyChosen: false,
    budgets: {},
    transactions: [],
    month: thisMonthKey(),
    typeFilter: 'all',
    catFilter: 'all',
    editingId: null,
    formType: 'expense'
  };
  var storageOk = true;

  function validTx(t) {
    return t && typeof t === 'object' &&
      (t.type === 'income' || t.type === 'expense') &&
      typeof t.id === 'string' &&
      typeof t.cents === 'number' && isFinite(t.cents) && t.cents > 0 &&
      typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
      typeof t.cat === 'string' && CAT[t.cat] && CAT[t.cat].type === t.type;
  }

  function probeStorage() {
    try {
      var k = '__bp_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  function load() {
    storageOk = probeStorage();
    if (!storageOk) return;
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return;
      if (d.currencyChosen === true && CURRENCIES.indexOf(d.currency) !== -1) {
        state.currency = d.currency;
        state.currencyChosen = true;
      }
      if (d.budgets && typeof d.budgets === 'object') {
        Object.keys(d.budgets).forEach(function (k) {
          var v = d.budgets[k];
          if (/^\d{4}-\d{2}$/.test(k) && typeof v === 'number' && isFinite(v) && v > 0) state.budgets[k] = Math.round(v);
        });
      }
      if (Array.isArray(d.transactions)) {
        state.transactions = d.transactions.filter(validTx).map(function (t) {
          return {
            id: t.id, type: t.type, cents: Math.round(t.cents), cat: t.cat, date: t.date,
            note: typeof t.note === 'string' ? t.note.slice(0, 80) : '',
            created: typeof t.created === 'number' ? t.created : 0
          };
        });
      }
    } catch (e) { /* unreadable data: start fresh */ }
  }

  function showStorageNotice(msg) {
    els.storageNotice.textContent = msg;
    els.storageNotice.hidden = false;
  }

  function save() {
    if (!storageOk) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({
        v: 1, currency: state.currency, currencyChosen: state.currencyChosen, budgets: state.budgets, transactions: state.transactions
      }));
    } catch (e) {
      storageOk = false;
      showStorageNotice('Your browser would not save the latest change, so records may be lost when you close this page.');
    }
  }

  /* ---------- Elements ---------- */
  var els = {};
  ['storageNotice', 'currency', 'prevMonth', 'nextMonth', 'thisMonth', 'monthLabel', 'remaining', 'status', 'track',
   'statIncome', 'statSpent', 'statBalance', 'budgetInput', 'budgetSym', 'saveBudget', 'budgetHint', 'budgetMsg',
   'breakdown', 'formSection', 'formTitle', 'typeExpense', 'typeIncome', 'amount', 'amountSym', 'date', 'cat', 'note',
   'formError', 'submitTx', 'cancelEdit', 'formOk', 'typeFilter', 'catFilter', 'txList', 'emptyMsg', 'clearMonth',
   'toast', 'toastMsg', 'toastBtn',
   'dateBtn', 'dateText', 'calendar', 'calTitle', 'calGrid', 'calPrev', 'calNext', 'calToday', 'calClose',
   'chipToday', 'chipYesterday'].forEach(function (id) { els[id] = document.getElementById(id); });

  /* ---------- Money formatting ---------- */
  var nf;
  function setFormatter() { nf = new Intl.NumberFormat(state.currency === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency: state.currency }); }
  function money(c) { return nf.format(c / 100); }
  function signed(c) { return c < 0 ? '\u2212' + money(-c) : money(c); }
  function currencySymbol() {
    try {
      var parts = nf.formatToParts(0);
      for (var i = 0; i < parts.length; i++) if (parts[i].type === 'currency') return parts[i].value;
    } catch (e) { /* fall through */ }
    return state.currency;
  }
  function updateSymbols() {
    var s = currencySymbol();
    var pad = (0.85 + s.length * 0.7 + 0.45) + 'rem';
    els.budgetSym.textContent = s;
    els.amountSym.textContent = s;
    els.budgetInput.style.paddingLeft = pad;
    els.amount.style.paddingLeft = pad;
  }

  /* ---------- Data queries ---------- */
  function monthTxs(m) { return state.transactions.filter(function (t) { return monthKey(t.date) === m; }); }
  function effectiveBudget(m) {
    if (state.budgets[m] != null) return { cents: state.budgets[m], inherited: false };
    var keys = Object.keys(state.budgets).filter(function (k) { return k < m; }).sort();
    if (!keys.length) return null;
    var from = keys[keys.length - 1];
    return { cents: state.budgets[from], inherited: true, from: from };
  }

  /* ---------- Rendering ---------- */
  var segs = {};
  EXPENSE.forEach(function (c) {
    var d = document.createElement('div');
    d.className = 'seg';
    d.style.background = catColor(c);
    els.track.appendChild(d);
    segs[c.id] = d;
  });

  function renderMonth() {
    els.monthLabel.textContent = monthLabel(state.month);
    els.thisMonth.hidden = state.month === thisMonthKey();
  }

  function renderSummary() {
    var txs = monthTxs(state.month);
    var income = 0, spent = 0, byCat = {};
    txs.forEach(function (t) {
      if (t.type === 'income') income += t.cents;
      else { spent += t.cents; byCat[t.cat] = (byCat[t.cat] || 0) + t.cents; }
    });
    var b = effectiveBudget(state.month);
    var balance = income - spent;

    els.remaining.classList.remove('over');
    els.status.className = 'status';

    if (b) {
      var rem = b.cents - spent;
      var pct = Math.round(spent / b.cents * 100);
      els.remaining.textContent = signed(rem);
      els.remaining.classList.toggle('over', rem < 0);
      if (rem < 0) {
        els.status.textContent = 'Over budget by ' + money(-rem) + '. You have spent ' + money(spent) + ' of ' + money(b.cents) + '.';
        els.status.classList.add('over');
      } else if (pct >= 80) {
        els.status.textContent = 'Heads up: you have used ' + pct + '% of your ' + money(b.cents) + ' budget.';
        els.status.classList.add('warn');
      } else {
        els.status.textContent = 'You have spent ' + money(spent) + ' of your ' + money(b.cents) + ' budget.';
      }
      els.track.setAttribute('aria-label', 'Spent ' + money(spent) + ' of ' + money(b.cents) + ' budget');
    } else {
      els.remaining.textContent = '\u2014';
      els.status.textContent = 'Set a monthly budget to see how much you have left.';
      els.track.setAttribute('aria-label', 'Spent ' + money(spent) + '. No budget set.');
    }

    var denom = b ? Math.max(b.cents, spent) : spent;
    EXPENSE.forEach(function (c) {
      var v = byCat[c.id] || 0;
      segs[c.id].style.width = denom ? (v / denom * 100) + '%' : '0%';
    });

    els.statIncome.textContent = money(income);
    els.statSpent.textContent = money(spent);
    els.statBalance.textContent = signed(balance);
    els.statBalance.classList.toggle('over', balance < 0);

    els.breakdown.innerHTML = '';
    var rows = EXPENSE.filter(function (c) { return byCat[c.id]; })
      .sort(function (a, c) { return byCat[c.id] - byCat[a.id]; });
    if (!rows.length) {
      els.breakdown.appendChild(h('li', { class: 'empty', style: 'display:block', text: 'Add an expense to see where your money goes.' }));
    } else {
      rows.forEach(function (c) {
        var share = Math.max(1, Math.round(byCat[c.id] / spent * 100));
        els.breakdown.appendChild(h('li', { style: '--w:' + share + '%;--c:' + catColor(c) },
          h('i', { class: 'dot', style: 'background:' + catColor(c) }),
          h('span', { text: c.name }),
          h('span', { class: 'amt', text: money(byCat[c.id]) }),
          h('span', { class: 'pct', text: share + '%' })
        ));
      });
    }
  }

  function renderList() {
    var all = monthTxs(state.month);
    var items = all.filter(function (t) {
      return (state.typeFilter === 'all' || t.type === state.typeFilter) &&
             (state.catFilter === 'all' || t.cat === state.catFilter);
    }).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.created || 0) - (a.created || 0);
    });

    els.txList.innerHTML = '';
    items.forEach(function (t) {
      var c = CAT[t.cat];
      var title = t.note || c.name;
      var amtText = (t.type === 'income' ? '+' : '\u2212') + money(t.cents);
      var label = title + ', ' + money(t.cents) + ', ' + shortDate(t.date);
      els.txList.appendChild(h('li', { class: 'tx' },
        h('span', { class: 'tx-date', text: shortDate(t.date) }),
        h('div', null,
          h('span', { class: 'tx-title' },
            t.type === 'expense' ? h('i', { class: 'dot', style: 'background:' + catColor(c) }) : null,
            h('span', { text: title })
          ),
          t.note ? h('span', { class: 'tx-cat', text: c.name }) : null,
          h('span', { class: 'tx-actions' },
            h('button', { type: 'button', class: 'link-btn', 'aria-label': 'Edit ' + label, text: 'Edit', onclick: function () { startEdit(t.id); } }),
            h('button', { type: 'button', class: 'link-btn danger', 'aria-label': 'Delete ' + label, text: 'Delete', onclick: function () { removeTxs([t.id]); } })
          )
        ),
        h('span', { class: 'tx-amt ' + t.type, text: amtText })
      ));
    });

    if (!all.length) {
      els.emptyMsg.textContent = 'No transactions in ' + monthLabel(state.month) + '. Add your first one above.';
      els.emptyMsg.hidden = false;
    } else if (!items.length) {
      els.emptyMsg.textContent = 'No transactions match these filters.';
      els.emptyMsg.hidden = false;
    } else {
      els.emptyMsg.hidden = true;
    }
    els.clearMonth.hidden = !all.length;
    if (!all.length) disarmClear();
  }

  function render() { renderMonth(); renderSummary(); renderList(); }

  /* ---------- Selects ---------- */
  function fillSelect(sel, items, selected, allLabel) {
    sel.innerHTML = '';
    if (allLabel) sel.appendChild(new Option(allLabel, 'all'));
    items.forEach(function (c) { sel.appendChild(new Option(c.name, c.id)); });
    if (selected) {
      for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === selected) sel.value = selected;
    }
  }
  function fillCatFilter() {
    var list = state.typeFilter === 'expense' ? EXPENSE : state.typeFilter === 'income' ? INCOME : EXPENSE.concat(INCOME);
    fillSelect(els.catFilter, list, state.catFilter, 'All categories');
    if (els.catFilter.value !== state.catFilter) state.catFilter = els.catFilter.value;
  }

  /* ---------- Budget ---------- */
  function syncBudgetInput() {
    var b = effectiveBudget(state.month);
    els.budgetInput.value = b ? centsToInput(b.cents) : '';
    if (!b) {
      els.budgetHint.textContent = 'No budget set for ' + monthLabel(state.month) + '.';
    } else if (b.inherited) {
      els.budgetHint.textContent = 'Carried over from ' + monthLabel(b.from) + '. Save to set it for ' + monthLabel(state.month) + '.';
    } else {
      els.budgetHint.textContent = 'Budget for ' + monthLabel(state.month) + '. Clear the field and save to remove it.';
    }
  }

  function saveBudget() {
    var raw = els.budgetInput.value.trim();
    els.budgetMsg.className = 'msg';
    if (raw === '') {
      delete state.budgets[state.month];
      save();
      syncBudgetInput();
      els.budgetMsg.textContent = 'Budget removed for ' + monthLabel(state.month) + '.';
    } else {
      var c = parseMoney(raw);
      if (!isFinite(c) || c <= 0) {
        els.budgetMsg.className = 'msg error';
        els.budgetMsg.textContent = 'Enter a budget greater than zero, like 1500 or 1500.50.';
        els.budgetInput.focus();
        return;
      }
      state.budgets[state.month] = c;
      save();
      syncBudgetInput();
      els.budgetMsg.textContent = 'Budget saved for ' + monthLabel(state.month) + '.';
    }
    render();
  }

  /* ---------- Form ---------- */
  function defaultDate() { return state.month === thisMonthKey() ? todayStr() : state.month + '-01'; }

  function renderFormMode() {
    var editing = !!state.editingId;
    els.formTitle.textContent = editing ? 'Edit transaction' : 'Add a transaction';
    els.submitTx.textContent = editing ? 'Save changes' : (state.formType === 'income' ? 'Add income' : 'Add expense');
    els.cancelEdit.hidden = !editing;
  }

  function setFormType(type, cat) {
    state.formType = type;
    els.typeExpense.checked = type === 'expense';
    els.typeIncome.checked = type === 'income';
    fillSelect(els.cat, type === 'expense' ? EXPENSE : INCOME, cat);
    renderFormMode();
  }

  function clearFormMessages() {
    els.formError.textContent = '';
    els.formOk.textContent = '';
  }

  function formError(msg, focusEl) {
    els.formOk.textContent = '';
    els.formError.textContent = msg;
    if (focusEl) focusEl.focus();
  }

  function resetFormFields() {
    els.amount.value = '';
    els.note.value = '';
    setDate(defaultDate());
  }

  function submitTx() {
    els.formError.textContent = '';
    var cents = parseMoney(els.amount.value);
    if (!isFinite(cents) || cents <= 0) return formError('Enter an amount greater than zero, like 12 or 12.50.', els.amount);
    if (cents > 100000000000) return formError('That amount is too large.', els.amount);
    var date = els.date.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return formError('Choose a date.', els.dateBtn);

    var type = state.formType;
    var cat = els.cat.value;
    var note = els.note.value.trim().slice(0, 80);
    var msg;

    if (state.editingId) {
      var t = state.transactions.filter(function (x) { return x.id === state.editingId; })[0];
      if (t) { t.type = type; t.cents = cents; t.cat = cat; t.date = date; t.note = note; }
      state.editingId = null;
      msg = 'Changes saved.';
    } else {
      state.transactions.push({ id: uid(), type: type, cents: cents, cat: cat, date: date, note: note, created: Date.now() });
      msg = (type === 'income' ? 'Income' : 'Expense') + ' added: ' + money(cents) + ' in ' + CAT[cat].name + '.';
    }

    save();
    var monthChanged = monthKey(date) !== state.month;
    state.month = monthKey(date);
    resetFormFields();
    renderFormMode();
    if (monthChanged) { syncBudgetInput(); els.budgetMsg.textContent = ''; disarmClear(); }
    render();
    els.formOk.textContent = msg + (monthChanged ? ' Showing ' + monthLabel(state.month) + '.' : '');
    els.amount.focus({ preventScroll: true });
  }

  function startEdit(id) {
    var t = state.transactions.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    state.editingId = id;
    setFormType(t.type, t.cat);
    els.amount.value = centsToInput(t.cents);
    setDate(t.date);
    els.note.value = t.note;
    clearFormMessages();
    els.formSection.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    els.amount.focus({ preventScroll: true });
  }

  function cancelEdit() {
    state.editingId = null;
    resetFormFields();
    renderFormMode();
    clearFormMessages();
  }

  /* ---------- Delete, undo, clear ---------- */
  var toastTimer = null;
  function hideToast() { clearTimeout(toastTimer); els.toast.hidden = true; }
  function showToast(msg, actionLabel, action) {
    clearTimeout(toastTimer);
    els.toastMsg.textContent = msg;
    if (actionLabel) {
      els.toastBtn.hidden = false;
      els.toastBtn.textContent = actionLabel;
      els.toastBtn.onclick = function () { action(); hideToast(); };
    } else {
      els.toastBtn.hidden = true;
    }
    els.toast.hidden = false;
    toastTimer = setTimeout(hideToast, 7000);
  }

  function removeTxs(ids) {
    var removed = state.transactions.filter(function (t) { return ids.indexOf(t.id) !== -1; });
    if (!removed.length) return;
    state.transactions = state.transactions.filter(function (t) { return ids.indexOf(t.id) === -1; });
    if (state.editingId && ids.indexOf(state.editingId) !== -1) cancelEdit();
    save();
    render();
    showToast(removed.length === 1 ? 'Transaction deleted.' : removed.length + ' transactions deleted.', 'Undo', function () {
      state.transactions = state.transactions.concat(removed);
      save();
      render();
    });
  }

  var clearArmed = false, clearTimer = null;
  function disarmClear() {
    clearArmed = false;
    clearTimeout(clearTimer);
    els.clearMonth.textContent = 'Clear this month';
  }
  function onClearClick() {
    var ids = monthTxs(state.month).map(function (t) { return t.id; });
    if (!ids.length) return;
    if (!clearArmed) {
      clearArmed = true;
      els.clearMonth.textContent = 'Confirm: delete ' + ids.length + (ids.length === 1 ? ' transaction' : ' transactions');
      clearTimer = setTimeout(disarmClear, 5000);
    } else {
      disarmClear();
      removeTxs(ids);
    }
  }

  /* ---------- Month navigation ---------- */
  function setMonth(key) {
    state.month = key;
    if (!state.editingId) setDate(defaultDate());
    syncBudgetInput();
    els.budgetMsg.textContent = '';
    els.formOk.textContent = '';
    disarmClear();
    render();
  }

  /* ---------- Date helpers and calendar picker ---------- */
  function parseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(iso, n) { var d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
  function addMonthsClamped(iso, n) {
    var d = parseISO(iso), day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return toISO(d);
  }
  function longDate(iso) {
    return parseISO(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function setDate(iso) {
    els.date.value = iso;
    els.dateText.textContent = parseISO(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    els.chipToday.setAttribute('aria-pressed', String(iso === todayStr()));
    els.chipYesterday.setAttribute('aria-pressed', String(iso === addDays(todayStr(), -1)));
  }

  var cal = { open: false, y: 0, m: 0, focus: '' };

  function dayMarks() {
    var marks = {};
    state.transactions.forEach(function (t) {
      var k = marks[t.date] || (marks[t.date] = { e: false, i: false });
      if (t.type === 'expense') k.e = true; else k.i = true;
    });
    return marks;
  }

  function renderCalendar() {
    var first = new Date(cal.y, cal.m, 1);
    els.calTitle.textContent = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    var start = new Date(cal.y, cal.m, 1 - first.getDay());
    var marks = dayMarks(), today = todayStr(), selected = els.date.value;
    els.calGrid.innerHTML = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var iso = toISO(d);
      var mk = marks[iso];
      var cls = 'day' + (d.getMonth() === cal.m ? '' : ' out') + (iso === today ? ' today' : '') + (iso === selected ? ' selected' : '');
      els.calGrid.appendChild(h('button', {
        type: 'button', class: cls, 'data-date': iso,
        tabindex: iso === cal.focus ? '0' : '-1',
        'aria-pressed': iso === selected ? 'true' : 'false',
        'aria-label': longDate(iso) + (mk ? '. Has transactions.' : '')
      },
        h('span', { text: String(d.getDate()) }),
        mk ? h('span', { class: 'dots' }, mk.e ? h('i', { class: 'de' }) : null, mk.i ? h('i', { class: 'di' }) : null) : null
      ));
    }
  }

  function focusDay() {
    var b = els.calGrid.querySelector('[data-date="' + cal.focus + '"]');
    if (b) b.focus();
  }
  function viewFocusMonth() { var d = parseISO(cal.focus); cal.y = d.getFullYear(); cal.m = d.getMonth(); }

  function openCalendar() {
    cal.focus = els.date.value || todayStr();
    viewFocusMonth();
    renderCalendar();
    els.calendar.hidden = false;
    els.dateBtn.setAttribute('aria-expanded', 'true');
    cal.open = true;
    focusDay();
  }
  function closeCalendar(returnFocus) {
    if (!cal.open) return;
    cal.open = false;
    els.calendar.hidden = true;
    els.dateBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) els.dateBtn.focus();
  }
  function shiftCalendar(n) {
    cal.focus = addMonthsClamped(cal.focus, n);
    viewFocusMonth();
    renderCalendar();
  }

  /* ---------- Wiring ---------- */
  els.prevMonth.addEventListener('click', function () { setMonth(shiftMonth(state.month, -1)); });
  els.nextMonth.addEventListener('click', function () { setMonth(shiftMonth(state.month, 1)); });
  els.thisMonth.addEventListener('click', function () { setMonth(thisMonthKey()); });

  els.currency.addEventListener('change', function () {
    state.currency = els.currency.value;
    state.currencyChosen = true;
    setFormatter();
    updateSymbols();
    save();
    render();
  });

  els.saveBudget.addEventListener('click', saveBudget);
  els.budgetInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); saveBudget(); } });

  els.typeExpense.addEventListener('change', function () { if (els.typeExpense.checked) setFormType('expense'); });
  els.typeIncome.addEventListener('change', function () { if (els.typeIncome.checked) setFormType('income'); });


  els.dateBtn.addEventListener('click', function () { if (cal.open) closeCalendar(false); else openCalendar(); });
  els.calPrev.addEventListener('click', function () { shiftCalendar(-1); });
  els.calNext.addEventListener('click', function () { shiftCalendar(1); });
  els.calToday.addEventListener('click', function () { setDate(todayStr()); closeCalendar(true); });
  els.calClose.addEventListener('click', function () { closeCalendar(true); });
  els.chipToday.addEventListener('click', function () { setDate(todayStr()); });
  els.chipYesterday.addEventListener('click', function () { setDate(addDays(todayStr(), -1)); });
  els.calGrid.addEventListener('click', function (e) {
    var b = e.target.closest('.day');
    if (!b) return;
    setDate(b.getAttribute('data-date'));
    closeCalendar(true);
  });
  els.calGrid.addEventListener('keydown', function (e) {
    var t = e.target.closest('.day');
    if (!t) return;
    var cur = t.getAttribute('data-date'), dow = parseISO(cur).getDay(), next = null;
    switch (e.key) {
      case 'ArrowLeft': next = addDays(cur, -1); break;
      case 'ArrowRight': next = addDays(cur, 1); break;
      case 'ArrowUp': next = addDays(cur, -7); break;
      case 'ArrowDown': next = addDays(cur, 7); break;
      case 'PageUp': next = addMonthsClamped(cur, -1); break;
      case 'PageDown': next = addMonthsClamped(cur, 1); break;
      case 'Home': next = addDays(cur, -dow); break;
      case 'End': next = addDays(cur, 6 - dow); break;
      default: return;
    }
    e.preventDefault();
    cal.focus = next;
    viewFocusMonth();
    renderCalendar();
    focusDay();
  });
  els.calendar.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeCalendar(true); }
  });
  function outsideCalendar(e) { return cal.open && !els.dateBtn.parentNode.contains(e.target); }
  document.addEventListener('click', function (e) { if (outsideCalendar(e)) closeCalendar(false); });
  document.addEventListener('focusin', function (e) { if (outsideCalendar(e)) closeCalendar(false); });

  els.submitTx.addEventListener('click', submitTx);
  els.cancelEdit.addEventListener('click', cancelEdit);
  [els.amount, els.note].forEach(function (el) {
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitTx(); } });
  });

  els.typeFilter.addEventListener('change', function () {
    state.typeFilter = els.typeFilter.value;
    state.catFilter = 'all';
    fillCatFilter();
    renderList();
  });
  els.catFilter.addEventListener('change', function () {
    state.catFilter = els.catFilter.value;
    renderList();
  });
  els.clearMonth.addEventListener('click', onClearClick);

  /* ---------- Init ---------- */
  load();
  setFormatter();
  CURRENCIES.forEach(function (code) {
    els.currency.appendChild(new Option(CURRENCY_NAMES[code] + ' (' + code + ')', code));
  });
  els.currency.value = state.currency;
  updateSymbols();
  fillCatFilter();
  setFormType('expense');
  setDate(defaultDate());
  syncBudgetInput();
  render();
  if (!storageOk) showStorageNotice('Your browser is blocking storage for this page, so records will not be saved after you close it.');
})();

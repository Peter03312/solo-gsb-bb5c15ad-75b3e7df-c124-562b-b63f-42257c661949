/*
 * app.js —— 多色滚筒套准校核前端（原生 JavaScript）
 *
 * 大整数策略：周长/偏移/布长/结果一律以十进制字符串传输与展示，
 * 不经过 Number 转换，因此无安全整数上限问题。
 */
'use strict';

const els = {
  list: document.getElementById('scheme-list'),
  btnNew: document.getElementById('btn-new'),
  errorBanner: document.getElementById('error-banner'),
  form: document.getElementById('editor-form'),
  name: document.getElementById('scheme-name'),
  rollersBody: document.getElementById('rollers-body'),
  btnAdd: document.getElementById('btn-add-roller'),
  btnRemove: document.getElementById('btn-remove-roller'),
  cloth: document.getElementById('cloth-length'),
  btnSolve: document.getElementById('btn-solve'),
  btnSave: document.getElementById('btn-save'),
  btnSaveAs: document.getElementById('btn-save-as'),
  btnDelete: document.getElementById('btn-delete'),
  saveStatus: document.getElementById('save-status'),
  resultEmpty: document.getElementById('result-empty'),
  resultOk: document.getElementById('result-ok'),
  resultConflict: document.getElementById('result-conflict'),
  conflictMessage: document.getElementById('conflict-message'),
  conflictPair: document.getElementById('conflict-pair'),
  conflictValues: document.getElementById('conflict-values'),
  conflictReason: document.getElementById('conflict-reason'),
  suggestionsWrap: document.getElementById('suggestions-table-wrap'),
  suggestionsBody: document.getElementById('suggestions-body'),
  suggestionsEmpty: document.getElementById('suggestions-empty'),
  suggestionsUnfixable: document.getElementById('suggestions-unfixable'),
  resFirst: document.getElementById('res-first'),
  resPeriod: document.getElementById('res-period'),
  resTotal: document.getElementById('res-total'),
  formulaFirst: document.getElementById('res-formula-first'),
  formulaPeriod: document.getElementById('res-formula-period'),
  positionsBody: document.getElementById('positions-body'),
  positionsNote: document.getElementById('positions-note'),
};

const state = {
  editingId: null,
  schemes: [],
  solveTimer: null,
  lastResult: null,
};

const DECIMAL_INTEGER = /^[0-9]+$/; // 允许前导零，服务端会规范化

/* ---------------- 工具 ---------------- */

/** 十进制字符串加千分位分隔（不损失任何位数）。 */
function groupThousands(s) {
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg ? '−' + grouped : grouped;
}

function showError(message) {
  if (message) {
    els.errorBanner.textContent = message;
    els.errorBanner.hidden = false;
  } else {
    els.errorBanner.hidden = true;
    els.errorBanner.textContent = '';
  }
}

function flashStatus(text, isError) {
  els.saveStatus.textContent = text;
  els.saveStatus.style.color = isError ? '#c0392b' : '';
  if (text) setTimeout(() => { els.saveStatus.textContent = ''; }, 3000);
}

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

/* ---------------- 表单 ---------------- */

function rollerRow(index, perimeter = '', offset = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="roller-index"></td>
    <td><input type="text" inputmode="numeric" class="input-perimeter" placeholder="如 640"></td>
    <td><input type="text" inputmode="numeric" class="input-offset" placeholder="0 ≤ 偏移 < 周长"></td>
  `;
  tr.querySelector('.roller-index').textContent = index;
  tr.querySelector('.input-perimeter').value = perimeter;
  tr.querySelector('.input-offset').value = offset;
  return tr;
}

function setRollerCount(count, preserved = []) {
  els.rollersBody.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const p = preserved[i] || {};
    els.rollersBody.appendChild(rollerRow(i + 1, p.perimeter || '', p.offset || ''));
  }
  updateRollerButtons(count);
}

function updateRollerButtons(count) {
  els.btnAdd.disabled = count >= 8;
  els.btnRemove.disabled = count <= 2;
}

function readForm() {
  const rows = [...els.rollersBody.querySelectorAll('tr')];
  return {
    name: els.name.value.trim(),
    clothLength: els.cloth.value.trim(),
    rollers: rows.map((tr) => ({
      perimeter: tr.querySelector('.input-perimeter').value.trim(),
      offset: tr.querySelector('.input-offset').value.trim(),
    })),
  };
}

function loadIntoForm(scheme) {
  els.name.value = scheme.name || '';
  els.cloth.value = scheme.clothLength ?? '';
  setRollerCount(scheme.rollers.length, scheme.rollers);
}

function resetForm() {
  els.name.value = '';
  els.cloth.value = '100000';
  setRollerCount(2, [
    { perimeter: '640', offset: '0' },
    { perimeter: '800', offset: '0' },
  ]);
}

/* ---------------- 客户端预检 ---------------- */

function prevalidate(data) {
  if (!DECIMAL_INTEGER.test(data.clothLength)) {
    return '布长必须是非负整数（十进制，不超过 120 位）';
  }
  for (let i = 0; i < data.rollers.length; i++) {
    const r = data.rollers[i];
    if (!DECIMAL_INTEGER.test(r.perimeter) || BigInt(r.perimeter) <= 0n) {
      return `色筒 ${i + 1} 的重复周长必须是正整数`;
    }
    if (!DECIMAL_INTEGER.test(r.offset)) {
      return `色筒 ${i + 1} 的标记偏移必须是非负整数`;
    }
    // 仅当两者都不超过服务端位数上限时才做大小比较，避免构造超大 BigInt
    if (r.offset.length <= 120 && r.perimeter.length <= 120 &&
        BigInt(r.offset) >= BigInt(r.perimeter)) {
      return `色筒 ${i + 1} 的标记偏移必须小于重复周长`;
    }
  }
  return null;
}

/* ---------------- 求解与渲染 ---------------- */

async function scheduleSolve() {
  clearTimeout(state.solveTimer);
  state.solveTimer = setTimeout(solve, 350);
}

async function solve() {
  const data = readForm();
  const clientError = prevalidate(data);
  if (clientError) {
    showError(clientError);
    hideResults();
    return;
  }
  try {
    const result = await api('POST', '/api/solve', data);
    showError(null);
    state.lastResult = result;
    renderResult(result, data);
  } catch (err) {
    showError(err.message);
    hideResults();
  }
}

function hideResults() {
  state.lastResult = null;
  els.resultEmpty.hidden = false;
  els.resultOk.hidden = true;
  els.resultConflict.hidden = true;
}

function renderResult(result, formData) {
  els.resultEmpty.hidden = true;
  if (!result.solvable) {
    els.resultOk.hidden = true;
    els.resultConflict.hidden = false;
    const c = result.conflict;
    els.conflictMessage.textContent = c.message;
    els.conflictPair.textContent = `色筒 ${c.rollerA} ↔ 色筒 ${c.rollerB}`;
    els.conflictValues.innerHTML =
      `色筒 ${c.rollerA}：周长 ${groupThousands(c.perimeterA)}，偏移 ${groupThousands(c.offsetA)}<br>` +
      `色筒 ${c.rollerB}：周长 ${groupThousands(c.perimeterB)}，偏移 ${groupThousands(c.offsetB)}`;
    els.conflictReason.innerHTML =
      `gcd(${groupThousands(c.perimeterA)}, ${groupThousands(c.perimeterB)}) = <b>${groupThousands(c.gcd)}</b>，` +
      `偏移差 = ${groupThousands(c.offsetA)} − ${groupThousands(c.offsetB)} = <b>${groupThousands(c.offsetDifference)}</b>；` +
      `${groupThousands(c.gcd)} 不能整除 ${groupThousands(c.offsetDifference)}，因此同余方程组无解。`;
    renderSuggestions(result.suggestions || []);
    return;
  }

  els.resultConflict.hidden = true;
  els.resultOk.hidden = false;
  els.resFirst.textContent = groupThousands(result.firstPosition);
  els.resPeriod.textContent = groupThousands(result.period);
  els.resTotal.textContent = groupThousands(result.withinCloth.total);
  els.formulaFirst.textContent = groupThousands(result.firstPosition);
  els.formulaPeriod.textContent = groupThousands(result.period);

  // 布长内位置表（剩余布长用 BigInt 计算，保持精度）。
  const cloth = BigInt(result.clothLength);
  const period = BigInt(result.period);
  els.positionsBody.innerHTML = '';
  for (let k = 0; k < result.withinCloth.positions.length; k++) {
    const p = result.withinCloth.positions[k];
    const remain = cloth - BigInt(p);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${k}</td><td>${groupThousands(p)}</td><td>${groupThousands(remain.toString())}</td>`;
    els.positionsBody.appendChild(tr);
  }

  const total = BigInt(result.withinCloth.total);
  const shown = BigInt(result.withinCloth.positions.length);
  if (total === 0n) {
    els.positionsNote.textContent =
      '布长范围内没有对花点：首次对花位置已超过布长。可加大布长或调整偏移后重新计算。';
  } else if (total > shown) {
    const firstUnshown = (BigInt(result.firstPosition) + period * shown).toString();
    els.positionsNote.textContent =
      `仅显示最早的 ${result.withinCloth.limit} 个；布长内共 ${groupThousands(total.toString())} 个，` +
      `第 ${result.withinCloth.limit + 1} 个位于 ${groupThousands(firstUnshown)} 毫米处。`;
  } else {
    els.positionsNote.textContent =
      `布长内共 ${groupThousands(total.toString())} 个对花点，已全部列出（位置区间 0 ≤ x ≤ 布长）。`;
  }
}

/* ---------------- 无解修正建议 ---------------- */

/** 渲染单色筒偏移修正建议（suggestions 已由服务端排序）。 */
function renderSuggestions(suggestions) {
  const fixable = suggestions.filter((s) => s.fixable);
  const unfixable = suggestions.filter((s) => !s.fixable);

  els.suggestionsBody.innerHTML = '';
  for (const s of fixable) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td class="roller-index">${s.roller}</td>` +
      `<td>${groupThousands(s.currentOffset)}</td>` +
      `<td class="big-num">${groupThousands(s.suggestedOffset)}</td>` +
      `<td>${groupThousands(s.adjustment)}</td>` +
      '<td></td>';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-small';
    btn.textContent = '采用';
    btn.addEventListener('click', () => applySuggestion(s));
    tr.lastElementChild.appendChild(btn);
    els.suggestionsBody.appendChild(tr);
  }

  els.suggestionsWrap.hidden = fixable.length === 0;
  els.suggestionsEmpty.hidden = fixable.length > 0;
  els.suggestionsUnfixable.textContent = unfixable.length > 0
    ? `色筒 ${unfixable.map((s) => s.roller).join('、')} 不可单独修复：只调整它一个时，其余色筒的同余式自身已无解。`
    : '';
}

/** 采用某条建议：仅把新偏移填入对应色筒并重新试算，不保存。 */
function applySuggestion(s) {
  const rows = [...els.rollersBody.querySelectorAll('tr')];
  const tr = rows[s.roller - 1];
  if (!tr) return;
  tr.querySelector('.input-offset').value = s.suggestedOffset;
  flashStatus(`已填入色筒 ${s.roller} 的建议偏移（未保存，如需保留请点击“保存方案”）`);
  solve();
}

/* ---------------- 方案列表 / 保存 ---------------- */

async function refreshList(selectId) {
  state.schemes = await api('GET', '/api/schemes');
  els.list.innerHTML = '';

  if (state.schemes.length === 0) {
    const li = document.createElement('li');
    li.className = 's-meta';
    li.style.padding = '0.4rem 0.2rem';
    li.textContent = '暂无保存的方案';
    els.list.appendChild(li);
    return;
  }

  for (const s of state.schemes) {
    const li = document.createElement('li');
    li.className = 'scheme-item' + (s.id === selectId ? ' active' : '');
    li.dataset.id = s.id;
    li.innerHTML = `
      <div class="s-name"></div>
      <div class="s-meta">${s.rollers.length} 色 · 布长 <span class="meta-cloth"></span> mm</div>
    `;
    li.querySelector('.s-name').textContent = s.name || '（未命名方案）';
    li.querySelector('.meta-cloth').textContent = groupThousands(s.clothLength);
    li.addEventListener('click', () => openScheme(s.id));
    els.list.appendChild(li);
  }
}

async function openScheme(id) {
  try {
    const scheme = await api('GET', `/api/schemes/${id}`);
    state.editingId = id;
    els.btnDelete.hidden = false;
    loadIntoForm(scheme);
    await refreshList(id);
    await solve();
  } catch (err) {
    showError(err.message);
  }
}

async function saveScheme(mode) {
  const data = readForm();
  if (!data.name) {
    showError('请先填写方案名称再保存');
    return;
  }
  const clientError = prevalidate(data);
  if (clientError) {
    showError(clientError);
    return;
  }
  try {
    let saved;
    if (mode === 'create' || !state.editingId) {
      saved = await api('POST', '/api/schemes', data);
    } else {
      saved = await api('PUT', `/api/schemes/${state.editingId}`, data);
    }
    state.editingId = saved.id;
    els.btnDelete.hidden = false;
    await refreshList(saved.id);
    flashStatus('已保存 ✓');
  } catch (err) {
    flashStatus('保存失败：' + err.message, true);
    showError(err.message);
  }
}

async function deleteCurrent() {
  if (!state.editingId) return;
  const name = els.name.value.trim() || '该方案';
  if (!window.confirm(`确定删除方案“${name}”？此操作不可撤销。`)) return;
  try {
    await api('DELETE', `/api/schemes/${state.editingId}`);
    state.editingId = null;
    els.btnDelete.hidden = true;
    resetForm();
    await refreshList(null);
    hideResults();
    flashStatus('已删除');
  } catch (err) {
    showError(err.message);
  }
}

/* ---------------- 事件绑定与初始化 ---------------- */

els.btnNew.addEventListener('click', () => {
  state.editingId = null;
  els.btnDelete.hidden = true;
  resetForm();
  refreshList(null);
  hideResults();
  showError(null);
});

els.btnAdd.addEventListener('click', () => {
  const rows = [...els.rollersBody.querySelectorAll('tr')];
  if (rows.length >= 8) return;
  els.rollersBody.appendChild(rollerRow(rows.length + 1));
  updateRollerButtons(rows.length + 1);
  scheduleSolve();
});

els.btnRemove.addEventListener('click', () => {
  const rows = [...els.rollersBody.querySelectorAll('tr')];
  if (rows.length <= 2) return;
  rows[rows.length - 1].remove();
  [...els.rollersBody.querySelectorAll('tr')].forEach((tr, i) => {
    tr.querySelector('.roller-index').textContent = i + 1;
  });
  updateRollerButtons(rows.length - 1);
  scheduleSolve();
});

els.rollersBody.addEventListener('input', scheduleSolve);
els.cloth.addEventListener('input', scheduleSolve);
els.btnSolve.addEventListener('click', solve);
els.btnSave.addEventListener('click', () => saveScheme('update'));
els.btnSaveAs.addEventListener('click', () => saveScheme('create'));
els.btnDelete.addEventListener('click', deleteCurrent);

(async function init() {
  resetForm();
  updateRollerButtons(2);
  try {
    await refreshList(null);
    await solve();
  } catch (err) {
    showError(err.message);
  }
})();

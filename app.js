// ─── State ───────────────────────────────────────────────────────────────────
let friends = [];
let dragSrc = null;
let svgDragState = null;

// Zoom/pan state
let viewTransform = { x: 0, y: 0, scale: 1 };
let panState = null;
let lastUsedRing = 4;

const CURRENT_YEAR = new Date().getFullYear();

const RINGS = [
  { id: 1, label: 'Intimate',      min: 1,  max: 5,   color: 'rgba(74,144,217,0.10)',  stroke: '#4A90D9' },
  { id: 2, label: 'Support',       min: 6,  max: 15,  color: 'rgba(232,126,161,0.08)', stroke: '#E87EA1' },
  { id: 3, label: 'Close Friends', min: 16, max: 50,  color: 'rgba(80,180,100,0.07)',  stroke: '#50b464' },
  { id: 4, label: 'Casual',        min: 51, max: 150, color: 'rgba(180,140,60,0.06)',  stroke: '#c8960a' },
];

function getRing(rank) {
  return RINGS.find(r => rank >= r.min && rank <= r.max) || RINGS[3];
}

function friendsInRing(ringId) {
  const r = RINGS[ringId - 1];
  return friends.filter(f => f.rank >= r.min && f.rank <= r.max)
                .sort((a, b) => a.rank - b.rank);
}

function yearsFromMet(yearMet) {
  if (!yearMet) return 0;
  return Math.max(0, CURRENT_YEAR - yearMet);
}

// ─── Persistence ─────────────────────────────────────────────────────────────
function save() {
  localStorage.setItem('dunbar-friends', JSON.stringify(friends));
  localStorage.setItem('dunbar-last-ring', lastUsedRing);
}

function load() {
  try {
    const raw = localStorage.getItem('dunbar-friends');
    if (raw) {
      friends = JSON.parse(raw);
      friends.forEach(f => {
        if (!f.yearMet && f.yearsKnown) f.yearMet = CURRENT_YEAR - f.yearsKnown;
      });
    }
    const savedRing = localStorage.getItem('dunbar-last-ring');
    if (savedRing) lastUsedRing = parseInt(savedRing, 10);
  } catch {}
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── Rank management ─────────────────────────────────────────────────────────
function nextRankInRing(ringId) {
  const r = RINGS[ringId - 1];
  const used = friends.filter(f => f.rank >= r.min && f.rank <= r.max).map(f => f.rank);
  for (let i = r.min; i <= r.max; i++) {
    if (!used.includes(i)) return i;
  }
  return null;
}

function ringCapacity(ringId) {
  const r = RINGS[ringId - 1];
  return r.max - r.min + 1;
}

function ringCount(ringId) {
  const r = RINGS[ringId - 1];
  return friends.filter(f => f.rank >= r.min && f.rank <= r.max).length;
}

function formatYears(yearMet) {
  const yrs = yearsFromMet(yearMet);
  if (yrs === 0) return 'This year';
  return yrs === 1 ? '1 yr' : `${yrs} yrs`;
}

function formatYearsLong(yearMet) {
  const yrs = yearsFromMet(yearMet);
  if (yrs === 0) return 'Met this year';
  return yrs === 1 ? 'Known for 1 year' : `Known for ${yrs} years`;
}

// ─── List Rendering ───────────────────────────────────────────────────────────
function renderList() {
  const container = document.getElementById('friend-list');
  container.innerHTML = '';

  RINGS.forEach(ring => {
    const section = document.createElement('div');
    section.className = 'ring-section';
    section.dataset.ring = ring.id;

    const header = document.createElement('div');
    header.className = 'ring-header';
    header.innerHTML = `<span>${ring.label}</span><span class="ring-count">${ringCount(ring.id)}/${ringCapacity(ring.id)}</span>`;
    section.appendChild(header);

    friendsInRing(ring.id).forEach(f => section.appendChild(createListItem(f)));

    container.appendChild(section);
  });
}

function createListItem(f) {
  const item = document.createElement('div');
  item.className = 'friend-item';
  item.draggable = true;
  item.dataset.id = f.id;

  const initials = f.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const cityClass = f.sameCity ? 'same-city' : '';
  const badges = (f.sameCity ? '<span class="city-badge" title="Same city">📍</span>' : '')
               + (f.isFamily ? '<span class="family-badge" title="Family">👨‍👩‍👧</span>' : '');

  item.innerHTML = `
    <div class="friend-avatar ${f.gender} ${cityClass}">${initials}</div>
    <div class="friend-info">
      <div class="friend-name">${escHtml(f.name)}</div>
      <div class="friend-meta">${formatYears(f.yearMet)}${badges}</div>
    </div>
    <button class="friend-edit-btn" data-id="${f.id}" title="Edit">✎</button>
  `;

  item.addEventListener('dragstart', onListDragStart);
  item.addEventListener('dragend', onListDragEnd);
  item.addEventListener('dragover', onListDragOver);
  item.addEventListener('dragleave', onListDragLeave);
  item.addEventListener('drop', onListDrop);

  item.querySelector('.friend-edit-btn').addEventListener('click', e => {
    e.stopPropagation();
    openModal(f.id);
  });

  return item;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── List Drag & Drop ─────────────────────────────────────────────────────────
function onListDragStart(e) {
  dragSrc = { id: this.dataset.id };
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
}

function onListDragEnd() {
  this.classList.remove('dragging');
  clearDropIndicators();
  dragSrc = null;
}

function clearDropIndicators() {
  document.querySelectorAll('.friend-item').forEach(el => {
    el.classList.remove('drop-before', 'drop-after');
  });
}

function onListDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (!dragSrc || this.dataset.id === dragSrc.id) return;
  clearDropIndicators();
  const rect = this.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  if (e.clientY < mid) {
    this.classList.add('drop-before');
  } else {
    this.classList.add('drop-after');
  }
}

function onListDragLeave(e) {
  // Only clear if leaving to outside this element
  if (!this.contains(e.relatedTarget)) {
    this.classList.remove('drop-before', 'drop-after');
  }
}

function onListDrop(e) {
  e.preventDefault();
  const isBefore = this.classList.contains('drop-before');
  clearDropIndicators();

  const srcId = e.dataTransfer.getData('text/plain');
  const tgtId = this.dataset.id;
  if (!srcId || srcId === tgtId) return;

  const src = friends.find(f => f.id === srcId);
  const tgt = friends.find(f => f.id === tgtId);
  if (!src || !tgt) return;

  // Collect all friends sorted by rank
  const sorted = [...friends].sort((a, b) => a.rank - b.rank);
  // Remove src from sorted list
  const withoutSrc = sorted.filter(f => f.id !== srcId);
  // Find insertion index
  const tgtIdx = withoutSrc.findIndex(f => f.id === tgtId);
  const insertIdx = isBefore ? tgtIdx : tgtIdx + 1;
  withoutSrc.splice(insertIdx, 0, src);
  // Re-assign ranks preserving each friend's ring boundaries
  // Strategy: assign ranks sequentially within each ring in the new order
  const ringOrder = [[], [], [], []];
  withoutSrc.forEach(f => {
    const ri = getRing(f.rank).id - 1;
    ringOrder[ri].push(f);
  });
  RINGS.forEach((ring, ri) => {
    ringOrder[ri].forEach((f, i) => {
      f.rank = ring.min + i;
    });
  });

  save(); renderList(); renderDiagram();
}

// ─── SVG Diagram ──────────────────────────────────────────────────────────────
const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_RADII = [80, 155, 240, 340];
// Label tag dimensions
const TAG_H = 26, TAG_PAD = 10;

function renderDiagram() {
  const svg = document.getElementById('diagram');
  svg.innerHTML = '';

  const W = svg.clientWidth || 700;
  const H = svg.clientHeight || 600;
  const cx = W / 2, cy = H / 2;

  const maxR = Math.min(W, H) / 2 - 50;
  const scale = maxR / RING_RADII[3];
  const radii = RING_RADII.map(r => r * scale);

  // Root group for zoom/pan
  const root = document.createElementNS(SVG_NS, 'g');
  root.setAttribute('id', 'diagram-root');
  applyTransform(root);
  svg.appendChild(root);

  // Background rings
  for (let i = RINGS.length - 1; i >= 0; i--) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy);
    c.setAttribute('r', radii[i]);
    c.setAttribute('fill', RINGS[i].color);
    c.setAttribute('stroke', RINGS[i].stroke);
    c.setAttribute('stroke-width', '1.5');
    c.setAttribute('stroke-opacity', '0.5');
    root.appendChild(c);

    const lbl = document.createElementNS(SVG_NS, 'text');
    lbl.setAttribute('x', cx);
    lbl.setAttribute('y', cy - radii[i] + 14);
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('fill', RINGS[i].stroke);
    lbl.setAttribute('fill-opacity', '0.8');
    lbl.setAttribute('font-size', Math.max(9, 11 * scale));
    lbl.setAttribute('font-family', 'sans-serif');
    lbl.setAttribute('font-weight', '600');
    lbl.setAttribute('pointer-events', 'none');
    lbl.textContent = `${RINGS[i].label} (${ringCount(RINGS[i].id)}/${ringCapacity(RINGS[i].id)})`;
    root.appendChild(lbl);
  }

  // Center dot removed

  // Friend nodes
  RINGS.forEach((ring, ri) => {
    const ringFriends = friendsInRing(ring.id);
    const n = ringFriends.length;
    if (n === 0) return;
    const r = radii[ri];
    const innerR = ri > 0 ? radii[ri - 1] : 0;
    const midR = (r + innerR) / 2;

    ringFriends.forEach((f, idx) => {
      const angle = (2 * Math.PI * idx / n) - Math.PI / 2;
      const fx = cx + midR * Math.cos(angle);
      const fy = cy + midR * Math.sin(angle);
      root.appendChild(buildFriendNode(f, fx, fy, cx, cy, radii));
    });
  });

  // Pan on background
  svg.addEventListener('mousedown', onPanStart);
  svg.addEventListener('wheel', onWheel, { passive: false });
}

function applyTransform(el) {
  el.setAttribute('transform',
    `translate(${viewTransform.x},${viewTransform.y}) scale(${viewTransform.scale})`);
}

function refreshTransform() {
  const root = document.getElementById('diagram-root');
  if (root) applyTransform(root);
}

// ─── Zoom / Pan ───────────────────────────────────────────────────────────────
function onWheel(e) {
  e.preventDefault();
  const svg = document.getElementById('diagram');
  const rect = svg.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const delta = e.deltaY < 0 ? 1.04 : 1 / 1.04;
  const newScale = Math.min(5, Math.max(0.3, viewTransform.scale * delta));
  // Zoom toward cursor
  viewTransform.x = mx - (mx - viewTransform.x) * (newScale / viewTransform.scale);
  viewTransform.y = my - (my - viewTransform.y) * (newScale / viewTransform.scale);
  viewTransform.scale = newScale;
  refreshTransform();
}

function onPanStart(e) {
  // Only pan on background (not on friend nodes)
  if (e.target.closest && e.target.closest('.friend-node')) return;
  if (e.button !== 0) return;
  panState = { startX: e.clientX - viewTransform.x, startY: e.clientY - viewTransform.y };
  document.addEventListener('mousemove', onPanMove);
  document.addEventListener('mouseup', onPanEnd);
}

function onPanMove(e) {
  if (!panState) return;
  viewTransform.x = e.clientX - panState.startX;
  viewTransform.y = e.clientY - panState.startY;
  refreshTransform();
}

function onPanEnd() {
  panState = null;
  document.removeEventListener('mousemove', onPanMove);
  document.removeEventListener('mouseup', onPanEnd);
}

function buildFriendNode(f, fx, fy, cx, cy, radii) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'friend-node');
  g.setAttribute('data-id', f.id);
  g.style.cursor = 'grab';

  // Tag dimensions
  const charW = 7.2;
  const tw = Math.min(f.name.length * charW, 110);
  const tagW = tw + TAG_PAD * 2;
  const tagH = TAG_H;
  const tagX = fx - tagW / 2;
  const tagY = fy - tagH / 2;

  const isMale = f.gender === 'male';
  const fillColor = isMale ? 'rgba(74,144,217,0.13)' : 'rgba(232,126,161,0.13)';
  const borderColor = isMale ? '#4A90D9' : '#E87EA1';
  const borderWidth = '1.8';
  const textColor = isMale ? '#1a5fa8' : '#b83870';

  // Drop shadow filter
  const filterId = `shadow-${f.id}`;
  const defs = document.createElementNS(SVG_NS, 'defs');
  const filter = document.createElementNS(SVG_NS, 'filter');
  filter.setAttribute('id', filterId);
  filter.setAttribute('x', '-20%'); filter.setAttribute('y', '-40%');
  filter.setAttribute('width', '140%'); filter.setAttribute('height', '200%');
  const feDropShadow = document.createElementNS(SVG_NS, 'feDropShadow');
  feDropShadow.setAttribute('dx', '0'); feDropShadow.setAttribute('dy', '1.5');
  feDropShadow.setAttribute('stdDeviation', '2');
  feDropShadow.setAttribute('flood-color', borderColor);  feDropShadow.setAttribute('flood-opacity', '0.22');
  filter.appendChild(feDropShadow);
  defs.appendChild(filter);
  g.appendChild(defs);

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', tagX);
  rect.setAttribute('y', tagY);
  rect.setAttribute('width', tagW);
  rect.setAttribute('height', tagH);
  rect.setAttribute('rx', '7');
  rect.setAttribute('ry', '7');
  rect.setAttribute('fill', fillColor);
  rect.setAttribute('stroke', borderColor);
  rect.setAttribute('stroke-width', borderWidth);
  rect.setAttribute('filter', `url(#${filterId})`);
  g.appendChild(rect);

  const displayName = f.name.length > 16 ? f.name.slice(0, 15) + '…' : f.name;
  const txt = document.createElementNS(SVG_NS, 'text');
  txt.setAttribute('x', fx);
  txt.setAttribute('y', fy + 5);
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('fill', textColor);
  txt.setAttribute('font-size', '11.5');
  txt.setAttribute('font-weight', '600');
  txt.setAttribute('font-family', '-apple-system, BlinkMacSystemFont, sans-serif');
  txt.setAttribute('letter-spacing', '0.2');
  txt.setAttribute('pointer-events', 'none');
  txt.textContent = displayName;
  g.appendChild(txt);

  g.addEventListener('mouseenter', e => showTooltip(e, f));
  g.addEventListener('mousemove', moveTooltip);
  g.addEventListener('mouseleave', hideTooltip);
  g.addEventListener('dblclick', () => openModal(f.id));
  g.addEventListener('mousedown', e => startSvgDrag(e, f, cx, cy, radii));

  return g;
}

// ─── SVG Drag with animation ──────────────────────────────────────────────────
function startSvgDrag(e, friend, cx, cy, radii) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation(); // prevent pan from starting
  hideTooltip();

  const svg = document.getElementById('diagram');
  const root = document.getElementById('diagram-root');
  const rect = svg.getBoundingClientRect();

  // Convert screen coords to SVG root coords
  function toSvgCoords(clientX, clientY) {
    return {
      x: (clientX - rect.left - viewTransform.x) / viewTransform.scale,
      y: (clientY - rect.top - viewTransform.y) / viewTransform.scale,
    };
  }

  const origNode = root.querySelector(`[data-id="${friend.id}"]`);
  if (origNode) origNode.style.opacity = '0.3';

  const startSvg = toSvgCoords(e.clientX, e.clientY);
  const ghost = buildFriendNode(friend, startSvg.x, startSvg.y, cx, cy, radii);
  ghost.classList.add('drag-ghost');
  ghost.setAttribute('data-ghost', '1');
  root.appendChild(ghost);

  let lastHighlightIdx = -1;

  function getTargetRingIdx(svgX, svgY) {
    const dx = svgX - cx, dy = svgY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let idx = radii.length - 1;
    for (let i = 0; i < radii.length; i++) {
      if (dist <= radii[i]) { idx = i; break; }
    }
    return idx;
  }

  function highlightRing(idx) {
    if (idx === lastHighlightIdx) return;
    root.querySelectorAll('.ring-drag-highlight').forEach(el => el.remove());
    lastHighlightIdx = idx;
    const hl = document.createElementNS(SVG_NS, 'circle');
    hl.setAttribute('cx', cx); hl.setAttribute('cy', cy);
    hl.setAttribute('r', radii[idx]);
    hl.setAttribute('fill', 'none');
    hl.setAttribute('stroke', RINGS[idx].stroke);
    hl.setAttribute('stroke-width', '3');
    hl.setAttribute('stroke-opacity', '0.7');
    hl.setAttribute('stroke-dasharray', '8 4');
    hl.setAttribute('class', 'ring-drag-highlight');
    hl.setAttribute('pointer-events', 'none');
    const firstNode = root.querySelector('.friend-node');
    root.insertBefore(hl, firstNode);
  }

  svgDragState = { id: friend.id };

  const onMove = ev => {
    const { x: mx, y: my } = toSvgCoords(ev.clientX, ev.clientY);
    ghost.querySelectorAll('rect').forEach(r => {
      const w = parseFloat(r.getAttribute('width'));
      const h = parseFloat(r.getAttribute('height'));
      r.setAttribute('x', mx - w / 2);
      r.setAttribute('y', my - h / 2);
    });
    ghost.querySelectorAll('text').forEach(t => {
      t.setAttribute('x', mx);
      t.setAttribute('y', my + 4);
    });
    highlightRing(getTargetRingIdx(mx, my));
  };

  const onUp = ev => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);

    ghost.remove();
    root.querySelectorAll('.ring-drag-highlight').forEach(el => el.remove());
    if (origNode) origNode.style.opacity = '';

    const { x: mx, y: my } = toSvgCoords(ev.clientX, ev.clientY);
    const targetRingIdx = getTargetRingIdx(mx, my);
    const targetRing = RINGS[targetRingIdx];
    const f = friends.find(x => x.id === friend.id);

    if (f) {
      const currentRing = getRing(f.rank);
      if (currentRing.id !== targetRing.id) {
        const newRank = nextRankInRing(targetRing.id);
        if (newRank !== null) {
          f.rank = newRank;
          save(); renderList(); renderDiagram();
          return;
        }
      }
    }
    svgDragState = null;
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function showTooltip(e, f) {
  const tip = document.getElementById('tooltip');
  const city = f.sameCity ? '<div class="t-city">📍 Same city</div>' : '';
  const metYear = f.yearMet ? `<div class="t-years">Since ${f.yearMet} · ${formatYearsLong(f.yearMet)}</div>` : '';
  const family = f.isFamily ? '<div class="t-family">👨‍👩‍👧 Family</div>' : '';
  tip.innerHTML = `<div class="t-name">${escHtml(f.name)}</div>${metYear}${city}${family}`;
  tip.style.display = 'block';
  moveTooltip(e);
}

function moveTooltip(e) {
  const tip = document.getElementById('tooltip');
  tip.style.left = (e.clientX + 14) + 'px';
  tip.style.top = (e.clientY - 10) + 'px';
}

function hideTooltip() {
  document.getElementById('tooltip').style.display = 'none';
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function updateYearHint() {
  const val = parseInt(document.getElementById('form-year-met').value, 10);
  const hint = document.getElementById('year-hint');
  if (val && val >= 1900 && val <= CURRENT_YEAR) {
    const yrs = CURRENT_YEAR - val;
    hint.textContent = yrs === 0 ? 'Met this year' : `${yrs} year${yrs !== 1 ? 's' : ''} ago`;
  } else {
    hint.textContent = '';
  }
}

function openModal(id) {
  const overlay = document.getElementById('modal-overlay');
  const delBtn = document.getElementById('btn-delete');
  document.getElementById('form-id').value = '';

  if (id) {
    const f = friends.find(x => x.id === id);
    if (!f) return;
    document.getElementById('modal-title').textContent = 'Edit Friend';
    document.getElementById('form-id').value = f.id;
    document.getElementById('form-name').value = f.name;
    document.getElementById('form-gender').value = f.gender;
    document.getElementById('form-year-met').value = f.yearMet || '';
    document.getElementById('form-city').checked = f.sameCity;
    document.getElementById('form-family').checked = f.isFamily || false;
    document.getElementById('form-ring').value = getRing(f.rank).id;
    delBtn.style.display = 'inline-block';
  } else {
    document.getElementById('modal-title').textContent = 'Add Friend';
    document.getElementById('form-id').value = '';
    document.getElementById('form-name').value = '';
    document.getElementById('form-gender').value = 'male';
    document.getElementById('form-year-met').value = '';
    document.getElementById('form-city').checked = false;
    document.getElementById('form-family').checked = false;
    document.getElementById('form-ring').value = lastUsedRing;
    delBtn.style.display = 'none';
  }

  updateYearHint();
  overlay.style.display = 'flex';
  document.getElementById('form-name').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

// ─── Import / Export ──────────────────────────────────────────────────────────
function exportJSON() {
  const blob = new Blob([JSON.stringify(friends, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'friends.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error();
      friends = data;
      save(); renderList(); renderDiagram();
    } catch { alert('Invalid JSON file.'); }
  };
  reader.readAsText(file);
}

// ─── Event Wiring ─────────────────────────────────────────────────────────────
document.getElementById('btn-add').addEventListener('click', () => openModal(null));
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.getElementById('btn-export').addEventListener('click', exportJSON);
document.getElementById('import-input').addEventListener('change', e => {
  if (e.target.files[0]) importJSON(e.target.files[0]);
  e.target.value = '';
});
document.getElementById('btn-reset-zoom').addEventListener('click', () => {
  viewTransform = { x: 0, y: 0, scale: 1 };
  refreshTransform();
});
document.getElementById('form-year-met').addEventListener('input', updateYearHint);

document.getElementById('btn-delete').addEventListener('click', () => {
  const id = document.getElementById('form-id').value;
  if (!id) return;
  friends = friends.filter(f => f.id !== id);
  save(); closeModal(); renderList(); renderDiagram();
});

document.getElementById('friend-form').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('form-id').value;
  const name = document.getElementById('form-name').value.trim();
  const gender = document.getElementById('form-gender').value;
  const yearMet = parseInt(document.getElementById('form-year-met').value, 10) || null;
  const sameCity = document.getElementById('form-city').checked;
  const isFamily = document.getElementById('form-family').checked;
  const ringId = parseInt(document.getElementById('form-ring').value, 10);
  lastUsedRing = ringId;

  if (!name) return;

  if (id) {
    const f = friends.find(x => x.id === id);
    if (f) {
      const oldRing = getRing(f.rank).id;
      f.name = name; f.gender = gender; f.yearMet = yearMet; f.sameCity = sameCity; f.isFamily = isFamily;
      if (oldRing !== ringId) {
        const newRank = nextRankInRing(ringId);
        if (newRank === null) { alert(`Ring is full (max ${ringCapacity(ringId)})`); return; }
        f.rank = newRank;
      }
    }
  } else {
    const newRank = nextRankInRing(ringId);
    if (newRank === null) { alert(`Ring is full (max ${ringCapacity(ringId)})`); return; }
    friends.push({ id: uid(), name, gender, yearMet, sameCity, isFamily, rank: newRank });
  }

  save(); closeModal(); renderList(); renderDiagram();
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderDiagram, 100);
});

// ─── Init ─────────────────────────────────────────────────────────────────────
load();
renderList();
renderDiagram();

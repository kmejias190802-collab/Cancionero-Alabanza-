/* ─── Firebase setup ────────────────────────────────────────── */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc,
  onSnapshot, addDoc, setDoc, deleteDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAGFag-VIDz0VK7tzgAFXX7jtAr6cRGZ-4",
  authDomain: "cancionero-alabanza.firebaseapp.com",
  projectId: "cancionero-alabanza",
  storageBucket: "cancionero-alabanza.firebasestorage.app",
  messagingSenderId: "625391551661",
  appId: "1:625391551661:web:91c7fc021f2f7eaf9ff224"
};

const fireApp = initializeApp(firebaseConfig);
const db      = getFirestore(fireApp);

/* ─── State ─────────────────────────────────────────────────── */
let songs      = [];
let categories = [];
let activeTab  = 'all';
let editId     = null;
let instState     = { chords: [], notes: [] };
let instActiveTab = { chords: null, notes: null };
let pendingInstType = null;

/* ─── Default categories (stored in Firestore) ──────────────── */
const DEFAULT_CATS = [
  { id: 'ritmica',   name: 'Rítmica / Alabanza' },
  { id: 'adoracion', name: 'Adoración' },
];

/* ─── Firestore listeners ───────────────────────────────────── */
function initFirestore() {
  // Listen to categories
  onSnapshot(collection(db, 'categories'), snap => {
    if (snap.empty) {
      // First time: seed default categories
      DEFAULT_CATS.forEach(c => setDoc(doc(db, 'categories', c.id), { name: c.name }));
      return;
    }
    categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Keep default order first
    const order = ['ritmica', 'adoracion'];
    categories.sort((a, b) => {
      const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
      if (ai === -1 && bi === -1) return (a.name || '').localeCompare(b.name || '', 'es');
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    render();
  });

  // Listen to songs (newest first by createdAt)
  const q = query(collection(db, 'songs'), orderBy('createdAt', 'desc'));
  onSnapshot(q, snap => {
    songs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  });
}

/* ─── Helpers ───────────────────────────────────────────────── */
function catById(id) { return categories.find(c => c.id === id) || { id, name: id }; }
function badgeClass(catId) {
  if (catId === 'ritmica')   return 'ritmica';
  if (catId === 'adoracion') return 'adoracion';
  return 'custom';
}
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function filteredSongs() {
  const q    = document.getElementById('search-input').value.toLowerCase().trim();
  const sort = document.getElementById('sort-select').value;
  let list = songs.filter(s => activeTab === 'all' || s.category === activeTab);
  if (q) list = list.filter(s => s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q));
  if (sort === 'alpha') list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'es'));
  return list;
}

/* ─── Render ────────────────────────────────────────────────── */
function render() { renderTabs(); renderSongs(); renderStats(); }

function renderTabs() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  function count(id) {
    return songs
      .filter(s => id === 'all' || s.category === id)
      .filter(s => !q || s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q))
      .length;
  }
  const container = document.getElementById('tabs-container');
  container.innerHTML = '';

  container.appendChild(makeTab('Todas', count('all'), activeTab === 'all',
    () => { activeTab = 'all'; render(); }, null));

  categories.forEach(c => {
    container.appendChild(makeTab(c.name, count(c.id), activeTab === c.id,
      () => { activeTab = c.id; render(); },
      (e) => { e.stopPropagation(); deleteCategory(c.id, c.name); }
    ));
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'tab add-cat';
  addBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true"></i> Categoría';
  addBtn.onclick = openCatModal;
  container.appendChild(addBtn);
}

function makeTab(name, count, isActive, onClick, onDelete) {
  const btn = document.createElement('button');
  btn.className = 'tab' + (isActive ? ' active' : '');
  btn.onclick = onClick;
  btn.appendChild(document.createTextNode(name + ' '));
  const badge = document.createElement('span');
  badge.className = 'count-badge';
  badge.textContent = count;
  btn.appendChild(badge);
  if (onDelete) {
    const del = document.createElement('span');
    del.className = 'del-cat';
    del.title = 'Eliminar categoría';
    del.innerHTML = '<i class="ti ti-x" style="font-size:11px"></i>';
    del.onclick = onDelete;
    btn.appendChild(del);
  }
  return btn;
}

function renderStats() {
  const list  = filteredSongs();
  const bar   = document.getElementById('stats-bar');
  const total = songs.filter(s => activeTab === 'all' || s.category === activeTab).length;
  const q     = document.getElementById('search-input').value.trim();
  bar.textContent = q
    ? `${list.length} resultado${list.length !== 1 ? 's' : ''} de ${total} canción${total !== 1 ? 'es' : ''}`
    : `${total} canción${total !== 1 ? 'es' : ''}`;
}

function renderSongs() {
  const list = filteredSongs();
  const container = document.getElementById('songs-list');
  if (!list.length) {
    const q = document.getElementById('search-input').value.trim();
    container.innerHTML = `
      <div class="empty-state">
        <i class="ti ti-music-off" aria-hidden="true"></i>
        <p>${q ? 'No se encontraron canciones con esa búsqueda.' : 'No hay canciones en esta categoría aún.'}</p>
        ${!q ? '<div class="empty-cta"><button class="btn primary" onclick="openAddModal()"><i class="ti ti-plus"></i> Agregar primera canción</button></div>' : ''}
      </div>`;
    return;
  }
  container.innerHTML = list.map(s => songCardHTML(s)).join('');
}

function songCardHTML(s) {
  const cat = catById(s.category);
  const meta = [
    s.key   ? `<div class="detail-item"><label>Tonalidad</label><span>${esc(s.key)}</span></div>` : '',
    s.bpm   ? `<div class="detail-item"><label>Tempo / BPM</label><span>${esc(s.bpm)}</span></div>` : '',
    s.meter ? `<div class="detail-item"><label>Compás</label><span>${esc(s.meter)}</span></div>` : '',
  ].filter(Boolean).join('');

  const ytBtn = s.youtube
    ? `<a class="yt-btn" href="${esc(s.youtube)}" target="_blank" rel="noopener">
        <i class="ti ti-brand-youtube"></i> Ver en YouTube
       </a>` : '';

  const lyricsBlock = s.lyrics
    ? `<div class="content-block"><span class="content-block-label">Letra</span>
       <div class="lyrics-text">${esc(s.lyrics)}</div></div>` : '';

  const chordsBlock = s.chords
    ? `<div class="content-block"><span class="content-block-label">Acordes generales</span>
       <div class="chords-text">${esc(s.chords)}</div></div>` : '';

  const instChords = (s.instrumentChords || []).filter(i => i.content);
  const instChordsBlock = instChords.length
    ? `<div class="content-block"><span class="content-block-label">Acordes por instrumento</span>
        <div class="inner-tabs-wrap">
          <div class="inner-tabs-header">
            ${instChords.map((i, idx) => `<button class="inner-tab${idx===0?' active':''}" onclick="switchInnerTab(this,'ic-${s.id}-${idx}')">${esc(i.name)}</button>`).join('')}
          </div>
          ${instChords.map((i, idx) => `<div class="inner-tab-panel${idx===0?' active':''}" id="ic-${s.id}-${idx}"><div class="chords-text">${esc(i.content)}</div></div>`).join('')}
        </div></div>` : '';

  const notesBlock = s.notes
    ? `<div class="content-block"><span class="content-block-label">Notas generales</span>
       <div class="chords-text" style="font-family:'DM Sans',sans-serif">${esc(s.notes)}</div></div>` : '';

  const instNotes = (s.instrumentNotes || []).filter(i => i.content);
  const instNotesBlock = instNotes.length
    ? `<div class="content-block"><span class="content-block-label">Notas por instrumento</span>
        <div class="inner-tabs-wrap">
          <div class="inner-tabs-header">
            ${instNotes.map((i, idx) => `<button class="inner-tab${idx===0?' active':''}" onclick="switchInnerTab(this,'in-${s.id}-${idx}')">${esc(i.name)}</button>`).join('')}
          </div>
          ${instNotes.map((i, idx) => `<div class="inner-tab-panel${idx===0?' active':''}" id="in-${s.id}-${idx}"><div class="chords-text" style="font-family:'DM Sans',sans-serif">${esc(i.content)}</div></div>`).join('')}
        </div></div>` : '';

  const hasAny = meta || s.youtube || s.lyrics || s.chords || instChords.length || s.notes || instNotes.length;

  return `
<div class="song-card" id="card-${s.id}" role="listitem">
  <div class="song-header" onclick="toggleCard('${s.id}')" role="button" aria-expanded="false">
    <div class="song-info">
      <div class="song-title">${esc(s.title)}</div>
      ${s.artist ? `<div class="song-artist">${esc(s.artist)}</div>` : ''}
    </div>
    <span class="badge ${badgeClass(s.category)}">${esc(cat.name)}</span>
    <i class="ti ti-chevron-down chevron" id="chev-${s.id}" aria-hidden="true"></i>
  </div>
  <div class="song-body" id="body-${s.id}">
    ${meta ? `<div class="detail-grid">${meta}</div>` : ''}
    ${ytBtn}${lyricsBlock}${chordsBlock}${instChordsBlock}${notesBlock}${instNotesBlock}
    ${!hasAny ? '<p style="font-size:13px;color:var(--text-3);margin-bottom:12px">Sin detalles adicionales guardados.</p>' : ''}
    <div class="card-actions">
      <button class="btn sm danger" onclick="deleteSong('${s.id}')"><i class="ti ti-trash"></i> Eliminar</button>
      <button class="btn sm" onclick="editSong('${s.id}')"><i class="ti ti-edit"></i> Editar</button>
    </div>
  </div>
</div>`;
}

function switchInnerTab(btn, panelId) {
  const wrap = btn.closest('.inner-tabs-wrap');
  wrap.querySelectorAll('.inner-tab').forEach(t => t.classList.remove('active'));
  wrap.querySelectorAll('.inner-tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(panelId)?.classList.add('active');
}

function toggleCard(id) {
  const body = document.getElementById('body-' + id);
  const chev = document.getElementById('chev-' + id);
  const isOpen = body.classList.toggle('open');
  chev.classList.toggle('open', isOpen);
  body.previousElementSibling?.setAttribute('aria-expanded', isOpen);
}

/* ─── Instrument tabs in modal ──────────────────────────────── */
function addInstrumentTab(type) {
  pendingInstType = type;
  document.getElementById('inst-name').value = '';
  document.getElementById('inst-modal').classList.add('open');
  setTimeout(() => document.getElementById('inst-name').focus(), 50);
}

function confirmAddInstrument() {
  const name = document.getElementById('inst-name').value.trim();
  if (!name) { shake('inst-name'); return; }
  const id = Date.now().toString(36);
  instState[pendingInstType].push({ id, name, content: '' });
  instActiveTab[pendingInstType] = id;
  renderInstTabs(pendingInstType);
  closeInstModal();
}

function removeInstrumentTab(type, id, e) {
  e.stopPropagation();
  saveInstContent(type);
  instState[type] = instState[type].filter(i => i.id !== id);
  instActiveTab[type] = instState[type].length ? instState[type][instState[type].length - 1].id : null;
  renderInstTabs(type);
}

function switchInstTab(type, id) {
  saveInstContent(type);
  instActiveTab[type] = id;
  renderInstTabs(type);
}

function saveInstContent(type) {
  const panels = document.getElementById('instrument-' + type + '-panels');
  if (!panels) return;
  const active = panels.querySelector('.inst-panel.active textarea');
  if (!active) return;
  const item = instState[type].find(i => i.id === instActiveTab[type]);
  if (item) item.content = active.value;
}

function renderInstTabs(type) {
  const tabsEl   = document.getElementById('instrument-' + type + '-tabs');
  const panelsEl = document.getElementById('instrument-' + type + '-panels');
  const items    = instState[type];
  const activeId = instActiveTab[type];
  tabsEl.innerHTML = items.map(i => `
    <button class="inst-tab${i.id === activeId ? ' active' : ''}" onclick="switchInstTab('${type}','${i.id}')">
      ${esc(i.name)}
      <span class="rm-inst" onclick="removeInstrumentTab('${type}','${i.id}',event)"><i class="ti ti-x" style="font-size:10px"></i></span>
    </button>`).join('');
  panelsEl.innerHTML = items.map(i => `
    <div class="inst-panel${i.id === activeId ? ' active' : ''}">
      <textarea rows="4" placeholder="Acordes / notas para ${esc(i.name)}...">${esc(i.content)}</textarea>
    </div>`).join('');
}

function collectInstState(type) {
  saveInstContent(type);
  return instState[type].filter(i => i.name).map(i => ({ id: i.id, name: i.name, content: i.content }));
}

/* ─── Song modal ────────────────────────────────────────────── */
function openAddModal() {
  editId = null;
  document.getElementById('modal-heading').textContent = 'Agregar canción';
  clearForm();
  fillCatSelect(null);
  document.getElementById('song-modal').classList.add('open');
  setTimeout(() => document.getElementById('f-title').focus(), 50);
}
window.openAddModal = openAddModal;

function editSong(id) {
  const s = songs.find(s => s.id === id);
  if (!s) return;
  editId = id;
  document.getElementById('modal-heading').textContent = 'Editar canción';
  document.getElementById('f-title').value   = s.title   || '';
  document.getElementById('f-artist').value  = s.artist  || '';
  document.getElementById('f-key').value     = s.key     || '';
  document.getElementById('f-meter').value   = s.meter   || '';
  document.getElementById('f-bpm').value     = s.bpm     || '';
  document.getElementById('f-youtube').value = s.youtube || '';
  document.getElementById('f-lyrics').value  = s.lyrics  || '';
  document.getElementById('f-chords').value  = s.chords  || '';
  document.getElementById('f-notes').value   = s.notes   || '';
  fillCatSelect(s.category);
  instState.chords = (s.instrumentChords || []).map(i => ({ ...i }));
  instState.notes  = (s.instrumentNotes  || []).map(i => ({ ...i }));
  instActiveTab.chords = instState.chords[0]?.id || null;
  instActiveTab.notes  = instState.notes[0]?.id  || null;
  renderInstTabs('chords');
  renderInstTabs('notes');
  document.getElementById('song-modal').classList.add('open');
  setTimeout(() => document.getElementById('f-title').focus(), 50);
}
window.editSong = editSong;

function clearForm() {
  ['f-title','f-artist','f-key','f-meter','f-bpm','f-youtube','f-lyrics','f-chords','f-notes']
    .forEach(id => { document.getElementById(id).value = ''; });
  instState = { chords: [], notes: [] };
  instActiveTab = { chords: null, notes: null };
  renderInstTabs('chords');
  renderInstTabs('notes');
}

function fillCatSelect(selected) {
  const sel = document.getElementById('f-category');
  sel.innerHTML = categories.map(c =>
    `<option value="${esc(c.id)}" ${c.id === (selected || categories[0]?.id) ? 'selected' : ''}>${esc(c.name)}</option>`
  ).join('');
}

async function saveSong() {
  const title = document.getElementById('f-title').value.trim();
  if (!title) { shake('f-title'); return; }

  const data = {
    title,
    artist:           document.getElementById('f-artist').value.trim(),
    category:         document.getElementById('f-category').value,
    key:              document.getElementById('f-key').value.trim(),
    meter:            document.getElementById('f-meter').value.trim(),
    bpm:              document.getElementById('f-bpm').value.trim(),
    youtube:          document.getElementById('f-youtube').value.trim(),
    lyrics:           document.getElementById('f-lyrics').value.trim(),
    chords:           document.getElementById('f-chords').value.trim(),
    notes:            document.getElementById('f-notes').value.trim(),
    instrumentChords: collectInstState('chords'),
    instrumentNotes:  collectInstState('notes'),
  };

  try {
    if (editId) {
      await setDoc(doc(db, 'songs', editId), { ...data, createdAt: songs.find(s => s.id === editId)?.createdAt || Date.now() });
      toast('Canción actualizada');
    } else {
      await addDoc(collection(db, 'songs'), { ...data, createdAt: Date.now() });
      toast('Canción agregada');
    }
    closeModal();
  } catch(e) {
    toast('Error al guardar. Revisá tu conexión.');
    console.error(e);
  }
}
window.saveSong = saveSong;

async function deleteSong(id) {
  if (!confirm('¿Eliminar esta canción? Esta acción no se puede deshacer.')) return;
  try {
    await deleteDoc(doc(db, 'songs', id));
    toast('Canción eliminada');
  } catch(e) {
    toast('Error al eliminar.');
    console.error(e);
  }
}
window.deleteSong = deleteSong;

function closeModal() { document.getElementById('song-modal').classList.remove('open'); }
window.closeModal = closeModal;

/* ─── Category modal ────────────────────────────────────────── */
function openCatModal() {
  document.getElementById('cat-name').value = '';
  document.getElementById('cat-modal').classList.add('open');
  setTimeout(() => document.getElementById('cat-name').focus(), 50);
}
window.openCatModal = openCatModal;

function closeCatModal() { document.getElementById('cat-modal').classList.remove('open'); }
window.closeCatModal = closeCatModal;

async function saveCategory() {
  const name = document.getElementById('cat-name').value.trim();
  if (!name) { shake('cat-name'); return; }
  const id = name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36);
  try {
    await setDoc(doc(db, 'categories', id), { name });
    activeTab = id;
    closeCatModal();
    toast(`Categoría "${name}" creada`);
  } catch(e) {
    toast('Error al crear categoría.');
    console.error(e);
  }
}
window.saveCategory = saveCategory;

async function deleteCategory(id, name) {
  const songsInCat = songs.filter(s => s.category === id).length;
  const msg = songsInCat > 0
    ? `¿Eliminar la categoría "${name}"? Tiene ${songsInCat} canción${songsInCat !== 1 ? 'es' : ''} que quedarán sin categoría asignada.`
    : `¿Eliminar la categoría "${name}"?`;
  if (!confirm(msg)) return;
  try {
    await deleteDoc(doc(db, 'categories', id));
    if (activeTab === id) activeTab = 'all';
    toast(`Categoría "${name}" eliminada`);
  } catch(e) {
    toast('Error al eliminar categoría.');
    console.error(e);
  }
}

/* ─── Instrument modal ──────────────────────────────────────── */
function closeInstModal() { document.getElementById('inst-modal').classList.remove('open'); }
window.closeInstModal = closeInstModal;
window.confirmAddInstrument = confirmAddInstrument;
window.addInstrumentTab = addInstrumentTab;
window.switchInstTab = switchInstTab;
window.removeInstrumentTab = removeInstrumentTab;
window.switchInnerTab = switchInnerTab;
window.toggleCard = toggleCard;

/* ─── Toast & shake ─────────────────────────────────────────── */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
function shake(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.style.borderColor = '#e24b4a';
  el.animate(
    [{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
    { duration: 300, iterations: 2 }
  );
  setTimeout(() => { el.style.borderColor = ''; }, 1500);
}

/* ─── Keyboard & backdrop ───────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeCatModal(); closeInstModal(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('search-input').focus();
    document.getElementById('search-input').select();
  }
});
['song-modal','cat-modal','inst-modal'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', function(e) {
    if (e.target === this) {
      if (id === 'song-modal') closeModal();
      else if (id === 'cat-modal') closeCatModal();
      else closeInstModal();
    }
  });
});
document.getElementById('search-input').addEventListener('input', render);
document.getElementById('sort-select').addEventListener('change', render);

/* ─── Boot ──────────────────────────────────────────────────── */
initFirestore();

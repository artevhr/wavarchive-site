// TEMP DEBUG
function showErr(msg) {
  let el = document.getElementById('_ferr');
  if (!el) {
    el = document.createElement('div');
    el.id = '_ferr';
    el.style.cssText = 'position:fixed;top:60px;left:8px;right:8px;background:#1a0000;border:2px solid #ff0000;color:#ff8888;font-size:11px;font-family:monospace;padding:8px;z-index:99999;max-height:200px;overflow-y:auto;border-radius:4px';
    document.body.appendChild(el);
  }
  el.innerHTML = '<b>FIRESTORE ERRORS:</b><br>' + msg + '<br>' + el.innerHTML;
}

// v202603160720
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCQVtvodBLUbbxXFUA1fxIOf1DgOdzjJS4",
  authDomain:        "wavarchive-73dfb.firebaseapp.com",
  projectId:         "wavarchive-73dfb",
  storageBucket:     "wavarchive-73dfb.firebasestorage.app",
  messagingSenderId: "803800269262",
  appId:             "1:803800269262:web:d274f1c0169b210a4b2b9f"
};

const fbApp = initializeApp(firebaseConfig);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

const GH_OWNER  = 'artevhr';
const GH_REPO   = 'wavarchive-music';
const GH_BRANCH = 'main';
const RAW        = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}`;
const TRACKS_URL = `${RAW}/tracks.json`;
const WORKER_URL = 'https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev';
const RECENT_KEY = 'wa_recent';



// Данные артистов — добавляй сюда
const ARTISTS = {
   "Д Д Д": {
     verified: true,
     bio: "девять два девять",
     photo: "avatars/DDd.png",
     links: [
       { label: "плейлист", url: "https://t.me/plst_music" },
     ]
   }
  // Пример:
  // "Овсянкин": {
  //   verified: true,
  //   bio: "Независимый артист.",
  //   photo: "avatars/ovsyankin.jpg",
  //   links: [
  //     { label: "Telegram", url: "https://t.me/username" },
  //     { label: "VK", url: "https://vk.com/username" },
  //     { label: "Instagram", url: "https://instagram.com/username" },
  //     { label: "SoundCloud", url: "https://soundcloud.com/username" },
  //     { label: "Boosty", url: "https://boosty.to/username" },
  //     { label: "Сайт", url: "https://mysite.com" }
  //   ]
  // }
};

// ── STATE ──────────────────────────────────────────────────────────────────────
let tracks = [], currentUser = null, userLikes = [], userPlaylists = [];
let queueTracks = [], queueIdx = -1, isWave = false;
let isPlaying = false, isShuffle = false, isRepeat = false;
let prevPage = 'home', ctxTargetId = null, shuffleOrder = [];
let genreHome = 'all', genreCatalog = 'all', searchQ = '';
let currentSort = 'new', firstAuth = true;
let playsCache = {}, playsCacheTime = 0;
let prevArtistPage = 'home';
let fullPlayerOpen = false;

const aud = document.getElementById('aud');

// ── HELPERS ───────────────────────────────────────────────────────────────────
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = s => { if(!s) return '--'; const m=Math.floor(s/60),sec=Math.floor(s%60); return `${m}:${sec.toString().padStart(2,'0')}`; };
const uid         = () => currentUser?.uid || null;
const myLikes     = () => userLikes;
const myPlaylists = () => userPlaylists;
const genreEmoji  = g => ({'электронная':'🎛','хип-хоп':'🎤','рок':'🎸','jazz':'🎷','ambient':'🌊','поп':'✨','другое':'🎵'}[g]||'🎵');
const coverUrl    = t => t.cover ? `${RAW}/${t.cover}` : null;
const audioUrl    = t => t.file  ? `${RAW}/${t.file}`  : null;

// Коллаборации — artist может быть строкой или массивом
const getArtists  = t => Array.isArray(t.artist) ? t.artist : [t.artist];
const artistStr   = t => getArtists(t).join(' & ');
const artistLinks = (t, onclick='openArtistPage') => getArtists(t)
  .map(a => `<span style="cursor:pointer" onclick="event.stopPropagation();${onclick}('${esc(a)}')">${esc(a)}</span>`)
  .join(' <span style="color:var(--muted)">×</span> ');

function toast(msg, err=false) {
  const a = document.getElementById('toast-area');
  const d = document.createElement('div');
  d.className = 'toast' + (err ? ' err' : '');
  d.textContent = msg;
  a.appendChild(d);
  setTimeout(() => d.remove(), 3200);
}

// ── TRACKS LOAD ───────────────────────────────────────────────────────────────
async function loadTracks() {
  document.getElementById('home-grid').innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center"><div class="spinner"></div></div>`;
  try {
    const r = await fetch(TRACKS_URL + '?t=' + Date.now());
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    tracks = await r.json();
    if (!Array.isArray(tracks)) throw new Error('Неверный формат');
  } catch(e) {
    tracks = [];
    const msg = `Не удалось загрузить треки: ${e.message}`;
    const empty = `<div class="empty" style="grid-column:1/-1"><div class="empty-ico">📭</div><div class="empty-txt">${esc(msg)}</div></div>`;
    document.getElementById('home-grid').innerHTML = empty;
    document.getElementById('catalog-list').innerHTML = empty;
  }
  renderPublic();
  if (currentUser) {
    renderLiked(); renderPlaylists(); renderProfile(); updateLikesBadge();
  }
  checkUrlTrack();
  // Hide preloader
  const pl = document.getElementById('preloader');
  if (pl) {
    setTimeout(() => pl.classList.add('hidden'), 300);
    setTimeout(() => pl.remove(), 900);
  }
}

// ── RENDER ALL ────────────────────────────────────────────────────────────────
function renderAll() {
  renderGenreBars();
  renderHomeGridSync();
  renderCatalogList();
  renderLiked();
  renderPlaylists();
  renderProfile();
  renderAuthArea();
  updateLikesBadge();
  renderRecent();
}

function renderPublic() {
  renderGenreBars();
  renderHomeGridSync();
  renderCatalogList();
  renderAuthArea();
  renderRecent();
}

// ── GENRE BARS ────────────────────────────────────────────────────────────────
const GENRES = ['all','электронная','хип-хоп','рок','jazz','ambient','поп','другое'];
const GLABELS = {all:'Все','электронная':'Электронная','хип-хоп':'Хип-хоп','рок':'Рок','jazz':'Jazz','ambient':'Ambient','поп':'Поп','другое':'Другое'};

function renderGenreBars() {
  ['gb-home','gb-catalog'].forEach((id,i) => {
    const cur = i === 0 ? genreHome : genreCatalog;
    const ctx = i === 0 ? 'home' : 'catalog';
    document.getElementById(id).innerHTML = GENRES.map(g =>
      `<button class="g-btn${g===cur?' on':''}" onclick="setGenre('${g}','${ctx}')">${esc(GLABELS[g])}</button>`
    ).join('');
  });
}

function setGenre(g, ctx) {
  if (ctx === 'home') { genreHome = g; renderHomeGridSync(); }
  else { genreCatalog = g; renderCatalogList(); }
  renderGenreBars();
}

// ── TRACK CARD ────────────────────────────────────────────────────────────────
function trackCard(t) {
  const url   = coverUrl(t);
  const liked = myLikes().includes(t.id);
  const isNow = queueTracks[queueIdx]?.id === t.id;
  const img   = url ? `<img src="${esc(url)}" loading="lazy" alt="">` : `<div class="tcard-img-ph">${genreEmoji(t.genre)}</div>`;
  return `<div class="tcard${isNow?' now':''}" id="card-${t.id}" onclick="openTrack('${t.id}')">
    <div class="tcard-img">${img}<div class="tcard-overlay" onclick="event.stopPropagation();playById('${t.id}')"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></div></div>
    <div class="tcard-title">${esc(t.title)}</div>
    <div class="tcard-artist">${artistLinks(t)}</div>
    <div class="tcard-foot">
      <div class="tcard-acts" onclick="event.stopPropagation()">
        <button class="act-btn heart${liked?' on':''}" onclick="toggleLike('${t.id}')"><svg viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
        <button class="act-btn add" onclick="openCtx('${t.id}',this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      </div>
      <span>${fmt(t.duration)}</span>
    </div>
  </div>`;
}

// ── TRACK ROW ─────────────────────────────────────────────────────────────────
function trackRowPlaylist(t, i, plId) {
  const url = coverUrl(t), lk = myLikes().includes(t.id), isNow = queueTracks[queueIdx]?.id === t.id;
  const img = url ? `<img src="${esc(url)}" loading="lazy" alt="">` : genreEmoji(t.genre);
  return `<div class="trow${isNow?' now':''}" id="row-${t.id}" onclick="playById('${t.id}','playlist')">
    <div class="trow-n">
      ${isNow ? `<span style="color:var(--acc)">▶</span>` : `<span class="trow-num">${i+1}</span><span class="trow-play-ico"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></span>`}
    </div>
    <div class="trow-img">${img}</div>
    <div class="trow-info">
      <div class="trow-title">${esc(t.title)}</div>
      <div class="trow-artist">${artistLinks(t)} <span class="tag-genre">${esc(t.genre||'')}</span></div>
    </div>
    <div class="trow-right" onclick="event.stopPropagation()">
      <button class="act-btn heart${lk?' on':''}" onclick="toggleLike('${t.id}')"><svg viewBox="0 0 24 24" fill="${lk?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
      <button class="act-btn" style="color:var(--muted)" title="Удалить из плейлиста" onclick="removeFromPlaylist('${plId}','${t.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      <span class="trow-dur">${fmt(t.duration)}</span>
    </div>
  </div>`;
}

function trackRow(t, i) {
  const url   = coverUrl(t);
  const liked = myLikes().includes(t.id);
  const isNow = queueTracks[queueIdx]?.id === t.id;
  const img   = url ? `<img src="${esc(url)}" loading="lazy" alt="">` : genreEmoji(t.genre);
  return `<div class="trow${isNow?' now':''}" id="row-${t.id}" onclick="playById('${t.id}')">
    <div class="trow-n">
      ${isNow
        ? '<span style="color:var(--acc)">▶</span>'
        : `<span class="trow-num">${i+1}</span><span class="trow-play-ico"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></span>`
      }
    </div>
    <div class="trow-img">${img}</div>
    <div class="trow-info">
      <div class="trow-title">${esc(t.title)}</div>
      <div class="trow-artist">${artistLinks(t)} <span class="tag-genre">${esc(t.genre||'')}</span></div>
    </div>
    <div class="trow-right" onclick="event.stopPropagation()">
      <button class="act-btn heart${liked?' on':''}" onclick="toggleLike('${t.id}')"><svg viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
      <button class="act-btn add" onclick="openCtx('${t.id}',this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      <span class="trow-dur">${fmt(t.duration)}</span>
    </div>
  </div>`;
}

// ── HOME GRID ─────────────────────────────────────────────────────────────────
function renderHomeGridSync() {
  let data = [...tracks];
  const now = Date.now(), week = 7*24*60*60*1000;
  if (currentSort === 'new') {
    data.sort((a,b) => (b.addedAt||'').localeCompare(a.addedAt||''));
  } else if (currentSort === 'top') {
    data.sort((a,b) => {
      const aR = playsCache[a.id] && (now - playsCache[a.id].lastPlayed) < week ? playsCache[a.id].count : 0;
      const bR = playsCache[b.id] && (now - playsCache[b.id].lastPlayed) < week ? playsCache[b.id].count : 0;
      return bR - aR;
    });
  } else {
    data.sort((a,b) => (playsCache[b.id]?.count||0) - (playsCache[a.id]?.count||0));
  }
  data = data.filter(t => genreHome === 'all' || t.genre === genreHome).slice(0, 12);
  const el = document.getElementById('home-grid');
  el.innerHTML = data.length
    ? data.map(t => trackCard(t)).join('')
    : `<div class="empty" style="grid-column:1/-1"><div class="empty-ico">🎵</div><div class="empty-txt">Нет треков</div></div>`;
}

async function setSort(sort, btn) {
  currentSort = sort;
  document.querySelectorAll('.sort-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderHomeGridSync();
  if (sort !== 'new' && WORKER_URL && !WORKER_URL.includes('YOUR_WORKER')) {
    const r = await fetch(WORKER_URL + '/plays').catch(() => null);
    if (r && r.ok) { playsCache = await r.json(); playsCacheTime = Date.now(); }
    renderHomeGridSync();
  }
}

// ── CATALOG ───────────────────────────────────────────────────────────────────
let _catalogData = [], _catalogPage = 0;
const CATALOG_PER_PAGE = 20;

function renderCatalogList() {
  const q = searchQ.toLowerCase();
  _catalogData = tracks
    .filter(t => genreCatalog === 'all' || t.genre === genreCatalog)
    .filter(t => !q || t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
  _catalogPage = 0;
  document.getElementById('catalog-cnt').textContent = _catalogData.length ? `(${_catalogData.length})` : '';
  const el = document.getElementById('catalog-list');
  if (!_catalogData.length) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Ничего не найдено</div></div>`;
    document.getElementById('catalog-more')?.remove();
    return;
  }
  el.innerHTML = _catalogData.slice(0, CATALOG_PER_PAGE).map((t,i) => trackRow(t,i)).join('');
  document.getElementById('catalog-more')?.remove();
  if (_catalogData.length > CATALOG_PER_PAGE) {
    el.insertAdjacentHTML('afterend', `<div id="catalog-more" class="load-more-wrap"><button class="btn btn-ghost" onclick="loadMoreCatalog()">Ещё треки (${_catalogData.length - CATALOG_PER_PAGE})</button></div>`);
  }
}

function loadMoreCatalog() {
  _catalogPage++;
  const start = _catalogPage * CATALOG_PER_PAGE;
  const chunk = _catalogData.slice(start, start + CATALOG_PER_PAGE);
  document.getElementById('catalog-list').insertAdjacentHTML('beforeend', chunk.map((t,i) => trackRow(t, start+i)).join(''));
  const remaining = _catalogData.length - (start + CATALOG_PER_PAGE);
  const btn = document.querySelector('#catalog-more button');
  if (remaining > 0 && btn) btn.textContent = `Ещё треки (${remaining})`;
  else document.getElementById('catalog-more')?.remove();
}

// ── LIKED ─────────────────────────────────────────────────────────────────────
function renderLiked() {
  const data = tracks.filter(t => myLikes().includes(t.id));
  document.getElementById('liked-cnt').textContent = data.length ? `(${data.length})` : '';
  const el = document.getElementById('liked-list');
  if (!uid()) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">🔒</div><div class="empty-txt">Войди, чтобы видеть лайки</div></div>`;
    return;
  }
  el.innerHTML = data.length
    ? data.map((t,i) => trackRow(t,i)).join('')
    : `<div class="empty"><div class="empty-ico">❤</div><div class="empty-txt">Лайкай треки — они появятся здесь</div></div>`;
}

function updateLikesBadge() {
  const cnt = myLikes().length;
  ['likes-badge','mob-likes-badge'].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.style.display = cnt ? '' : 'none'; b.textContent = cnt; }
  });
}

// ── RECENT ────────────────────────────────────────────────────────────────────
function addToRecent(t) {
  let r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  r = r.filter(id => id !== t.id);
  r.unshift(t.id);
  if (r.length > 20) r = r.slice(0, 20);
  localStorage.setItem(RECENT_KEY, JSON.stringify(r));
  renderRecent();
}

function renderRecent() {
  const el    = document.getElementById('recent-list');
  const label = document.querySelector('.recent-label');
  if (!el) return;
  const ids  = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  const data = ids.map(id => tracks.find(t => t.id === id)).filter(Boolean).slice(0, 5);
  if (!data.length) {
    el.style.display = 'none';
    if (label) label.style.display = 'none';
    return;
  }
  el.style.display = '';
  if (label) label.style.display = '';
  el.innerHTML = data.map((t,i) => trackRow(t,i)).join('');
}

// ── PLAYLISTS ─────────────────────────────────────────────────────────────────
function renderPlaylists() {
  const pls = myPlaylists();
  const el  = document.getElementById('pl-grid');
  if (!uid()) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-ico">🔒</div><div class="empty-txt">Войди, чтобы создавать плейлисты</div></div>`;
    return;
  }
  if (!pls.length) {
    el.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-ico">📂</div><div class="empty-txt">Нажми «Новый плейлист»</div></div>`;
    return;
  }
  el.innerHTML = pls.map(pl => {
    const tks   = pl.tracks.map(id => tracks.find(t => t.id === id)).filter(Boolean).slice(0, 4);
    const tiles = Array.from({length:4}, (_,i) => {
      const t = tks[i], u = t ? coverUrl(t) : null;
      return u ? `<div class="pl-card-mosaic-tile"><img src="${esc(u)}" loading="lazy"></div>` : `<div class="pl-card-mosaic-tile">♪</div>`;
    }).join('');
    return `<div class="pl-card" onclick="openPlaylistDetail('${pl.id}')">
      <div class="pl-card-mosaic">${tiles}</div>
      <div class="pl-card-name">${esc(pl.name)}</div>
      <div class="pl-card-cnt">${pl.tracks.length} треков</div>
    </div>`;
  }).join('');
}

let _currentPlId = null;
function openPlaylistDetail(plId) {
  const pl = myPlaylists().find(p => p.id === plId);
  if (!pl) return;
  _currentPlId = plId;
  const tks = pl.tracks.map(id => tracks.find(t => t.id === id)).filter(Boolean);
  document.getElementById('pl-detail-body').innerHTML = `
    <div class="pg-title">${esc(pl.name)}</div>
    ${pl.desc ? `<p style="font-size:12px;color:var(--muted2);margin-bottom:20px;line-height:1.8">${esc(pl.desc)}</p>` : ''}
    ${tks.length
      ? `<div class="tlist">${tks.map((t,i) => trackRowPlaylist(t,i,plId)).join('')}</div>`
      : `<div class="empty"><div class="empty-ico">🎵</div><div class="empty-txt">Плейлист пустой</div></div>`}`;
  const shareBtn = document.getElementById('btn-share-pl');
  if (shareBtn) shareBtn.style.display = '';
  const delBtn = document.getElementById('btn-delete-pl');
  if (delBtn) delBtn.style.display = '';
  _playContext = 'playlist';
  prevPage = 'playlists';
  nav('pl-detail');
}

function sharePlaylist(plId) {
  if (!plId) plId = _currentPlId;
  if (!plId) return;
  const url = location.origin + location.pathname + '?pl=' + plId;
  if (navigator.share) {
    navigator.share({ title: 'WAVARCHIVE — плейлист', url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => toast('✓ Ссылка скопирована')).catch(() => toast('Ссылка: ' + url));
  }
}

async function deletePlaylist() {
  if (!_currentPlId) return;
  const pl = userPlaylists.find(p => p.id === _currentPlId);
  if (!pl) return;
  if (!confirm(`Удалить плейлист «${pl.name}»?`)) return;
  try {
    const { deleteDoc, doc: fsDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').catch(() => ({}));
    if (deleteDoc) {
      await deleteDoc(fsDoc(db, 'playlists', _currentPlId));
    } else {
      // fallback — use already imported deleteDoc via workaround
      await fetch(`https://firestore.googleapis.com/v1/projects/wavarchive-73dfb/databases/(default)/documents/playlists/${_currentPlId}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + await auth.currentUser.getIdToken() }
      });
    }
    userPlaylists = userPlaylists.filter(p => p.id !== _currentPlId);
    try {
      const cache = JSON.parse(localStorage.getItem('wa_udata_' + uid()) || '{}');
      cache.playlists = userPlaylists;
      localStorage.setItem('wa_udata_' + uid(), JSON.stringify(cache));
    } catch {}
    nav('playlists');
    renderPlaylists();
    toast('Плейлист удалён');
    _currentPlId = null;
  } catch(e) {
    console.error('deletePlaylist:', e);
    toast('Ошибка удаления', true);
  }
}

function openCreatePl() {
  if (!uid()) { openAuth(); return; }
  document.getElementById('pl-inp-name').value = '';
  document.getElementById('pl-inp-desc').value = '';
  openModal('m-create-pl');
}

async function createPlaylist() {
  const name = document.getElementById('pl-inp-name').value.trim();
  if (!name) { toast('Введи название', true); return; }
  if (!uid()) { toast('Войди в аккаунт', true); return; }
  const pl = { name, desc: document.getElementById('pl-inp-desc').value.trim(), tracks: [], uid: uid(), createdAt: Date.now() };
  closeModal('m-create-pl');
  addDoc(collection(db, 'playlists'), pl)
    .then(ref => {
      pl.id = ref.id;
      userPlaylists.push(pl);
      renderPlaylists();
      toast('✓ Плейлист «' + name + '» создан');
      try {
        const cache = JSON.parse(localStorage.getItem('wa_udata_' + uid()) || '{}');
        cache.playlists = userPlaylists;
        localStorage.setItem('wa_udata_' + uid(), JSON.stringify(cache));
      } catch {}
    })
    .catch(e => {
      console.error('createPlaylist:', e.code, e.message);
      showErr('playlist: ' + e.code + ' — ' + e.message);
      toast('Ошибка: ' + (e.code || e.message), true);
    });
}

// ── PROFILE ───────────────────────────────────────────────────────────────────
function renderProfile() {
  const el = document.getElementById('profile-body');
  if (!currentUser) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">👤</div><div class="empty-txt">Войди или зарегистрируйся</div></div>`;
    return;
  }
  const name = currentUser.displayName || currentUser.email;
  const ini  = (name || '?')[0].toUpperCase();
  el.innerHTML = `
    <div class="profile-head">
      <div class="profile-ava">${ini}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div class="profile-name" id="profile-name-display">${esc(name)}</div>
          <button class="btn btn-ghost" style="font-size:9px;padding:3px 10px" onclick="toggleEditName()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Изменить
          </button>
        </div>
        <div id="edit-name-form" style="display:none;margin-top:8px">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input class="form-input" id="new-name-inp" type="text" placeholder="Новое имя" value="${esc(name)}" style="flex:1;min-width:140px;max-width:240px">
            <button class="btn btn-prime" style="padding:8px 16px" onclick="saveNewName()">Сохранить</button>
            <button class="btn btn-ghost" style="padding:8px 16px" onclick="toggleEditName()">Отмена</button>
          </div>
          <div id="edit-name-err" style="font-size:11px;color:var(--danger);margin-top:6px;display:none"></div>
        </div>
        <div class="profile-email">${esc(currentUser.email)}</div>
        <div class="stat-row">
          <div><div class="stat-v">${userLikes.length}</div><div class="stat-l">Лайков</div></div>
          <div><div class="stat-v">${userPlaylists.length}</div><div class="stat-l">Плейлистов</div></div>
        </div>
      </div>
    </div>
    <button class="btn btn-ghost" onclick="doLogout()">Выйти из аккаунта</button>`;
}

function toggleEditName() {
  const form = document.getElementById('edit-name-form');
  if (!form) return;
  const visible = form.style.display !== 'none';
  form.style.display = visible ? 'none' : 'block';
  if (!visible) setTimeout(() => document.getElementById('new-name-inp')?.focus(), 50);
}

async function saveNewName() {
  const inp = document.getElementById('new-name-inp');
  const err = document.getElementById('edit-name-err');
  if (!inp) return;
  const newName = inp.value.trim();
  if (!newName) { if(err){err.textContent='Введи имя';err.style.display='';} return; }
  if (newName === currentUser.displayName) { toggleEditName(); return; }
  const btn = document.querySelector('#edit-name-form .btn-prime');
  if (btn) { btn.disabled=true; btn.textContent='Сохраняем...'; }
  try {
    await updateProfile(currentUser, { displayName: newName });
    await updateDoc(doc(db, 'users', uid()), { name: newName }).catch(() =>
      setDoc(doc(db, 'users', uid()), { name: newName }, { merge: true })
    );
    renderProfile();
    renderAuthArea();
    toast('✓ Имя обновлено');
  } catch(e) {
    if(err){err.textContent='Ошибка: '+e.message;err.style.display='';}
    if(btn){btn.disabled=false;btn.textContent='Сохранить';}
  }
}

// ── TRACK DETAIL PAGE ─────────────────────────────────────────────────────────
function openTrack(id) {
  const t = tracks.find(x => x.id === id);
  if (!t) return;
  const url   = coverUrl(t);
  const liked = myLikes().includes(t.id);
  const img   = url ? `<img src="${esc(url)}" alt="">` : genreEmoji(t.genre);
  const plays = playsCache[t.id]?.count || 0;
  const artistSpan = artistLinks(t);
  document.getElementById('track-body').innerHTML = `
    <div class="td-wrap">
      <div class="td-img">${img}</div>
      <div class="td-info">
        <div class="td-title">${esc(t.title)}</div>
        <div class="td-artist">${artistSpan}</div>
        ${t.tags?.length ? `<div class="td-tags">${t.tags.map(g=>`<span class="td-tag">${esc(g)}</span>`).join('')}</div>` : ''}
        ${t.description ? `<div class="td-desc">${esc(t.description)}</div>` : ''}
        <div class="td-acts">
          <button class="btn btn-prime" onclick="playById('${t.id}')">
            <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="5 3 19 12 5 21"/></svg>Слушать
          </button>
          <button class="btn btn-ghost${liked?' btn-danger':''}" id="td-like-btn" onclick="toggleLike('${t.id}')">
            <svg viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>${liked?'Убрать лайк':'Лайк'}
          </button>
          <button class="btn btn-ghost" onclick="openCtx('${t.id}',this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>В плейлист
          </button>
          <button class="btn btn-ghost" onclick="shareTrack('${t.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Поделиться
          </button>
        </div>
        <div class="td-stat">
          <div><div class="td-stat-v">${fmt(t.duration)}</div><div class="td-stat-l">Длительность</div></div>
          <div><div class="td-stat-v">${esc(t.genre||'--')}</div><div class="td-stat-l">Жанр</div></div>
          ${plays ? `<div><div class="td-stat-v">${plays}</div><div class="td-stat-l">Прослушиваний</div></div>` : ''}
        </div>
      </div>
    </div>`;
  prevPage = document.querySelector('.nav-link.active')?.dataset.p || 'home';
  nav('track');
}

function goBackFromTrack() { nav(prevPage); }

// ── ARTIST PAGE ───────────────────────────────────────────────────────────────
function openArtistPage(name) {
  prevArtistPage = document.querySelector('.nav-link.active')?.dataset.p || 'home';
  const info = ARTISTS[name] || {};
  const tks  = tracks.filter(t => getArtists(t).includes(name));
  const ini  = (name || '?')[0].toUpperCase();
  const avatarHtml = info.photo
    ? `<div class="artist-avatar"><img src="${esc(info.photo)}" alt=""></div>`
    : `<div class="artist-avatar">${ini}</div>`;
  const badge = info.verified
    ? `<span class="artist-badge"><svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Верифицирован</span>`
    : '';
  const socials = (info.links || []).map(l =>
    `<a href="${esc(l.url)}" target="_blank" rel="noopener" class="btn-social btn-custom">${esc(l.label)}</a>`
  );
  document.getElementById('artist-body').innerHTML = `
    <div class="artist-header">
      ${avatarHtml}
      <div>
        <div class="artist-name">${esc(name)}${badge}</div>
        <div class="artist-meta">${tks.length} треков</div>
        ${info.bio ? `<div class="artist-bio">${esc(info.bio)}</div>` : ''}
        ${socials.length ? `<div class="artist-socials">${socials.join('')}</div>` : ''}
      </div>
    </div>
    ${renderArtistAlbums(name)}
    ${tks.length
      ? `<div class="tlist">${tks.map((t,i) => trackRow(t,i)).join('')}</div>`
      : `<div class="empty"><div class="empty-ico">🎵</div><div class="empty-txt">Нет треков</div></div>`}`;
  nav('artist');
}

function goBackFromArtist() { nav(prevArtistPage); }

// ── SHARE ─────────────────────────────────────────────────────────────────────
function shareTrack(id) {
  const url = location.origin + location.pathname + '?track=' + id;
  const t = tracks.find(x => x.id === id);
  const title = t ? `${t.title} — ${t.artist}` : 'WAVARCHIVE';
  if (navigator.share) {
    navigator.share({ title, url }).catch(() => {
      navigator.clipboard.writeText(url).then(() => toast('✓ Ссылка скопирована')).catch(() => {});
    });
  } else {
    navigator.clipboard.writeText(url).then(() => {
      const el = document.createElement('div');
      el.className = 'share-copied'; el.textContent = '✓ Ссылка скопирована';
      document.body.appendChild(el); setTimeout(() => el.remove(), 2000);
    }).catch(() => toast('Ссылка: ' + url));
  }
}

function copyShareUrl() {}
function nativeShare() {}

function checkUrlTrack() {
  const p   = new URLSearchParams(location.search);
  const tid = p.get('track');
  if (tid) {
    const t = tracks.find(x => x.id === tid);
    if (t) {
      openTrack(tid);
    } else {
      // Track not found — show 404
      document.getElementById('track-body').innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:32px;text-align:center;position:relative;overflow:hidden">
          <canvas id="c404" style="position:absolute;inset:0;width:100%;height:100%;opacity:.35"></canvas>
          <div style="position:relative;z-index:1">
            <div style="font-family:var(--f-head);font-size:clamp(80px,18vw,160px);font-weight:800;letter-spacing:-8px;line-height:1;background:linear-gradient(135deg,var(--acc),var(--acc2),var(--border2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:pulse404 2s ease-in-out infinite">404</div>
            <button class="btn btn-ghost" style="margin-top:32px" onclick="nav('home')">← На главную</button>
          </div>
        </div>
        <style>
          @keyframes pulse404{0%,100%{opacity:.7;transform:scale(1)}50%{opacity:1;transform:scale(1.03)}}
        </style>`;
      // Animated waveform on canvas
      setTimeout(() => {
        const canvas = document.getElementById('c404');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let w, h, t = 0;
        const resize = () => { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; };
        resize();
        window.addEventListener('resize', resize);
        const waves = [
          { freq: .018, amp: .18, speed: .022, phase: 0,    color: 'var(--acc)' },
          { freq: .012, amp: .12, speed: .014, phase: 2.1,  color: 'var(--acc2)' },
          { freq: .024, amp: .08, speed: .031, phase: 4.3,  color: 'var(--border2)' },
          { freq: .009, amp: .22, speed: .009, phase: 1.5,  color: 'var(--acc)' },
        ];
        const getColor = v => getComputedStyle(document.documentElement).getPropertyValue(v.replace('var(','').replace(')',''));
        function draw() {
          if (!document.getElementById('c404')) return;
          ctx.clearRect(0, 0, w, h);
          waves.forEach(wave => {
            ctx.beginPath();
            ctx.strokeStyle = getColor(wave.color) || '#ff5e1a';
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = .6;
            for (let x = 0; x <= w; x += 2) {
              const y = h/2 + Math.sin(x * wave.freq + t * wave.speed + wave.phase) * h * wave.amp
                            + Math.sin(x * wave.freq * 2.3 + t * wave.speed * 1.7) * h * wave.amp * .3;
              x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
          });
          t++;
          requestAnimationFrame(draw);
        }
        draw();
      }, 50);
      prevPage = 'home';
      nav('track');
    }
  }
  checkUrlPlaylist();
}

// ── PLAYS ─────────────────────────────────────────────────────────────────────
function incrementPlays(id) {
  if (!WORKER_URL || WORKER_URL.includes('YOUR_WORKER')) return;
  fetch(WORKER_URL + '/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackId: id })
  }).catch(() => {});
}

// ── PLAYER ────────────────────────────────────────────────────────────────────
let _playContext = null; // 'playlist', 'catalog', null = all

function playById(id, context) {
  const t = tracks.find(x => x.id === id);
  if (!t) return;
  stopWave();

  if (context === 'playlist' && _currentPlId) {
    // Play from playlist — queue = playlist tracks
    const pl = userPlaylists.find(p => p.id === _currentPlId);
    if (pl) {
      const plTracks = pl.tracks.map(tid => tracks.find(x => x.id === tid)).filter(Boolean);
      _playContext = 'playlist';
      queueTracks  = plTracks;
      queueIdx     = queueTracks.findIndex(x => x.id === id);
      startPlay();
      return;
    }
  }

  // Play from anywhere else — queue = all tracks, reset context
  _playContext = null;
  queueTracks  = [...tracks];
  queueIdx     = queueTracks.findIndex(x => x.id === id);
  startPlay();
}

function startPlay() {
  const t = queueTracks[queueIdx];
  if (!t) return;
  const url = audioUrl(t);
  if (url) { aud.src = url; aud.play().catch(() => {}); }
  updatePlayerUI(t);
  markNow();
  incrementPlays(t.id);
  addToRecent(t);
  preloadNext();
  _lyricsVisible = false;
  const lyrEl = document.getElementById('fp-lyrics');
  if (lyrEl) lyrEl.style.display = 'none';
  const covEl = document.getElementById('fp-cover');
  if (covEl) covEl.style.display = '';
  const lyrBtn = document.getElementById('fp-lyrics-btn');
  if (lyrBtn) lyrBtn.classList.remove('active');
  const covUrl = coverUrl(t);
  if (covUrl) extractDominantColor(covUrl); else resetAccent();
}

function preloadNext() {
  const ni = queueIdx + 1;
  if (ni >= queueTracks.length) return;
  const url = audioUrl(queueTracks[ni]);
  if (!url) return;
  const a = new Audio(); a.preload = 'auto'; a.src = url;
}

function updatePlayerUI(t) {
  const url   = coverUrl(t);
  const liked = myLikes().includes(t.id);

  // Mini player
  document.getElementById('pl-name').textContent = t.title;
  document.getElementById('pl-by').textContent = artistStr(t);
  const art = document.getElementById('pl-art');
  if (url) { art.innerHTML = `<img src="${esc(url)}"`+'>'; }
  else { art.innerHTML = genreEmoji(t.genre); art.style.fontSize = '18px'; }
  document.getElementById('pl-heart').classList.toggle('on', liked);
  document.querySelector('#pl-heart svg')?.setAttribute('fill', liked ? 'currentColor' : 'none');

  // Full player
  document.getElementById('fp-title').textContent = t.title;
  const fpArtist = document.getElementById('fp-artist');
  const artists = getArtists(t);
  if (artists.length === 1) {
    fpArtist.textContent = artists[0];
    fpArtist.style.cursor = 'pointer';
    fpArtist.style.textDecorationColor = 'var(--border2)';
    fpArtist.onclick = () => { closeFullPlayer(); openArtistPage(artists[0]); };
  } else {
    fpArtist.innerHTML = artistLinks(t, 'openArtistPage');
    fpArtist.style.cursor = 'default';
    fpArtist.onclick = null;
  }
  const fpCover = document.getElementById('fp-cover');
  if (url) { fpCover.innerHTML = `<img src="${esc(url)}"`+'>'; }
  else { fpCover.innerHTML = genreEmoji(t.genre); fpCover.style.fontSize = '72px'; }
  document.getElementById('fp-heart').classList.toggle('on', liked);
  document.querySelector('#fp-heart svg')?.setAttribute('fill', liked ? 'currentColor' : 'none');

  document.title = `${t.title} · ${artistStr(t)} — WAVARCHIVE`;
  // Media Session — обложка на экране блокировки
  if ('mediaSession' in navigator) {
    const artwork = coverUrl(t);
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  t.title,
      artist: artistStr(t),
      album:  'WAVARCHIVE',
      artwork: artwork ? [
        { src: artwork, sizes: '512x512', type: 'image/jpeg' }
      ] : []
    });
    navigator.mediaSession.setActionHandler('play',           () => aud.play());
    navigator.mediaSession.setActionHandler('pause',          () => aud.pause());
    navigator.mediaSession.setActionHandler('nexttrack',      () => nextTrack());
    navigator.mediaSession.setActionHandler('previoustrack',  () => prevTrack());
  }
}

function markNow() {
  document.querySelectorAll('.tcard').forEach(c => c.classList.remove('now'));
  document.querySelectorAll('.trow').forEach(r => r.classList.remove('now'));
  const id = queueTracks[queueIdx]?.id;
  if (!id) return;
  document.getElementById('card-' + id)?.classList.add('now');
  const row = document.getElementById('row-' + id);
  if (row) { row.classList.add('now'); row.querySelector('.trow-n').textContent = '▶'; }
}

function togglePlay() {
  if (queueIdx === -1) { if (tracks[0]) playById(tracks[0].id); return; }
  isPlaying ? aud.pause() : aud.play().catch(() => {});
}

function refreshPlayBtn() {
  const playing = isPlaying;
  ['ico-play','mob-ico-play','fp-ico-play'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = playing ? 'none' : '';
  });
  ['ico-pause','mob-ico-pause','fp-ico-pause'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = playing ? '' : 'none';
  });
  // full player button style
  const fpBtn = document.getElementById('fp-play');
  if (fpBtn) fpBtn.style.background = playing ? 'var(--acc2)' : 'var(--acc)';
}

function nextTrack() {
  if (!queueTracks.length) return;
  if (isShuffle && shuffleOrder.length) {
    const pos = shuffleOrder.indexOf(queueIdx);
    queueIdx  = shuffleOrder[(pos+1) % shuffleOrder.length];
    startPlay(); return;
  }
  const ni = queueIdx + 1;
  if (ni >= queueTracks.length) { startWaveAuto(); return; }
  queueIdx = ni; startPlay();
}

function prevTrack() {
  if (!queueTracks.length) return;
  if (isShuffle && shuffleOrder.length) {
    const pos = shuffleOrder.indexOf(queueIdx);
    queueIdx  = shuffleOrder[(pos - 1 + shuffleOrder.length) % shuffleOrder.length];
  } else {
    queueIdx = (queueIdx - 1 + queueTracks.length) % queueTracks.length;
  }
  startPlay();
}

function toggleShuffle() {
  isShuffle = !isShuffle;
  document.getElementById('btn-shuf')?.classList.toggle('active', isShuffle);
  document.getElementById('fp-shuf')?.classList.toggle('active', isShuffle);
  if (isShuffle) shuffleOrder = [...Array(queueTracks.length).keys()].sort(() => Math.random() - .5);
  toast(isShuffle ? 'Перемешивание вкл.' : 'Перемешивание выкл.');
}

function toggleRepeat() {
  isRepeat = !isRepeat;
  document.getElementById('btn-rep')?.classList.toggle('active', isRepeat);
  document.getElementById('fp-rep')?.classList.toggle('active', isRepeat);
  aud.loop = isRepeat;
  toast(isRepeat ? 'Повтор вкл.' : 'Повтор выкл.');
}

// ── AUDIO EVENTS ──────────────────────────────────────────────────────────────
aud.addEventListener('play',  () => { isPlaying = true;  refreshPlayBtn(); });
aud.addEventListener('pause', () => { isPlaying = false; refreshPlayBtn(); });
aud.addEventListener('ended', () => { if (!isRepeat) nextTrack(); });

aud.addEventListener('timeupdate', () => {
  if (!aud.duration) return;
  const p = (aud.currentTime / aud.duration) * 100;
  const setRange = (id) => {
    const r = document.getElementById(id);
    if (r) { r.value = p; r.style.setProperty('--p', p + '%'); }
  };
  setRange('prog-range');
  setRange('fp-range');
  const fill = document.getElementById('mob-prog-fill');
  if (fill) fill.style.width = p + '%';
  const cur = fmt(Math.floor(aud.currentTime));
  document.getElementById('t-cur').textContent   = cur;
  document.getElementById('fp-cur').textContent  = cur;
});

aud.addEventListener('loadedmetadata', () => {
  const tot = fmt(Math.floor(aud.duration));
  document.getElementById('t-tot').textContent  = tot;
  document.getElementById('fp-tot').textContent = tot;
});

document.getElementById('prog-range').addEventListener('input', e => {
  const p = parseFloat(e.target.value);
  e.target.style.setProperty('--p', p + '%');
  if (aud.duration) aud.currentTime = (p / 100) * aud.duration;
  const fpR = document.getElementById('fp-range');
  if (fpR) { fpR.value = p; fpR.style.setProperty('--p', p + '%'); }
});

document.getElementById('fp-range').addEventListener('input', e => {
  const p = parseFloat(e.target.value);
  e.target.style.setProperty('--p', p + '%');
  if (aud.duration) aud.currentTime = (p / 100) * aud.duration;
  const pr = document.getElementById('prog-range');
  if (pr) { pr.value = p; pr.style.setProperty('--p', p + '%'); }
});

const vr = document.getElementById('vol-range');
const savedVol = parseFloat(localStorage.getItem('wa_vol') ?? '80');
vr.value = savedVol;
vr.style.setProperty('--p', savedVol + '%');
aud.volume = savedVol / 100;
vr.addEventListener('input', e => {
  e.target.style.setProperty('--p', e.target.value + '%');
  aud.volume = e.target.value / 100;
  localStorage.setItem('wa_vol', e.target.value);
});

function toggleLikePlayer() {
  const t = queueTracks[queueIdx];
  if (t) toggleLike(t.id);
}

// ── FULL SCREEN PLAYER ────────────────────────────────────────────────────────
function openFullPlayer() {
  if (queueIdx === -1) return;
  fullPlayerOpen = true;
  document.getElementById('fullplayer').classList.add('open');
}

function closeFullPlayer() {
  fullPlayerOpen = false;
  document.getElementById('fullplayer').classList.remove('open');
}

function openCtxPlayer() {
  const t = queueTracks[queueIdx];
  if (!t) return;
  setTimeout(() => {
    const fakeBtn = {
      getBoundingClientRect: () => ({
        bottom: window.innerHeight - 180,
        left: Math.max(8, window.innerWidth / 2 - 95)
      })
    };
    openCtxWithShare(t.id, fakeBtn);
  }, 50);
}

// ── WAVE ──────────────────────────────────────────────────────────────────────
function startWave() {
  if (!tracks.length) { toast('Нет треков', true); return; }
  queueTracks = [...tracks].sort(() => Math.random() - .5);
  queueIdx = 0; isWave = true;
  startPlay();
  toast('〰 Волна запущена');
  document.querySelectorAll('.nav-wave').forEach(b => b.classList.add('active'));
}

function startWaveAuto() {
  if (!tracks.length) return;
  queueTracks = [...tracks].sort(() => Math.random() - .5);
  queueIdx = 0; isWave = true;
  startPlay();
  toast('〰 Волна');
}

function stopWave() {
  isWave = false;
  document.querySelectorAll('.nav-wave').forEach(b => b.classList.remove('active'));
}

// ── LIKES ─────────────────────────────────────────────────────────────────────
function saveLikeCache() {
  try {
    const cache = JSON.parse(localStorage.getItem('wa_udata_' + uid()) || '{}');
    cache.likes = userLikes;
    localStorage.setItem('wa_udata_' + uid(), JSON.stringify(cache));
  } catch {}
}

async function toggleLike(id) {
  if (!uid()) { openAuth(); return; }
  const has  = userLikes.includes(id);
  const uRef = doc(db, 'users', uid());
  if (has) {
    userLikes = userLikes.filter(x => x !== id);
    toast('Убрано из понравившихся');
  } else {
    userLikes = [...userLikes, id];
    toast('❤ Добавлено');
  }
  refreshLikeUI(id, !has);
  updateLikesBadge();
  renderLiked();
  const op = has ? arrayRemove(id) : arrayUnion(id);
  updateDoc(uRef, { likes: op })
    .then(() => saveLikeCache())
    .catch(() => {
      // документ не существует — создаём и повторяем
      setDoc(uRef, { uid: uid(), email: currentUser.email, name: currentUser.displayName || '', likes: userLikes, createdAt: Date.now() })
        .then(() => saveLikeCache())
        .catch(e => { console.error('toggleLike:', e.code, e.message); showErr('like: ' + e.code + ' — ' + e.message); });
    });
  // Update track detail page button if open
  const tdb = document.getElementById('td-like-btn');
  if (tdb) {
    const l2 = userLikes.includes(id);
    tdb.className = `btn btn-ghost${l2 ? ' btn-danger' : ''}`;
    tdb.innerHTML = l2
      ? `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Убрать лайк`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Лайк`;
  }

  // Update player hearts
  if (queueTracks[queueIdx]?.id === id) {
    const l2 = userLikes.includes(id);
    ['pl-heart', 'fp-heart'].forEach(hid => {
      const h = document.getElementById(hid);
      if (h) {
        h.classList.toggle('on', l2);
        h.querySelector('svg')?.setAttribute('fill', l2 ? 'currentColor' : 'none');
      }
    });
  }

  // Save cache
  try {
    const cache = JSON.parse(localStorage.getItem('wa_udata_' + uid()) || '{}');
    cache.likes = userLikes;
    localStorage.setItem('wa_udata_' + uid(), JSON.stringify(cache));
  } catch {}
}

function refreshLikeUI(id, liked) {
  document.querySelectorAll('.act-btn.heart').forEach(btn => {
    if (!(btn.getAttribute('onclick') || '').includes(`'${id}'`)) return;
    btn.classList.toggle('on', liked);
    btn.querySelector('svg')?.setAttribute('fill', liked ? 'currentColor' : 'none');
  });
}

// ── CONTEXT MENU ──────────────────────────────────────────────────────────────
function openCtxWithShare(trackId, btn) {
  if (!uid()) { openAuth(); return; }
  ctxTargetId = trackId;
  const head = document.getElementById('ctx-head');
  if (head) head.textContent = 'Действия';
  const pls   = myPlaylists();
  const items = document.getElementById('ctx-items');
  const shareBtn = `<div class="ctx-item" onclick="closeCtx();setTimeout(()=>shareTrack('${trackId}'),100)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Поделиться</div>`;
  const newBtn = `<div class="ctx-item" onclick="openCreatePl();closeCtx()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Новый плейлист</div>`;
  items.innerHTML = shareBtn + pls.map(pl => {
    const has = pl.tracks.includes(trackId);
    return `<div class="ctx-item${has?' checked':''}" onclick="addToPlaylist('${pl.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${has?'<polyline points="20 6 9 17 4 12"/>':'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>'}</svg>${esc(pl.name)}</div>`;
  }).join('') + newBtn;
  const rect = btn.getBoundingClientRect ? btn.getBoundingClientRect() : { bottom: 100, left: 100 };
  const menu = document.getElementById('ctx-menu');
  menu.style.top  = (rect.bottom + 6) + 'px';
  menu.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
  menu.classList.add('open');
  _ctxJustOpened = true;
}

function openCtx(trackId, btn) {
  if (!uid()) { openAuth(); return; }
  ctxTargetId = trackId;
  const head = document.getElementById('ctx-head');
  if (head) head.textContent = 'Добавить в плейлист';
  const pls   = myPlaylists();
  const items = document.getElementById('ctx-items');
  const newBtn = `<div class="ctx-item" onclick="openCreatePl();closeCtx()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Новый плейлист</div>`;
  items.innerHTML = pls.map(pl => {
    const has = pl.tracks.includes(trackId);
    return `<div class="ctx-item${has?' checked':''}" onclick="addToPlaylist('${pl.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${has?'<polyline points="20 6 9 17 4 12"/>':'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>'}</svg>${esc(pl.name)}</div>`;
  }).join('') + newBtn;
  const rect = btn.getBoundingClientRect ? btn.getBoundingClientRect() : { bottom: 100, left: 100 };
  const menu = document.getElementById('ctx-menu');
  menu.style.top  = (rect.bottom + 6) + 'px';
  menu.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
  menu.classList.add('open');
  _ctxJustOpened = true;
}

function closeCtx() { document.getElementById('ctx-menu').classList.remove('open'); }

async function removeFromPlaylist(plId, trackId) {
  const pl = userPlaylists.find(p => p.id === plId);
  if (!pl) return;
  pl.tracks = pl.tracks.filter(id => id !== trackId);
  updateDoc(doc(db, 'playlists', plId), { tracks: arrayRemove(trackId) })
    .catch(e => console.error('removeFromPlaylist:', e));
  try {
    const cache = JSON.parse(localStorage.getItem('wa_udata_' + uid()) || '{}');
    cache.playlists = userPlaylists;
    localStorage.setItem('wa_udata_' + uid(), JSON.stringify(cache));
  } catch {}
  renderPlaylists();
  openPlaylistDetail(plId);
  toast('Трек удалён из плейлиста');
}

async function addToPlaylist(plId) {
  closeCtx();
  const pl = userPlaylists.find(p => p.id === plId);
  if (!pl || pl.tracks.includes(ctxTargetId)) { toast('Уже в этом плейлисте'); return; }
  pl.tracks.push(ctxTargetId);
  await updateDoc(doc(db, 'playlists', plId), { tracks: arrayUnion(ctxTargetId) }).catch(e => console.error('addToPlaylist:', e));
  toast(`✓ Добавлено в «${pl.name}»`);
  renderPlaylists();
}

let _ctxJustOpened = false;
document.addEventListener('click', e => {
  if (_ctxJustOpened) { _ctxJustOpened = false; return; }
  if (!e.target.closest('.ctx-menu') && !e.target.closest('.act-btn.add') && !e.target.closest('.btn[onclick*="openCtx"]') && !e.target.closest('.fp-more')) closeCtx();
});

// ── AUTH ──────────────────────────────────────────────────────────────────────
function openAuth(mode = 'login') { switchAuthMode(mode); openModal('m-auth'); }

function switchAuthMode(mode) {
  document.getElementById('auth-login-form').style.display = mode === 'login' ? '' : 'none';
  document.getElementById('auth-reg-form').style.display   = mode === 'reg'   ? '' : 'none';
  document.getElementById('auth-modal-title').textContent  = mode === 'login' ? 'Вход' : 'Регистрация';
  document.getElementById('auth-error').classList.remove('show');
}

function authError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.classList.add('show');
}

const FB_ERR = {
  'auth/email-already-in-use': 'Email уже зарегистрирован',
  'auth/invalid-email':        'Некорректный email',
  'auth/weak-password':        'Пароль слишком простой',
  'auth/user-not-found':       'Пользователь не найден',
  'auth/wrong-password':       'Неверный пароль',
  'auth/invalid-credential':   'Неверный email или пароль',
  'auth/too-many-requests':    'Слишком много попыток',
  'auth/network-request-failed': 'Проблема с интернетом',
};

async function doLogin() {
  const email = document.getElementById('li-email').value.trim();
  const pass  = document.getElementById('li-pass').value;
  if (!email || !pass) { authError('Заполни все поля'); return; }
  const btn = document.querySelector('#auth-login-form .btn-prime');
  btn.disabled = true; btn.textContent = 'Вход...';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    closeModal('m-auth');
  } catch(e) {
    authError(FB_ERR[e.code] || e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Войти';
  }
}

async function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  if (!name || !email || !pass) { authError('Заполни все поля'); return; }
  if (pass.length < 6) { authError('Пароль — минимум 6 символов'); return; }
  const btn = document.querySelector('#auth-reg-form .btn-prime');
  btn.disabled = true; btn.textContent = 'Создаём...';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    // Создаём документ пользователя — onAuthStateChanged вызовет loadUserData
    // который тоже создаст документ, но мы делаем это здесь явно чтобы гарантировать
    setDoc(doc(db, 'users', cred.user.uid), { name, email, uid: cred.user.uid, likes: [], createdAt: Date.now() }).catch(()=>{});
    closeModal('m-auth');
  } catch(e) {
    authError(FB_ERR[e.code] || e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Создать аккаунт';
  }
}

async function doLogout() {
  await signOut(auth);
  currentUser = null; userLikes = []; userPlaylists = [];
  renderAll(); nav('home'); toast('Вышел из аккаунта');
}

async function loadUserData(user) {
  if (!user) return;
  const CACHE_KEY = 'wa_udata_' + user.uid;

  // Show from cache instantly
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached) {
      userLikes     = cached.likes     || [];
      userPlaylists = cached.playlists || [];
      renderLiked(); renderPlaylists(); renderProfile(); updateLikesBadge();
    }
  } catch {}

  // Load fresh data in parallel
  const uRef = doc(db, 'users', user.uid);
  const [snap, plSn] = await Promise.all([
    getDoc(uRef).catch(() => null),
    getDocs(query(collection(db, 'playlists'), where('uid', '==', user.uid))).catch(() => null)
  ]);

  if (!snap || !snap.exists()) {
    await setDoc(uRef, { uid: user.uid, email: user.email, name: user.displayName || '', likes: [], createdAt: Date.now() })
      .catch(e => { console.error('createUserDoc:', e.code, e.message); if(typeof showErr!=='undefined') showErr('createUserDoc: ' + e.code + ' — ' + e.message); });
    userLikes = [];
  } else {
    userLikes = snap.data().likes || [];
  }
  userPlaylists = plSn ? plSn.docs.map(d => ({ id: d.id, ...d.data() })) : [];

  // Save to cache
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ likes: userLikes, playlists: userPlaylists, ts: Date.now() }));
  } catch {}

  renderLiked(); renderPlaylists(); renderProfile(); updateLikesBadge();
}

function renderAuthArea() {
  const el = document.getElementById('auth-area');
  if (currentUser) {
    const name = currentUser.displayName || currentUser.email;
    const ini  = (name || '?')[0].toUpperCase();
    el.innerHTML = `<div class="user-menu-wrap">
      <div class="user-chip" id="user-chip" onclick="toggleUserMenu()">
        <div class="user-avatar">${ini}</div>
        <span class="user-chip-name">${esc(name)}</span>
        <svg class="chip-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        <div class="dropdown" id="user-dd">
          <div class="dd-item" onclick="nav('profile');closeUserMenu()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Профиль</div>
          <div class="dd-item" onclick="nav('liked');closeUserMenu()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>Понравилось</div>
          <div class="dd-item" onclick="nav('playlists');closeUserMenu()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>Плейлисты</div>
          <div class="dd-sep"></div>
          <div class="dd-item" onclick="doLogout()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Выйти</div>
        </div>
      </div>
    </div>`;
  } else {
    el.innerHTML = `<button class="btn-auth" onclick="openAuth('login')">Войти</button><button class="btn-auth primary" onclick="openAuth('reg')">Регистрация</button>`;
  }
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  renderAuthArea();
  if (user) {
    if (firstAuth) { firstAuth = false; toast(`✓ Добро пожаловать, ${user.displayName || user.email}!`); }
    loadUserData(user);
  } else {
    firstAuth = false; userLikes = []; userPlaylists = [];
    renderLiked(); renderPlaylists(); renderProfile(); updateLikesBadge();
  }
});

function toggleUserMenu() {
  const chip = document.getElementById('user-chip');
  const dd   = document.getElementById('user-dd');
  if (!chip || !dd) return;
  const open = dd.classList.toggle('open');
  chip.classList.toggle('open', open);
}
function closeUserMenu() {
  document.getElementById('user-dd')?.classList.remove('open');
  document.getElementById('user-chip')?.classList.remove('open');
}
document.addEventListener('click', e => { if (!e.target.closest('.user-menu-wrap')) closeUserMenu(); });

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function nav(page, linkEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
  document.getElementById('pg-' + page)?.classList.add('show');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  if (linkEl) linkEl.classList.add('active');
  else document.querySelector(`.nav-link[data-p="${page}"]`)?.classList.add('active');
  document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.mob-nav-btn[data-p="${page}"]`)?.classList.add('active');
  document.getElementById('content').scrollTop = 0;
}

// ── MOBILE SEARCH ─────────────────────────────────────────────────────────────
function openMobSearch() {
  document.getElementById('mob-search-overlay').classList.add('open');
  setTimeout(() => document.getElementById('mob-search-inp').focus(), 80);
}
function closeMobSearch() {
  document.getElementById('mob-search-overlay').classList.remove('open');
  document.getElementById('mob-search-inp').value = '';
  document.getElementById('mob-search-results').innerHTML = '<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Начни вводить</div></div>';
}

let mobST;
let _searchTab = 'tracks';
function setSearchTab(tab) {
  _searchTab = tab;
  document.querySelectorAll('.search-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const q = document.getElementById('mob-search-inp').value.trim().toLowerCase();
  if (q) runMobSearch(q);
}

function runMobSearch(q) {
  const el = document.getElementById('mob-search-results');
  if (!q) {
    el.innerHTML = '<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Начни вводить</div></div>';
    return;
  }
  if (_searchTab === 'tracks') {
    const res = tracks.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
    el.innerHTML = res.length
      ? res.map((t,i) => trackRow(t,i)).join('')
      : '<div class="empty"><div class="empty-ico">😶</div><div class="empty-txt">Ничего не найдено</div></div>';
  } else {
    // Artists tab
    const artistNames = [...new Set(tracks.flatMap(t => getArtists(t)))].filter(a => a.toLowerCase().includes(q));
    if (!artistNames.length) {
      el.innerHTML = '<div class="empty"><div class="empty-ico">😶</div><div class="empty-txt">Артисты не найдены</div></div>';
      return;
    }
    el.innerHTML = artistNames.map(name => {
      const info = ARTISTS[name] || {};
      const tks = tracks.filter(t => t.artist === name);
      const ini = (name || '?')[0].toUpperCase();
      const av = info.photo
        ? `<img src="${RAW}/${info.photo}" style="width:40px;height:40px;border-radius:50%;object-fit:cover">`
        : `<div style="width:40px;height:40px;border-radius:50%;background:var(--surf2);display:flex;align-items:center;justify-content:center;font-family:var(--f-head);font-weight:800;color:var(--acc);font-size:16px;flex-shrink:0">${ini}</div>`;
      const badge = info.verified ? ' ✓' : '';
      return `<div class="trow" onclick="openArtistPage('${esc(name)}');closeMobSearch()" style="grid-template-columns:56px 1fr">
        <div class="trow-img" style="width:56px;height:56px;padding:8px;border:none">${av}</div>
        <div class="trow-info">
          <div class="trow-title">${esc(name)}${badge}</div>
          <div class="trow-artist" style="color:var(--muted2)">${tks.length} треков</div>
        </div>
      </div>`;
    }).join('');
  }
}

document.getElementById('mob-search-inp').addEventListener('input', e => {
  clearTimeout(mobST);
  mobST = setTimeout(() => runMobSearch(e.target.value.trim().toLowerCase()), 200);
});

let searchST;
document.getElementById('search-inp').addEventListener('input', e => {
  clearTimeout(searchST);
  searchST = setTimeout(() => {
    searchQ = e.target.value.trim();
    if (searchQ) { nav('catalog'); renderCatalogList(); renderArtistSearch(); }
    else renderCatalogList();
  }, 200);
});

function renderArtistSearch() {
  const el = document.getElementById('artist-search-results');
  if (!el) return;
  const q = searchQ.toLowerCase();
  if (!q) { el.style.display = 'none'; return; }
  const names = [...new Set(tracks.flatMap(t => getArtists(t)))].filter(a => a.toLowerCase().includes(q));
  if (!names.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = `<div class="section-label" style="margin-bottom:12px">Артисты</div>` +
    names.map(name => {
      const info = ARTISTS[name] || {};
      const tks = tracks.filter(t => t.artist === name);
      const ini = (name || '?')[0].toUpperCase();
      const av = info.photo
        ? `<img src="${RAW}/${info.photo}" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`
        : `<div style="width:44px;height:44px;border-radius:50%;background:var(--surf2);display:flex;align-items:center;justify-content:center;font-family:var(--f-head);font-weight:800;color:var(--acc);font-size:18px;flex-shrink:0">${ini}</div>`;
      return `<div class="trow" onclick="openArtistPage('${esc(name)}')" style="grid-template-columns:52px 1fr">
        <div class="trow-img" style="width:52px;height:52px;padding:4px;border:none">${av}</div>
        <div class="trow-info">
          <div class="trow-title">${esc(name)}${info.verified?' ✓':''}</div>
          <div class="trow-artist">${tks.length} треков</div>
        </div>
      </div>`;
    }).join('');
}

// ── KEYBOARD ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.code === 'Space')      { e.preventDefault(); togglePlay(); }
  if (e.code === 'ArrowRight') { e.preventDefault(); nextTrack(); }
  if (e.code === 'ArrowLeft')  { e.preventDefault(); prevTrack(); }
  if (e.code === 'Escape')     { if (fullPlayerOpen) closeFullPlayer(); }
});

// ── MODALS ────────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('open'); });
});
document.getElementById('li-pass').addEventListener('keydown',  e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('reg-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });


// ── THEME ─────────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('wa_theme') || 'dark';
  applyTheme(saved);
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('wa_theme', theme);
  const dark  = document.getElementById('theme-icon-dark');
  const light = document.getElementById('theme-icon-light');
  if (dark)  dark.style.display  = theme === 'dark'  ? '' : 'none';
  if (light) light.style.display = theme === 'light' ? '' : 'none';
}
function toggleTheme() {
  const cur = localStorage.getItem('wa_theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}


// ── ALBUMS ────────────────────────────────────────────────────────────────────
let prevAlbumPage = 'home';

function getAlbums() {
  const map = {};
  tracks.forEach(t => {
    if (!t.album) return;
    if (!map[t.album]) map[t.album] = {
      name: t.album,
      artist: artistStr(t),
      cover: t.albumCover || t.cover || null,
      tracks: [],
      addedAt: t.addedAt || ''
    };
    map[t.album].tracks.push(t.id);
    if (!map[t.album].cover && (t.albumCover || t.cover)) {
      map[t.album].cover = t.albumCover || t.cover;
    }
  });
  return Object.values(map);
}

function renderArtistAlbums(artistName) {
  const albums = getAlbums().filter(a => getArtists({artist:a.artist}).includes(artistName));
  if (!albums.length) return '';
  return `<div class="section-label" style="margin-top:24px;margin-bottom:12px">Альбомы</div>
    <div class="albums-grid">${albums.map(a => albumCard(a)).join('')}</div>`;
}

function albumCard(album) {
  const url = album.cover ? `${RAW}/${album.cover}` : null;
  const img = url ? `<img src="${esc(url)}" loading="lazy" alt="">` : '💿';
  return `<div class="album-card" onclick="openAlbum('${esc(album.name)}')">
    <div class="album-cover">${img}<div class="album-badge">${album.tracks.length} тр.</div></div>
    <div class="album-title">${esc(album.name)}</div>
    <div class="album-meta">${esc(album.artist)}</div>
  </div>`;
}

function openAlbum(albumName) {
  prevAlbumPage = document.querySelector('.nav-link.active')?.dataset.p || 'home';
  const album = getAlbums().find(a => a.name === albumName);
  if (!album) return;
  const tks = album.tracks.map(id => tracks.find(t => t.id === id)).filter(Boolean);
  const url = album.cover ? `${RAW}/${album.cover}` : null;
  const img = url ? `<img src="${esc(url)}" alt="">` : '💿';
  const year = album.addedAt ? album.addedAt.slice(0,4) : '';
  document.getElementById('album-body').innerHTML = `
    <div class="album-header">
      <div class="album-header-img">${img}</div>
      <div>
        <div class="album-header-title">${esc(album.name)}</div>
        <div class="album-header-artist" onclick="openArtistPage('${esc(album.artist)}')">${esc(album.artist)}</div>
        <div class="album-header-meta">${year ? year + ' · ' : ''}${tks.length} треков</div>
        <button class="btn btn-prime" onclick="playAlbum('${esc(album.name)}')">
          <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="5 3 19 12 5 21"/></svg>Слушать альбом
        </button>
      </div>
    </div>
    ${tks.length ? `<div class="tlist">${tks.map((t,i) => trackRow(t,i)).join('')}</div>` : ''}`;
  nav('album');
}

function playAlbum(albumName) {
  const album = getAlbums().find(a => a.name === albumName);
  if (!album) return;
  const tks = album.tracks.map(id => tracks.find(t => t.id === id)).filter(Boolean);
  if (!tks.length) return;
  stopWave();
  queueTracks = tks;
  queueIdx = 0;
  startPlay();
  toast(`▶ ${albumName}`);
}

function goBackFromAlbum() { nav(prevAlbumPage); }

// ── WINDOW EXPORTS (for onclick in HTML) ──────────────────────────────────────
window.nav=nav; 
// ── DOMINANT COLOR ────────────────────────────────────────────────────────────
function setFpGradient(R, G, B) {
  const fp = document.getElementById('fullplayer');
  if (!fp) return;
  let layer = fp.querySelector('.fp-grad-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'fp-grad-layer';
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;transition:background .8s ease';
    fp.insertBefore(layer, fp.firstChild);
  }
  layer.style.background = `radial-gradient(ellipse at 50% 0%, rgba(${R},${G},${B},0.6) 0%, rgba(${R},${G},${B},0.15) 45%, transparent 72%)`;
}

function extractDominantColor(src) {
  // Always show orange gradient immediately as fallback
  setFpGradient(255, 94, 26);
  if (!src) return;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, 8, 8);
      const d = ctx.getImageData(0,0,8,8).data;
      let r=0,g=0,b=0,n=0;
      for (let i=0;i<d.length;i+=4) {
        if (d[i+3]<128) continue;
        r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++;
      }
      if (!n || Math.max(r/n,g/n,b/n)-Math.min(r/n,g/n,b/n)<30) return;
      const R=Math.round(r/n), G=Math.round(g/n), B=Math.round(b/n);
      document.documentElement.style.setProperty('--acc',  `rgb(${R},${G},${B})`);
      document.documentElement.style.setProperty('--acc2', `rgb(${Math.min(255,R+40)},${Math.min(255,G+40)},${Math.min(255,B+40)})`);
      setFpGradient(R, G, B);
    } catch {}
  };
  // On CORS error — keep orange gradient
  img.onerror = () => {};
  img.src = src;
}

function resetAccent() {
  document.documentElement.style.setProperty('--acc','#ff5e1a');
  document.documentElement.style.setProperty('--acc2','#ff8c5a');
  setFpGradient(255, 94, 26);
}

// ── LYRICS ────────────────────────────────────────────────────────────────────
let _lyricsVisible = false;
function toggleLyrics() {
  const t = queueTracks[queueIdx]; if (!t) return;
  _lyricsVisible = !_lyricsVisible;
  const lyrEl  = document.getElementById('fp-lyrics');
  const covEl  = document.getElementById('fp-cover');
  const lyrBtn = document.getElementById('fp-lyrics-btn');
  if (_lyricsVisible) {
    if (covEl) covEl.style.display = 'none';
    if (lyrEl) {
      lyrEl.style.display = 'block';
      lyrEl.innerHTML = t.lyrics
        ? `<div class="fp-lyrics-text">${esc(t.lyrics).replace(/\n/g,'<br>')}</div>`
        : `<div class="fp-lyrics-empty">Текст не добавлен</div>`;
    }
    if (lyrBtn) lyrBtn.classList.add('active');
  } else {
    if (covEl) covEl.style.display = '';
    if (lyrEl) lyrEl.style.display = 'none';
    if (lyrBtn) lyrBtn.classList.remove('active');
  }
}

// ── PUBLIC PLAYLIST BY URL ────────────────────────────────────────────────────
function checkUrlPlaylist() {
  const pid = new URLSearchParams(location.search).get('pl') || new URLSearchParams(location.search).get('playlist');
  if (!pid) return;
  import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').then(({getFirestore,doc,getDoc})=>{}).catch(()=>{});
  // Use already imported db
  getDoc(doc(db, 'playlists', pid)).then(snap => {
    if (!snap.exists()) return;
    const pl  = { id: snap.id, ...snap.data() };
    const tks = pl.tracks.map(id => tracks.find(t => t.id === id)).filter(Boolean);
    document.getElementById('pl-detail-body').innerHTML = `
      <div class="pg-title">${esc(pl.name)} <span style="font-size:12px;color:var(--c-muted2);font-family:var(--f-mono);font-weight:400">— публичный</span></div>
      ${pl.desc ? `<p style="font-size:12px;color:var(--c-muted2);margin-bottom:20px;line-height:1.8">${esc(pl.desc)}</p>` : ''}
      ${tks.length
        ? `<div class="tlist">${tks.map((t,i) => trackRow(t,i)).join('')}</div>`
        : `<div class="empty"><div class="empty-ico">🎵</div><div class="empty-txt">Плейлист пустой</div></div>`}`;
    nav('pl-detail');
  }).catch(() => {});
}

window.setGenre=setGenre; window.setSort=setSort;
window.openTrack=openTrack; window.playById=playById; window.openArtistPage=openArtistPage;
window.goBackFromTrack=goBackFromTrack; window.goBackFromArtist=goBackFromArtist;
window.toggleLike=toggleLike; window.toggleLikePlayer=toggleLikePlayer;
window.togglePlay=togglePlay; window.nextTrack=nextTrack; window.prevTrack=prevTrack;
window.toggleShuffle=toggleShuffle; window.toggleRepeat=toggleRepeat;
window.openCtx=openCtx; window.openCtxWithShare=openCtxWithShare; window.closeCtx=closeCtx; window.addToPlaylist=addToPlaylist;
window.openPlaylistDetail=openPlaylistDetail; window.openCreatePl=openCreatePl; window.createPlaylist=createPlaylist;
window.openAuth=openAuth; window.switchAuthMode=switchAuthMode;
window.doLogin=doLogin; window.doRegister=doRegister; window.doLogout=doLogout;
window.toggleUserMenu=toggleUserMenu; window.closeUserMenu=closeUserMenu;
window.openModal=openModal; window.closeModal=closeModal;
window.openMobSearch=openMobSearch; window.closeMobSearch=closeMobSearch;
window.startWave=startWave; window.shareTrack=shareTrack;
window.openFullPlayer=openFullPlayer;
window.copyShareUrl=copyShareUrl;window.nativeShare=nativeShare; window.closeFullPlayer=closeFullPlayer;
window.toggleLyrics=toggleLyrics; window.deletePlaylist=deletePlaylist; window.removeFromPlaylist=removeFromPlaylist; window.saveNewName=saveNewName; window.toggleEditName=toggleEditName; window.setSearchTab=setSearchTab; window.toggleTheme=toggleTheme; window.openAlbum=openAlbum; window.playAlbum=playAlbum; window.goBackFromAlbum=goBackFromAlbum; window.loadMoreCatalog=loadMoreCatalog; window.sharePlaylist=sharePlaylist; window.openCtxPlayer=openCtxPlayer;
window.openCtxPlayer=openCtxPlayer;

// ── INIT ──────────────────────────────────────────────────────────────────────
initTheme();
renderAuthArea();
loadTracks();

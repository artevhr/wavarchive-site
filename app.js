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
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

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
  // Пример:
  // "Овсянкин": {
  //   verified: true,
  //   bio: "Независимый артист.",
  //   telegram: "@username",
  //   instagram: "username",
  //   vk: "username",
  //   soundcloud: "username",
  //   photo: "https://..."
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
  // если пользователь уже авторизован — рендерим приватные части
  if (currentUser) {
    renderLiked(); renderPlaylists(); renderProfile(); updateLikesBadge();
  }
  checkUrlTrack();
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
    <div class="tcard-artist" onclick="event.stopPropagation();openArtistPage('${esc(t.artist)}')">${esc(t.artist)}</div>
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
function trackRow(t, i) {
  const url   = coverUrl(t);
  const liked = myLikes().includes(t.id);
  const isNow = queueTracks[queueIdx]?.id === t.id;
  const img   = url ? `<img src="${esc(url)}" loading="lazy" alt="">` : genreEmoji(t.genre);
  return `<div class="trow${isNow?' now':''}" id="row-${t.id}" onclick="playById('${t.id}')">
    <div class="trow-n">${isNow ? '▶' : i+1}</div>
    <div class="trow-img">${img}</div>
    <div class="trow-info">
      <div class="trow-title">${esc(t.title)}</div>
      <div class="trow-artist"><span onclick="event.stopPropagation();openArtistPage('${esc(t.artist)}')" style="cursor:pointer">${esc(t.artist)}</span> <span class="tag-genre">${esc(t.genre||'')}</span></div>
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
      ? `<div class="tlist">${tks.map((t,i) => trackRow(t,i)).join('')}</div>`
      : `<div class="empty"><div class="empty-ico">🎵</div><div class="empty-txt">Плейлист пустой</div></div>`}`;
  const shareBtn = document.getElementById('btn-share-pl');
  if (shareBtn) shareBtn.style.display = '';
  prevPage = 'playlists';
  nav('pl-detail');
}

function sharePlaylist(plId) {
  if (!plId) plId = _currentPlId;
  if (!plId) return;
  const url = location.origin + location.pathname + '?playlist=' + plId;
  if (navigator.share) {
    navigator.share({ title: 'WAVARCHIVE — плейлист', url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => toast('✓ Ссылка скопирована')).catch(() => toast('Ссылка: ' + url));
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
      <div>
        <div class="profile-name">${esc(name)}</div>
        <div class="profile-email">${esc(currentUser.email)}</div>
        <div class="stat-row">
          <div><div class="stat-v">${userLikes.length}</div><div class="stat-l">Лайков</div></div>
          <div><div class="stat-v">${userPlaylists.length}</div><div class="stat-l">Плейлистов</div></div>
        </div>
      </div>
    </div>
    <button class="btn btn-ghost" onclick="doLogout()">Выйти из аккаунта</button>`;
}

// ── TRACK DETAIL PAGE ─────────────────────────────────────────────────────────
function openTrack(id) {
  const t = tracks.find(x => x.id === id);
  if (!t) return;
  const url   = coverUrl(t);
  const liked = myLikes().includes(t.id);
  const img   = url ? `<img src="${esc(url)}" alt="">` : genreEmoji(t.genre);
  const plays = playsCache[t.id]?.count || 0;
  const artistSpan = `<span style="cursor:pointer;text-decoration:underline;text-decoration-color:var(--border)" onclick="openArtistPage('${esc(t.artist)}')">${esc(t.artist)}</span>`;
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
  const tks  = tracks.filter(t => t.artist === name);
  const ini  = (name || '?')[0].toUpperCase();
  const avatarHtml = info.photo
    ? `<div class="artist-avatar"><img src="${esc(info.photo)}" alt=""></div>`
    : `<div class="artist-avatar">${ini}</div>`;
  const badge = info.verified
    ? `<span class="artist-badge"><svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Верифицирован</span>`
    : '';
  const socials = [];
  if (info.telegram)   socials.push(`<a href="https://t.me/${info.telegram.replace('@','')}" target="_blank" class="btn-social btn-tg-s"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg>Telegram</a>`);
  if (info.instagram)  socials.push(`<a href="https://instagram.com/${info.instagram}" target="_blank" class="btn-social btn-inst-s">Instagram</a>`);
  if (info.vk)         socials.push(`<a href="https://vk.com/${info.vk}" target="_blank" class="btn-social btn-vk-s">VK</a>`);
  if (info.soundcloud) socials.push(`<a href="https://soundcloud.com/${info.soundcloud}" target="_blank" class="btn-social btn-sc-s">SoundCloud</a>`);
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
  const p = new URLSearchParams(location.search);
  const tid = p.get('track');
  if (tid) { const t = tracks.find(x => x.id === tid); if (t) openTrack(tid); }
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
function playById(id) {
  const t = tracks.find(x => x.id === id);
  if (!t) return;
  stopWave();
  queueTracks = [...tracks];
  queueIdx    = queueTracks.findIndex(x => x.id === id);
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
  document.getElementById('pl-by').textContent   = t.artist;
  const art = document.getElementById('pl-art');
  if (url) { art.innerHTML = `<img src="${esc(url)}"`+'>'; }
  else { art.innerHTML = genreEmoji(t.genre); art.style.fontSize = '18px'; }
  document.getElementById('pl-heart').classList.toggle('on', liked);
  document.querySelector('#pl-heart svg')?.setAttribute('fill', liked ? 'currentColor' : 'none');

  // Full player
  document.getElementById('fp-title').textContent = t.title;
  const fpArtist = document.getElementById('fp-artist');
  fpArtist.textContent = t.artist;
  fpArtist.style.cursor = 'pointer';
  fpArtist.style.textDecoration = 'underline';
  fpArtist.style.textDecorationColor = 'var(--border2)';
  fpArtist.onclick = () => { closeFullPlayer(); openArtistPage(t.artist); };
  const fpCover = document.getElementById('fp-cover');
  if (url) { fpCover.innerHTML = `<img src="${esc(url)}"`+'>'; }
  else { fpCover.innerHTML = genreEmoji(t.genre); fpCover.style.fontSize = '72px'; }
  document.getElementById('fp-heart').classList.toggle('on', liked);
  document.querySelector('#fp-heart svg')?.setAttribute('fill', liked ? 'currentColor' : 'none');

  document.title = `${t.title} · ${t.artist} — WAVARCHIVE`;
  // Media Session — обложка на экране блокировки
  if ('mediaSession' in navigator) {
    const artwork = coverUrl(t);
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  t.title,
      artist: t.artist,
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
vr.style.setProperty('--p', '80%');
aud.volume = .8;
vr.addEventListener('input', e => {
  e.target.style.setProperty('--p', e.target.value + '%');
  aud.volume = e.target.value / 100;
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
    await setDoc(doc(db, 'users', cred.user.uid), { name, email, uid: cred.user.uid, likes: [], createdAt: Date.now() });
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
    await setDoc(uRef, { uid: user.uid, email: user.email, name: user.displayName || '', likes: [], createdAt: Date.now() }).catch(() => {});
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
document.getElementById('mob-search-inp').addEventListener('input', e => {
  clearTimeout(mobST);
  mobST = setTimeout(() => {
    const q  = e.target.value.trim().toLowerCase();
    const el = document.getElementById('mob-search-results');
    if (!q) { el.innerHTML = '<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Начни вводить</div></div>'; return; }
    const res = tracks.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
    el.innerHTML = res.length
      ? res.map((t,i) => trackRow(t,i)).join('')
      : '<div class="empty"><div class="empty-ico">😶</div><div class="empty-txt">Ничего не найдено</div></div>';
  }, 200);
});

let searchST;
document.getElementById('search-inp').addEventListener('input', e => {
  clearTimeout(searchST);
  searchST = setTimeout(() => {
    searchQ = e.target.value.trim();
    if (searchQ) nav('catalog');
    renderCatalogList();
  }, 200);
});

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

// ── WINDOW EXPORTS (for onclick in HTML) ──────────────────────────────────────
window.nav=nav; 
// ── DOMINANT COLOR ────────────────────────────────────────────────────────────
function extractDominantColor(src) {
  if (!src) { resetAccent(); return; }
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
      if (!n || Math.max(r/n,g/n,b/n)-Math.min(r/n,g/n,b/n)<30) { resetAccent(); return; }
      const root = document.documentElement;
      root.style.setProperty('--acc', `rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})`);
      root.style.setProperty('--acc2', `rgb(${Math.min(255,Math.round(r/n)+40)},${Math.min(255,Math.round(g/n)+40)},${Math.min(255,Math.round(b/n)+40)})`);
    } catch { resetAccent(); }
  };
  img.onerror = resetAccent;
  img.src = src;
}
function resetAccent() {
  document.documentElement.style.setProperty('--acc','#ff5e1a');
  document.documentElement.style.setProperty('--acc2','#ff8c5a');
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
  const pid = new URLSearchParams(location.search).get('playlist');
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
window.toggleLyrics=toggleLyrics; window.loadMoreCatalog=loadMoreCatalog; window.sharePlaylist=sharePlaylist; window.openCtxPlayer=openCtxPlayer;
window.openCtxPlayer=openCtxPlayer;

// ── INIT ──────────────────────────────────────────────────────────────────────
renderAuthArea();
loadTracks();

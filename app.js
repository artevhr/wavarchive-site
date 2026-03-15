const GH_OWNER  = 'artevhr';
const GH_REPO   = 'wavarchive-music';
const GH_BRANCH = 'main';
const RAW        = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}`;
const TRACKS_URL = `${RAW}/tracks.json`;

let tracks       = [];
let currentUser  = null;   
let userLikes    = [];     
let userPlaylists = [];    
let fb           = null;   

let queueTracks  = [];
let isWave       = false;
let queueIdx     = -1;
let isPlaying    = false;
let isShuffle    = false;
let isRepeat     = false;
let prevPage     = 'home';
let ctxTargetId  = null;
let shuffleOrder = [];
let genreHome    = 'all';
let genreCatalog = 'all';
let searchQ      = '';

const aud = document.getElementById('aud');

const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = s => { if(!s) return '—'; const m=Math.floor(s/60),sec=Math.floor(s%60); return `${m}:${sec.toString().padStart(2,'0')}`; };
const uid       = () => currentUser?.uid || null;
const myLikes   = () => userLikes;
const myPlaylists = () => userPlaylists;

const genreEmoji = g => ({'электронная':'🎛','хип-хоп':'🎤','рок':'🎸','jazz':'🎷','ambient':'🌊','поп':'✨','другое':'🎵'}[g]||'🎵');
const coverUrl = t => t.cover ? `${RAW}/${t.cover}` : null;
const audioUrl = t => t.file  ? `${RAW}/${t.file}`  : null;

function toast(msg, err=false) {
  const a = document.getElementById('toast-area');
  const d = document.createElement('div');
  d.className = 'toast' + (err?' err':'');
  d.textContent = msg;
  a.appendChild(d);
  setTimeout(() => d.remove(), 3200);
}

async function loadTracks() {
  const grid = document.getElementById('home-grid');
  const list = document.getElementById('catalog-list');
  grid.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center"><div class="spinner"></div></div>`;

  try {
    const r = await fetch(TRACKS_URL + '?t=' + Date.now());
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    tracks = await r.json();
    if (!Array.isArray(tracks)) throw new Error('Неверный формат tracks.json');
  } catch (e) {
    tracks = [];
    const msg = GH_OWNER === 'YOUR_GITHUB_USERNAME'
      ? 'Настрой GH_OWNER и GH_REPO в коде сайта'
      : `Не удалось загрузить треки: ${e.message}`;
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-ico">📭</div>
      <div class="empty-txt">${esc(msg)}</div>
    </div>`;
    list.innerHTML = grid.innerHTML;
    renderGenreBars(); renderLiked(); renderPlaylists(); renderProfile(); renderAuthArea(); updateLikesBadge();
    return;
  }

  renderAll();
}

function renderAll() {
  renderGenreBars();
  renderHomeGrid();
  renderCatalogList();
  renderLiked();
  renderPlaylists();
  renderProfile();
  renderAuthArea();
  updateLikesBadge();
}

const GENRES = ['all','электронная','хип-хоп','рок','jazz','ambient','поп','другое'];
const GENRE_LABELS = {all:'Все','электронная':'Электронная','хип-хоп':'Хип-хоп','рок':'Рок','jazz':'Jazz','ambient':'Ambient','поп':'Поп','другое':'Другое'};

function renderGenreBars() {
  ['gb-home','gb-catalog'].forEach((id,i) => {
    const cur = i===0 ? genreHome : genreCatalog;
    const ctx = i===0 ? 'home' : 'catalog';
    document.getElementById(id).innerHTML = GENRES.map(g =>
      `<button class="g-btn${g===cur?' on':''}" onclick="setGenre('${g}','${ctx}')">${esc(GENRE_LABELS[g])}</button>`
    ).join('');
  });
}

function setGenre(g, ctx) {
  if (ctx==='home') { genreHome=g; renderHomeGrid(); }
  else { genreCatalog=g; renderCatalogList(); }
  renderGenreBars();
}

function trackCard(t) {
  const url = coverUrl(t);
  const liked = myLikes().includes(t.id);
  const isNow = queueTracks[queueIdx]?.id === t.id;
  const img = url
    ? `<img src="${esc(url)}" loading="lazy" alt="">`
    : `<div class="tcard-img-ph">${genreEmoji(t.genre)}</div>`;
  return `
  <div class="tcard${isNow?' now':''}" id="card-${t.id}" onclick="openTrack('${t.id}')">
    <div class="tcard-img">
      ${img}
      <div class="tcard-overlay" onclick="event.stopPropagation();playById('${t.id}')">
        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
      </div>
    </div>
    <div class="tcard-title">${esc(t.title)}</div>
    <div class="tcard-artist">${esc(t.artist)}</div>
    <div class="tcard-foot">
      <div class="tcard-acts" onclick="event.stopPropagation()">
        <button class="act-btn heart${liked?' on':''}" onclick="toggleLike('${t.id}')">
          <svg viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        </button>
        <button class="act-btn add" onclick="openCtx('${t.id}',this)" title="В плейлист">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <span>${fmt(t.duration)}</span>
    </div>
  </div>`;
}

function trackRow(t, i) {
  const url = coverUrl(t);
  const liked = myLikes().includes(t.id);
  const isNow = queueTracks[queueIdx]?.id === t.id;
  const img = url
    ? `<img src="${esc(url)}" loading="lazy" alt="">`
    : genreEmoji(t.genre);
  return `
  <div class="trow${isNow?' now':''}" id="row-${t.id}" onclick="playById('${t.id}')">
    <div class="trow-n">${isNow ? '▶' : i+1}</div>
    <div class="trow-img">${img}</div>
    <div class="trow-info">
      <div class="trow-title">${esc(t.title)}</div>
      <div class="trow-artist">${esc(t.artist)} <span class="tag-genre">${esc(t.genre||'')}</span></div>
    </div>
    <div class="trow-right" onclick="event.stopPropagation()">
      <button class="act-btn heart${liked?' on':''}" onclick="toggleLike('${t.id}')">
        <svg viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      </button>
      <button class="act-btn add" onclick="openCtx('${t.id}',this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <span class="trow-dur">${fmt(t.duration)}</span>
    </div>
  </div>`;
}

function renderHomeGrid() {
  const data = tracks.filter(t => genreHome==='all' || t.genre===genreHome).slice(0,12);
  const el = document.getElementById('home-grid');
  el.innerHTML = data.length
    ? data.map(t => trackCard(t)).join('')
    : `<div class="empty" style="grid-column:1/-1"><div class="empty-ico">🎵</div><div class="empty-txt">Нет треков в этом жанре</div></div>`;
}

function renderCatalogList() {
  const q = searchQ.toLowerCase();
  const data = tracks
    .filter(t => genreCatalog==='all' || t.genre===genreCatalog)
    .filter(t => !q || t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
  const el = document.getElementById('catalog-list');
  document.getElementById('catalog-cnt').textContent = data.length ? `(${data.length})` : '';
  el.innerHTML = data.length
    ? data.map((t,i) => trackRow(t,i)).join('')
    : `<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Ничего не найдено</div></div>`;
}

function renderLiked() {
  const lk = myLikes();
  const data = tracks.filter(t => lk.includes(t.id));
  const el = document.getElementById('liked-list');
  document.getElementById('liked-cnt').textContent = data.length ? `(${data.length})` : '';
  if (!uid()) { el.innerHTML=`<div class="empty"><div class="empty-ico">🔒</div><div class="empty-txt">Войди, чтобы видеть понравившиеся треки</div></div>`; return; }
  el.innerHTML = data.length
    ? data.map((t,i) => trackRow(t,i)).join('')
    : `<div class="empty"><div class="empty-ico">❤</div><div class="empty-txt">Лайкай треки — они появятся здесь</div></div>`;
}

function updateLikesBadge() {
  const cnt = myLikes().length;
  const b1 = document.getElementById('likes-badge');
  const b2 = document.getElementById('mob-likes-badge');
  if (b1) { b1.style.display = cnt ? '' : 'none'; b1.textContent = cnt; }
  if (b2) { b2.style.display = cnt ? '' : 'none'; b2.textContent = cnt; }
}

function renderPlaylists() {
  const pls = myPlaylists();
  const el = document.getElementById('pl-grid');
  if (!uid()) { el.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="empty-ico">🔒</div><div class="empty-txt">Войди, чтобы создавать плейлисты</div></div>`; return; }
  if (!pls.length) { el.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="empty-ico">📂</div><div class="empty-txt">Нажми «Новый плейлист» чтобы начать</div></div>`; return; }
  el.innerHTML = pls.map(pl => {
    const tks = pl.tracks.map(id => tracks.find(t=>t.id===id)).filter(Boolean).slice(0,4);
    const tiles = Array.from({length:4},(_,i)=>{
      const t = tks[i]; const u = t ? coverUrl(t) : null;
      return u
        ? `<div class="pl-card-mosaic-tile"><img src="${esc(u)}" loading="lazy"></div>`
        : `<div class="pl-card-mosaic-tile">♪</div>`;
    }).join('');
    return `<div class="pl-card" onclick="openPlaylistDetail('${pl.id}')">
      <div class="pl-card-mosaic">${tiles}</div>
      <div class="pl-card-name">${esc(pl.name)}</div>
      <div class="pl-card-cnt">${pl.tracks.length} треков</div>
    </div>`;
  }).join('');
}

function openPlaylistDetail(plId) {
  const pl = myPlaylists().find(p=>p.id===plId);
  if (!pl) return;
  const tks = pl.tracks.map(id=>tracks.find(t=>t.id===id)).filter(Boolean);
  document.getElementById('pl-detail-body').innerHTML = `
    <div class="pg-title">${esc(pl.name)}</div>
    ${pl.desc?`<p style="font-size:12px;color:var(--c-muted2);margin-bottom:20px;line-height:1.8">${esc(pl.desc)}</p>`:''}
    ${tks.length
      ? `<div class="tlist">${tks.map((t,i)=>trackRow(t,i)).join('')}</div>`
      : `<div class="empty"><div class="empty-ico">🎵</div><div class="empty-txt">Плейлист пустой — добавь треки через кнопку + на карточке</div></div>`
    }`;
  prevPage = 'playlists';
  nav('pl-detail');
}

function openCreatePl() {
  if (!uid()) { openAuth(); return; }
  document.getElementById('pl-inp-name').value='';
  document.getElementById('pl-inp-desc').value='';
  openModal('m-create-pl');
}

async function createPlaylist() {
  const name = document.getElementById('pl-inp-name').value.trim();
  if (!name) { toast('Введи название', true); return; }
  const { db, collection, addDoc } = fb;
  const pl = { name, desc: document.getElementById('pl-inp-desc').value.trim(), tracks: [], uid: uid(), createdAt: Date.now() };
  const ref = await addDoc(collection(db, 'playlists'), pl).catch(e => { toast('Ошибка: ' + e.message, true); return null; });
  if (!ref) return;
  pl.id = ref.id;
  userPlaylists.push(pl);
  closeModal('m-create-pl');
  renderPlaylists();
  toast('✓ Плейлист создан');
}

function renderProfile() {
  const el = document.getElementById('profile-body');
  if (!currentUser) { el.innerHTML=`<div class="empty"><div class="empty-ico">👤</div><div class="empty-txt">Войди или зарегистрируйся, чтобы увидеть профиль.</div></div>`; return; }
  const name  = currentUser.displayName || currentUser.email;
  const email = currentUser.email;
  const ini   = (name||'?')[0].toUpperCase();
  el.innerHTML = `
    <div class="profile-head">
      <div class="profile-ava">${ini}</div>
      <div>
        <div class="profile-name">${esc(name)}</div>
        <div class="profile-email">${esc(email)}</div>
        <div class="stat-row">
          <div><div class="stat-v">${userLikes.length}</div><div class="stat-l">Лайков</div></div>
          <div><div class="stat-v">${userPlaylists.length}</div><div class="stat-l">Плейлистов</div></div>
        </div>
      </div>
    </div>
    <button class="btn btn-ghost" onclick="doLogout()">Выйти из аккаунта</button>`;
}

function openTrack(id) {
  const t = tracks.find(x=>x.id===id);
  if (!t) return;
  const url = coverUrl(t);
  const liked = myLikes().includes(t.id);
  const img = url
    ? `<img src="${esc(url)}" alt="">`
    : genreEmoji(t.genre);
  document.getElementById('track-body').innerHTML = `
    <div class="td-wrap">
      <div class="td-img">${img}</div>
      <div class="td-info">
        <div class="td-title">${esc(t.title)}</div>
        <div class="td-artist">${esc(t.artist)}</div>
        ${t.tags?.length ? `<div class="td-tags">${t.tags.map(g=>`<span class="td-tag">${esc(g)}</span>`).join('')}</div>` : ''}
        ${t.description ? `<div class="td-desc">${esc(t.description)}</div>` : ''}
        <div class="td-acts">
          <button class="btn btn-prime" onclick="playById('${t.id}')">
            <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="5 3 19 12 5 21"/></svg>
            Слушать
          </button>
          <button class="btn btn-ghost${liked?' btn-danger':''}" id="td-like-btn" onclick="toggleLike('${t.id}')">
            <svg viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            ${liked ? 'Убрать лайк' : 'Лайк'}
          </button>
          <button class="btn btn-ghost" onclick="openCtx('${t.id}',this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            В плейлист
          </button>
        </div>
        <div class="td-stat">
          <div><div class="td-stat-v">${fmt(t.duration)}</div><div class="td-stat-l">Длительность</div></div>
          <div><div class="td-stat-v">${esc(t.genre||'—')}</div><div class="td-stat-l">Жанр</div></div>
        </div>
      </div>
    </div>`;
  prevPage = document.querySelector('.nav-link.active')?.dataset.p || 'home';
  nav('track');
}

function goBackFromTrack() { nav(prevPage); }

function playById(id) {
  const t = tracks.find(x=>x.id===id);
  if (!t) return;
  stopWave();
  queueTracks = [...tracks];
  queueIdx = queueTracks.findIndex(x=>x.id===id);
  startPlay();
}

function startPlay() {
  const t = queueTracks[queueIdx];
  if (!t) return;
  const url = audioUrl(t);
  if (url) { aud.src = url; aud.play().catch(()=>{}); }
  else { demoPlay(t); }
  updatePlayerUI(t);
  markNow();
}

let demoTimer=null, demoPos=0, demoDur=0;
function demoPlay(t) {
  clearInterval(demoTimer);
  demoDur = t.duration||180; demoPos=0;
  isPlaying=true; refreshPlayBtn();
  document.getElementById('t-tot').textContent = fmt(demoDur);
  demoTimer = setInterval(()=>{
    if (!isPlaying) return;
    demoPos++;
    if (demoPos>=demoDur) {
      clearInterval(demoTimer); isPlaying=false; refreshPlayBtn();
      isRepeat ? startPlay() : nextTrack(); return;
    }
    const p=(demoPos/demoDur)*100;
    setProg(p); updateMobProg(p); document.getElementById('t-cur').textContent=fmt(demoPos);
  },1000);
}
function setProg(p){
  const r=document.getElementById('prog-range');
  r.value=p; r.style.setProperty('--p',p+'%');
}

function updatePlayerUI(t) {
  document.getElementById('pl-name').textContent = t.title;
  document.getElementById('pl-by').textContent   = t.artist;
  const art = document.getElementById('pl-art');
  const url = coverUrl(t);
  if (url) { art.innerHTML=`<img src="${esc(url)}">`; }
  else { art.innerHTML = genreEmoji(t.genre); art.style.fontSize='18px'; }
  const liked = myLikes().includes(t.id);
  document.getElementById('pl-heart').classList.toggle('on',liked);
  const hsvg = document.querySelector('#pl-heart svg');
  if (hsvg) hsvg.setAttribute('fill',liked?'currentColor':'none');
  document.title = `${t.title} · ${t.artist} — WAVARCHIVE`;
}

function markNow() {
  document.querySelectorAll('.tcard').forEach(c=>c.classList.remove('now'));
  document.querySelectorAll('.trow').forEach(r=>r.classList.remove('now'));
  const id = queueTracks[queueIdx]?.id; if (!id) return;
  document.getElementById('card-'+id)?.classList.add('now');
  const row = document.getElementById('row-'+id);
  if (row) { row.classList.add('now'); row.querySelector('.trow-n').textContent='▶'; }
}

function togglePlay() {
  if (queueIdx===-1) { playById(tracks[0]?.id); return; }
  if (aud.src && aud.src!==location.href) {
    isPlaying ? aud.pause() : aud.play().catch(()=>{});
  } else {
    isPlaying=!isPlaying; refreshPlayBtn();
  }
}

function refreshPlayBtn(){
  document.getElementById('ico-play').style.display  = isPlaying?'none':'';
  document.getElementById('ico-pause').style.display = isPlaying?'':'none';
  const mp = document.getElementById('mob-ico-play');
  const ms = document.getElementById('mob-ico-pause');
  if (mp) mp.style.display = isPlaying?'none':'';
  if (ms) ms.style.display = isPlaying?'':'none';
}

function nextTrack() {
  if (!queueTracks.length) return;
  let ni;
  if (isShuffle && shuffleOrder.length) {
    const pos=shuffleOrder.indexOf(queueIdx);
    ni=shuffleOrder[(pos+1)%shuffleOrder.length];
    queueIdx=ni; startPlay(); return;
  }
  ni = queueIdx + 1;
  if (ni >= queueTracks.length) {
    startWaveAuto(); return;
  }
  queueIdx=ni; startPlay();
}
function prevTrack() {
  if (!queueTracks.length) return;
  let pi;
  if (isShuffle && shuffleOrder.length) {
    const pos=shuffleOrder.indexOf(queueIdx);
    pi=shuffleOrder[(pos-1+shuffleOrder.length)%shuffleOrder.length];
  } else { pi=(queueIdx-1+queueTracks.length)%queueTracks.length; }
  queueIdx=pi; startPlay();
}

function toggleShuffle(){
  isShuffle=!isShuffle;
  document.getElementById('btn-shuf').classList.toggle('active',isShuffle);
  if (isShuffle) shuffleOrder=[...Array(queueTracks.length).keys()].sort(()=>Math.random()-.5);
  toast(isShuffle?'Перемешивание вкл.':'Перемешивание выкл.');
}
function toggleRepeat(){
  isRepeat=!isRepeat;
  document.getElementById('btn-rep').classList.toggle('active',isRepeat);
  aud.loop=isRepeat;
  toast(isRepeat?'Повтор вкл.':'Повтор выкл.');
}

aud.addEventListener('play',   ()=>{ isPlaying=true;  refreshPlayBtn(); });
aud.addEventListener('pause',  ()=>{ isPlaying=false; refreshPlayBtn(); });
aud.addEventListener('ended',  ()=>{ if(!isRepeat) nextTrack(); });
aud.addEventListener('timeupdate',()=>{
  if (!aud.duration) return;
  const p=(aud.currentTime/aud.duration)*100;
  setProg(p);
  updateMobProg(p);
  document.getElementById('t-cur').textContent=fmt(Math.floor(aud.currentTime));
});
aud.addEventListener('loadedmetadata',()=>{
  document.getElementById('t-tot').textContent=fmt(Math.floor(aud.duration));
});

document.getElementById('prog-range').addEventListener('input',e=>{
  const p=parseFloat(e.target.value);
  e.target.style.setProperty('--p',p+'%');
  if (aud.duration) aud.currentTime=(p/100)*aud.duration;
  else demoPos=Math.floor((p/100)*demoDur);
});

const vr=document.getElementById('vol-range');
vr.style.setProperty('--p','80%');
aud.volume=.8;
vr.addEventListener('input',e=>{
  const p=e.target.value;
  e.target.style.setProperty('--p',p+'%');
  aud.volume=p/100;
});

function toggleLikePlayer(){
  const t=queueTracks[queueIdx]; if(t) toggleLike(t.id);
}

async function toggleLike(id) {
  if (!uid()) { openAuth(); return; }
  const { db, doc, updateDoc, arrayUnion, arrayRemove } = fb;
  const has = userLikes.includes(id);
  const ref = doc(db, 'users', uid());
  if (has) {
    userLikes = userLikes.filter(x => x !== id);
    await updateDoc(ref, { likes: arrayRemove(id) }).catch(()=>{});
    toast('Убрано из понравившихся');
  } else {
    userLikes = [...userLikes, id];
    await updateDoc(ref, { likes: arrayUnion(id) }).catch(()=>{});
    toast('❤ Добавлено в понравившееся');
  }
  refreshLikeUI(id, !has);
  updateLikesBadge();
  renderLiked();
  
  const tdb = document.getElementById('td-like-btn');
  if (tdb) {
    const liked2 = userLikes.includes(id);
    tdb.className = `btn btn-ghost${liked2?' btn-danger':''}`;
    tdb.innerHTML = liked2
      ? `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Убрать лайк`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Лайк`;
  }
  
  if (queueTracks[queueIdx]?.id === id) {
    const h = document.getElementById('pl-heart');
    const liked2 = userLikes.includes(id);
    h.classList.toggle('on', liked2);
    h.querySelector('svg').setAttribute('fill', liked2 ? 'currentColor' : 'none');
  }
}

function refreshLikeUI(id,liked) {
  document.querySelectorAll(`.act-btn.heart`).forEach(btn=>{
    const p=btn.getAttribute('onclick')||'';
    if (!p.includes(`'${id}'`)) return;
    btn.classList.toggle('on',liked);
    btn.querySelector('svg')?.setAttribute('fill',liked?'currentColor':'none');
  });
}

function openCtx(trackId, btn) {
  if (!uid()) { openAuth(); return; }
  ctxTargetId = trackId;
  const pls = myPlaylists();
  const items = document.getElementById('ctx-items');
  if (!pls.length) {
    items.innerHTML = `<div class="ctx-item" onclick="openCreatePl();closeCtx()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Создать плейлист
    </div>`;
  } else {
    items.innerHTML = pls.map(pl=>{
      const has=pl.tracks.includes(trackId);
      return `<div class="ctx-item${has?' checked':''}" onclick="addToPlaylist('${pl.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${has?'<polyline points="20 6 9 17 4 12"/>':'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'}
        </svg>
        ${esc(pl.name)}
      </div>`;
    }).join('') + `<div class="ctx-item" onclick="openCreatePl();closeCtx()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Новый плейлист
    </div>`;
  }
  const rect = btn.getBoundingClientRect();
  const menu = document.getElementById('ctx-menu');
  menu.style.top  = (rect.bottom+6)+'px';
  menu.style.left = Math.min(rect.left, window.innerWidth-200)+'px';
  menu.classList.add('open');
}

function closeCtx() { document.getElementById('ctx-menu').classList.remove('open'); }

async function addToPlaylist(plId) {
  closeCtx();
  const pl = userPlaylists.find(p => p.id === plId);
  if (!pl) return;
  if (pl.tracks.includes(ctxTargetId)) { toast('Уже в этом плейлисте'); return; }
  pl.tracks.push(ctxTargetId);
  const { db, doc, updateDoc, arrayUnion } = fb;
  await updateDoc(doc(db, 'playlists', plId), { tracks: arrayUnion(ctxTargetId) }).catch(()=>{});
  toast(`✓ Добавлено в «${pl.name}»`);
  renderPlaylists();
}

document.addEventListener('click', e=>{
  if (!e.target.closest('.ctx-menu') && !e.target.closest('.act-btn.add') && !e.target.closest('.btn[onclick*="openCtx"]')) closeCtx();
});

function openAuth(mode='login') {
  switchAuthMode(mode);
  openModal('m-auth');
}

function switchAuthMode(mode) {
  document.getElementById('auth-login-form').style.display = mode==='login' ? '' : 'none';
  document.getElementById('auth-reg-form').style.display   = mode==='reg'   ? '' : 'none';
  document.getElementById('auth-modal-title').textContent  = mode==='login' ? 'Вход' : 'Регистрация';
  document.getElementById('auth-error').classList.remove('show');
}

function authError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.classList.add('show');
}

function firebaseErrMsg(code) {
  const map = {
    'auth/email-already-in-use':  'Email уже зарегистрирован',
    'auth/invalid-email':         'Некорректный email',
    'auth/weak-password':         'Пароль слишком простой (минимум 6 символов)',
    'auth/user-not-found':        'Пользователь не найден',
    'auth/wrong-password':        'Неверный пароль',
    'auth/invalid-credential':    'Неверный email или пароль',
    'auth/too-many-requests':     'Слишком много попыток. Попробуй позже',
    'auth/network-request-failed':'Проблема с интернетом',
  };
  return map[code] || `Ошибка: ${code}`;
}

async function doLogin() {
  if (!fb) { authError('Firebase не инициализирован'); return; }
  const email = document.getElementById('li-email').value.trim();
  const pass  = document.getElementById('li-pass').value;
  if (!email || !pass) { authError('Заполни все поля'); return; }
  const btn = document.querySelector('#auth-login-form .btn-prime');
  btn.disabled = true; btn.textContent = 'Вход...';
  try {
    await fb.signInWithEmailAndPassword(fb.auth, email, pass);
    closeModal('m-auth');
    
  } catch(e) {
    authError(firebaseErrMsg(e.code));
  } finally {
    btn.disabled = false; btn.textContent = 'Войти';
  }
}

async function doRegister() {
  if (!fb) { authError('Firebase не инициализирован'); return; }
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  if (!name||!email||!pass) { authError('Заполни все поля'); return; }
  if (pass.length < 6) { authError('Пароль — минимум 6 символов'); return; }
  const btn = document.querySelector('#auth-reg-form .btn-prime');
  btn.disabled = true; btn.textContent = 'Создаём...';
  try {
    const cred = await fb.createUserWithEmailAndPassword(fb.auth, email, pass);
    await fb.updateProfile(cred.user, { displayName: name });
    
    const { db, doc, setDoc } = fb;
    await setDoc(doc(db, 'users', cred.user.uid), { name, email, likes: [], createdAt: Date.now() });
    closeModal('m-auth');
  } catch(e) {
    authError(firebaseErrMsg(e.code));
  } finally {
    btn.disabled = false; btn.textContent = 'Создать аккаунт';
  }
}

async function doLogout() {
  if (!fb) return;
  await fb.signOut(fb.auth);
  currentUser   = null;
  userLikes     = [];
  userPlaylists = [];
  renderAll();
  nav('home');
  toast('Вышел из аккаунта');
}

async function loadUserData(user) {
  if (!fb || !user) return;
  const { db, doc, getDoc, collection, query, where, getDocs } = fb;

  
  const uSnap = await getDoc(doc(db, 'users', user.uid)).catch(()=>null);
  userLikes = uSnap?.exists() ? (uSnap.data().likes || []) : [];

  
  const plQ   = query(collection(db, 'playlists'), where('uid', '==', user.uid));
  const plSnap = await getDocs(plQ).catch(()=>null);
  userPlaylists = plSnap ? plSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];

  renderAll();
}

function initApp(fbInstance) {
  fb = fbInstance;
  let firstAuth = true;
  fb.onAuthStateChanged(fb.auth, async user => {
    currentUser = user;
    if (user) {
      renderAuthArea();
      if (firstAuth) {
        firstAuth = false;
        toast(`✓ Добро пожаловать, ${user.displayName || user.email}!`);
      }
      loadUserData(user);
    } else {
      userLikes     = [];
      userPlaylists = [];
      firstAuth = false;
      renderAll();
    }
  });
  loadTracks();
}

window.addEventListener('fb-ready', () => initApp(window._fb));

if (window._fb) initApp(window._fb);

function startWave() {
  if (!tracks.length) { toast('Нет треков для волны', true); return; }
  const pool = [...tracks].sort(() => Math.random() - 0.5);
  queueTracks = pool;
  queueIdx = 0;
  isWave = true;
  startPlay();
  toast('〰 Волна запущена');
  document.querySelectorAll('.nav-wave').forEach(b => b.classList.add('active'));
  document.querySelectorAll('.mob-nav-btn[onclick*="startWave"]').forEach(b => b.classList.add('active'));
}

function startWaveAuto() {
  if (!tracks.length) return;
  const pool = [...tracks].sort(() => Math.random() - 0.5);
  queueTracks = pool;
  queueIdx = 0;
  isWave = true;
  startPlay();
  toast('〰 Волна — рандомные треки');
}

function stopWave() {
  isWave = false;
  document.querySelectorAll('.nav-wave').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mob-nav-btn[onclick*="startWave"]').forEach(b => b.classList.remove('active'));
}

function renderAuthArea() {
  const el = document.getElementById('auth-area');
  if (currentUser) {
    const name = currentUser.displayName || currentUser.email;
    const ini  = (name||'?')[0].toUpperCase();
    el.innerHTML = `
      <div class="user-menu-wrap">
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
    el.innerHTML = `
      <button class="btn-auth" onclick="openAuth('login')">Войти</button>
      <button class="btn-auth primary" onclick="openAuth('reg')">Регистрация</button>`;
  }
}

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
document.addEventListener('click', e=>{
  if (!e.target.closest('.user-menu-wrap')) closeUserMenu();
});

function nav(page, linkEl) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('show'));
  document.getElementById('pg-'+page)?.classList.add('show');
  
  document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
  if (linkEl) linkEl.classList.add('active');
  else {
    const found = document.querySelector(`.nav-link[data-p="${page}"]`);
    if (found) found.classList.add('active');
  }
  
  document.querySelectorAll('.mob-nav-btn').forEach(b=>b.classList.remove('active'));
  const mb = document.querySelector(`.mob-nav-btn[data-p="${page}"]`);
  if (mb) mb.classList.add('active');

  document.getElementById('content').scrollTop=0;
}

function openMobSearch() {
  document.getElementById('mob-search-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('mob-search-inp').focus(), 80);
}
function closeMobSearch() {
  document.getElementById('mob-search-overlay').classList.remove('open');
  document.getElementById('mob-search-inp').value = '';
  document.getElementById('mob-search-results').innerHTML =
    '<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Начни вводить название или имя артиста</div></div>';
}
document.getElementById('mob-search-inp').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  const el = document.getElementById('mob-search-results');
  if (!q) { el.innerHTML = '<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Начни вводить название или имя артиста</div></div>'; return; }
  const res = tracks.filter(t =>
    t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || (t.genre||'').toLowerCase().includes(q)
  );
  el.innerHTML = res.length
    ? res.map((t,i) => trackRow(t,i)).join('')
    : '<div class="empty"><div class="empty-ico">😶</div><div class="empty-txt">Ничего не найдено</div></div>';
});

function updateMobProg(pct) {
  const fill = document.getElementById('mob-prog-fill');
  if (fill) fill.style.width = pct + '%';
}

document.getElementById('search-inp').addEventListener('input', e=>{
  searchQ = e.target.value.trim();
  if (searchQ) nav('catalog');
  renderCatalogList();
});

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-bg').forEach(bg=>{
  bg.addEventListener('click', e=>{ if(e.target===bg) bg.classList.remove('open'); });
});

document.getElementById('li-pass').addEventListener('keydown',  e=>{ if(e.key==='Enter') doLogin(); });
document.getElementById('reg-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') doRegister(); });

renderAuthArea();

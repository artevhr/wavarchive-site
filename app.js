import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const FB = {
  apiKey:"AIzaSyCQVtvodBLUbbxXFUA1fxIOf1DgOdzjJS4",
  authDomain:"wavarchive-73dfb.firebaseapp.com",
  projectId:"wavarchive-73dfb",
  storageBucket:"wavarchive-73dfb.firebasestorage.app",
  messagingSenderId:"803800269262",
  appId:"1:803800269262:web:d274f1c0169b210a4b2b9f"
};
const fbApp = initializeApp(FB);
const auth  = getAuth(fbApp);
const db    = getFirestore(fbApp);

const GH   = { owner:'artevhr', repo:'wavarchive-music', branch:'main' };
const RAW  = `https://raw.githubusercontent.com/${GH.owner}/${GH.repo}/${GH.branch}`;
const WORKER = 'https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev';
const RKEY   = 'wa_recent';
const ARTISTS = {
  // Пример:
  // "Овсянкин": {
  //   verified: true,
  //   bio: "Независимый артист из Москвы.",
  //   telegram: "@ovsyankin",
  //   instagram: "ovsyankin",
  //   vk: "ovsyankin",
  //   soundcloud: "ovsyankin",
  //   photo: "https://..."
  // }
};

// STATE
let tracks=[], user=null, likes=[], playlists=[];
let queue=[], qi=-1, wave=false;
let playing=false, shuffle=false, repeat=false;
let prevPage='home', ctxId=null, shuffleOrd=[];
let gHome='all', gCatalog='all', sq='';
let sort='new', firstLogin=true;
let playsCache={}, playsCacheTs=0;
let prevArtist='home', fpOpen=false;
let ctxOpen=false;

const aud = document.getElementById('aud');
const $ = id => document.getElementById(id);
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = s => { if(!s&&s!==0)return '--'; const m=Math.floor(s/60),x=Math.floor(s%60); return `${m}:${x.toString().padStart(2,'0')}`; };
const uid      = () => user?.uid||null;
const coverUrl = t => t.cover?`${RAW}/${t.cover}`:null;
const audioUrl = t => t.file ?`${RAW}/${t.file}` :null;
const emoji    = g => ({'электронная':'🎛','хип-хоп':'🎤','рок':'🎸','jazz':'🎷','ambient':'🌊','поп':'✨','другое':'🎵'}[g]||'🎵');

// TOAST
function toast(msg, err=false) {
  const a=$('toast-area'), d=document.createElement('div');
  d.className='toast'+(err?' err':''); d.textContent=msg; a.appendChild(d);
  setTimeout(()=>d.remove(), 3000);
}

// LOAD TRACKS
async function loadTracks() {
  $('home-grid').innerHTML=`<div style="grid-column:1/-1;padding:40px;text-align:center"><div class="spinner"></div></div>`;
  try {
    const r=await fetch(`${RAW}/tracks.json?t=${Date.now()}`);
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    tracks=await r.json();
    if(!Array.isArray(tracks)) throw new Error('bad format');
  } catch(e) {
    tracks=[];
    const m=`<div class="empty" style="grid-column:1/-1"><div class="empty-ico">📭</div><div class="empty-txt">Не удалось загрузить треки: ${esc(e.message)}</div></div>`;
    $('home-grid').innerHTML=m; $('catalog-list').innerHTML=m;
  }
  renderAll();
  checkUrlTrack();
}

function renderAll() {
  renderGenreBars(); renderHomeGrid(); renderCatalogList();
  renderLiked(); renderPlaylists(); renderProfile(); renderAuthArea(); updateBadge();
  renderRecent();
}

// GENRES
const GENRES=['all','электронная','хип-хоп','рок','jazz','ambient','поп','другое'];
const GL={all:'Все','электронная':'Электронная','хип-хоп':'Хип-хоп','рок':'Рок','jazz':'Jazz','ambient':'Ambient','поп':'Поп','другое':'Другое'};
function renderGenreBars() {
  ['gb-home','gb-catalog'].forEach((id,i)=>{
    const cur=i===0?gHome:gCatalog, ctx=i===0?'home':'catalog';
    $(id).innerHTML=GENRES.map(g=>`<button class="g-btn${g===cur?' on':''}" onclick="setGenre('${g}','${ctx}')">${esc(GL[g])}</button>`).join('');
  });
}
function setGenre(g,ctx){ if(ctx==='home'){gHome=g;renderHomeGrid();}else{gCatalog=g;renderCatalogList();}renderGenreBars(); }

// SORT
function sortTracks(data) {
  const now=Date.now(), week=7*24*60*60*1000, c=playsCache;
  if(sort==='new') return [...data].sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));
  if(sort==='top') return [...data].sort((a,b)=>{
    const aR=c[a.id]&&(now-c[a.id].lastPlayed)<week?c[a.id].count:0;
    const bR=c[b.id]&&(now-c[b.id].lastPlayed)<week?c[b.id].count:0;
    return bR-aR;
  });
  return [...data].sort((a,b)=>(c[b.id]?.count||0)-(c[a.id]?.count||0));
}
function setSort(s,btn) {
  sort=s;
  document.querySelectorAll('.sort-tab').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderHomeGrid();
}

// CARD / ROW
function trackCard(t) {
  const url=coverUrl(t), lk=likes.includes(t.id), now=queue[qi]?.id===t.id;
  const img=url?`<img src="${esc(url)}" loading="lazy" alt="">`:`<div class="tcard-img-ph">${emoji(t.genre)}</div>`;
  return `<div class="tcard${now?' now':''}" id="card-${t.id}" onclick="openTrack('${t.id}')">
    <div class="tcard-img">${img}<div class="tcard-overlay" onclick="event.stopPropagation();playById('${t.id}')"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></div></div>
    <div class="tcard-title">${esc(t.title)}</div>
    <div class="tcard-artist" onclick="event.stopPropagation();openArtist('${esc(t.artist)}')">${esc(t.artist)}</div>
    <div class="tcard-foot"><div class="tcard-acts" onclick="event.stopPropagation()">
      <button class="act-btn heart${lk?' on':''}" onclick="toggleLike('${t.id}')"><svg viewBox="0 0 24 24" fill="${lk?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
      <button class="act-btn add" onclick="openCtx('${t.id}',this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
    </div><span>${fmt(t.duration)}</span></div>
  </div>`;
}
function trackRow(t,i) {
  const url=coverUrl(t), lk=likes.includes(t.id), now=queue[qi]?.id===t.id;
  const img=url?`<img src="${esc(url)}" loading="lazy" alt="">`:emoji(t.genre);
  return `<div class="trow${now?' now':''}" id="row-${t.id}" onclick="playById('${t.id}')">
    <div class="trow-n">${now?'▶':i+1}</div>
    <div class="trow-img">${img}</div>
    <div class="trow-info">
      <div class="trow-title">${esc(t.title)}</div>
      <div class="trow-artist"><span onclick="event.stopPropagation();openArtist('${esc(t.artist)}')">${esc(t.artist)}</span> <span class="tag-genre">${esc(t.genre||'')}</span></div>
    </div>
    <div class="trow-right" onclick="event.stopPropagation()">
      <button class="act-btn heart${lk?' on':''}" onclick="toggleLike('${t.id}')"><svg viewBox="0 0 24 24" fill="${lk?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
      <button class="act-btn add" onclick="openCtx('${t.id}',this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      <span class="trow-dur">${fmt(t.duration)}</span>
    </div>
  </div>`;
}

function renderHomeGrid() {
  const data=sortTracks(tracks).filter(t=>gHome==='all'||t.genre===gHome).slice(0,12);
  $('home-grid').innerHTML=data.length?data.map(t=>trackCard(t)).join(''):`<div class="empty" style="grid-column:1/-1"><div class="empty-ico">🎵</div><div class="empty-txt">Нет треков</div></div>`;
}
// renderCatalogList moved to pagination section
function renderLiked() {
  const data=tracks.filter(t=>likes.includes(t.id));
  $('liked-cnt').textContent=data.length?`(${data.length})`:'';
  $('liked-list').innerHTML=!uid()?`<div class="empty"><div class="empty-ico">🔒</div><div class="empty-txt">Войди, чтобы видеть лайки</div></div>`:
    data.length?data.map((t,i)=>trackRow(t,i)).join(''):`<div class="empty"><div class="empty-ico">❤</div><div class="empty-txt">Лайкай треки — они появятся здесь</div></div>`;
}
function updateBadge() {
  const n=likes.length;
  ['likes-badge','mob-likes-badge'].forEach(id=>{const b=$(id);if(b){b.style.display=n?'':'none';b.textContent=n;}});
}
function renderRecent() {
  const el=$('recent-list'), lbl=document.querySelector('.recent-label');
  if(!el) return;
  const ids=JSON.parse(localStorage.getItem(RKEY)||'[]');
  const data=ids.map(id=>tracks.find(t=>t.id===id)).filter(Boolean).slice(0,5);
  if(!data.length){el.style.display='none';if(lbl)lbl.style.display='none';return;}
  el.style.display='';if(lbl)lbl.style.display='';
  el.innerHTML=data.map((t,i)=>trackRow(t,i)).join('');
}
function addToRecent(t) {
  let r=JSON.parse(localStorage.getItem(RKEY)||'[]');
  r=[t.id,...r.filter(id=>id!==t.id)].slice(0,20);
  localStorage.setItem(RKEY,JSON.stringify(r));
  renderRecent();
}
function renderPlaylists() {
  const el=$('pl-grid');
  if(!uid()){el.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="empty-ico">🔒</div><div class="empty-txt">Войди, чтобы создавать плейлисты</div></div>`;return;}
  if(!playlists.length){el.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="empty-ico">📂</div><div class="empty-txt">Нажми «Новый плейлист»</div></div>`;return;}
  el.innerHTML=playlists.map(pl=>{
    const tks=pl.tracks.map(id=>tracks.find(t=>t.id===id)).filter(Boolean).slice(0,4);
    const tiles=Array.from({length:4},(_,i)=>{const t=tks[i],u=t?coverUrl(t):null;return u?`<div class="pl-card-mosaic-tile"><img src="${esc(u)}" loading="lazy"></div>`:`<div class="pl-card-mosaic-tile">♪</div>`;}).join('');
    return `<div class="pl-card" onclick="openPlDetail('${pl.id}')"><div class="pl-card-mosaic">${tiles}</div><div class="pl-card-name">${esc(pl.name)}</div><div class="pl-card-cnt">${pl.tracks.length} треков</div></div>`;
  }).join('');
}
let currentPlId = null;
function openPlDetail(plId) {
  const pl=playlists.find(p=>p.id===plId);if(!pl)return;
  currentPlId = plId;
  const tks=pl.tracks.map(id=>tracks.find(t=>t.id===id)).filter(Boolean);
  $('pl-detail-body').innerHTML=`<div class="pg-title">${esc(pl.name)}</div>${pl.desc?`<p style="font-size:12px;color:var(--muted2);margin-bottom:20px;line-height:1.8">${esc(pl.desc)}</p>`:''}${tks.length?`<div class="tlist">${tks.map((t,i)=>trackRow(t,i)).join('')}</div>`:`<div class="empty"><div class="empty-ico">🎵</div><div class="empty-txt">Плейлист пустой</div></div>`}`;
  const shareBtn = $('btn-share-pl');
  if(shareBtn) shareBtn.style.display = '';
  prevPage='playlists'; nav('pl-detail');
}
function openCreatePl(){if(!uid()){openAuth();return;}$('pl-inp-name').value='';$('pl-inp-desc').value='';openModal('m-create-pl');}
async function createPlaylist() {
  const name=$('pl-inp-name').value.trim();
  if(!name){toast('Введи название',true);return;}
  if(!uid()){toast('Войди в аккаунт',true);return;}
  const pl={name,desc:$('pl-inp-desc').value.trim(),tracks:[],uid:uid(),createdAt:Date.now()};
  closeModal('m-create-pl');
  try {
    const ref=await addDoc(collection(db,'playlists'),pl);
    pl.id=ref.id; playlists.push(pl); renderPlaylists(); toast('✓ Плейлист создан');
    saveCache();
  } catch(e) {
    console.error('createPlaylist',e.code,e.message);
    toast(`Ошибка: ${e.message}`,true);
  }
}
function renderProfile() {
  const el=$('profile-body');
  if(!user){el.innerHTML=`<div class="empty"><div class="empty-ico">👤</div><div class="empty-txt">Войди или зарегистрируйся</div></div>`;return;}
  const name=user.displayName||user.email, ini=(name||'?')[0].toUpperCase();
  el.innerHTML=`<div class="profile-head"><div class="profile-ava">${ini}</div><div><div class="profile-name">${esc(name)}</div><div class="profile-email">${esc(user.email)}</div><div class="stat-row"><div><div class="stat-v">${likes.length}</div><div class="stat-l">Лайков</div></div><div><div class="stat-v">${playlists.length}</div><div class="stat-l">Плейлистов</div></div></div></div></div><button class="btn btn-ghost" onclick="doLogout()">Выйти из аккаунта</button>`;
}

// TRACK DETAIL
function openTrack(id) {
  const t=tracks.find(x=>x.id===id);if(!t)return;
  const url=coverUrl(t), lk=likes.includes(t.id), img=url?`<img src="${esc(url)}" alt="">`:emoji(t.genre);
  const plays=playsCache[t.id]?.count||0;
  const artistSpan=`<span style="cursor:pointer;text-decoration:underline;text-decoration-color:var(--border2)" onclick="openArtist('${esc(t.artist)}')">${esc(t.artist)}</span>`;
  $('track-body').innerHTML=`<div class="td-wrap"><div class="td-img">${img}</div><div class="td-info">
    <div class="td-title">${esc(t.title)}</div>
    <div class="td-artist">${artistSpan}</div>
    ${t.tags?.length?`<div class="td-tags">${t.tags.map(g=>`<span class="td-tag">${esc(g)}</span>`).join('')}</div>`:''}
    ${t.description?`<div class="td-desc">${esc(t.description)}</div>`:''}
    <div class="td-acts">
      <button class="btn btn-prime" onclick="playById('${t.id}')"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="5 3 19 12 5 21"/></svg>Слушать</button>
      <button class="btn btn-ghost${lk?' btn-danger':''}" id="td-like-btn" onclick="toggleLike('${t.id}')"><svg viewBox="0 0 24 24" fill="${lk?'currentColor':'none'}" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>${lk?'Убрать лайк':'Лайк'}</button>
      <button class="btn btn-ghost" onclick="shareTrack('${t.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Поделиться</button>
    </div>
    <div class="td-stat">
      <div><div class="td-stat-v">${fmt(t.duration)}</div><div class="td-stat-l">Длительность</div></div>
      <div><div class="td-stat-v">${esc(t.genre||'--')}</div><div class="td-stat-l">Жанр</div></div>
      ${plays?`<div><div class="td-stat-v">${plays}</div><div class="td-stat-l">Прослушиваний</div></div>`:''}
    </div>
  </div></div>`;
  prevPage=document.querySelector('.nav-link.active')?.dataset.p||'home'; nav('track');
}
function goBackFromTrack(){nav(prevPage);}

// ARTIST
function openArtist(name) {
  prevArtist=document.querySelector('.nav-link.active')?.dataset.p||'home';
  const info=ARTISTS[name]||{}, tks=tracks.filter(t=>t.artist===name), ini=(name||'?')[0].toUpperCase();
  const av=info.photo?`<div class="artist-avatar"><img src="${esc(info.photo)}" alt=""></div>`:`<div class="artist-avatar">${ini}</div>`;
  const badge=info.verified?`<span class="artist-badge"><svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Верифицирован</span>`:'';
  const socials=[];
  if(info.telegram) socials.push(`<a href="https://t.me/${info.telegram.replace('@','')}" target="_blank" class="btn-social tg"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg>Telegram</a>`);
  if(info.instagram) socials.push(`<a href="https://instagram.com/${info.instagram}" target="_blank" class="btn-social inst"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>Instagram</a>`);
  if(info.vk) socials.push(`<a href="https://vk.com/${info.vk}" target="_blank" class="btn-social vk"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.864-.525-2.05-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.253-1.405 2.151-3.574 2.151-3.574.119-.254.322-.491.762-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.05.17.49-.085.744-.576.744z"/></svg>VK</a>`);
  if(info.soundcloud) socials.push(`<a href="https://soundcloud.com/${info.soundcloud}" target="_blank" class="btn-social sc"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.56 8.87V17h8.76c1.48-.01 2.68-1.2 2.68-2.68 0-1.48-1.2-2.68-2.68-2.68-.1 0-.2.01-.3.02-.12-2.56-2.21-4.62-4.78-4.62-1.47 0-2.78.6-3.73 1.56l.05.27zM0 15.32c0 .94.77 1.68 1.68 1.68s1.68-.77 1.68-1.68V9.34c0-.94-.77-1.68-1.68-1.68S0 8.4 0 9.34v5.98zm5.04 1.35c0 .94.77 1.33 1.68 1.33s1.68-.39 1.68-1.33V7.67c0-.94-.77-1.68-1.68-1.68S5.04 6.73 5.04 7.67v9z"/></svg>SoundCloud</a>`);
  $('artist-body').innerHTML=`<div class="artist-header">${av}<div>
    <div class="artist-name">${esc(name)}${badge}</div>
    <div class="artist-meta">${tks.length} треков</div>
    ${info.bio?`<div class="artist-bio">${esc(info.bio)}</div>`:''}
    ${socials.length?`<div class="artist-socials">${socials.join('')}</div>`:''}
  </div></div>${tks.length?`<div class="tlist">${tks.map((t,i)=>trackRow(t,i)).join('')}</div>`:`<div class="empty"><div class="empty-ico">🎵</div><div class="empty-txt">Нет треков</div></div>`}`;
  nav('artist');
}
function goBackFromArtist(){nav(prevArtist);}

// SHARE
function shareTrack(id) {
  const url=`${location.origin}${location.pathname}?track=${id}`;
  const t=tracks.find(x=>x.id===id);
  const title=t?`${t.title} — ${t.artist}`:'WAVARCHIVE';
  if(navigator.share){
    navigator.share({title,url}).catch(()=>{});
  } else {
    navigator.clipboard.writeText(url).then(()=>toast('✓ Ссылка скопирована')).catch(()=>toast('Ссылка: '+url));
  }
}
function checkUrlTrack(){
  const p=new URLSearchParams(location.search);
  const id=p.get('track');
  if(id&&tracks.find(x=>x.id===id)) openTrack(id);
  checkUrlPlaylist();
}

// PLAYER
function playById(id) {
  const t=tracks.find(x=>x.id===id);if(!t)return;
  stopWave(); queue=[...tracks]; qi=queue.findIndex(x=>x.id===id); play();
}
function play() {
  const t=queue[qi];if(!t)return;
  const url=audioUrl(t);
  if(url){aud.src=url;aud.play().catch(()=>{});}
  updatePlayerUI(t); markNow(); addToRecent(t);
  if(WORKER&&!WORKER.includes('YOUR_WORKER')) fetch(WORKER+'/play',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({trackId:t.id})}).catch(()=>{});
  // preload next
  const ni=qi+1;if(ni<queue.length){const nu=audioUrl(queue[ni]);if(nu){const a=new Audio();a.preload='auto';a.src=nu;}}
}
function updatePlayerUI(t) {
  const url=coverUrl(t), lk=likes.includes(t.id);
  $('pl-name').textContent=t.title; $('pl-by').textContent=t.artist;
  const art=$('pl-art');
  if(url){art.innerHTML=`<img src="${esc(url)}">`;}else{art.innerHTML=emoji(t.genre);art.style.fontSize='18px';}
  $('fp-title').textContent=t.title;
  const fpa=$('fp-artist'); fpa.textContent=t.artist;
  fpa.onclick=()=>{closeFullPlayer();openArtist(t.artist);};
  const fpCov=$('fp-cover');
  if(url){fpCov.innerHTML=`<img src="${esc(url)}">`;}else{fpCov.innerHTML=emoji(t.genre);fpCov.style.fontSize='72px';}
  ['pl-heart','fp-heart'].forEach(hid=>{
    const h=$(hid);if(!h)return;
    h.classList.toggle('on',lk);
    h.querySelector('svg')?.setAttribute('fill',lk?'currentColor':'none');
  });
  document.title=`${t.title} · ${t.artist} — WAVARCHIVE`;
  // Extract dominant color
  lyricsVisible = false;
  const lyrEl = $('fp-lyrics'); if(lyrEl) lyrEl.style.display='none';
  const covEl = $('fp-cover'); if(covEl) covEl.style.display='';
  const lyrBtn = $('fp-lyrics-btn'); if(lyrBtn) lyrBtn.classList.remove('active');
  const covUrl = coverUrl(t);
  if(covUrl) extractColorFromCover(covUrl);
  else resetAccentColor();
}
function markNow() {
  document.querySelectorAll('.tcard').forEach(c=>c.classList.remove('now'));
  document.querySelectorAll('.trow').forEach(r=>r.classList.remove('now'));
  const id=queue[qi]?.id;if(!id)return;
  $('card-'+id)?.classList.add('now');
  const row=$('row-'+id);if(row){row.classList.add('now');row.querySelector('.trow-n').textContent='▶';}
}
function togglePlay(){if(qi===-1){if(tracks[0])playById(tracks[0].id);return;}playing?aud.pause():aud.play().catch(()=>{});}
function refreshPlayBtn(){
  const p=playing;
  ['ico-play','mob-ico-play','fp-ico-play'].forEach(id=>{const e=$(id);if(e)e.style.display=p?'none':'';});
  ['ico-pause','mob-ico-pause','fp-ico-pause'].forEach(id=>{const e=$(id);if(e)e.style.display=p?'':'none';});
}
function nextTrack(){
  if(!queue.length)return;
  if(shuffle&&shuffleOrd.length){const p=shuffleOrd.indexOf(qi);qi=shuffleOrd[(p+1)%shuffleOrd.length];play();return;}
  const ni=qi+1;if(ni>=queue.length){startWaveAuto();return;}
  qi=ni;play();
}
function prevTrack(){
  if(!queue.length)return;
  if(shuffle&&shuffleOrd.length){const p=shuffleOrd.indexOf(qi);qi=shuffleOrd[(p-1+shuffleOrd.length)%shuffleOrd.length];}
  else{qi=(qi-1+queue.length)%queue.length;}
  play();
}
function toggleShuffle(){shuffle=!shuffle;['btn-shuf','fp-shuf'].forEach(id=>$(id)?.classList.toggle('active',shuffle));if(shuffle)shuffleOrd=[...Array(queue.length).keys()].sort(()=>Math.random()-.5);toast(shuffle?'Перемешивание вкл.':'Перемешивание выкл.');}
function toggleRepeat(){repeat=!repeat;['btn-rep','fp-rep'].forEach(id=>$(id)?.classList.toggle('active',repeat));aud.loop=repeat;toast(repeat?'Повтор вкл.':'Повтор выкл.');}

aud.addEventListener('play',()=>{playing=true;refreshPlayBtn();});
aud.addEventListener('pause',()=>{playing=false;refreshPlayBtn();});
aud.addEventListener('ended',()=>{if(!repeat)nextTrack();});
aud.addEventListener('timeupdate',()=>{
  if(!aud.duration)return;
  const p=(aud.currentTime/aud.duration)*100;
  ['prog-range','fp-range'].forEach(id=>{const r=$(id);if(r){r.value=p;r.style.setProperty('--p',p+'%');}});
  const f=$('mob-prog-fill');if(f)f.style.width=p+'%';
  const c=fmt(Math.floor(aud.currentTime));
  $('t-cur').textContent=c; $('fp-cur').textContent=c;
});
aud.addEventListener('loadedmetadata',()=>{
  const t=fmt(Math.floor(aud.duration));
  $('t-tot').textContent=t; $('fp-tot').textContent=t;
});
$('prog-range').addEventListener('input',e=>{
  const p=parseFloat(e.target.value);
  e.target.style.setProperty('--p',p+'%');
  if(aud.duration)aud.currentTime=(p/100)*aud.duration;
  const r=$('fp-range');if(r){r.value=p;r.style.setProperty('--p',p+'%');}
});
$('fp-range').addEventListener('input',e=>{
  const p=parseFloat(e.target.value);
  e.target.style.setProperty('--p',p+'%');
  if(aud.duration)aud.currentTime=(p/100)*aud.duration;
  const r=$('prog-range');if(r){r.value=p;r.style.setProperty('--p',p+'%');}
});
const vr=$('vol-range');vr.style.setProperty('--p','80%');aud.volume=.8;
vr.addEventListener('input',e=>{e.target.style.setProperty('--p',e.target.value+'%');aud.volume=e.target.value/100;});
function toggleLikePlayer(){const t=queue[qi];if(t)toggleLike(t.id);}

// FULL PLAYER
function openFullPlayer(){if(qi===-1)return;fpOpen=true;$('fullplayer').classList.add('open');}
function closeFullPlayer(){fpOpen=false;$('fullplayer').classList.remove('open');}
function openCtxPlayer(){
  const t=queue[qi];if(!t)return;
  ctxJustOpened=true;
  setTimeout(()=>{
    const btn={getBoundingClientRect:()=>({bottom:window.innerHeight-160,left:Math.max(8,window.innerWidth/2-100)})};
    openCtxFull(t.id,btn);
  },30);
}

// WAVE
function startWave(){if(!tracks.length){toast('Нет треков',true);return;}queue=[...tracks].sort(()=>Math.random()-.5);qi=0;wave=true;play();toast('〰 Волна запущена');document.querySelectorAll('.nav-wave').forEach(b=>b.classList.add('active'));}
function startWaveAuto(){if(!tracks.length)return;queue=[...tracks].sort(()=>Math.random()-.5);qi=0;wave=true;play();toast('〰 Волна');}
function stopWave(){wave=false;document.querySelectorAll('.nav-wave').forEach(b=>b.classList.remove('active'));}

// LIKES
async function toggleLike(id) {
  if(!uid()){openAuth();return;}
  const has=likes.includes(id);
  if(has){likes=likes.filter(x=>x!==id);toast('Убрано из понравившихся');}
  else{likes=[...likes,id];toast('❤ Добавлено');}
  refreshLikeUI(id,!has); updateBadge(); renderLiked();
  updateLikeBtn(id);
  // Write to Firestore in background
  const uRef=doc(db,'users',uid());
  const op=has?arrayRemove(id):arrayUnion(id);
  updateDoc(uRef,{likes:op})
    .then(()=>saveCache())
    .catch(()=>{
      // doc may not exist yet — create it first
      setDoc(uRef,{uid:uid(),email:user.email,name:user.displayName||'',likes:has?likes:[...likes],createdAt:Date.now()})
        .then(()=>saveCache())
        .catch(e=>console.error('like:',e.code,e.message));
    });
}
function updateLikeBtn(id) {
  const lk=likes.includes(id);
  const tdb=$('td-like-btn');
  if(tdb){
    tdb.className=`btn btn-ghost${lk?' btn-danger':''}`;
    tdb.innerHTML=lk?`<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Убрать лайк`:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Лайк`;
  }
  if(queue[qi]?.id===id){
    ['pl-heart','fp-heart'].forEach(hid=>{
      const h=$(hid);if(!h)return;
      h.classList.toggle('on',lk);
      h.querySelector('svg')?.setAttribute('fill',lk?'currentColor':'none');
    });
  }
}
function refreshLikeUI(id,lk){
  document.querySelectorAll('.act-btn.heart').forEach(b=>{
    if(!(b.getAttribute('onclick')||'').includes(`'${id}'`))return;
    b.classList.toggle('on',lk);
    b.querySelector('svg')?.setAttribute('fill',lk?'currentColor':'none');
  });
}

// CTX MENU
let ctxJustOpened=false;
function buildCtxItems(trackId, withShare=false) {
  const pls=playlists;
  const shareBtn=withShare?`<div class="ctx-item" onclick="shareTrack('${trackId}');closeCtx()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Поделиться</div>`:'';
  const newBtn=`<div class="ctx-item" onclick="openCreatePl();closeCtx()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Новый плейлист</div>`;
  const plItems=pls.map(pl=>{
    const has=pl.tracks.includes(trackId);
    return `<div class="ctx-item${has?' checked':''}" onclick="addToPl('${pl.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${has?'<polyline points="20 6 9 17 4 12"/>':'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>'}</svg>${esc(pl.name)}</div>`;
  }).join('');
  return shareBtn+plItems+newBtn;
}
function showCtxMenu(btn) {
  const rect=btn.getBoundingClientRect?btn.getBoundingClientRect():{bottom:200,left:100};
  const menu=$('ctx-menu');
  let top=rect.bottom+6, left=rect.left;
  const menuH=menu.offsetHeight||200;
  if(top+menuH>window.innerHeight-10) top=rect.top-menuH-6;
  if(top<10) top=10;
  left=Math.max(8,Math.min(left,window.innerWidth-menu.offsetWidth-8));
  menu.style.top=top+'px'; menu.style.left=left+'px';
  menu.classList.add('open');
  ctxJustOpened=true;
}
function openCtx(trackId,btn) {
  if(!uid()){openAuth();return;}
  ctxId=trackId;
  $('ctx-head').textContent='Добавить в плейлист';
  $('ctx-items').innerHTML=buildCtxItems(trackId,false);
  showCtxMenu(btn);
}
function openCtxFull(trackId,btn) {
  if(!uid()){openAuth();return;}
  ctxId=trackId;
  $('ctx-head').textContent='Действия';
  $('ctx-items').innerHTML=buildCtxItems(trackId,true);
  showCtxMenu(btn);
}
function closeCtx(){$('ctx-menu').classList.remove('open');ctxOpen=false;}
document.addEventListener('click',e=>{
  if(ctxJustOpened){ctxJustOpened=false;return;}
  if(!e.target.closest('.ctx-menu'))closeCtx();
});
async function addToPl(plId) {
  closeCtx();
  const pl=playlists.find(p=>p.id===plId);
  if(!pl||pl.tracks.includes(ctxId)){toast('Уже в этом плейлисте');return;}
  pl.tracks.push(ctxId);
  toast(`✓ Добавлено в «${pl.name}»`); renderPlaylists();
  updateDoc(doc(db,'playlists',plId),{tracks:arrayUnion(ctxId)})
    .then(()=>saveCache())
    .catch(e=>console.error('addToPl:',e));
}

// AUTH
function openAuth(mode='login'){switchAuthMode(mode);openModal('m-auth');}
function switchAuthMode(mode){
  $('auth-login-form').style.display=mode==='login'?'':'none';
  $('auth-reg-form').style.display=mode==='reg'?'':'none';
  $('auth-modal-title').textContent=mode==='login'?'Вход':'Регистрация';
  $('auth-error').classList.remove('show');
}
function authErr(msg){$('auth-error').textContent=msg;$('auth-error').classList.add('show');}
const FERR={'auth/email-already-in-use':'Email уже зарегистрирован','auth/invalid-email':'Некорректный email','auth/weak-password':'Пароль слишком простой','auth/user-not-found':'Пользователь не найден','auth/wrong-password':'Неверный пароль','auth/invalid-credential':'Неверный email или пароль','auth/too-many-requests':'Слишком много попыток','auth/network-request-failed':'Проблема с интернетом'};
async function doLogin(){
  const email=$('li-email').value.trim(), pass=$('li-pass').value;
  if(!email||!pass){authErr('Заполни все поля');return;}
  const btn=document.querySelector('#auth-login-form .btn-prime');
  btn.disabled=true;btn.textContent='Вход...';
  try{await signInWithEmailAndPassword(auth,email,pass);closeModal('m-auth');}
  catch(e){authErr(FERR[e.code]||e.message);}
  finally{btn.disabled=false;btn.textContent='Войти';}
}
async function doRegister(){
  const name=$('reg-name').value.trim(), email=$('reg-email').value.trim(), pass=$('reg-pass').value;
  if(!name||!email||!pass){authErr('Заполни все поля');return;}
  if(pass.length<6){authErr('Пароль — минимум 6 символов');return;}
  const btn=document.querySelector('#auth-reg-form .btn-prime');
  btn.disabled=true;btn.textContent='Создаём...';
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,pass);
    await updateProfile(cred.user,{displayName:name});
    await setDoc(doc(db,'users',cred.user.uid),{uid:cred.user.uid,email,name,likes:[],createdAt:Date.now()});
    btn.disabled=false;btn.textContent='Создать аккаунт';
    closeModal('m-auth');
  }catch(e){
    btn.disabled=false;btn.textContent='Создать аккаунт';
    authErr(FERR[e.code]||e.message);
  }
}
async function doLogout(){await signOut(auth);user=null;likes=[];playlists=[];renderAll();nav('home');toast('Вышел из аккаунта');}

function saveCache(){
  if(!uid())return;
  try{localStorage.setItem(`wa_u_${uid()}`,JSON.stringify({likes,playlists,ts:Date.now()}));}catch{}
}
async function loadUserData(u) {
  if(!u)return;
  // 1. Show cache instantly
  try{
    const c=JSON.parse(localStorage.getItem(`wa_u_${u.uid}`)||'null');
    if(c){likes=c.likes||[];playlists=c.playlists||[];renderLiked();renderPlaylists();renderProfile();updateBadge();}
  }catch{}
  // 2. Load from Firestore in parallel
  const [snap,plSnap]=await Promise.all([
    getDoc(doc(db,'users',u.uid)).catch(()=>null),
    getDocs(query(collection(db,'playlists'),where('uid','==',u.uid))).catch(()=>null)
  ]);
  if(!snap||!snap.exists()){
    await setDoc(doc(db,'users',u.uid),{uid:u.uid,email:u.email,name:u.displayName||'',likes:[],createdAt:Date.now()}).catch(()=>{});
    likes=[];
  }else{likes=snap.data().likes||[];}
  const freshPls=plSnap?plSnap.docs.map(d=>({id:d.id,...d.data()})):[];
  // Merge: keep any locally added tracks that Firestore may not have yet
  playlists=freshPls.map(fp=>{
    const local=playlists.find(p=>p.id===fp.id);
    if(local&&local.tracks.length>fp.tracks.length){
      // local has more tracks — use local but update other fields
      return {...fp,tracks:local.tracks};
    }
    return fp;
  });
  renderLiked();renderPlaylists();renderProfile();updateBadge();
  saveCache();
}

function renderAuthArea(){
  const el=$('auth-area');
  if(user){
    const name=user.displayName||user.email, ini=(name||'?')[0].toUpperCase();
    el.innerHTML=`<div class="user-menu-wrap"><div class="user-chip" id="user-chip" onclick="toggleMenu()"><div class="user-avatar">${ini}</div><span class="user-chip-name">${esc(name)}</span><svg class="chip-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg><div class="dropdown" id="user-dd"><div class="dd-item" onclick="nav('profile');closeMenu()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Профиль</div><div class="dd-item" onclick="nav('liked');closeMenu()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>Понравилось</div><div class="dd-item" onclick="nav('playlists');closeMenu()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>Плейлисты</div><div class="dd-sep"></div><div class="dd-item" onclick="doLogout()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Выйти</div></div></div></div>`;
  }else{el.innerHTML=`<button class="btn-auth" onclick="openAuth('login')">Войти</button><button class="btn-auth primary" onclick="openAuth('reg')">Регистрация</button>`;}
}
function toggleMenu(){const c=$('user-chip'),d=$('user-dd');if(!c||!d)return;const o=d.classList.toggle('open');c.classList.toggle('open',o);}
function closeMenu(){$('user-dd')?.classList.remove('open');$('user-chip')?.classList.remove('open');}
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeMenu();});

onAuthStateChanged(auth,u=>{
  user=u; renderAuthArea();
  if(u){if(firstLogin){firstLogin=false;toast(`✓ Добро пожаловать, ${u.displayName||u.email}!`);}loadUserData(u);}
  else{firstLogin=false;likes=[];playlists=[];renderLiked();renderPlaylists();renderProfile();updateBadge();}
});

// NAV
function nav(page,linkEl){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('show'));
  $('pg-'+page)?.classList.add('show');
  document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
  if(linkEl)linkEl.classList.add('active');else document.querySelector(`.nav-link[data-p="${page}"]`)?.classList.add('active');
  document.querySelectorAll('.mob-nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.mob-nav-btn[data-p="${page}"]`)?.classList.add('active');
  $('content').scrollTop=0;
}

// MOB SEARCH
function openMobSearch(){$('mob-search-overlay').classList.add('open');setTimeout(()=>$('mob-search-inp').focus(),80);}
function closeMobSearch(){$('mob-search-overlay').classList.remove('open');$('mob-search-inp').value='';$('mob-search-results').innerHTML='<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Начни вводить</div></div>';}
let mst;
$('mob-search-inp').addEventListener('input',e=>{
  clearTimeout(mst);mst=setTimeout(()=>{
    const q=e.target.value.trim().toLowerCase(), el=$('mob-search-results');
    if(!q){el.innerHTML='<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Начни вводить</div></div>';return;}
    const r=tracks.filter(t=>t.title.toLowerCase().includes(q)||t.artist.toLowerCase().includes(q));
    el.innerHTML=r.length?r.map((t,i)=>trackRow(t,i)).join(''):'<div class="empty"><div class="empty-ico">😶</div><div class="empty-txt">Ничего не найдено</div></div>';
  },200);
});
let sst;
$('search-inp').addEventListener('input',e=>{clearTimeout(sst);sst=setTimeout(()=>{sq=e.target.value.trim();if(sq)nav('catalog');renderCatalogList();},200);});

// KEYBOARD
document.addEventListener('keydown',e=>{
  const tag=document.activeElement.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA')return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}
  if(e.code==='ArrowRight'){e.preventDefault();nextTrack();}
  if(e.code==='ArrowLeft'){e.preventDefault();prevTrack();}
  if(e.code==='Escape'){if(fpOpen)closeFullPlayer();}
});

// MODALS
function openModal(id){$(id).classList.add('open');}
function closeModal(id){$(id).classList.remove('open');}
document.querySelectorAll('.modal-bg').forEach(bg=>{bg.addEventListener('click',e=>{if(e.target===bg)bg.classList.remove('open');});});
$('li-pass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
$('reg-pass').addEventListener('keydown',e=>{if(e.key==='Enter')doRegister();});


// ── DOMINANT COLOR ────────────────────────────────────────────────────────────
function getDominantColor(imgEl) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, 8, 8);
    const d = ctx.getImageData(0, 0, 8, 8).data;
    let r=0,g=0,b=0,count=0;
    for(let i=0;i<d.length;i+=4){
      if(d[i+3]<128) continue;
      r+=d[i]; g+=d[i+1]; b+=d[i+2]; count++;
    }
    if(!count) return null;
    return [Math.round(r/count), Math.round(g/count), Math.round(b/count)];
  } catch { return null; }
}

function applyAccentColor(rgb) {
  if(!rgb) return;
  const [r,g,b] = rgb;
  // Ensure color is vivid enough
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  if(max - min < 30) return; // too gray
  const root = document.documentElement;
  root.style.setProperty('--acc', `rgb(${r},${g},${b})`);
  root.style.setProperty('--acc2', `rgb(${Math.min(255,r+40)},${Math.min(255,g+40)},${Math.min(255,b+40)})`);
}

function resetAccentColor() {
  const root = document.documentElement;
  root.style.setProperty('--acc', '#ff5e1a');
  root.style.setProperty('--acc2', '#ff8c5a');
}

function extractColorFromCover(src) {
  if(!src) { resetAccentColor(); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const rgb = getDominantColor(img);
    applyAccentColor(rgb);
  };
  img.onerror = resetAccentColor;
  img.src = src;
}


// ── LYRICS ────────────────────────────────────────────────────────────────────
let lyricsVisible = false;

function toggleLyrics() {
  const t = queue[qi]; if(!t) return;
  lyricsVisible = !lyricsVisible;
  const btn = $('fp-lyrics-btn');
  const cover = $('fp-cover');
  const lyricsEl = $('fp-lyrics');
  if(lyricsVisible) {
    cover.style.display = 'none';
    lyricsEl.style.display = 'block';
    if(btn) btn.classList.add('active');
    lyricsEl.innerHTML = t.lyrics
      ? `<div class="fp-lyrics-text">${esc(t.lyrics).replace(/\n/g,'<br>')}</div>`
      : `<div class="fp-lyrics-empty">Текст не добавлен</div>`;
  } else {
    cover.style.display = '';
    lyricsEl.style.display = 'none';
    if(btn) btn.classList.remove('active');
  }
}


// ── PAGINATION ────────────────────────────────────────────────────────────────
let catalogPage = 0;
const PAGE_SIZE = 20;
let catalogData = [];

function renderCatalogList() {
  const q = sq.toLowerCase();
  catalogData = tracks
    .filter(t => (gCatalog==='all'||t.genre===gCatalog) && (!q||t.title.toLowerCase().includes(q)||t.artist.toLowerCase().includes(q)));
  $('catalog-cnt').textContent = catalogData.length ? `(${catalogData.length})` : '';
  catalogPage = 0;
  const el = $('catalog-list');
  if(!catalogData.length) { el.innerHTML = `<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Ничего не найдено</div></div>`; return; }
  el.innerHTML = catalogData.slice(0, PAGE_SIZE).map((t,i)=>trackRow(t,i)).join('');
  if(catalogData.length > PAGE_SIZE) {
    el.insertAdjacentHTML('afterend', `<div id="catalog-more" class="load-more-wrap"><button class="btn btn-ghost" onclick="loadMoreCatalog()">Ещё треки (${catalogData.length - PAGE_SIZE})</button></div>`);
  } else {
    document.getElementById('catalog-more')?.remove();
  }
}

function loadMoreCatalog() {
  catalogPage++;
  const start = catalogPage * PAGE_SIZE;
  const chunk = catalogData.slice(start, start + PAGE_SIZE);
  const el = $('catalog-list');
  el.insertAdjacentHTML('beforeend', chunk.map((t,i)=>trackRow(t, start+i)).join(''));
  const remaining = catalogData.length - (start + PAGE_SIZE);
  const moreEl = document.getElementById('catalog-more');
  if(remaining > 0) { moreEl.querySelector('button').textContent = `Ещё треки (${remaining})`; }
  else { moreEl?.remove(); }
}


// ── PUBLIC PLAYLISTS ──────────────────────────────────────────────────────────
function sharePlaylist(plId) {
  const url = `${location.origin}${location.pathname}?playlist=${plId}`;
  if(navigator.share) {
    navigator.share({ title: 'WAVARCHIVE — плейлист', url }).catch(()=>{});
  } else {
    navigator.clipboard.writeText(url).then(()=>toast('✓ Ссылка на плейлист скопирована')).catch(()=>toast('Ссылка: '+url));
  }
}

function checkUrlPlaylist() {
  const pid = new URLSearchParams(location.search).get('playlist');
  if(!pid) return;
  // Load playlist from Firestore even without auth
  getDoc(doc(db,'playlists',pid)).then(snap=>{
    if(!snap.exists()) return;
    const pl = {id:snap.id,...snap.data()};
    const tks = pl.tracks.map(id=>tracks.find(t=>t.id===id)).filter(Boolean);
    $('pl-detail-body').innerHTML = `
      <div class="pg-title">${esc(pl.name)} <span style="font-size:13px;color:var(--muted2);font-family:var(--f-mono);font-weight:400">— публичный</span></div>
      ${pl.desc?`<p style="font-size:12px;color:var(--muted2);margin-bottom:20px;line-height:1.8">${esc(pl.desc)}</p>`:''}
      ${tks.length?`<div class="tlist">${tks.map((t,i)=>trackRow(t,i)).join('')}</div>`:`<div class="empty"><div class="empty-ico">🎵</div><div class="empty-txt">Плейлист пустой</div></div>`}`;
    nav('pl-detail');
  }).catch(()=>{});
}

// EXPOSE
const W=window;
W.nav=nav;W.setGenre=setGenre;W.setSort=setSort;
W.openTrack=openTrack;W.playById=playById;W.openArtist=openArtist;
W.goBackFromTrack=goBackFromTrack;W.goBackFromArtist=goBackFromArtist;
W.toggleLike=toggleLike;W.toggleLikePlayer=toggleLikePlayer;
W.togglePlay=togglePlay;W.nextTrack=nextTrack;W.prevTrack=prevTrack;
W.toggleShuffle=toggleShuffle;W.toggleRepeat=toggleRepeat;
W.openCtx=openCtx;W.closeCtx=closeCtx;W.addToPl=addToPl;
W.openPlDetail=openPlDetail;W.openCreatePl=openCreatePl;W.createPlaylist=createPlaylist;
W.openAuth=openAuth;W.switchAuthMode=switchAuthMode;
W.doLogin=doLogin;W.doRegister=doRegister;W.doLogout=doLogout;
W.toggleMenu=toggleMenu;W.closeMenu=closeMenu;
W.openModal=openModal;W.closeModal=closeModal;
W.openMobSearch=openMobSearch;W.closeMobSearch=closeMobSearch;
W.startWave=startWave;W.shareTrack=shareTrack;
W.openFullPlayer=openFullPlayer;W.closeFullPlayer=closeFullPlayer;W.openCtxPlayer=openCtxPlayer;
W.toggleLyrics=toggleLyrics;W.sharePlaylist=sharePlaylist;W.currentPlId=null;W.loadMoreCatalog=loadMoreCatalog;

// INIT
renderAuthArea();
loadTracks();

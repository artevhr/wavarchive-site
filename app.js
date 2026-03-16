import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment, collection, query, where, getDocs, addDoc, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCQVtvodBLUbbxXFUA1fxIOf1DgOdzjJS4",
  authDomain:        "wavarchive-73dfb.firebaseapp.com",
  projectId:         "wavarchive-73dfb",
  storageBucket:     "wavarchive-73dfb.firebasestorage.app",
  messagingSenderId: "803800269262",
  appId:             "1:803800269262:web:d274f1c0169b210a4b2b9f",
  measurementId:     "G-H0M5239XVK"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const GH_OWNER  = 'artevhr';
const GH_REPO   = 'wavarchive-music';
const GH_BRANCH = 'main';
const RAW        = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}`;
const TRACKS_URL = `${RAW}/tracks.json`;

let tracks=[], currentUser=null, userLikes=[], userPlaylists=[];
let queueTracks=[], isWave=false, queueIdx=-1;
let isPlaying=false, isShuffle=false, isRepeat=false;
let prevPage='home', ctxTargetId=null, shuffleOrder=[];
let genreHome='all', genreCatalog='all', searchQ='';
let firstAuth=true;
let currentSort='new';
let prevArtistPage='home';
let playsCache={}, playsCacheTime=0;
const RECENT_KEY='wa_recent';
const WORKER_URL='https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev';
const ARTISTS={};

const aud = document.getElementById('aud');
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = s => { if(!s) return '--'; const m=Math.floor(s/60),sec=Math.floor(s%60); return `${m}:${sec.toString().padStart(2,'0')}`; };
const uid         = () => currentUser?.uid || null;
const myLikes     = () => userLikes;
const myPlaylists = () => userPlaylists;
const genreEmoji  = g => ({'электронная':'🎛','хип-хоп':'🎤','рок':'🎸','jazz':'🎷','ambient':'🌊','поп':'✨','другое':'🎵'}[g]||'🎵');
const coverUrl    = t => t.cover ? `${RAW}/${t.cover}` : null;
const audioUrl    = t => t.file  ? `${RAW}/${t.file}`  : null;

function toast(msg, err=false) {
  const a=document.getElementById('toast-area'), d=document.createElement('div');
  d.className='toast'+(err?' err':''); d.textContent=msg; a.appendChild(d);
  setTimeout(()=>d.remove(),3200);
}

async function loadTracks() {
  document.getElementById('home-grid').innerHTML=`<div style="grid-column:1/-1;padding:40px;text-align:center"><div class="spinner"></div></div>`;
  try {
    const r=await fetch(TRACKS_URL+'?t='+Date.now());
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    tracks=await r.json();
    if(!Array.isArray(tracks)) throw new Error('Неверный формат');
  } catch(e) {
    tracks=[];
    const empty=`<div class="empty" style="grid-column:1/-1"><div class="empty-ico">📭</div><div class="empty-txt">Не удалось загрузить треки: ${esc(e.message)}</div></div>`;
    document.getElementById('home-grid').innerHTML=empty;
    document.getElementById('catalog-list').innerHTML=empty;
  }
  renderAll();
}

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

const GENRES=['all','электронная','хип-хоп','рок','jazz','ambient','поп','другое'];
const GENRE_LABELS={all:'Все','электронная':'Электронная','хип-хоп':'Хип-хоп','рок':'Рок','jazz':'Jazz','ambient':'Ambient','поп':'Поп','другое':'Другое'};

function renderGenreBars() {
  ['gb-home','gb-catalog'].forEach((id,i)=>{
    const cur=i===0?genreHome:genreCatalog, ctx=i===0?'home':'catalog';
    document.getElementById(id).innerHTML=GENRES.map(g=>`<button class="g-btn${g===cur?' on':''}" onclick="setGenre('${g}','${ctx}')">${esc(GENRE_LABELS[g])}</button>`).join('');
  });
}
function setGenre(g,ctx) { if(ctx==='home'){genreHome=g;renderHomeGrid();}else{genreCatalog=g;renderCatalogList();}renderGenreBars(); }

function trackCard(t) {
  const url=coverUrl(t), liked=myLikes().includes(t.id), isNow=queueTracks[queueIdx]?.id===t.id;
  const img=url?`<img src="${esc(url)}" loading="lazy" alt="">`:`<div class="tcard-img-ph">${genreEmoji(t.genre)}</div>`;
  return `<div class="tcard${isNow?' now':''}" id="card-${t.id}" onclick="openTrack('${t.id}')">
    <div class="tcard-img">${img}<div class="tcard-overlay" onclick="event.stopPropagation();playById('${t.id}')"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></div></div>
    <div class="tcard-title">${esc(t.title)}</div><div class="tcard-artist">${esc(t.artist)}</div>
    <div class="tcard-foot"><div class="tcard-acts" onclick="event.stopPropagation()">
      <button class="act-btn heart${liked?' on':''}" onclick="toggleLike('${t.id}')"><svg viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
      <button class="act-btn add" onclick="openCtx('${t.id}',this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
    </div><span>${fmt(t.duration)}</span></div></div>`;
}

function trackRow(t,i) {
  const url=coverUrl(t), liked=myLikes().includes(t.id), isNow=queueTracks[queueIdx]?.id===t.id;
  const img=url?`<img src="${esc(url)}" loading="lazy" alt="">`:genreEmoji(t.genre);
  return `<div class="trow${isNow?' now':''}" id="row-${t.id}" onclick="playById('${t.id}')">
    <div class="trow-n">${isNow?'▶':i+1}</div><div class="trow-img">${img}</div>
    <div class="trow-info"><div class="trow-title">${esc(t.title)}</div><div class="trow-artist">${esc(t.artist)} <span class="tag-genre">${esc(t.genre||'')}</span></div></div>
    <div class="trow-right" onclick="event.stopPropagation()">
      <button class="act-btn heart${liked?' on':''}" onclick="toggleLike('${t.id}')"><svg viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
      <button class="act-btn add" onclick="openCtx('${t.id}',this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      <span class="trow-dur">${fmt(t.duration)}</span>
    </div></div>`;
}

function renderHomeGridSync() {
  let data = [...tracks];
  if (currentSort==='new') data.sort((a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''));
  else if (currentSort==='top'||currentSort==='plays') {
    const now=Date.now(), week=7*24*60*60*1000;
    data.sort((a,b)=>{
      const pa=playsCache[a.id], pb=playsCache[b.id];
      if(currentSort==='plays') return (pb?.count||0)-(pa?.count||0);
      const aR=pa&&(now-pa.lastPlayed)<week?pa.count:0;
      const bR=pb&&(now-pb.lastPlayed)<week?pb.count:0;
      return bR-aR;
    });
  }
  data = data.filter(t=>genreHome==='all'||t.genre===genreHome).slice(0,12);
  const el=document.getElementById('home-grid');
  el.innerHTML=data.length?data.map(t=>trackCard(t)).join(''):`<div class="empty" style="grid-column:1/-1"><div class="empty-ico">🎵</div><div class="empty-txt">Нет треков</div></div>`;
}

async function renderHomeGrid() {
  if (currentSort !== 'new' && (Date.now()-playsCacheTime>60000)) {
    playsCache = await getPlaysMap();
    playsCacheTime = Date.now();
  }
  renderHomeGridSync();
}
function renderCatalogList() {
  const q=searchQ.toLowerCase(), data=tracks.filter(t=>genreCatalog==='all'||t.genre===genreCatalog).filter(t=>!q||t.title.toLowerCase().includes(q)||t.artist.toLowerCase().includes(q));
  const el=document.getElementById('catalog-list');
  document.getElementById('catalog-cnt').textContent=data.length?`(${data.length})`:'';
  el.innerHTML=data.length?data.map((t,i)=>trackRow(t,i)).join(''):`<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Ничего не найдено</div></div>`;
}
function renderLiked() {
  const data=tracks.filter(t=>myLikes().includes(t.id)), el=document.getElementById('liked-list');
  document.getElementById('liked-cnt').textContent=data.length?`(${data.length})`:'';
  if(!uid()){el.innerHTML=`<div class="empty"><div class="empty-ico">🔒</div><div class="empty-txt">Войди, чтобы видеть лайки</div></div>`;return;}
  el.innerHTML=data.length?data.map((t,i)=>trackRow(t,i)).join(''):`<div class="empty"><div class="empty-ico">❤</div><div class="empty-txt">Лайкай треки — они появятся здесь</div></div>`;
}
function updateLikesBadge() {
  const cnt=myLikes().length;
  ['likes-badge','mob-likes-badge'].forEach(id=>{const b=document.getElementById(id);if(b){b.style.display=cnt?'':'none';b.textContent=cnt;}});
}
function renderPlaylists() {
  const pls=myPlaylists(), el=document.getElementById('pl-grid');
  if(!uid()){el.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="empty-ico">🔒</div><div class="empty-txt">Войди, чтобы создавать плейлисты</div></div>`;return;}
  if(!pls.length){el.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="empty-ico">📂</div><div class="empty-txt">Нажми «Новый плейлист»</div></div>`;return;}
  el.innerHTML=pls.map(pl=>{
    const tks=pl.tracks.map(id=>tracks.find(t=>t.id===id)).filter(Boolean).slice(0,4);
    const tiles=Array.from({length:4},(_,i)=>{const t=tks[i],u=t?coverUrl(t):null;return u?`<div class="pl-card-mosaic-tile"><img src="${esc(u)}" loading="lazy"></div>`:`<div class="pl-card-mosaic-tile">♪</div>`;}).join('');
    return `<div class="pl-card" onclick="openPlaylistDetail('${pl.id}')"><div class="pl-card-mosaic">${tiles}</div><div class="pl-card-name">${esc(pl.name)}</div><div class="pl-card-cnt">${pl.tracks.length} треков</div></div>`;
  }).join('');
}
function openPlaylistDetail(plId) {
  const pl=myPlaylists().find(p=>p.id===plId); if(!pl) return;
  const tks=pl.tracks.map(id=>tracks.find(t=>t.id===id)).filter(Boolean);
  document.getElementById('pl-detail-body').innerHTML=`<div class="pg-title">${esc(pl.name)}</div>${pl.desc?`<p style="font-size:12px;color:var(--c-muted2);margin-bottom:20px;line-height:1.8">${esc(pl.desc)}</p>`:''}${tks.length?`<div class="tlist">${tks.map((t,i)=>trackRow(t,i)).join('')}</div>`:`<div class="empty"><div class="empty-ico">🎵</div><div class="empty-txt">Плейлист пустой</div></div>`}`;
  prevPage='playlists'; nav('pl-detail');
}
function openCreatePl(){if(!uid()){openAuth();return;}document.getElementById('pl-inp-name').value='';document.getElementById('pl-inp-desc').value='';openModal('m-create-pl');}
async function createPlaylist() {
  const name=document.getElementById('pl-inp-name').value.trim();
  if(!name){toast('Введи название',true);return;}
  await setDoc(doc(db,'users',uid()),{uid:uid()},{merge:true}).catch(()=>{});
  const pl={name,desc:document.getElementById('pl-inp-desc').value.trim(),tracks:[],uid:uid(),createdAt:Date.now()};
  const ref=await addDoc(collection(db,'playlists'),pl).catch(e=>{toast('Ошибка: '+e.message,true);return null;});
  if(!ref) return;
  pl.id=ref.id; userPlaylists.push(pl); closeModal('m-create-pl'); renderPlaylists(); toast('✓ Плейлист создан');
}
function renderProfile() {
  const el=document.getElementById('profile-body');
  if(!currentUser){el.innerHTML=`<div class="empty"><div class="empty-ico">👤</div><div class="empty-txt">Войди или зарегистрируйся</div></div>`;return;}
  const name=currentUser.displayName||currentUser.email, ini=(name||'?')[0].toUpperCase();
  el.innerHTML=`<div class="profile-head"><div class="profile-ava">${ini}</div><div><div class="profile-name">${esc(name)}</div><div class="profile-email">${esc(currentUser.email)}</div><div class="stat-row"><div><div class="stat-v">${userLikes.length}</div><div class="stat-l">Лайков</div></div><div><div class="stat-v">${userPlaylists.length}</div><div class="stat-l">Плейлистов</div></div></div></div></div><button class="btn btn-ghost" onclick="doLogout()">Выйти из аккаунта</button>`;
}
function openTrack(id) {
  const t=tracks.find(x=>x.id===id); if(!t) return;
  const url=coverUrl(t), liked=myLikes().includes(t.id), img=url?`<img src="${esc(url)}" alt="">`:genreEmoji(t.genre);
  const plays=playsCache[t.id]?.count||0;
  const artistSpan=`<span style="cursor:pointer;text-decoration:underline;text-decoration-color:var(--c-border)" onclick="openArtistPage('${esc(t.artist)}')">${esc(t.artist)}</span>`;
  document.getElementById('track-body').innerHTML=`<div class="td-wrap"><div class="td-img">${img}</div><div class="td-info"><div class="td-title">${esc(t.title)}</div><div class="td-artist">${artistSpan}</div>${t.tags?.length?`<div class="td-tags">${t.tags.map(g=>`<span class="td-tag">${esc(g)}</span>`).join('')}</div>`:''}${t.description?`<div class="td-desc">${esc(t.description)}</div>`:''}<div class="td-acts"><button class="btn btn-prime" onclick="playById('${t.id}')"><svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><polygon points="5 3 19 12 5 21"/></svg>Слушать</button><button class="btn btn-ghost${liked?' btn-danger':''}" id="td-like-btn" onclick="toggleLike('${t.id}')"><svg viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>${liked?'Убрать лайк':'Лайк'}</button><button class="btn btn-ghost" onclick="openCtx('${t.id}',this)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>В плейлист</button><button class="btn btn-ghost" onclick="shareTrack('${t.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Поделиться</button></div><div class="td-stat"><div><div class="td-stat-v">${fmt(t.duration)}</div><div class="td-stat-l">Длительность</div></div><div><div class="td-stat-v">${esc(t.genre||'--')}</div><div class="td-stat-l">Жанр</div></div>${plays?`<div><div class="td-stat-v">${plays}</div><div class="td-stat-l">Прослушиваний</div></div>`:''}</div></div></div>`;
  prevPage=document.querySelector('.nav-link.active')?.dataset.p||'home'; nav('track');
}
function goBackFromTrack(){nav(prevPage);}
function playById(id) {
  const t=tracks.find(x=>x.id===id); if(!t) return;
  stopWave(); queueTracks=[...tracks]; queueIdx=queueTracks.findIndex(x=>x.id===id); startPlay();
}
function startPlay() {
  const t=queueTracks[queueIdx]; if(!t) return;
  const url=audioUrl(t);
  if(url){aud.src=url;aud.play().catch(()=>{});}
  updatePlayerUI(t); markNow();
  incrementPlays(t.id);
  addToRecent(t);
  preloadNext();
}
function updatePlayerUI(t) {
  document.getElementById('pl-name').textContent=t.title;
  document.getElementById('pl-by').textContent=t.artist;
  const art=document.getElementById('pl-art'), url=coverUrl(t);
  if(url){art.innerHTML=`<img src="${esc(url)}">`;}else{art.innerHTML=genreEmoji(t.genre);art.style.fontSize='18px';}
  const liked=myLikes().includes(t.id);
  document.getElementById('pl-heart').classList.toggle('on',liked);
  document.querySelector('#pl-heart svg')?.setAttribute('fill',liked?'currentColor':'none');
  document.title=`${t.title} · ${t.artist} — WAVARCHIVE`;
}
function markNow() {
  document.querySelectorAll('.tcard').forEach(c=>c.classList.remove('now'));
  document.querySelectorAll('.trow').forEach(r=>r.classList.remove('now'));
  const id=queueTracks[queueIdx]?.id; if(!id) return;
  document.getElementById('card-'+id)?.classList.add('now');
  const row=document.getElementById('row-'+id);
  if(row){row.classList.add('now');row.querySelector('.trow-n').textContent='▶';}
}
function togglePlay() {
  if(queueIdx===-1){if(tracks[0])playById(tracks[0].id);return;}
  isPlaying?aud.pause():aud.play().catch(()=>{});
}
function refreshPlayBtn() {
  document.getElementById('ico-play').style.display=isPlaying?'none':'';
  document.getElementById('ico-pause').style.display=isPlaying?'':'none';
  const mp=document.getElementById('mob-ico-play'), ms=document.getElementById('mob-ico-pause');
  if(mp)mp.style.display=isPlaying?'none':''; if(ms)ms.style.display=isPlaying?'':'none';
}
function nextTrack() {
  if(!queueTracks.length) return;
  if(isShuffle&&shuffleOrder.length){const pos=shuffleOrder.indexOf(queueIdx);queueIdx=shuffleOrder[(pos+1)%shuffleOrder.length];startPlay();return;}
  const ni=queueIdx+1;
  if(ni>=queueTracks.length){startWaveAuto();return;}
  queueIdx=ni;startPlay();
}
function prevTrack() {
  if(!queueTracks.length) return;
  if(isShuffle&&shuffleOrder.length){const pos=shuffleOrder.indexOf(queueIdx);queueIdx=shuffleOrder[(pos-1+shuffleOrder.length)%shuffleOrder.length];}
  else{queueIdx=(queueIdx-1+queueTracks.length)%queueTracks.length;}
  startPlay();
}
function toggleShuffle(){isShuffle=!isShuffle;document.getElementById('btn-shuf').classList.toggle('active',isShuffle);if(isShuffle)shuffleOrder=[...Array(queueTracks.length).keys()].sort(()=>Math.random()-.5);toast(isShuffle?'Перемешивание вкл.':'Перемешивание выкл.');}
function toggleRepeat(){isRepeat=!isRepeat;document.getElementById('btn-rep').classList.toggle('active',isRepeat);aud.loop=isRepeat;toast(isRepeat?'Повтор вкл.':'Повтор выкл.');}

aud.addEventListener('play',()=>{isPlaying=true;refreshPlayBtn();});
aud.addEventListener('pause',()=>{isPlaying=false;refreshPlayBtn();});
aud.addEventListener('ended',()=>{if(!isRepeat)nextTrack();});
aud.addEventListener('timeupdate',()=>{
  if(!aud.duration)return;
  const p=(aud.currentTime/aud.duration)*100, r=document.getElementById('prog-range');
  r.value=p;r.style.setProperty('--p',p+'%');
  const fill=document.getElementById('mob-prog-fill');if(fill)fill.style.width=p+'%';
  document.getElementById('t-cur').textContent=fmt(Math.floor(aud.currentTime));
});
aud.addEventListener('loadedmetadata',()=>{document.getElementById('t-tot').textContent=fmt(Math.floor(aud.duration));});
document.getElementById('prog-range').addEventListener('input',e=>{const p=parseFloat(e.target.value);e.target.style.setProperty('--p',p+'%');if(aud.duration)aud.currentTime=(p/100)*aud.duration;});
const vr=document.getElementById('vol-range');vr.style.setProperty('--p','80%');aud.volume=.8;
vr.addEventListener('input',e=>{e.target.style.setProperty('--p',e.target.value+'%');aud.volume=e.target.value/100;});
function toggleLikePlayer(){const t=queueTracks[queueIdx];if(t)toggleLike(t.id);}

async function toggleLike(id) {
  if(!uid()){openAuth();return;}
  const has=userLikes.includes(id), uRef=doc(db,'users',uid());
  const snap=await getDoc(uRef).catch(()=>null);
  if(!snap||!snap.exists()){await setDoc(uRef,{uid:uid(),email:currentUser.email,likes:[],createdAt:Date.now()}).catch(()=>{});}
  if(has){
    userLikes=userLikes.filter(x=>x!==id);
    await updateDoc(uRef,{likes:arrayRemove(id)}).catch(e=>console.error('like:',e));
    toast('Убрано из понравившихся');
  }else{
    userLikes=[...userLikes,id];
    await updateDoc(uRef,{likes:arrayUnion(id)}).catch(e=>console.error('like:',e));
    toast('❤ Добавлено');
  }
  refreshLikeUI(id,!has);updateLikesBadge();renderLiked();
  const tdb=document.getElementById('td-like-btn');
  if(tdb){const l2=userLikes.includes(id);tdb.className=`btn btn-ghost${l2?' btn-danger':''}`;tdb.innerHTML=l2?`<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Убрать лайк`:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Лайк`;}
  if(queueTracks[queueIdx]?.id===id){const h=document.getElementById('pl-heart'),l2=userLikes.includes(id);h.classList.toggle('on',l2);h.querySelector('svg')?.setAttribute('fill',l2?'currentColor':'none');}
}
function refreshLikeUI(id,liked){document.querySelectorAll('.act-btn.heart').forEach(btn=>{if(!(btn.getAttribute('onclick')||'').includes(`'${id}'`))return;btn.classList.toggle('on',liked);btn.querySelector('svg')?.setAttribute('fill',liked?'currentColor':'none');});}

function openCtx(trackId,btn){
  if(!uid()){openAuth();return;}
  ctxTargetId=trackId;const pls=myPlaylists(),items=document.getElementById('ctx-items');
  const newBtn=`<div class="ctx-item" onclick="openCreatePl();closeCtx()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Новый плейлист</div>`;
  items.innerHTML=(!pls.length?'':pls.map(pl=>{const has=pl.tracks.includes(trackId);return `<div class="ctx-item${has?' checked':''}" onclick="addToPlaylist('${pl.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${has?'<polyline points="20 6 9 17 4 12"/>':'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>'}</svg>${esc(pl.name)}</div>`;}).join(''))+newBtn;
  const rect=btn.getBoundingClientRect(),menu=document.getElementById('ctx-menu');
  menu.style.top=(rect.bottom+6)+'px';menu.style.left=Math.min(rect.left,window.innerWidth-200)+'px';menu.classList.add('open');
}
function closeCtx(){document.getElementById('ctx-menu').classList.remove('open');}
async function addToPlaylist(plId){
  closeCtx();const pl=userPlaylists.find(p=>p.id===plId);
  if(!pl||pl.tracks.includes(ctxTargetId)){toast('Уже в этом плейлисте');return;}
  pl.tracks.push(ctxTargetId);
  await updateDoc(doc(db,'playlists',plId),{tracks:arrayUnion(ctxTargetId)}).catch(()=>{});
  toast(`✓ Добавлено в «${pl.name}»`);renderPlaylists();
}
document.addEventListener('click',e=>{if(!e.target.closest('.ctx-menu')&&!e.target.closest('.act-btn.add')&&!e.target.closest('.btn[onclick*="openCtx"]'))closeCtx();});

function openAuth(mode='login'){switchAuthMode(mode);openModal('m-auth');}
function switchAuthMode(mode){document.getElementById('auth-login-form').style.display=mode==='login'?'':'none';document.getElementById('auth-reg-form').style.display=mode==='reg'?'':'none';document.getElementById('auth-modal-title').textContent=mode==='login'?'Вход':'Регистрация';document.getElementById('auth-error').classList.remove('show');}
function authError(msg){const el=document.getElementById('auth-error');el.textContent=msg;el.classList.add('show');}
const FB_ERR={'auth/email-already-in-use':'Email уже зарегистрирован','auth/invalid-email':'Некорректный email','auth/weak-password':'Пароль слишком простой','auth/user-not-found':'Пользователь не найден','auth/wrong-password':'Неверный пароль','auth/invalid-credential':'Неверный email или пароль','auth/too-many-requests':'Слишком много попыток','auth/network-request-failed':'Проблема с интернетом'};
async function doLogin(){
  const email=document.getElementById('li-email').value.trim(),pass=document.getElementById('li-pass').value;
  if(!email||!pass){authError('Заполни все поля');return;}
  const btn=document.querySelector('#auth-login-form .btn-prime');btn.disabled=true;btn.textContent='Вход...';
  try{await signInWithEmailAndPassword(auth,email,pass);closeModal('m-auth');}
  catch(e){authError(FB_ERR[e.code]||e.message);}
  finally{btn.disabled=false;btn.textContent='Войти';}
}
async function doRegister(){
  const name=document.getElementById('reg-name').value.trim(),email=document.getElementById('reg-email').value.trim(),pass=document.getElementById('reg-pass').value;
  if(!name||!email||!pass){authError('Заполни все поля');return;}
  if(pass.length<6){authError('Пароль — минимум 6 символов');return;}
  const btn=document.querySelector('#auth-reg-form .btn-prime');btn.disabled=true;btn.textContent='Создаём...';
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,pass);
    await updateProfile(cred.user,{displayName:name});
    await setDoc(doc(db,'users',cred.user.uid),{name,email,uid:cred.user.uid,likes:[],createdAt:Date.now()});
    btn.disabled=false;btn.textContent='Создать аккаунт';
    closeModal('m-auth');
  }catch(e){
    btn.disabled=false;btn.textContent='Создать аккаунт';
    authError(FB_ERR[e.code]||e.message);
  }
}
async function doLogout(){await signOut(auth);currentUser=null;userLikes=[];userPlaylists=[];renderAll();nav('home');toast('Вышел из аккаунта');}
async function loadUserData(user) {
  if (!user) return;
  const CACHE_KEY = 'wa_udata_' + user.uid;

  // Показываем из кэша мгновенно
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached) {
      userLikes     = cached.likes     || [];
      userPlaylists = cached.playlists || [];
      renderLiked(); renderPlaylists(); renderProfile(); updateLikesBadge();
    }
  } catch {}

  // Грузим свежие данные параллельно
  const uRef = doc(db, 'users', user.uid);
  const [snap, plSn] = await Promise.all([
    getDoc(uRef).catch(() => null),
    getDocs(query(collection(db,'playlists'), where('uid','==',user.uid))).catch(()=>null)
  ]);

  if (!snap || !snap.exists()) {
    await setDoc(uRef, {uid:user.uid, email:user.email, name:user.displayName||'', likes:[], createdAt:Date.now()}).catch(()=>{});
    userLikes = [];
  } else {
    userLikes = snap.data().likes || [];
  }

  userPlaylists = plSn ? plSn.docs.map(d=>({id:d.id,...d.data()})) : [];

  // Сохраняем в кэш
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      likes: userLikes,
      playlists: userPlaylists,
      ts: Date.now()
    }));
  } catch {}

  renderLiked(); renderPlaylists(); renderProfile(); updateLikesBadge();
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    renderAuthArea();
    if (firstAuth) { firstAuth=false; toast(`✓ Добро пожаловать, ${user.displayName||user.email}!`); }
    loadUserData(user);
  } else {
    firstAuth=false;
    userLikes=[];
    userPlaylists=[];
    renderAuthArea();
    renderLiked();
    renderPlaylists();
    renderProfile();
    updateLikesBadge();
  }
});

function startWave(){if(!tracks.length){toast('Нет треков',true);return;}queueTracks=[...tracks].sort(()=>Math.random()-.5);queueIdx=0;isWave=true;startPlay();toast('〰 Волна запущена');document.querySelectorAll('.nav-wave').forEach(b=>b.classList.add('active'));}
function startWaveAuto(){if(!tracks.length)return;queueTracks=[...tracks].sort(()=>Math.random()-.5);queueIdx=0;isWave=true;startPlay();toast('〰 Волна');}
function stopWave(){isWave=false;document.querySelectorAll('.nav-wave').forEach(b=>b.classList.remove('active'));}

function renderAuthArea(){
  const el=document.getElementById('auth-area');
  if(currentUser){
    const name=currentUser.displayName||currentUser.email,ini=(name||'?')[0].toUpperCase();
    el.innerHTML=`<div class="user-menu-wrap"><div class="user-chip" id="user-chip" onclick="toggleUserMenu()"><div class="user-avatar">${ini}</div><span class="user-chip-name">${esc(name)}</span><svg class="chip-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg><div class="dropdown" id="user-dd"><div class="dd-item" onclick="nav('profile');closeUserMenu()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Профиль</div><div class="dd-item" onclick="nav('liked');closeUserMenu()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>Понравилось</div><div class="dd-item" onclick="nav('playlists');closeUserMenu()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>Плейлисты</div><div class="dd-sep"></div><div class="dd-item" onclick="doLogout()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Выйти</div></div></div></div>`;
  }else{el.innerHTML=`<button class="btn-auth" onclick="openAuth('login')">Войти</button><button class="btn-auth primary" onclick="openAuth('reg')">Регистрация</button>`;}
}
function toggleUserMenu(){const chip=document.getElementById('user-chip'),dd=document.getElementById('user-dd');if(!chip||!dd)return;const open=dd.classList.toggle('open');chip.classList.toggle('open',open);}
function closeUserMenu(){document.getElementById('user-dd')?.classList.remove('open');document.getElementById('user-chip')?.classList.remove('open');}
document.addEventListener('click',e=>{if(!e.target.closest('.user-menu-wrap'))closeUserMenu();});

function nav(page,linkEl){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('show'));
  document.getElementById('pg-'+page)?.classList.add('show');
  document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
  if(linkEl)linkEl.classList.add('active');else document.querySelector(`.nav-link[data-p="${page}"]`)?.classList.add('active');
  document.querySelectorAll('.mob-nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.mob-nav-btn[data-p="${page}"]`)?.classList.add('active');
  document.getElementById('content').scrollTop=0;
}
function openMobSearch(){document.getElementById('mob-search-overlay').classList.add('open');setTimeout(()=>document.getElementById('mob-search-inp').focus(),80);}
function closeMobSearch(){document.getElementById('mob-search-overlay').classList.remove('open');document.getElementById('mob-search-inp').value='';document.getElementById('mob-search-results').innerHTML='<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Начни вводить</div></div>';}
let mobST;
document.getElementById('mob-search-inp').addEventListener('input',e=>{clearTimeout(mobST);mobST=setTimeout(()=>{const q=e.target.value.trim().toLowerCase(),el=document.getElementById('mob-search-results');if(!q){el.innerHTML='<div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">Начни вводить</div></div>';return;}const res=tracks.filter(t=>t.title.toLowerCase().includes(q)||t.artist.toLowerCase().includes(q));el.innerHTML=res.length?res.map((t,i)=>trackRow(t,i)).join(''):'<div class="empty"><div class="empty-ico">😶</div><div class="empty-txt">Ничего не найдено</div></div>';},200);});
let searchST;
document.getElementById('search-inp').addEventListener('input',e=>{clearTimeout(searchST);searchST=setTimeout(()=>{searchQ=e.target.value.trim();if(searchQ)nav('catalog');renderCatalogList();},200);});
document.addEventListener('keydown',e=>{const tag=document.activeElement.tagName;if(tag==='INPUT'||tag==='TEXTAREA')return;if(e.code==='Space'){e.preventDefault();togglePlay();}if(e.code==='ArrowRight'){e.preventDefault();nextTrack();}if(e.code==='ArrowLeft'){e.preventDefault();prevTrack();}});
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-bg').forEach(bg=>{bg.addEventListener('click',e=>{if(e.target===bg)bg.classList.remove('open');});});
document.getElementById('li-pass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
document.getElementById('reg-pass').addEventListener('keydown',e=>{if(e.key==='Enter')doRegister();});


function incrementPlays(id) {
  fetch(WORKER_URL+'/play',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({trackId:id})
  }).catch(()=>{});
}

async function getPlaysMap() {
  try {
    const r=await fetch(WORKER_URL+'/plays');
    if(!r.ok) return {};
    return await r.json();
  } catch { return {}; }
}

function shareTrack(id) {
  const url=location.origin+location.pathname+'?track='+id;
  navigator.clipboard.writeText(url).then(()=>{
    const el=document.createElement('div');
    el.className='share-copied';el.textContent='✓ Ссылка скопирована';
    document.body.appendChild(el);setTimeout(()=>el.remove(),2000);
  }).catch(()=>{toast('Ссылка: '+url);});
}

function addToRecent(t) {
  let r=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');
  r=r.filter(id=>id!==t.id);r.unshift(t.id);
  if(r.length>20)r=r.slice(0,20);
  localStorage.setItem(RECENT_KEY,JSON.stringify(r));
  renderRecent();
}

function renderRecent() {
  const el=document.getElementById('recent-list');if(!el)return;
  const ids=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');
  const data=ids.map(id=>tracks.find(t=>t.id===id)).filter(Boolean).slice(0,5);
  const label=el.previousElementSibling;
  if(!data.length){el.style.display='none';if(label)label.style.display='none';return;}
  el.style.display='';if(label)label.style.display='';
  el.innerHTML=data.map((t,i)=>trackRow(t,i)).join('');
}

async function getSortedTracks(sort) {
  const now = Date.now();
  if (sort !== 'new') {
    if (now - playsCacheTime > 60000) {
      getPlaysMap().then(m => { playsCache=m; playsCacheTime=Date.now(); });
    }
  }
  const week = 7*24*60*60*1000;
  let data = [...tracks];
  if (sort==='new') {
    data.sort((a,b) => (b.addedAt||'').localeCompare(a.addedAt||''));
  } else if (sort==='top') {
    data.sort((a,b) => {
      const pa=playsCache[a.id], pb=playsCache[b.id];
      const aR=pa&&(now-pa.lastPlayed)<week?pa.count:0;
      const bR=pb&&(now-pb.lastPlayed)<week?pb.count:0;
      return bR-aR;
    });
  } else if (sort==='plays') {
    data.sort((a,b) => (playsCache[b.id]?.count||0)-(playsCache[a.id]?.count||0));
  }
  return data;
}

async function setSort(sort, btn) {
  currentSort = sort;
  document.querySelectorAll('.sort-tab').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderHomeGridSync();
  if (sort !== 'new') {
    playsCache = await getPlaysMap();
    playsCacheTime = Date.now();
    renderHomeGridSync();
  }
}

function preloadNext() {
  const ni=queueIdx+1;if(ni>=queueTracks.length)return;
  const next=queueTracks[ni],url=audioUrl(next);if(!url)return;
  const a=new Audio();a.preload='auto';a.src=url;
}

function openArtistPage(artistName) {
  prevArtistPage=document.querySelector('.nav-link.active')?.dataset.p||'home';
  const info=ARTISTS[artistName]||{};
  const tks=tracks.filter(t=>t.artist===artistName);
  const ini=(artistName||'?')[0].toUpperCase();
  const avatarHtml=info.photo?`<div class="artist-avatar"><img src="${esc(info.photo)}" alt=""></div>`:`<div class="artist-avatar">${ini}</div>`;
  const tgBtn=info.telegram?`<a href="https://t.me/${info.telegram.replace('@','')}" target="_blank" class="btn-tg"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg>Telegram</a>`:'';
  document.getElementById('artist-body').innerHTML=`<div class="artist-header">${avatarHtml}<div><div class="artist-name">${esc(artistName)}</div><div class="artist-meta">${tks.length} треков</div>${tgBtn}</div></div>${tks.length?`<div class="tlist">${tks.map((t,i)=>trackRow(t,i)).join('')}</div>`:`<div class="empty"><div class="empty-ico">🎵</div><div class="empty-txt">Нет треков</div></div>`}`;
  nav('artist');
}
function goBackFromArtist(){nav(prevArtistPage);}

function checkUrlTrack() {
  const tid=new URLSearchParams(location.search).get('track');
  if(tid){const t=tracks.find(x=>x.id===tid);if(t)openTrack(tid);}
}

window.setGenre=setGenre;window.renderHomeGrid=renderHomeGrid;window.nav=nav;window.openTrack=openTrack;window.playById=playById;
window.toggleLike=toggleLike;window.toggleLikePlayer=toggleLikePlayer;window.openCtx=openCtx;
window.closeCtx=closeCtx;window.addToPlaylist=addToPlaylist;window.openPlaylistDetail=openPlaylistDetail;
window.openCreatePl=openCreatePl;window.createPlaylist=createPlaylist;window.openAuth=openAuth;
window.switchAuthMode=switchAuthMode;window.doLogin=doLogin;window.doRegister=doRegister;
window.doLogout=doLogout;window.togglePlay=togglePlay;window.nextTrack=nextTrack;
window.prevTrack=prevTrack;window.toggleShuffle=toggleShuffle;window.toggleRepeat=toggleRepeat;
window.toggleUserMenu=toggleUserMenu;window.closeUserMenu=closeUserMenu;window.goBackFromTrack=goBackFromTrack;
window.openMobSearch=openMobSearch;window.closeMobSearch=closeMobSearch;window.startWave=startWave;
window.openModal=openModal;window.closeModal=closeModal;
window.openArtistPage=openArtistPage;window.goBackFromArtist=goBackFromArtist;
window.shareTrack=shareTrack;window.setSort=setSort;

renderAuthArea();
loadTracks().then(()=>checkUrlTrack());

import { initializeApp }                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged,
         signInWithEmailAndPassword,
         createUserWithEmailAndPassword,
         updateProfile, signOut }        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc,
         setDoc, addDoc, updateDoc,
         collection, query, where,
         getDocs, onSnapshot,
         arrayUnion, arrayRemove }       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'AIzaSyCQVtvodBLUbbxXFUA1fxIOf1DgOdzjJS4',
  authDomain:        'wavarchive-73dfb.firebaseapp.com',
  projectId:         'wavarchive-73dfb',
  storageBucket:     'wavarchive-73dfb.firebasestorage.app',
  messagingSenderId: '803800269262',
  appId:             '1:803800269262:web:d274f1c0169b210a4b2b9f',
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

window._fb = {
  auth,
  db,
  onAuthStateChanged: (a, cb) => onAuthStateChanged(a, cb),
  signInWithEmailAndPassword:    (a, e, p) => signInWithEmailAndPassword(a, e, p),
  createUserWithEmailAndPassword:(a, e, p) => createUserWithEmailAndPassword(a, e, p),
  updateProfile:  (u, d) => updateProfile(u, d),
  signOut:        (a)    => signOut(a),
  doc, getDoc, setDoc, addDoc, updateDoc,
  collection, query, where, getDocs, onSnapshot,
  arrayUnion, arrayRemove,
};

window.dispatchEvent(new Event('fb-ready'));

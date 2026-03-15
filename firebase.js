import { initializeApp }                        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile }
                                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
         collection, query, where, getDocs, addDoc, arrayUnion, arrayRemove }
                                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

window._fb = { auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword,
               signOut, onAuthStateChanged, updateProfile,
               doc, getDoc, setDoc, updateDoc, deleteDoc,
               collection, query, where, getDocs, addDoc, arrayUnion, arrayRemove };

window.dispatchEvent(new Event('fb-ready'));

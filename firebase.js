import { initializeApp }                        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile }
                                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
         collection, query, where, getDocs, addDoc, arrayUnion, arrayRemove }
                                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCQVtvodBLUbbxXFUA1fxIOf1DgOdzjJS4",
  authDomain: "wavarchive-73dfb.firebaseapp.com",
  projectId: "wavarchive-73dfb",
  storageBucket: "wavarchive-73dfb.firebasestorage.app",
  messagingSenderId: "803800269262",
  appId: "1:803800269262:web:d274f1c0169b210a4b2b9f",
  measurementId: "G-H0M5239XVK"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

window._fb = { auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword,
               signOut, onAuthStateChanged, updateProfile,
               doc, getDoc, setDoc, updateDoc, deleteDoc,
               collection, query, where, getDocs, addDoc, arrayUnion, arrayRemove };

window.dispatchEvent(new Event('fb-ready'));

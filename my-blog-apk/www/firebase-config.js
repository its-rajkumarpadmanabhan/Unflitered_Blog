// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  increment, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  getDocs,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Config
// Replace with your full credentials if updating from Firebase Console
export const firebaseConfig = {
  apiKey: "AIzaSyBDpmmitG-DNDrB2ffC3X_9VgcgCt8zpZA",
  authDomain: "unfiltered-journal-b146e.firebaseapp.com",
  projectId: "unfiltered-journal-b146e",
  storageBucket: "unfiltered-journal-b146e.firebasestorage.app",
  messagingSenderId: "593498922713",
  appId: "1:593498922713:web:800ef55f3e5b3aace468c8",
  measurementId: "G-E53NLSCE4L"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  increment,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  getDocs,
  setDoc
};

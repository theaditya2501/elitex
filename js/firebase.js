import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  signInWithCustomToken,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
  runTransaction,
  onSnapshot,
  increment
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Canonical Firebase project configuration for elitexgamers-17353
const firebaseConfig = {
  apiKey: "AIzaSyAhm6MEFPzwF4pbugKd0Va6xyhheFf6BiA",
  authDomain: "elitexgamers-17353.firebaseapp.com",
  projectId: "elitexgamers-17353",
  storageBucket: "elitexgamers-17353.firebasestorage.app",
  messagingSenderId: "892417395386",
  appId: "1:892417395386:web:c255bafa4b2d72fbb81083",
  measurementId: "G-SCJ1FW5KBH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Public Razorpay Key ID
const RAZORPAY_KEY_ID = "rzp_live_TbxTWY1CD6udie";

export {
  app,
  auth,
  db,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  signInWithCustomToken,
  updateProfile,
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
  runTransaction,
  onSnapshot,
  increment,
  RAZORPAY_KEY_ID
};

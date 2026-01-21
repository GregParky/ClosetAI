// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDb0JS47ViyAXaloLXZv4qYSLc9SwB193k",
  authDomain: "closetai-5188c.firebaseapp.com",
  projectId: "closetai-5188c",
  storageBucket: "closetai-5188c.firebasestorage.app",
  messagingSenderId: "626091187407",
  appId: "1:626091187407:web:1b6de257880918a0872bba",
  measurementId: "G-JZF1VWTY0Q"
};

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleWebClientId = "626091187407-8jteapulfhpgt9j99nsgbdinec10ntfn.apps.googleusercontent.com";

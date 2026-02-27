// firebase/firebaseConfig.js
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDb0JS47ViyAXaloLXZv4qYSLc9SwB193k",
  authDomain: "closetai-5188c.firebaseapp.com",
  projectId: "closetai-5188c",
  storageBucket: "closetai-5188c.firebasestorage.app",
  messagingSenderId: "626091187407",
  appId: "1:626091187407:web:1b6de257880918a0872bba",
  measurementId: "G-JZF1VWTY0Q"
};

// ✅ Don't redeclare app if hot reload runs this file again
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ React Native needs initializeAuth + persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

export const db = getFirestore(app);

export const storage = getStorage(app);


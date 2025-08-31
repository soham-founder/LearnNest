import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDbXJwl5KFI0PmxAjFwv3uhqlHcaMUJdn8",
  authDomain: "learn-b2a23.firebaseapp.com",
  databaseURL: "https://learn-b2a23-default-rtdb.firebaseio.com",
  projectId: "learn-b2a23",
  storageBucket: "learn-b2a23.firebasestorage.app",
  messagingSenderId: "943870096465",
  appId: "1:943870096465:web:903b921da6d2f090813470",
  measurementId: "G-21LK4T1816"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);
const storage = getStorage(app);

// Initialize Firestore with persistent cache settings (new recommended approach)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export { app, auth, db, functions, storage };
export const firebaseProjectId = firebaseConfig.projectId;

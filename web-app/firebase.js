import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "CHEIA_TA_API",
  authDomain: "DOMENIUL_TAU",
  databaseURL: "URL_UL_TAU",
  projectId: "PROIECTUL_TAU",
  storageBucket: "DEPOZITUL_TAU",
  messagingSenderId: "MESAJUL_TAU",
  appId: "ID_UL_TAU"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const firestore = getFirestore(app);
export const auth = getAuth(app);

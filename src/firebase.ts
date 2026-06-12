import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

// Main configurations (used for Authentication and fallback)
const mainConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Dev configurations (falls back to main if not provided)
const devConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY_DEV || mainConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN_DEV || mainConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID_DEV || mainConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET_DEV || mainConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID_DEV || mainConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID_DEV || mainConfig.appId,
};

// Prod configurations (falls back to main if not provided)
const prodConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY_PROD || mainConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN_PROD || mainConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID_PROD || mainConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET_PROD || mainConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID_PROD || mainConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID_PROD || mainConfig.appId,
};

// Initialize Firebase Apps (check getApps to prevent initialization errors during HMR)
const mainApp = getApps().find(app => app.name === "[DEFAULT]") || initializeApp(mainConfig);

const devApp = getApps().find(app => app.name === "dev") || 
  (JSON.stringify(devConfig) === JSON.stringify(mainConfig) ? mainApp : initializeApp(devConfig, "dev"));

const prodApp = getApps().find(app => app.name === "prod") || 
  (JSON.stringify(prodConfig) === JSON.stringify(mainConfig) ? mainApp : initializeApp(prodConfig, "prod"));

// Initialize Auth using Main App
export const auth = getAuth(mainApp);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Firestore Databases
const dbDevName = import.meta.env.VITE_FIRESTORE_DATABASE_DEV || "(default)";
const dbProdName = import.meta.env.VITE_FIRESTORE_DATABASE_PROD || "(default)";

export const dbDev = initializeFirestore(devApp, {}, dbDevName);
export const dbProd = initializeFirestore(prodApp, {}, dbProdName);

// Firestore collection names
export const collectionDev = import.meta.env.VITE_FIRESTORE_COLLECTION_DEV || "feature_flags_dev";
export const collectionProd = import.meta.env.VITE_FIRESTORE_COLLECTION_PROD || "feature_flags_prod";

// Environment Configuration Types
export interface EnvironmentConfig {
  id: string;
  name: string;
  db: any;
  collectionName: string;
  colorClass: string; // Tailwind classes for text/background styling
  badgeClass: string;
}

// Unified Environments List
// You can add more environments (like staging, qa, etc.) here by initializing them above
export const ENVIRONMENTS: EnvironmentConfig[] = [
  {
    id: "dev",
    name: "DEV",
    db: dbDev,
    collectionName: collectionDev,
    colorClass: "text-amber-400 border-amber-500/20 bg-amber-500/5",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20"
  },
  {
    id: "prod",
    name: "PROD",
    db: dbProd,
    collectionName: collectionProd,
    colorClass: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
  }
];

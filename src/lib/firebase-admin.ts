import adminApp from "firebase-admin/app";
import adminAuthPkg from "firebase-admin/auth";
import firebaseConfig from "../../firebase-applet-config.json";

const { initializeApp, getApps } = adminApp;
const { getAuth } = adminAuthPkg;

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

export const adminAuth = getAuth();

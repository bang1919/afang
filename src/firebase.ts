import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result;
  } catch (error: any) {
    console.error("Firebase Login Error:", error);
    let message = "로그인 중 오류가 발생했습니다.";
    if (error.code === 'auth/popup-blocked') {
      message = "팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.";
    } else if (error.code === 'auth/unauthorized-domain') {
      message = "현재 도메인이 Firebase 승인 도메인에 등록되지 않았습니다. Firebase 콘솔(Authentication > Settings > Authorized domains)에 현재 도메인을 추가해야 합니다.";
    } else if (error.code === 'auth/popup-closed-by-user') {
      message = "로그인 창이 닫혔습니다. 다시 시도해주세요.";
    } else {
      message += ` (${error.code})`;
    }
    alert(message);
    throw error;
  }
};
export const logout = () => signOut(auth);

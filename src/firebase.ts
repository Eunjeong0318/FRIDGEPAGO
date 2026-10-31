import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { doc, Firestore, getDocFromServer, getFirestore } from 'firebase/firestore';

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
}

const localConfigModules = import.meta.glob('../firebase-applet-config.json', {
  eager: true,
  import: 'default',
}) as Record<string, Partial<FirebaseAppletConfig>>;

const fileConfig: Partial<FirebaseAppletConfig> =
  localConfigModules['../firebase-applet-config.json'] ?? {};

function pickConfigValue(envValue: string | undefined, fallbackValue: string | undefined): string {
  const trimmedEnv = envValue?.trim();
  if (
    trimmedEnv &&
    !trimmedEnv.startsWith('YOUR_') &&
    !trimmedEnv.startsWith('MY_')
  ) {
    return trimmedEnv;
  }
  const trimmedFallback = fallbackValue?.trim();
  if (
    trimmedFallback &&
    !trimmedFallback.startsWith('YOUR_') &&
    !trimmedFallback.startsWith('MY_')
  ) {
    return trimmedFallback;
  }
  return '';
}

const resolvedFirebaseConfig: FirebaseAppletConfig = {
  apiKey: pickConfigValue(import.meta.env.VITE_FIREBASE_API_KEY, fileConfig.apiKey),
  authDomain: pickConfigValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, fileConfig.authDomain),
  projectId: pickConfigValue(import.meta.env.VITE_FIREBASE_PROJECT_ID, fileConfig.projectId),
  storageBucket: pickConfigValue(
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    fileConfig.storageBucket
  ),
  messagingSenderId: pickConfigValue(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    fileConfig.messagingSenderId
  ),
  appId: pickConfigValue(import.meta.env.VITE_FIREBASE_APP_ID, fileConfig.appId),
  measurementId: pickConfigValue(
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    fileConfig.measurementId
  ),
  firestoreDatabaseId:
    pickConfigValue(
      import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
      fileConfig.firestoreDatabaseId
    ) || '(default)',
};

export const isFirebaseClientConfigured = Boolean(
  resolvedFirebaseConfig.apiKey && resolvedFirebaseConfig.projectId
);

const app: FirebaseApp | null = isFirebaseClientConfigured
  ? initializeApp(resolvedFirebaseConfig)
  : null;

/* CRITICAL: Pass firestoreDatabaseId from resolved Firebase config */
export const db: Firestore = app
  ? getFirestore(app, resolvedFirebaseConfig.firestoreDatabaseId)
  : (null as unknown as Firestore);

export const auth: Auth | null = app ? getAuth(app) : null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const ALLOWED_OWNER_EMAIL = 'jseongho92@gmail.com';

export function isAuthorizedOwnerUser(user: User | null | undefined): boolean {
  if (!user || !user.emailVerified || !user.email) {
    return false;
  }
  return user.email.trim().toLowerCase() === ALLOWED_OWNER_EMAIL;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: boolean | string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function extractQuotaMessage(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : String(error);
  if (
    raw.includes("Quota exceeded for quota metric 'Free daily read units per project (free tier database)'")
  ) {
    return `일일 무료 데이터베이스 읽기 한도를 초과했습니다. 내일 한도가 초기화되며, 업그레이드는 Firebase 콘솔(https://console.firebase.google.com/project/${resolvedFirebaseConfig.projectId}/firestore/databases/${resolvedFirebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true)에서 진행할 수 있습니다.`;
  }
  if (raw.includes('Quota exceeded.')) {
    return '일일 무료 클라우드 데이터베이스 사용 한도를 초과했습니다. 내일 한도가 자동 초기화됩니다.';
  }
  return null;
}

async function testConnection(): Promise<void> {
  if (!isFirebaseClientConfigured) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export async function signInWithGooglePopup(): Promise<User> {
  if (!auth) {
    throw new Error(
      'Firebase 웹 설정이 구성되지 않았습니다. 환경변수(VITE_FIREBASE_*) 또는 로컬 설정 파일을 확인해주세요.'
    );
  }
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signOutFromFirebase(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

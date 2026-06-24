import OneSignal from 'react-onesignal';

let initialized = false;
let initPromise: Promise<void> | null = null;

/** OneSignal is configured for production only — skip preview/localhost UAT. */
export function canUseOneSignal(): boolean {
  if (typeof window === 'undefined') return false
  const { hostname, origin } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') return false
  return origin === 'https://tv-magic-companion.vercel.app'
}

export function initOneSignal(): Promise<void> {
  if (initPromise) return initPromise;

  if (!canUseOneSignal()) {
    initPromise = Promise.resolve()
    return initPromise
  }

  initPromise = OneSignal.init({
    appId: '2eeab815-cfc2-4b65-bf79-a3c4415ced61',
    serviceWorkerPath: '/OneSignalSDKWorker.js',
    serviceWorkerParam: { scope: '/' },
    allowLocalhostAsSecureOrigin: true,
  }).then(() => {
    initialized = true;
  });

  return initPromise;
}

export async function promptForNotifications() {
  if (!canUseOneSignal()) return
  if (initPromise) await initPromise;
  OneSignal.Slidedown.promptPush();
}

export async function setOneSignalUser(userId: string) {
  if (!canUseOneSignal()) return
  if (initPromise) await initPromise;
  if (!initialized) return;
  try {
    await OneSignal.login(userId);
  } catch (err) {
    console.error('OneSignal login error:', err);
  }
}

export async function clearOneSignalUser() {
  if (!canUseOneSignal() || !initialized) return;
  try {
    await OneSignal.logout();
  } catch (err) {
    console.error('OneSignal logout error:', err);
  }
}

import OneSignal from 'react-onesignal';

let initialized = false;
let initPromise: Promise<void> | null = null;

export function initOneSignal(): Promise<void> {
  if (initPromise) return initPromise;

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
  if (initPromise) await initPromise;
  OneSignal.Slidedown.promptPush();
}

export async function setOneSignalUser(userId: string) {
  if (initPromise) await initPromise;
  if (!initialized) return;
  try {
    await OneSignal.login(userId);
  } catch (err) {
    console.error('OneSignal login error:', err);
  }
}

export async function clearOneSignalUser() {
  if (!initialized) return;
  try {
    await OneSignal.logout();
  } catch (err) {
    console.error('OneSignal logout error:', err);
  }
}
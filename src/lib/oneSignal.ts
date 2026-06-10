import OneSignal from 'react-onesignal';

let initialized = false;

export async function initOneSignal() {
  if (initialized) return;
  initialized = true;

  await OneSignal.init({
    appId: '2eeab815-cfc2-4b65-bf79-a3c4415ced61',
    serviceWorkerPath: '/OneSignalSDKWorker.js',
    serviceWorkerParam: { scope: '/' },
    allowLocalhostAsSecureOrigin: true,
  });

  // Show the native browser permission prompt
  OneSignal.Slidedown.promptPush();
}

export async function setOneSignalUser(userId: string) {
  await OneSignal.login(userId);
}

export async function clearOneSignalUser() {
  await OneSignal.logout();
}
import OneSignal from 'react-onesignal';

export async function initOneSignal() {
  await OneSignal.init({
    appId: '2eeab815-cfc2-4b65-bf79-a3c4415ced61',
    serviceWorkerParam: { scope: '/' },
    serviceWorkerPath: '/OneSignalSDKWorker.js',
    allowLocalhostAsSecureOrigin: true,
  });

  // Request notification permission immediately after init
  await OneSignal.Notifications.requestPermission();
}

export async function setOneSignalUser(userId: string) {
  await OneSignal.login(userId);
}

export async function clearOneSignalUser() {
  await OneSignal.logout();
}
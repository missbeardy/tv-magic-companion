// public/OneSignalSDKWorker.js
// OneSignal service worker — also imports our main SW for PWA caching

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js')
importScripts('/sw.js')
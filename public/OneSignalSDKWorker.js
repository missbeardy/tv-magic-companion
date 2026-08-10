// public/OneSignalSDKWorker.js
// OneSignal service worker — co-exists with VitePWA's /sw.js.
//
// Import the classic push-only handler, NOT /sw.js. The built /sw.js is a
// Workbox bundle; loading it via importScripts here can throw before our push
// listener registers, which silently drops native Web Push payloads (FCM 201,
// nothing on screen).

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js')
importScripts('/web-push-handler.js')

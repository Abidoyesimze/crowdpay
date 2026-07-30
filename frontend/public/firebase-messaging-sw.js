/* global importScripts, firebase, self, clients */
const encodedConfig = new URL(self.location.href).searchParams.get('config');

if (encodedConfig) {
  const config = JSON.parse(self.atob(encodedConfig));
  importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js');
  firebase.initializeApp(config);

  firebase.messaging().onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    self.registration.showNotification(notification.title || 'CrowdPay', {
      body: notification.body || '',
      data: { link: payload.data?.link || '/' },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil(clients.openWindow(url));
});

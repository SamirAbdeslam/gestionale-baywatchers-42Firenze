// Service Worker for Push Notifications

self.addEventListener('install', (event) => {
    console.log('Service Worker installing.');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activating.');
    event.waitUntil(clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
    console.log('Push received:', event);
    
    let notificationData = {};
    
    try {
        notificationData = event.data.json();
    } catch (e) {
        notificationData = {
            title: 'Baywatchers Event',
            body: event.data ? event.data.text() : 'Hai una notifica',
            icon: '/static/favicon.ico'
        };
    }
    
    const title = notificationData.title || 'Baywatchers';
    const options = {
        body: notificationData.body || '',
        icon: notificationData.icon || '/static/favicon.ico',
        badge: notificationData.badge || '/static/badge.png',
        vibrate: notificationData.vibrate || [200, 100, 200],
        requireInteraction: notificationData.requireInteraction !== undefined ? notificationData.requireInteraction : true,
        tag: notificationData.tag || 'baywatchers-notification',
        data: notificationData.data || { url: '/' }
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('Notification clicked:', event);
    
    event.notification.close();
    
    const urlToOpen = event.notification.data && event.notification.data.url 
        ? event.notification.data.url 
        : '/calendar';
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // Check if there's already a window open
            for (let client of clientList) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

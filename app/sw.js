/// <reference lib="webworker" />

// Give the service worker access to Firebase Messaging.
// Note: We are using Web Push directly, not necessarily Firebase, but the reference is good for types.

const sw = self;

sw.addEventListener('install', (event) => {
    console.log('Service Worker installing.');
    sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
    console.log('Service Worker activating.');
    event.waitUntil(sw.clients.claim());
});

// Handle incoming push notifications
sw.addEventListener('push', (event) => {
    console.log('[Service Worker] Push Received.');

    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            console.warn('Push event has no JSON data:', event.data.text());
            return;
        }
    }

    // Matrix Push Gateway (Sygnal) format usually wraps content
    // Example: { notification: { counts: { unread: 1 }, devices: [...] }, content: { ... } }
    // OR simply the structure defined by the pusher.

    // Basic payload handling
    const title = data.sender_display_name || data.title || 'New Message';
    const options = {
        body: data.content ? data.content.body : (data.body || 'You have a new message'),
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: {
            roomId: data.room_id,
            url: data.room_id ? `/chat/rooms/${data.room_id}` : '/chat'
        },
        tag: data.room_id // Collapse notifications from same room
    };

    if (data.unread_count && navigator.setAppBadge) {
        navigator.setAppBadge(data.unread_count).catch(console.error);
    }

    event.waitUntil(sw.registration.showNotification(title, options));
});

// Handle notification clicks
sw.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification click Received.');

    event.notification.close();

    // Open the app or focus existing window
    const urlToOpen = event.notification.data?.url || '/chat';

    event.waitUntil(
        sw.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((windowClients) => {
            // Check if there is already a window/tab open with the target URL
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            // If not, open a new window
            if (sw.clients.openWindow) {
                return sw.clients.openWindow(urlToOpen);
            }
        })
    );
});

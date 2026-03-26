/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

const sw = self;

let quietUntil = 0;

sw.addEventListener('message', (event) => {
    if (event.data?.type === 'SET_QUIET_UNTIL') {
        quietUntil = event.data.timestamp || 0;
        console.log('[Service Worker] Quiet hours updated until:', new Date(quietUntil).toLocaleString());
    }
});

// This is the magic line that Nuxt PWA module needs to inject the asset manifest.
// If it's missing, the PWA won't be considered "complete" for some browsers.
precacheAndRoute(self.__WB_MANIFEST);

sw.addEventListener('install', (event) => {
    console.log('Service Worker installing.');
    sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
    console.log('Service Worker activating.');
    event.waitUntil(sw.clients.claim());
});

// --- Periodic Background Sync (2026 Standards) ---

sw.addEventListener('periodicsync', (event) => {
    if (event.tag === 'sync-messages') {
        console.log('[Service Worker] Periodic sync: pre-fetching messages for active rooms');
        event.waitUntil(preFetchActiveRooms('periodicsync'));
    }
});

// --- Background Sync (2026 Standards) ---

sw.addEventListener('sync', (event) => {
    if (event.tag === 'sync-unread-messages') {
        console.log('[Service Worker] Background sync: refreshing message buffers');
        event.waitUntil(preFetchActiveRooms('sync'));
    }
});

async function preFetchActiveRooms(reason = 'push') {
    // Logic: In 2026, we notify the client to sync buffers if open.
    // This allows the app to perform high-priority decryption and
    // IndexedDB updates while the SW handles the notification.
    const clients = await sw.clients.matchAll({ type: 'window' });
    for (const client of clients) {
        client.postMessage({ type: 'SYNC_BUFFERS', reason });
    }
}

// --- Media Proxy (Authenticated Streaming) ---

const MEDIA_PROXY_PATH = '/_media_proxy/';

sw.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Match /_media_proxy/ with or without trailing slash
    if (url.pathname === MEDIA_PROXY_PATH || url.pathname === MEDIA_PROXY_PATH.slice(0, -1)) {
        event.respondWith(handleMediaProxy(event.request));
    }
});

async function handleMediaProxy(request) {
    const url = new URL(request.url);
    const encodedData = url.searchParams.get('data');

    if (!encodedData) {
        return new Response('Missing data parameter', { status: 400 });
    }

    try {
        // Data is passed as a base64 encoded JSON string in the URL.
        // atob might fail if the user used a URL-safe variant (unlikely here but good to handle).
        const jsonStr = atob(encodedData.replace(/-/g, '+').replace(/_/g, '/'));
        const decoded = JSON.parse(jsonStr);
        const { mediaUrl, accessToken } = decoded;

        if (!mediaUrl || !accessToken) {
            return new Response('Missing mediaUrl or accessToken', { status: 400 });
        }

        // Forward original headers (Range, etc.)
        const headers = new Headers(request.headers);
        headers.set('Authorization', `Bearer ${accessToken}`);

        // We fetch and return the response. 
        // If the browser sends a Range header, we MUST return the partial response.
        // Most modern fetch implementations in Service Workers pass 206s correctly.
        const response = await fetch(mediaUrl, {
            headers,
            credentials: 'omit',
        });

        // Ensure we preserve the status for Range requests (206)
        return response;
    } catch (err) {
        console.error('[Service Worker] Media proxy error:', err);
        return new Response('Internal Proxy Error: ' + err.message, { status: 500 });
    }
}

// Helper to extract a readable summary of the message
function getMessageSummary(content) {
    if (!content) return 'New message';

    // Handle encrypted messages (Matrix doesn't send content for these usually in push)
    if (content.msgtype === undefined && content.algorithm) {
        return 'Encrypted message';
    }

    switch (content.msgtype) {
        case 'm.text':
        case 'm.notice':
        case 'm.emote':
            return content.body;
        case 'm.image':
            return 'Sent an image';
        case 'm.video':
            return 'Sent a video';
        case 'm.audio':
            return 'Sent an audio file';
        case 'm.file':
            return `Sent a file: ${content.body}`;
        case 'm.location':
            return 'Shared a location';
        default:
            return content.body || 'New message';
    }
}

// --- Zero-Knowledge Decryption (2026 Standards) ---

const DB_NAME = 'tumult-crypto-storage';
const STORE_NAME = 'keys';
const KEY_NAME = 'notification-decryption-key';

async function decryptNotification(encrypted) {
    if (!encrypted || !encrypted.iv || !encrypted.ct) return null;

    try {
        // Open IndexedDB
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        // Get Key
        const key = await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(KEY_NAME);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (!key) {
            console.warn('[Service Worker] No decryption key found in IndexedDB');
            return null;
        }

        // Decrypt
        const iv = new Uint8Array(atob(encrypted.iv).split('').map(c => c.charCodeAt(0)));
        const ct = new Uint8Array(atob(encrypted.ct).split('').map(c => c.charCodeAt(0)));

        const decrypted = await sw.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ct
        );

        return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (err) {
        console.error('[Service Worker] Decryption failed:', err);
        return null;
    }
}

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

    event.waitUntil(handlePushEvent(data));
});

async function handlePushEvent(data) {
    // 1. Attempt Zero-Knowledge Decryption
    let title = data.title;
    let notificationBody = data.body;

    if (data.encrypted) {
        console.log('[Service Worker] Encrypted push detected, decrypting...');
        const decrypted = await decryptNotification(data.encrypted);
        if (decrypted) {
            title = decrypted.title;
            notificationBody = decrypted.body;
            console.log('[Service Worker] Decryption successful:', title);
        } else {
            console.warn('[Service Worker] Decryption failed, falling back to generic notification');
            title = 'Tumult';
            notificationBody = 'New message';
        }
    }

    // 2. Fallback logic for when the browser doesn't natively handle declarative push:
    const sender = data.sender_display_name || 'Someone';
    const roomName = data.room_name;
    const bodyText = getMessageSummary(data.content);

    // Formatting (Prefer server-sent/decrypted title/body if available)
    title = title || (roomName || sender);
    notificationBody = notificationBody || (roomName ? `${sender}: ${bodyText}` : bodyText);
    const urlToOpen = data.navigate || (data.data?.url || (data.room_id ? `/chat/rooms/${data.room_id}` : '/chat'));

    const options = {
        body: notificationBody,
        icon: data.icon || '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: {
            roomId: data.room_id,
            eventId: data.event_id,
            url: urlToOpen
        },
        tag: data.room_id || 'general-notification',
        renotify: true
    };

    // Update App Badge (iOS 16.4+ / Android)
    if (data.counts && data.counts.unread !== undefined && 'setAppBadge' in navigator) {
        navigator.setAppBadge(data.counts.unread).catch(console.error);
    }

    // Show Notification (Imperative Fallback)
    const now = Date.now();
    const shouldShow = now > quietUntil;

    const promises = [
        shouldShow ? sw.registration.showNotification(title, options) : Promise.resolve(),
        // Use this wake-up to also pre-fetch if appropriate
        preFetchActiveRooms('push')
    ];

    // Register a one-off background sync to ensure data is fresh even if the
    // initial pre-fetch wake-up is too brief.
    if ('sync' in sw.registration) {
        promises.push(sw.registration.sync.register('sync-unread-messages'));
    }

    await Promise.all(promises);
}

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
            // If not found exactly, try to find any open chat window
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes('/chat') && 'focus' in client) {
                    if ('navigate' in client) {
                        return client.navigate(urlToOpen).then(c => c.focus());
                    }
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

// Handle notification dismissal
sw.addEventListener('notificationclose', (event) => {
    console.log('[Service Worker] Notification closed/dismissed.');
    // In 2026, we could report this to analytics to help maintain ML reputation,
    // but the user has requested to discard engagement monitoring for now.
});

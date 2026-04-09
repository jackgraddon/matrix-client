/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

const sw = self;

let quietUntil = 0;
let showContentInNotifications = true;
const displayedEvents = new Set(); // Simple event_id deduplication

sw.addEventListener('message', (event) => {
    if (event.data?.type === 'SET_QUIET_UNTIL') {
        quietUntil = event.data.timestamp || 0;
        console.log('[Service Worker] Quiet hours updated until:', new Date(quietUntil).toLocaleString());
    }
    if (event.data?.type === 'SET_SHOW_CONTENT') {
        showContentInNotifications = !!event.data.enabled;
        console.log('[Service Worker] Show content setting updated:', showContentInNotifications);
    }
    if (event.data?.type === 'MARK_EVENT_DISPLAYED') {
        const eventId = event.data.eventId;
        if (eventId && !displayedEvents.has(eventId)) {
            displayedEvents.add(eventId);
            console.log('[Service Worker] Marked event as displayed (internal sync):', eventId);
        }
    }
    if (event.data?.type === 'CLEAR_BADGE') {
        if ('clearAppBadge' in navigator) {
            navigator.clearAppBadge().catch(console.error);
        } else if ('setAppBadge' in navigator) {
            navigator.setAppBadge(0).catch(console.error);
        }
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
        event.waitUntil(preFetchActiveRooms());
    }
});

async function preFetchActiveRooms() {
    // Logic: In 2026, we notify the client to sync buffers if open,
    // or we attempt a background fetch for unread messages if supported.
    const clients = await sw.clients.matchAll({ type: 'window' });
    for (const client of clients) {
        client.postMessage({ type: 'SYNC_BUFFERS', reason: 'periodicsync' });
    }
}

// --- Media Proxy (Authenticated Streaming) ---

const MEDIA_PROXY_PATH = '/_media_proxy/';

sw.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Match /_media_proxy/ with or without trailing slash
    if (url.pathname === MEDIA_PROXY_PATH || url.pathname === MEDIA_PROXY_PATH.slice(0, -1)) {
        event.respondWith(handleMediaProxy(event.request));
        return;
    }

    // Web Share Target Interceptor
    if (url.pathname === '/share-target' && event.request.method === 'POST') {
        event.respondWith((async () => {
            try {
                const formData = await event.request.formData();
                const title = formData.get('title');
                const text = formData.get('text');
                const urlValue = formData.get('url');
                const files = formData.getAll('media');

                const shareData = {
                    title: title ? title.toString() : undefined,
                    text: text ? text.toString() : undefined,
                    url: urlValue ? urlValue.toString() : undefined,
                    files: [],
                };

                if (files && files.length > 0) {
                    for (const file of files) {
                        if (file instanceof File) {
                            shareData.files.push({
                                blob: file,
                                name: file.name,
                                type: file.type
                            });
                        }
                    }
                }

                await saveShareToIDB(shareData);
                return Response.redirect('/?share=pending', 303);
            } catch (err) {
                console.error('[Service Worker] Share Target error:', err);
                return Response.redirect('/?share=error', 303);
            }
        })());
        return;
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
// Mirror of app/utils/matrix-content.ts — keep in sync
function getMessageSummary(content) {
    if (!content) return 'New message';

    // Handle encrypted messages (Matrix doesn't send content for these usually in push)
    if (content.msgtype === undefined && content.algorithm) {
        return 'Encrypted message';
    }

    // Custom game state events
    if (content.game_id) {
        if (content.type === 'cc.jackg.ruby.game.action' || content.msgtype === 'cc.jackg.ruby.game.action' || content.action) {
            const action = content.action;
            if (action === 'move') {
                if (content.move) {
                    const pieceMap = {
                        'p': 'Pawn', 'r': 'Rook', 'n': 'Knight', 'b': 'Bishop', 'q': 'Queen', 'k': 'King'
                    };
                    const pieceName = pieceMap[content.piece] || 'Piece';
                    const to = content.to ? content.to.toUpperCase() : content.move;
                    if (content.piece && content.to) {
                        return `moved ${pieceName} to ${to}`;
                    }
                    return `moved ${content.move}`;
                }
                if (typeof content.position === 'number') {
                    return `moved at position ${content.position + 1}`;
                }
                return 'made a move';
            }
            if (action === 'accept') return 'accepted the game!';
            if (action === 'decline') return 'declined the game.';
            if (action === 'play') {
                const words = content.words || [];
                const wordText = words.length > 0 ? ` '${words.join(', ')}'` : '';
                const score = content.score || 0;
                return `played${wordText} for ${score} points`;
            }
            if (action === 'swap') {
                return `swapped ${content.count || 'some'} tiles`;
            }
            if (action === 'pass') {
                return 'passed their turn';
            }
            if (action === 'challenge') {
                return 'challenged the last move!';
            }
            if (action === 'resolve_challenge') {
                const result = content.result === 'accepted' ? 'ACCEPTED' : 'REJECTED';
                return `resolved the challenge: Move was ${result}`;
            }
            if (content.type === 'revert' || content.msgtype === 'revert' || action === 'revert') {
                const words = content.words ? content.words.filter(w => w !== 'BINGO!').join(', ') : '';
                return `reverted the illegal move ('${words}')`;
            }
            return `action: ${action}`;
        }
        
        if (content.type === 'cc.jackg.ruby.game.state' || content.msgtype === 'cc.jackg.ruby.game.state') return 'Game state updated';
        
        return 'Game update';
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

// Handle incoming push notifications
sw.addEventListener('push', (event) => {
    console.log('[Service Worker] Push Received.');

    event.waitUntil((async () => {
        let data = {};
        if (event.data) {
            try {
                data = event.data.json();
            } catch (e) {
                console.warn('Push event has no JSON data:', event.data.text());
                return;
            }
        }

        // --- 0. Update App Badge (iOS 16.4+ / Android) ---
        // MUST happen early and regardless of deduplication to ensure current unread count is always reflected
        if (data.counts && data.counts.unread !== undefined && 'setAppBadge' in navigator) {
            if (data.counts.unread === 0) {
                if ('clearAppBadge' in navigator) {
                    navigator.clearAppBadge().catch(console.error);
                } else {
                    navigator.setAppBadge(0).catch(console.error);
                }
            } else {
                navigator.setAppBadge(data.counts.unread).catch(console.error);
            }
        }

        // --- 1. Deduplication ---
        if (data.event_id) {
            if (displayedEvents.has(data.event_id)) {
                console.log('[Service Worker] Skipping duplicate notification for event:', data.event_id);
                return;
            }
            displayedEvents.add(data.event_id);
            // Limit set size to avoid memory leak
            if (displayedEvents.size > 100) {
                const firstItem = displayedEvents.values().next().value;
                displayedEvents.delete(firstItem);
            }
        }

        let debugError = null;

        // --- 1.5. Load Settings from IDB ---
        const settings = await getSwSettings();
        const effectiveShowContent = showContentInNotifications && settings.showContent;
        const effectiveQuietUntil = Math.max(quietUntil, settings.quietUntil);

        // --- 2. Transport Decryption (Relay Level) ---
        if (data.ciphertext) {
            try {
                const decryptedPayload = await decryptTransportPayload(data.ciphertext);
                if (decryptedPayload) {
                    console.log('[Service Worker] Successfully decrypted transport payload.');
                    data = { ...data, ...decryptedPayload };
                }
            } catch (err) {
                console.error('[Service Worker] Failed to decrypt transport payload:', err);
                debugError = `Transport Error: ${err.message}`;
            }
        }

        // --- 3. Protocol Decryption (Matrix Level) ---
        // If content is still "Encrypted message", try a background fetch + decrypt
        // ONLY if show content is enabled
        if (effectiveShowContent && data.room_id && data.event_id && (data.content?.algorithm || getMessageSummary(data.content) === 'Encrypted message')) {
            try {
                const decryptedContent = await fetchAndDecryptMatrixEvent(data.room_id, data.event_id);
                if (decryptedContent) {
                    console.log('[Service Worker] Successfully decrypted Matrix event in background.');
                    data.content = decryptedContent;

                    // Re-calculate fields based on decrypted content
                    const sender = data.sender_display_name || 'Someone';
                    const roomName = data.room_name;
                    const isDirect = data.is_direct || (roomName === sender);
                    data.body = getMessageSummary(decryptedContent);
                    data.title = (roomName && !isDirect) ? `${sender} in ${roomName}` : sender;
                }
            } catch (err) {
                console.warn('[Service Worker] Background Matrix decryption failed:', err);
                debugError = `Matrix Error: ${err.message}`;
            }
        }

        // If this browser supports Declarative Web Push (web_push: 8030),
        // it may have already shown the notification natively.
        // However, we still handle the push event to ensure the Service Worker
        // can perform background logic like pre-fetching.

        // Matrix Sygnal-derived format from our relay
        // Fallback logic for when the browser doesn't natively handle declarative push:
        const sender = data.sender_display_name || 'Someone';
        const roomName = data.room_name;
        const bodyText = getMessageSummary(data.content);

        // Formatting (Prefer server-sent title/body if available, fallback to required styling)
        let title = data.title || (roomName ? `${sender} in ${roomName}` : sender);
        let notificationBody = data.body || bodyText;

        if (!effectiveShowContent) {
            title = 'New Message';
            notificationBody = 'Tap to read';
        } else if (notificationBody === 'Encrypted message' || notificationBody === 'New message') {
            // Content toggle is ON but we couldn't decrypt — give useful context
            // We still know who sent it and where, just not what they said
            notificationBody = (data.is_direct || (roomName === sender))
                ? 'Tap to read message'                        // DM: "Alice — Tap to read message"
                : `New message in ${roomName || 'a room'}`;    // Group: "Alice in General — New message in General"
        } else if (debugError) {
            notificationBody = `${notificationBody} (${debugError})`;
        }
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

        // Show Notification (Imperative Fallback)
        const now = Date.now();
        const shouldShow = now > effectiveQuietUntil;

        await Promise.all([
            shouldShow ? sw.registration.showNotification(title, options) : Promise.resolve(),
            // Use this wake-up to also pre-fetch if appropriate
            preFetchActiveRooms()
        ]);
    })());
});

// --- Background Decryption Helpers ---

// Minimal IDB utility for Service Worker (Mirror of app/utils/crypto-db.ts)
const CRYPTO_DB_NAME = 'tumult-crypto-storage';
const CRYPTO_STORE_NAME = 'keys';
const AUTH_STORE_NAME = 'auth';
const SHARE_STORE_NAME = 'shares';
const KEY_NAME = 'notification-decryption-key';

async function openCryptoDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CRYPTO_DB_NAME, 3);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(CRYPTO_STORE_NAME)) db.createObjectStore(CRYPTO_STORE_NAME);
            if (!db.objectStoreNames.contains(AUTH_STORE_NAME)) db.createObjectStore(AUTH_STORE_NAME);
            if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) db.createObjectStore(SHARE_STORE_NAME);
            if (!db.objectStoreNames.contains('decrypted_events')) db.createObjectStore('decrypted_events');
            // NOTE: NO megolm_sessions store — keys never leave the device
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveShareToIDB(share) {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(SHARE_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(SHARE_STORE_NAME);
        const request = store.put(share, 'pending-share');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getSwCryptoKey() {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CRYPTO_STORE_NAME, 'readonly');
        const store = transaction.objectStore(CRYPTO_STORE_NAME);
        const request = store.get(KEY_NAME);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

async function getSwMatrixAuth() {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(AUTH_STORE_NAME, 'readonly');
        const store = transaction.objectStore(AUTH_STORE_NAME);
        const accessTokenReq = store.get('access_token');
        const homeserverUrlReq = store.get('homeserver_url');
        const deviceIdReq = store.get('device_id');
        let accessToken = null;
        let homeserverUrl = null;
        let deviceId = null;
        accessTokenReq.onsuccess = () => { accessToken = accessTokenReq.result || null; };
        homeserverUrlReq.onsuccess = () => { homeserverUrl = homeserverUrlReq.result || null; };
        deviceIdReq.onsuccess = () => { deviceId = deviceIdReq.result || null; };
        transaction.oncomplete = () => resolve({ accessToken, homeserverUrl, deviceId });
        transaction.onerror = () => reject(transaction.error);
    });
}

async function getSwSettings() {
    const db = await openCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(AUTH_STORE_NAME, 'readonly');
        const store = transaction.objectStore(AUTH_STORE_NAME);
        const showContentReq = store.get('show_content');
        const quietUntilReq = store.get('quiet_until');
        let showContent = true;
        let quietUntil = 0;
        showContentReq.onsuccess = () => { 
            if (showContentReq.result !== undefined) showContent = showContentReq.result; 
        };
        quietUntilReq.onsuccess = () => { 
            if (quietUntilReq.result !== undefined) quietUntil = quietUntilReq.result; 
        };
        transaction.oncomplete = () => resolve({ showContent, quietUntil });
        transaction.onerror = () => reject(transaction.error);
    });
}

async function decryptTransportPayload(ciphertextB64) {
    try {
        const key = await getSwCryptoKey();
        if (!key) return null;

        const combined = new Uint8Array(
            atob(ciphertextB64).split('').map(c => c.charCodeAt(0))
        );
        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );

        return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (e) {
        console.error('[SW] decryptTransportPayload error:', e);
        return null;
    }
}

async function getDecryptedEventCache(eventId) {
    try {
        const db = await openCryptoDB();
        return new Promise((resolve) => {
            const tx = db.transaction('decrypted_events', 'readonly');
            const req = tx.objectStore('decrypted_events').get(eventId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

async function cacheDecryptedEventInSw(eventId, content) {
    try {
        const db = await openCryptoDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction('decrypted_events', 'readwrite');
            tx.objectStore('decrypted_events').put(content, eventId);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn('[SW] Could not cache decrypted event:', e);
    }
}

async function fetchAndDecryptMatrixEvent(roomId, eventId) {
    try {
        // 1. Check the decrypted event cache (written by the app when it WAS open)
        const cached = await getDecryptedEventCache(eventId);
        if (cached) {
            console.log('[SW] Cache hit for', eventId);
            return cached;
        }

        const { accessToken, homeserverUrl } = await getSwMatrixAuth();
        if (!accessToken || !homeserverUrl) return null;

        // 2. Fetch the raw event from the homeserver
        const url = `${homeserverUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) return null;
        const event = await response.json();

        // 3. If it came back unencrypted (non-E2EE room), use it directly
        if (event.type !== 'm.room.encrypted') return event.content;

        // 4. App is open — ask a window to decrypt it
        const clients = await sw.clients.matchAll({ type: 'window' });
        if (clients.length > 0) {
            const decryptionPromises = clients.map(client =>
                new Promise(resolve => {
                    const channel = new MessageChannel();
                    channel.port1.onmessage = msg => resolve(msg.data?.decrypted || null);
                    client.postMessage({ type: 'DECRYPT_EVENT', event }, [channel.port2]);
                    setTimeout(() => resolve(null), 2000);
                })
            );

            const results = await Promise.race([
                Promise.all(decryptionPromises),
                new Promise(resolve => setTimeout(() => resolve([]), 2500))
            ]);

            const decrypted = Array.isArray(results)
                ? results.find(r => !!r)
                : results;

            if (decrypted) {
                await cacheDecryptedEventInSw(eventId, decrypted);
                return decrypted;
            }
        }

        // 5. App is closed and event is encrypted — return null gracefully
        // The push handler will fall back to showing sender name only.
        console.log('[SW] App closed, cannot decrypt E2EE event', eventId);
        return null;

    } catch (e) {
        console.error('[SW] fetchAndDecryptMatrixEvent error:', e);
        return null;
    }
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

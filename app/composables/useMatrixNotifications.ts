import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { getMessageSummary } from '../utils/matrix-content';
import { cacheDecryptedEvent } from '../utils/notification-cache';

export function useMatrixNotifications() {
    const { $isTauri } = useNuxtApp();
    const store = useMatrixStore();

    async function handleDecryptedEvent(event: MatrixEvent, room: Room) {
        if (!store.pushNotificationsEnabled) return;
        if (event.getSender() === store.client?.getUserId()) return; // no self-notify

        // Respect Quiet Hours
        if (Date.now() < store.notificationsQuietUntil) return;

        const content = event.getContent();
        const summary = getMessageSummary(content);

        if ($isTauri) {
            // Tauri path: native notification, full content always available
            // because we're in-process with the crypto store
            if (store.showContentInNotifications) {
                await sendTauriNotification({
                    title: buildTitle(event, room),
                    body:  summary,
                    roomId: room.roomId,
                    eventId: event.getId()!,
                });
            } else {
                await sendTauriNotification({
                    title: 'New Message',
                    body:  'Tap to read',
                    roomId: room.roomId,
                    eventId: event.getId()!,
                });
            }
        } else {
            // PWA path: cache for SW and let the push notification handle display
            // The SW will find this in IDB if the push arrives while app is open
            if (event.getId()) {
                await cacheDecryptedEvent(event.getId()!, content);
            }
        }
    }

    function buildTitle(event: MatrixEvent, room: Room): string {
        const sender   = event.sender?.name || event.getSender() || 'Someone';
        const roomName = room.name;

        // Check if it's a DM
        const mDirectEvent = store.client?.getAccountData('m.direct');
        const mDirectContent = mDirectEvent ? mDirectEvent.getContent() : {};
        let isDirect = false;
        for (const userRooms of Object.values(mDirectContent)) {
            if (Array.isArray(userRooms) && userRooms.includes(room.roomId)) {
                isDirect = true;
                break;
            }
        }

        return (isDirect || roomName === sender) ? sender : `${sender} in ${roomName}`;
    }

    async function sendTauriNotification({ title, body, roomId, eventId }: {
        title: string; body: string; roomId: string; eventId: string;
    }) {
        try {
            const { sendNotification } = await import('@tauri-apps/plugin-notification');
            sendNotification({
                title,
                body,
                // Tauri notification action payload for tap-to-open:
                extra: { roomId, eventId },
            } as any);
        } catch (e) {
            console.error('[Tauri Notifications] Failed to send notification:', e);
        }
    }

    return { handleDecryptedEvent };
}

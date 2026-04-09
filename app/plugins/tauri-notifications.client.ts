export default defineNuxtPlugin(async () => {
    const { $isTauri } = useNuxtApp();
    if (import.meta.server || !$isTauri) return;

    try {
        const { onNotificationAction } = await import('@tauri-apps/plugin-notification');
        const router = useRouter();

        onNotificationAction((action) => {
            const roomId = action.notification.extra?.roomId;
            if (roomId) {
                router.push(`/chat/rooms/${roomId}`);
            }
        });
    } catch (e) {
        console.error('[Tauri Notifications Plugin] Failed to initialize:', e);
    }
});

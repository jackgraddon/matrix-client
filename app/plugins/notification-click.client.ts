import { onNotificationReceived, onAction } from '@tauri-apps/plugin-notification';

/**
 * Nuxt plugin to handle notification clicks in Tauri.
 * When a notification is clicked, it navigates to the room if a roomId is present.
 */
export default defineNuxtPlugin(async (nuxtApp) => {
  // Only runs on the client side and if running within Tauri
  if (import.meta.server || !(window as any).__TAURI_INTERNALS__) return;

  try {
    const handleNotificationClick = (payload: any) => {
      console.log('[Notification Plugin] Notification interacted:', payload);
      
      // Payload structure depends on whether it's onNotificationReceived or onAction
      // Usually it contains the notification object or action identifier
      const notification = payload.notification || payload;
      const roomId = notification?.extra?.roomId || notification?.data?.roomId;

      if (roomId) {
        console.log(`[Notification Plugin] Navigating to room: ${roomId}`);
        const router = useRouter();
        router.push(`/chat/rooms/${roomId}`);
        
        // Also ensure the window is focused (important if app was minimized)
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
           const appWindow = getCurrentWindow();
           appWindow.setFocus();
           appWindow.unminimize();
        }).catch(err => console.error('[Notification Plugin] Failed to focus window:', err));
      }
    };

    // Listen for notification clicks (general)
    onNotificationReceived((payload) => {
      handleNotificationClick(payload);
    });

    // Listen for custom actions (if any)
    onAction((payload) => {
      handleNotificationClick(payload);
    });

    console.log('[Notification Plugin] Listeners attached for Tauri notifications');
  } catch (err) {
    console.error('[Notification Plugin] Error initializing notification listeners:', err);
  }
});

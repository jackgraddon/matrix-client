import { ActivityService } from "~/services/activity.service";

export default defineNuxtPlugin(() => {
    console.log('[GameDetectionPlugin] Plugin loaded!');

    if (!(window as any).__TAURI_INTERNALS__) {
        console.log('[GameDetectionPlugin] Not in Tauri, skipping.');
        return;
    }

    console.log('[GameDetectionPlugin] Initializing game detection...');

    // The ActivityService instance is already initialized in services.client.ts
    // but we can ensure it's synced if needed here, or just rely on the service.
    ActivityService.getInstance().init();
});

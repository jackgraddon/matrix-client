import { MatrixService } from "~/services/matrix.service";
import { ActivityService } from "~/services/activity.service";
import { PresenceService } from "~/services/presence.service";
import { AudioService } from "~/services/audio.service";
import { JellyfinService } from "~/services/jellyfin.service";
import { VerificationService } from "~/services/verification.service";

export default defineNuxtPlugin(async () => {
    // Services are singletons
    const activityService = ActivityService.getInstance();
    const presenceService = PresenceService.getInstance();
    const audioService = AudioService.getInstance();
    const matrixService = MatrixService.getInstance();
    const verificationService = VerificationService.getInstance();
    const jellyfinService = JellyfinService.getInstance();

    await activityService.init();
    await jellyfinService.init();

    return {
        provide: {
            matrixService,
            activityService,
            presenceService,
            audioService,
            verificationService,
            jellyfinService
        }
    };
});

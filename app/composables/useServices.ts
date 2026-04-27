import { MatrixService } from "~/services/matrix.service";
import { ActivityService } from "~/services/activity.service";
import { PresenceService } from "~/services/presence.service";
import { AudioService } from "~/services/audio.service";
import { JellyfinService } from "~/services/jellyfin.service";
import { VerificationService } from "~/services/verification.service";

export const useMatrixService = () => MatrixService.getInstance();
export const useActivityService = () => ActivityService.getInstance();
export const usePresenceService = () => PresenceService.getInstance();
export const useAudioService = () => AudioService.getInstance();
export const useJellyfinService = () => JellyfinService.getInstance();
export const useVerificationService = () => VerificationService.getInstance();

export const useServices = () => ({
    matrixService: useMatrixService(),
    activityService: useActivityService(),
    presenceService: usePresenceService(),
    audioService: useAudioService(),
    jellyfinService: useJellyfinService(),
    verificationService: useVerificationService()
});

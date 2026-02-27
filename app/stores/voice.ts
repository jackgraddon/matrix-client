import { defineStore } from 'pinia';
import { 
  Room as LiveKitRoom, 
  RoomEvent as LKRoomEvent, 
  BaseKeyProvider as BaseE2EEKeyProvider, 
  createKeyMaterialFromBuffer 
} from 'livekit-client';
import type { Room } from 'matrix-js-sdk';
import { toast } from 'vue-sonner';

export const useVoiceStore = defineStore('voice', {
  state: () => ({
    activeRoomId: null as string | null,
    lkRoom: null as LiveKitRoom | null,
    isConnecting: false,
    isConnected: false,
    isMicEnabled: false,
    isCameraEnabled: false,
    error: null as string | null,
  }),

  actions: {
    async joinVoiceRoom(room: Room) {
      if (this.activeRoomId === room.roomId) return;
      if (this.activeRoomId) await this.leaveVoiceRoom();

      this.isConnecting = true;
      this.error = null;
      const matrixStore = useMatrixStore();

      try {
        console.log(`[Voice] Joining room ${room.roomId}`);
        
        // 1. Get MatrixRTC Session
        const rtcSession = matrixStore.client?.matrixRTC.getRoomSession(room);
        if (!rtcSession) throw new Error('Failed to get RTC session');

        // 2. Focus Discovery & Selection (Critical Step)
        // Check for existing active focus first to prevent split brains
        let foci = (rtcSession as any).foci || [];
        if (foci.length > 0) {
            console.log('[Voice] Using existing active foci:', foci);
        } else {
             // If no active focus, try to discover from .well-known
            try {
                const wellKnown = await matrixStore.client?.getClientWellKnown();
                const rtcFoci = wellKnown?.['org.matrix.msc4143.rtc_foci'];
                if (Array.isArray(rtcFoci)) {
                    const livekitFocus = rtcFoci.find((f: any) => f.type === 'livekit');
                    if (livekitFocus) {
                        foci = [livekitFocus];
                        console.log('[Voice] Discovered focus from .well-known:', livekitFocus);
                    }
                }
            } catch (e) {
                console.warn('[Voice] Failed to discover focus via .well-known', e);
            }

            // Fallback: If still no focus, construct a default one (e.g. for matrix.org)
            if (foci.length === 0) {
                 console.warn('[Voice] No focus found. Falling back to default matrix.org focus.');
                 foci = [{
                     type: 'livekit',
                     livekit_service_url: 'https://livekit-jwt.call.matrix.org',
                     livekit_alias: 'default' 
                 }];
            }
        }
        
        // 3. Join MatrixRTC Session
        const userId = matrixStore.client?.getUserId()!;
        const deviceId = matrixStore.client?.getDeviceId()!;
        
        // This is the key fix: We MUST pass the focus we intend to use if we are the first joiner.
        // If we don't, other clients won't know where to connect.
        rtcSession.joinRTCSession(
            { userId, deviceId, memberId: `${userId}:${deviceId}` }, 
            foci, 
            undefined, // multiSfuFocus
            { manageMediaKeys: true, useExperimentalToDeviceTransport: true }
        );

        // 4. Get LiveKit Credentials (JWT)
        // We use the service URL from the chosen focus
        const serviceUrl = foci[0].livekit_service_url;
        const openIdToken = await matrixStore.client?.getOpenIdToken();
        
        console.log(`[Voice] Fetching JWT from ${serviceUrl}`);
        const response = await fetch(`${serviceUrl}/sfu/get`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room: room.roomId,
                device_id: deviceId,
                openid_token: openIdToken
            })
        });

        if (!response.ok) throw new Error(`Failed to get JWT: ${response.statusText}`);
        const { url: lkUrl, jwt } = await response.json();

        // 5. Setup LiveKit Room with E2EE
        const roomOptions: any = {
            adaptiveStream: true,
            dynacast: true,
            publishDefaults: { red: true, dtx: true, simulcast: true },
            audioCaptureDefaults: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
            videoCaptureDefaults: { facingMode: 'user' },
        };

        // E2EE Setup
        if (rtcSession) {
            console.log('[Voice] Setting up E2EE key bridge');
            const keyProvider = new BaseE2EEKeyProvider({
                sharedKey: false, 
                ratchetWindowSize: 0, 
                failureTolerance: -1 
            });

            const onKeyChanged = async (keyBin: Uint8Array, keyIndex: number, membership: any, rtcBackendIdentity: string) => {
                try {
                    const cryptoKey = await createKeyMaterialFromBuffer(keyBin.buffer as ArrayBuffer);
                    (keyProvider as any).onSetEncryptionKey(cryptoKey, rtcBackendIdentity, keyIndex);
                    console.log(`[Voice] Bridged key for ${rtcBackendIdentity} (idx: ${keyIndex})`);
                } catch (e) {
                    console.error('[Voice] Failed to bridge key:', e);
                }
            };
            
            (rtcSession as any).on('encryption_key_changed', onKeyChanged);
             // Re-emit existing keys for local participant or already joined members
            if (typeof (rtcSession as any).reemitEncryptionKeys === 'function') {
                (rtcSession as any).reemitEncryptionKeys();
            }

            const worker = new Worker(new URL('livekit-client/e2ee-worker', import.meta.url));
            roomOptions.encryption = { keyProvider, worker };
        }

        const lkRoom = new LiveKitRoom(roomOptions);

        // 6. Connect to LiveKit
        await lkRoom.connect(lkUrl, jwt);
        
        // 7. Setup Audio/Video
        await lkRoom.startAudio();
        await lkRoom.localParticipant.setMicrophoneEnabled(true);
        this.isMicEnabled = true;

        this.lkRoom = markRaw(lkRoom);
        this.activeRoomId = room.roomId;
        this.isConnected = true;
        
        // Listeners for UI updates
        lkRoom.on(LKRoomEvent.Disconnected, () => this.leaveVoiceRoom());
        lkRoom.on(LKRoomEvent.LocalTrackPublished, () => {
             this.isMicEnabled = lkRoom.localParticipant.isMicrophoneEnabled;
             this.isCameraEnabled = lkRoom.localParticipant.isCameraEnabled;
        });
        
        toast.success('Joined voice call');

      } catch (e: any) {
        console.error('[Voice] Failed to join:', e);
        this.error = e.message;
        toast.error('Failed to join call');
        this.isConnecting = false;
        // Cleanup if partial failure
        if (this.activeRoomId) this.leaveVoiceRoom();
      } finally {
        this.isConnecting = false;
      }
    },

    async leaveVoiceRoom() {
        if (!this.activeRoomId) return;
        
        const matrixStore = useMatrixStore();
        const room = matrixStore.client?.getRoom(this.activeRoomId);

        console.log(`[Voice] Leaving room ${this.activeRoomId}`);

        // 1. Leave LiveKit
        if (this.lkRoom) {
            await this.lkRoom.disconnect();
            this.lkRoom = null;
        }

        // 2. Leave MatrixRTC Session
        if (room) {
            try {
                const rtcSession = matrixStore.client?.matrixRTC.getRoomSession(room);
                rtcSession?.leaveRoomSession();
            } catch (e) {
                console.warn('[Voice] Failed to leave MatrixRTC session cleanly:', e);
            }
        }

        this.activeRoomId = null;
        this.isConnected = false;
        this.isMicEnabled = false;
        this.isCameraEnabled = false;
        this.error = null;
    },

    async toggleMic() {
        if (!this.lkRoom) return;
        const enabled = !this.isMicEnabled;
        await this.lkRoom.localParticipant.setMicrophoneEnabled(enabled);
        this.isMicEnabled = enabled;
    },

    async toggleCamera() {
        if (!this.lkRoom) return;
        const enabled = !this.isCameraEnabled;
        await this.lkRoom.localParticipant.setCameraEnabled(enabled);
        this.isCameraEnabled = enabled;
    }
  }
});

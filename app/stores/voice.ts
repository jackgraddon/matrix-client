import { defineStore } from 'pinia';
import { markRaw } from 'vue';
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
        connectingRoomId: null as string | null,
    }),

    actions: {
        async joinVoiceRoom(room: Room) {
            if (this.activeRoomId === room.roomId) return;
            if (this.activeRoomId) await this.leaveVoiceRoom();

            this.isConnecting = true;
            this.connectingRoomId = room.roomId;
            this.error = null;
            const matrixStore = useMatrixStore();

            try {
                console.log(`[Voice] Joining room ${room.roomId}`);

                // 0. Ensure we have device keys for everyone in the room
                // This is critical for the "No targets found for sending key" error.
                const members = room.getJoinedMembers();
                const memberIds = members.map(m => m.userId);
                const crypto = matrixStore.client?.getCrypto();
                if (memberIds.length > 0 && crypto) {
                    console.log(`[Voice] Ensuring device keys for ${memberIds.length} members`);
                    // downloadUncached=true ensures we fetch from server if not in cache
                    await crypto.getUserDeviceInfo(memberIds, true);
                }

                // 1. Get MatrixRTC Session
                const rtcSession = matrixStore.client?.matrixRTC.getRoomSession(room);
                if (!rtcSession) throw new Error('Failed to get RTC session');

                // 2. Focus Discovery & Selection (Critical Step)
                // Check for existing active focus first to prevent split brains
                let foci = (rtcSession as any).foci || [];
                if (foci.length === 0) {
                    // Robustly check memberships for active foci if the session property is empty
                    const memberships = (rtcSession as any).memberships || [];
                    if (memberships.length > 0) {
                        console.log(`[Voice] Checking ${memberships.length} memberships for active focus...`);
                        for (const m of memberships) {
                            // Check if we can extract focus from the call membership event
                            // Note: The structure depends on matrix-js-sdk version, we check common paths
                            const event = m.getCallMemberEvent?.();
                            const content = event?.getContent?.();
                            if (content?.foci_active && Array.isArray(content.foci_active) && content.foci_active.length > 0) {
                                foci = content.foci_active;
                                console.log('[Voice] Found active focus in membership:', foci);
                                break;
                            }
                        }
                    }
                }

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

                console.log(`[Voice] Joining MatrixRTC session for room ${room.roomId} as ${userId}/${deviceId}`);

                try {
                    // This is the key fix: We MUST pass the focus we intend to use if we are the first joiner.
                    // If we don't, other clients won't know where to connect.
                    rtcSession.joinRTCSession(
                        { userId, deviceId, memberId: deviceId },
                        foci,
                        foci[0], // multiSfuFocus (Pass a valid transport to bypass SDK isLivekitTransportConfig crash)
                        {
                            manageMediaKeys: true,
                            useExperimentalToDeviceTransport: true,
                            unstableSendStickyEvents: true,
                            membershipEventExpiryMs: 300000, // 5 minutes
                            delayedLeaveEventRestartMs: 20000,
                            delayedLeaveEventDelayMs: 60000
                        }
                    );
                    console.log('[Voice] MatrixRTC joinRTCSession call successful');
                } catch (rtcErr) {
                    console.error('[Voice] Failed to joinRTCSession:', rtcErr);
                    // Don't throw here, as LiveKit might still work, but warn that sidebar will be empty
                }

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
                            // Custom implementation of LiveKit's createKeyMaterialFromBuffer
                            // We FORCE extractable: true so WebKit doesn't push it to the macOS Keychain
                            const cryptoKey = await window.crypto.subtle.importKey(
                                'raw',
                                keyBin.buffer as ArrayBuffer,
                                'HKDF',
                                true,
                                ['deriveBits', 'deriveKey']
                            );
                            // LiveKit expects the identity string to match what's in the token.
                            // For MatrixRTC, this is usually UserId:DeviceId (which rtcBackendIdentity should be).
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

                    // Fetch and monkey-patch the worker to prevent macOS Keychain bombardment
                    // LiveKit's worker creates non-extractable WebCrypto keys by default
                    const workerUrl = new URL('livekit-client/e2ee-worker', import.meta.url).href;
                    const workerRes = await fetch(workerUrl);
                    let workerCode = await workerRes.text();

                    const patchCode = `
                        const _originalImportKey = crypto.subtle.importKey;
                        crypto.subtle.importKey = function(format, keyData, algo, extractable, keyUsages) {
                            return _originalImportKey.call(crypto.subtle, format, keyData, algo, true, keyUsages);
                        };
                        const _originalDeriveKey = crypto.subtle.deriveKey;
                        crypto.subtle.deriveKey = function(algo, baseKey, derivedKeyType, extractable, keyUsages) {
                            return _originalDeriveKey.call(crypto.subtle, algo, baseKey, derivedKeyType, true, keyUsages);
                        };
                    `;

                    const blob = new Blob([patchCode + '\\n' + workerCode], { type: 'application/javascript' });
                    const worker = new Worker(URL.createObjectURL(blob));

                    roomOptions.encryption = { keyProvider, worker };
                }

                const lkRoom = new LiveKitRoom(roomOptions);

                // 6. Connect to LiveKit
                await lkRoom.connect(lkUrl, jwt);

                console.log(`[Voice] Connected to room: ${lkRoom.name}. Participants: ${lkRoom.remoteParticipants.size}`);

                // 7. Setup Audio/Video
                await lkRoom.startAudio();
                await lkRoom.localParticipant.setMicrophoneEnabled(true);
                this.isMicEnabled = true;

                this.lkRoom = markRaw(lkRoom);
                this.activeRoomId = room.roomId;
                this.connectingRoomId = null;
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
            if (!this.activeRoomId && !this.connectingRoomId) return;

            const roomId = this.activeRoomId || this.connectingRoomId;
            const matrixStore = useMatrixStore();
            const room = matrixStore.client?.getRoom(roomId!);

            console.log(`[Voice] Leaving room ${roomId}`);

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
            this.connectingRoomId = null;
            this.isConnecting = false;
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

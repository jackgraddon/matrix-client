import { IngressClient } from 'livekit-server-sdk';

export class LiveKitManager {
    private ingressClient: IngressClient;

    constructor(private host: string, private apiKey: string, private secret: string) {
        this.ingressClient = new IngressClient(host, apiKey, secret);
    }

    async createDiscordUserIngress(userId: string, displayName: string, roomName: string) {
        // RTP_INPUT maps to value 4 in protocol.
        const ingress = await this.ingressClient.createIngress(4 as any, {
            name: `discord-${userId}`,
            roomName: roomName,
            participantIdentity: `discord::${userId}`,
            participantName: displayName,
            enableTranscoding: false,
        });

        console.log(`[LiveKit] Created ingress for ${userId} in ${roomName}`);
        return ingress;
    }
}

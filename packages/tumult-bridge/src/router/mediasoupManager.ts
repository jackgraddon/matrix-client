import * as mediasoup from 'mediasoup';

export class MediasoupManager {
    private worker?: mediasoup.types.Worker;
    private router?: mediasoup.types.Router;
    private producers = new Map<string, mediasoup.types.Producer>();
    private transports = new Map<string, mediasoup.types.PlainTransport>();

    async init() {
        this.worker = await mediasoup.createWorker({
            logLevel: 'debug',
            logTags: ['rtp', 'rtcp', 'rtx'],
            rtcMinPort: 10000,
            rtcMaxPort: 10100,
        });

        this.router = await this.worker.createRouter({
            mediaCodecs: [
                {
                    kind: 'audio',
                    mimeType: 'audio/opus',
                    clockRate: 48000,
                    channels: 2,
                }
            ],
        });

        console.log('[Mediasoup] Worker and Router initialized');
    }

    async createPlainTransport(userId: string, comedia: boolean = false) {
        if (!this.router) throw new Error('Router not initialized');

        const transport = await this.router.createPlainTransport({
            listenIp: { ip: '127.0.0.1' },
            rtcpMux: true,
            comedia: comedia,
        });

        this.transports.set(userId, transport);
        return transport;
    }

    async createProducer(userId: string, ssrc: number) {
        const transport = this.transports.get(userId);
        if (!transport) throw new Error('Transport not found for user');

        const producer = await transport.produce({
            kind: 'audio',
            rtpParameters: {
                codecs: [
                    {
                        mimeType: 'audio/opus',
                        payloadType: 111,
                        clockRate: 48000,
                        channels: 2,
                    }
                ],
                encodings: [{ ssrc }],
            },
        });

        this.producers.set(userId, producer);
        return producer;
    }

    getRouter() {
        return this.router;
    }

    cleanup() {
        this.worker?.close();
    }
}

import WebSocket from 'ws';
import dgram from 'dgram';
import sodium from 'libsodium-wrappers';
import { EventEmitter } from 'events';

export interface DiscordVoiceConnectionOptions {
    guildId: string;
    channelId: string;
    userId: string;
    sessionId: string;
    token: string;
    endpoint: string;
}

export class DiscordVoiceConnection extends EventEmitter {
    private ws?: WebSocket;
    private udp?: dgram.Socket;
    private secretKey?: Uint8Array;
    private ssrc?: number;
    private serverIp?: string;
    private serverPort?: number;
    private localIp?: string;
    private localPort?: number;
    private heartbeatInterval?: NodeJS.Timeout;

    public ssrcMap = new Map<number, string>();
    public sequence = 0;
    public timestamp = 0;

    constructor(private options: DiscordVoiceConnectionOptions) {
        super();
    }

    async connect() {
        await sodium.ready;
        return new Promise<void>((resolve, reject) => {
            const endpoint = this.options.endpoint.split(':')[0];
            this.ws = new WebSocket(`wss://${endpoint}/?v=8`);

            this.ws.on('open', () => {
                this.identify();
            });

            this.ws.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                this.handleMessage(msg, resolve, reject);
            });

            this.ws.on('error', reject);
            this.ws.on('close', () => {
                this.cleanup();
            });
        });
    }

    private identify() {
        this.ws?.send(JSON.stringify({
            op: 0, // IDENTIFY
            d: {
                server_id: this.options.guildId,
                user_id: this.options.userId,
                session_id: this.options.sessionId,
                token: this.options.token,
            }
        }));
    }

    private handleMessage(msg: any, resolve: () => void, reject: (err: any) => void) {
        switch (msg.op) {
            case 2: // READY
                this.ssrc = msg.d.ssrc;
                this.serverIp = msg.d.ip;
                this.serverPort = msg.d.port;
                this.setupUdp(resolve, reject);
                this.startHeartbeat(msg.d.heartbeat_interval);
                break;
            case 4: // SESSION_DESCRIPTION
                this.secretKey = new Uint8Array(msg.d.secret_key);
                console.log('[DiscordVoice] Received secret key');
                this.emit('ready');
                break;
            case 5: // SPEAKING
                this.ssrcMap.set(msg.d.ssrc, msg.d.user_id);
                break;
            case 8: // HELLO
                this.startHeartbeat(msg.d.heartbeat_interval);
                break;
        }
    }

    private setupUdp(resolve: () => void, reject: (err: any) => void) {
        this.udp = dgram.createSocket('udp4');
        this.udp.on('message', (msg) => this.handleUdpMessage(msg));
        this.udp.on('error', (err) => {
            console.error('[DiscordVoice] UDP error:', err);
            this.emit('error', err);
        });

        // IP Discovery
        const packet = Buffer.alloc(74);
        packet.writeUInt16BE(0x1, 0); // Type 1 (Request)
        packet.writeUInt16BE(70, 2); // Length 70
        packet.writeUInt32BE(this.ssrc!, 4);

        this.udp.send(packet, this.serverPort!, this.serverIp!, (err) => {
            if (err) reject(err);
        });

        this.udp.once('message', (msg) => {
            // Parse IP Discovery response
            this.localIp = msg.slice(8, msg.indexOf(0, 8)).toString();
            this.localPort = msg.readUInt16BE(72);

            this.selectProtocol();
            resolve();
        });
    }

    private selectProtocol() {
        this.ws?.send(JSON.stringify({
            op: 1, // SELECT_PROTOCOL
            d: {
                protocol: 'udp',
                data: {
                    address: this.localIp,
                    port: this.localPort,
                    mode: 'xsalsa20_poly1305'
                }
            }
        }));
    }

    private handleUdpMessage(packet: Buffer) {
        if (!this.secretKey) return;

        // Basic RTP header is 12 bytes
        if (packet.length < 12) return;

        // Opcode 1/2 is IP Discovery
        if (packet.readUInt16BE(0) === 0x2) return;

        const decrypted = this.decryptPacket(packet);
        if (decrypted) {
            this.emit('rtp', decrypted);
        }
    }

    private decryptPacket(packet: Buffer): Buffer | null {
        if (!this.secretKey) return null;
        const header = packet.slice(0, 12);
        const nonce = Buffer.alloc(24);
        header.copy(nonce, 0); // nonce = header padded to 24 bytes

        const ciphertext = packet.slice(12);
        try {
            const plaintext = sodium.crypto_secretbox_open_easy(
                ciphertext, nonce, this.secretKey
            );
            return Buffer.concat([header, plaintext]);
        } catch (e) {
            return null;
        }
    }

    public sendRtp(opusPacket: Buffer) {
        if (!this.udp || !this.secretKey || !this.serverPort || !this.serverIp || !this.ssrc) return;

        const header = Buffer.alloc(12);
        header[0] = 0x80;
        header[1] = 0x78; // Payload type
        header.writeUInt16BE(this.sequence++, 2);
        header.writeUInt32BE(this.timestamp, 4);
        header.writeUInt32BE(this.ssrc, 8);

        this.timestamp += 960;

        const nonce = Buffer.alloc(24);
        header.copy(nonce);

        const encrypted = sodium.crypto_secretbox_easy(opusPacket, nonce, this.secretKey);
        const packet = Buffer.concat([header, Buffer.from(encrypted)]);

        this.udp.send(packet, this.serverPort, this.serverIp);
    }

    private startHeartbeat(interval: number) {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
            this.ws?.send(JSON.stringify({
                op: 3, // HEARTBEAT
                d: Date.now()
            }));
        }, interval);
    }

    private cleanup() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.ws?.close();
        this.udp?.close();
    }
}

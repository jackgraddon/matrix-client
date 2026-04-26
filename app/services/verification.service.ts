import * as sdk from 'matrix-js-sdk';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent';
import { VerificationRequestEvent, VerificationPhase, VerifierEvent } from 'matrix-js-sdk/lib/crypto-api/verification';
import type { VerificationRequest, Verifier, ShowSasCallbacks } from 'matrix-js-sdk/lib/crypto-api/verification';
import { useMatrixStore } from '~/stores/matrix';
import { useUIStore } from '~/stores/ui';
import { markRaw } from 'vue';
import { toast } from 'vue-sonner';

export class VerificationService {
  private static instance: VerificationService;
  private client: sdk.MatrixClient | null = null;

  private constructor() {}

  public static getInstance(): VerificationService {
    if (!VerificationService.instance) VerificationService.instance = new VerificationService();
    return VerificationService.instance;
  }

  setClient(client: sdk.MatrixClient | null) {
    this.client = client;
    if (this.client) this.setupVerificationListeners();
  }

  private setupVerificationListeners() {
    if (!this.client) return;

    this.client.on(CryptoEvent.VerificationRequestReceived, (request: VerificationRequest) => {
      if (request.initiatedByMe) return;
      const store = useMatrixStore();
      const uiStore = useUIStore();

      if (store.isVerificationInitiatedByMe && store.activeVerificationRequest &&
          ![VerificationPhase.Cancelled, VerificationPhase.Done].includes(store.activeVerificationRequest.phase)) {
        return;
      }

      store.activeVerificationRequest = markRaw(request);
      store.isVerificationInitiatedByMe = request.initiatedByMe;
      store.verificationPhase = request.phase;
      uiStore.setVerificationModalOpen(true);

      this.attachRequestListeners(request);
    });

    this.client.on(CryptoEvent.KeysChanged, () => this.checkDeviceVerified());
    this.client.on(CryptoEvent.UserTrustStatusChanged, () => this.checkDeviceVerified());

    // Secret gossip listeners
    this.client.on("crypto.secrets.request" as any, async (request: any) => {
        const status = await this.client?.getCrypto()?.getDeviceVerificationStatus(request.userId, request.deviceId);
        if (status?.isVerified()) await request.share();
    });

    this.client.on("crypto.secrets.received" as any, async (name: string) => {
        if (name === 'm.megolm_backup.v1') {
            await this.client?.getCrypto()?.loadSessionBackupPrivateKeyFromSecretStorage();
            await this.client?.getCrypto()?.restoreKeyBackup({});
        }
    });
  }

  public attachRequestListeners(request: VerificationRequest) {
    const store = useMatrixStore();
    const uiStore = useUIStore();

    const checkPhase = async () => {
      const phase = request.phase;
      store.verificationPhase = phase;
      store.isVerificationInitiatedByMe = request.initiatedByMe;

      if (phase === VerificationPhase.Ready) {
        store.qrCodeData = (request as any).qrCodeData || null;
        if (store.isVerificationInitiatedByMe && !request.verifier && !store.activeSas &&
            !request.otherPartySupportsMethod('m.qr_code.scan.v1') && !request.otherPartySupportsMethod('m.qr_code.show.v1')) {
          const verifier = await request.startVerification('m.sas.v1');
          this.setupVerifierListeners(verifier);
        }
      } else if (phase === VerificationPhase.Started) {
        if (request.verifier) this.setupVerifierListeners(request.verifier);
      } else if (phase === VerificationPhase.Done) {
        store.isVerificationCompleted = true;
        store.activeSas = null;
        this.checkDeviceVerified();
        toast.success('Device verified!');
      } else if (phase === VerificationPhase.Cancelled) {
        store._resetVerificationState();
        uiStore.setVerificationModalOpen(false);
      }

      if ([VerificationPhase.Done, VerificationPhase.Cancelled].includes(phase)) {
        request.off(VerificationRequestEvent.Change, checkPhase);
      }
    };

    request.on(VerificationRequestEvent.Change, checkPhase);
    checkPhase();
  }

  private setupVerifierListeners(verifier: Verifier) {
    const store = useMatrixStore();
    verifier.on(VerifierEvent.ShowSas, (sas: ShowSasCallbacks) => { store.activeSas = sas; });
    verifier.on(VerifierEvent.Cancel, () => { store._resetVerificationState(); });
    verifier.verify().catch(() => {});
  }

  async checkDeviceVerified() {
    if (!this.client) return;
    const crypto = this.client.getCrypto();
    if (!crypto) return;
    const store = useMatrixStore();

    await this.client.downloadKeysForUsers([this.client.getUserId()!]);
    store.isCrossSigningReady = await crypto.isCrossSigningReady();
    store.isSecretStorageReady = await crypto.isSecretStorageReady();
  }

  async requestVerification() {
    if (!this.client?.getCrypto()) return;
    const store = useMatrixStore();
    const uiStore = useUIStore();
    uiStore.setVerificationModalOpen(true);
    store.isRequestingVerification = true;
    try {
      const request = await this.client.getCrypto()!.requestOwnUserVerification();
      store.activeVerificationRequest = markRaw(request);
      store.isVerificationInitiatedByMe = request.initiatedByMe;
      store.verificationPhase = request.phase;
      this.attachRequestListeners(request);
    } finally {
      store.isRequestingVerification = false;
    }
  }

  async acceptVerification() {
    const store = useMatrixStore();
    if (store.activeVerificationRequest) {
      await store.activeVerificationRequest.accept();
    }
  }

  async reciprocateQrCode(data: string | Uint8ClampedArray) {
    const store = useMatrixStore();
    if (store.activeVerificationRequest) {
      const verifier = await (store.activeVerificationRequest as any).reciprocateQrCode('m.qr_code.scan.v1', data);
      this.setupVerifierListeners(verifier);
    }
  }

  async confirmSasMatch(match: boolean) {
    const store = useMatrixStore();
    if (store.activeSas) {
      store.isSasConfirming = true;
      try {
        if (match) await store.activeSas.confirm();
        else await store.activeSas.cancel();
      } finally {
        store.isSasConfirming = false;
      }
    }
  }

  async cancelVerification() {
    const store = useMatrixStore();
    if (store.activeVerificationRequest) {
      await store.activeVerificationRequest.cancel();
    }
    store._resetVerificationState();
  }

  async bootstrapVerification() {
    if (!this.client?.getCrypto()) return;
    const store = useMatrixStore();
    const uiStore = useUIStore();
    uiStore.setVerificationModalOpen(true);
    store.isRestoringHistory = true;
    try {
      await this.client.getCrypto()!.bootstrapCrossSigning({
        setupNewAfterFailure: false,
        authUploadDeviceSigningKeys: async (makeRequest: (data: any) => Promise<void>) => { await makeRequest({}); }
      } as any);
      this.checkDeviceVerified();
    } catch (e) {
      console.error('[VerificationService] Bootstrap failed', e);
    } finally {
      store.isRestoringHistory = false;
    }
  }

  async submitSecretStorageKey(key: string) {
    const store = useMatrixStore();
    if (store.secretStoragePrompt) {
      const prompt = store.secretStoragePrompt;
      store.secretStoragePrompt = null;
      prompt.promise.resolve(key);
    }
  }

  cancelSecretStorageKey() {
    const store = useMatrixStore();
    if (store.secretStoragePrompt) {
      const prompt = store.secretStoragePrompt;
      store.secretStoragePrompt = null;
      prompt.promise.reject(new Error('Cancelled'));
    }
  }

  async repairCrypto() {
    const store = useMatrixStore();
    await store._clearPersistentStores();
    window.location.reload();
  }

  async resetSecurity() {
    const matrixService = (await import('~/services/matrix.service')).MatrixService.getInstance();
    await matrixService.logout();
  }

  closeVerificationModal() {
    const store = useMatrixStore();
    const uiStore = useUIStore();
    store._resetVerificationState();
    uiStore.setVerificationModalOpen(false);
  }
}

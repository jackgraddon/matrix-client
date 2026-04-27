import { useJellyfinStore } from '~/stores/jellyfin';
import { setSecret, deleteSecret, getSecret } from '~/composables/useAppStorage';

export class JellyfinService {
  private static instance: JellyfinService;

  private constructor() {}

  public static getInstance(): JellyfinService {
    if (!JellyfinService.instance) JellyfinService.instance = new JellyfinService();
    return JellyfinService.instance;
  }

  async init() {
    const store = useJellyfinStore();
    const url = await getSecret('jellyfin_server_url');
    const token = await getSecret('jellyfin_access_token');
    const userId = await getSecret('jellyfin_user_id');
    if (url && token && userId) {
        store.setCredentials(url, token, userId);
    }
  }

  async login(url: string, token: string, userId: string) {
    const store = useJellyfinStore();
    store.setCredentials(url, token, userId);
    await setSecret('jellyfin_server_url', url);
    await setSecret('jellyfin_access_token', token);
    await setSecret('jellyfin_user_id', userId);
  }

  async logout() {
    const store = useJellyfinStore();
    store.setCredentials('', '', '');
    await deleteSecret('jellyfin_server_url');
    await deleteSecret('jellyfin_access_token');
    await deleteSecret('jellyfin_user_id');
  }
}

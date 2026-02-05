import { ClientEvent, Room } from 'matrix-js-sdk';
import { defineStore } from 'pinia';

export const useMatrixStore = defineStore('matrix', () => {
  const { $matrix: client } = useNuxtApp();

  const isReady = ref(false);
  const isAuthenticated = ref(false);
  const rooms = ref<Room[]>([]);
  const userId = ref("");
  const deviceId = ref("");
  const accessToken = ref("");
  const baseUrl = ref("");

  const startVestra = async () => {
    // Check for existing session
    const storedAccessToken = localStorage.getItem("matrix_access_token");
    const storedUserId = localStorage.getItem("matrix_user_id");
    const storedDeviceId = localStorage.getItem("matrix_device_id");
    const storedBaseUrl = localStorage.getItem("matrix_homeserver_url");

    if (!storedAccessToken || !storedUserId) {
      console.warn("No session found. Redirect to login.");
      return;
    }

    userId.value = storedUserId;
    accessToken.value = storedAccessToken;
    deviceId.value = storedDeviceId || "";
    baseUrl.value = storedBaseUrl || "";

    // Assign credentials to the existing client instance
    isAuthenticated.value = true;

    // Forcefully set credentials as properties that the SDK likely uses
    if ((client as any).setUserId) {
      (client as any).setUserId(storedUserId);
    }

    // Most Matrix SDK versions use a credentials object
    if (!(client as any).credentials) {
      (client as any).credentials = {};
    }
    (client as any).credentials.userId = storedUserId;
    (client as any).credentials.accessToken = storedAccessToken;
    (client as any).credentials.deviceId = storedDeviceId;

    // Also set direct properties if they exist
    (client as any).userId = storedUserId;
    (client as any).accessToken = storedAccessToken;

    client.on(ClientEvent.Sync, (state, prevState) => {
      console.log(`Sync: ${prevState} -> ${state}`);

      if (state === "PREPARED") {
        isReady.value = true;
        // We grab the initial list
        rooms.value = client.getRooms();
      }
    });

    // Also listen for new rooms that get created while the app is open
    client.on(ClientEvent.Room, (room) => {
      const exists = rooms.value.some(r => r.roomId === room.roomId);
      if (!exists) {
        rooms.value.push(room);
      }
    });

    // Start the client
    await client.startClient({ initialSyncLimit: 20 });
    isAuthenticated.value = true;
  };

  const logout = () => {
    localStorage.removeItem("matrix_access_token");
    localStorage.removeItem("matrix_user_id");
    localStorage.removeItem("matrix_device_id");
    localStorage.removeItem("matrix_homeserver_url");
    client.stopClient();
    client.clearStores();
    isAuthenticated.value = false;
    isReady.value = false;
    rooms.value = [];
    userId.value = "";
    deviceId.value = "";
    accessToken.value = "";
    baseUrl.value = "";
    navigateTo('/login');
  };

  return { isReady, rooms, isAuthenticated, userId, deviceId, accessToken, baseUrl, startVestra, logout };
});
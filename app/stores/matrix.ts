import { ClientEvent, Room, User } from 'matrix-js-sdk';
import { defineStore } from 'pinia';

export const useMatrixStore = defineStore('matrix', () => {
  const { $matrix: client } = useNuxtApp();

  const isReady = ref(false);
  const isAuthenticated = ref(false);
  const rooms = ref<Room[]>([]);
  const user = shallowRef<User>();
  const deviceId = ref("");
  const accessToken = ref("");
  const baseUrl = ref("");

  // Optimistic initialization from localStorage to prevent auth redirects on refresh
  if (import.meta.client) {
    const storedAccessToken = localStorage.getItem("matrix_access_token");
    if (storedAccessToken) {
      isAuthenticated.value = true;
      accessToken.value = storedAccessToken;
      const storedUserId = localStorage.getItem("matrix_user_id");
      let storedBaseUrl = localStorage.getItem("matrix_homeserver_url");

      if (storedBaseUrl && !storedBaseUrl.startsWith("http")) {
        storedBaseUrl = `https://${storedBaseUrl}`;
      }

      if (storedUserId) {
        // Create client with the correct baseUrl
        user.value = User.createUser(storedUserId, client);
        if (storedBaseUrl) {
          baseUrl.value = storedBaseUrl;
          // If the client instance allows updating baseUrl dynamically, do it here.
          // However, matrix-js-sdk client usually takes baseUrl at creation.
          // slightly hacky but might be needed if the client singleton was created with default
          (client as any).baseUrl = storedBaseUrl;
          if ((client as any).http) {
            (client as any).http.baseUrl = storedBaseUrl;
            (client as any).http.opts.baseUrl = storedBaseUrl;
          }
        }
      }
    }
  }

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

    user.value = User.createUser(storedUserId, client);
    accessToken.value = storedAccessToken;
    deviceId.value = storedDeviceId || "";

    let validBaseUrl = storedBaseUrl || "";
    if (validBaseUrl && !validBaseUrl.startsWith("http")) {
      validBaseUrl = `https://${validBaseUrl}`;
    }
    baseUrl.value = validBaseUrl;

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
    await client.stopClient(); // Ensure it's stopped before restarting with new params if needed

    // We might need to re-create the http wrapper if baseUrl changed significantly, 
    // but usually setting the property is enough if done before start.
    if (validBaseUrl) {
      (client as any).baseUrl = validBaseUrl;
      if ((client as any).http) {
        (client as any).http.baseUrl = validBaseUrl;
        (client as any).http.opts.baseUrl = validBaseUrl;
      }
    }

    await client.startClient({ initialSyncLimit: 20 });
    isAuthenticated.value = true;

    // Fetch user profile
    try {
      const profile = await client.getProfileInfo(storedUserId);
      if (profile) {
        if (user.value) {
          user.value.displayName = profile.displayname;
          user.value.rawDisplayName = profile.displayname;
          if (profile.avatar_url) {
            // Convert mxc url to http url
            user.value.avatarUrl = client.mxcUrlToHttp(profile.avatar_url, 96, 96, "crop") || "";
          }
          triggerRef(user); // Force update for shallowRef
        }
      }
    } catch (e) {
      console.error("Failed to fetch profile:", e);
    }
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
    user.value = undefined;
    deviceId.value = "";
    accessToken.value = "";
    baseUrl.value = "";
    navigateTo('/login');
  };

  return { isReady, rooms, isAuthenticated, user, deviceId, accessToken, baseUrl, startVestra, logout };
});
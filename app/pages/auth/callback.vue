<template>
  <div>
    <p>Authenticating...</p>
  </div>
</template>

<script lang="ts" setup>
import { completeOidcLogin } from "@/utils/matrix-auth";

onMounted(async () => {
  const matrixStore = useMatrixStore();
  const route = useRoute();

  const code = route.query.code as string;
  const state = route.query.state as string;
  
  if (code && state) {
    // Trade the code for an access_token
    const { tokenResponse, homeserverUrl, idTokenClaims } = await completeOidcLogin(code, state);
    
    // Verify we have a token
    if (tokenResponse.access_token) {
        localStorage.setItem("matrix_access_token", tokenResponse.access_token);
        
        // Extract device ID from scope if present
        if (tokenResponse.scope) {
            const scopeParts = tokenResponse.scope.split(' ');
            const deviceScope = scopeParts.find(s => s.startsWith('urn:matrix:org.matrix.msc2967.client:device:'));
            if (deviceScope) {
                const deviceId = deviceScope.split(':').pop();
                if (deviceId) {
                    localStorage.setItem("matrix_device_id", deviceId);
                }
            }
        }

        // Fetch the real Matrix User ID (MXID)
        // OIDC 'sub' claim might be an opaque ID (like a ULID), not the @user:domain
        try {
            const whoamiRes = await fetch(`${homeserverUrl}/_matrix/client/v3/account/whoami`, {
                headers: {
                    'Authorization': `Bearer ${tokenResponse.access_token}`
                }
            });
            if (whoamiRes.ok) {
                const data = await whoamiRes.json();
                console.log("Fetched real MXID:", data.user_id);
                localStorage.setItem("matrix_user_id", data.user_id);
            } else {
                console.error("Failed to fetch MXID, falling back to sub claim:", idTokenClaims.sub);
                localStorage.setItem("matrix_user_id", idTokenClaims.sub);
            }
        } catch (e) {
            console.error("Error fetching MXID:", e);
            localStorage.setItem("matrix_user_id", idTokenClaims.sub);
        }
    }
    
    if (homeserverUrl) {
       localStorage.setItem("matrix_homeserver_url", homeserverUrl);
    }

    // Force a reload to ensure the matrix plugin re-initializes with the new credentials
    window.location.assign('/');
  }
});
</script>
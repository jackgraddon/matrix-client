import * as sdk from "matrix-js-sdk";
import type { OidcClientConfig, ValidatedAuthMetadata } from "matrix-js-sdk";

// Helper to get config safely (prevents top-level crash)
export const getHomeserverUrl = () => {
  const config = useRuntimeConfig();
  const baseUrl = 'https://' + config.public.matrix.baseUrl;
  return baseUrl;
}

// Helper to get redirect URI safely
const getRedirectUri = () => {
  if (import.meta.client) {
    return window.location.origin + "/auth/callback";
  }
  return ""; // Fallback during SSR (won't be used)
}

// Discovery
export async function getOidcConfig(): Promise<OidcClientConfig> {
  const homeserverUrl = getHomeserverUrl();
  // Create a temp client just to fetch metadata
  const client = sdk.createClient({ baseUrl: homeserverUrl });
  return await client.getAuthMetadata();
}

// Registration
export async function registerClient(authConfig: OidcClientConfig): Promise<string> {
  const redirectUri = getRedirectUri();

  // Note: These keys must be snake_case as per OIDC spec
  return await sdk.registerOidcClient(
    authConfig,
    {
      clientName: 'Ruby Matrix Client',
      clientUri: import.meta.client ? window.location.origin : '',
      applicationType: "web",
      redirectUris: [redirectUri], // MUST match what you use in getLoginUrl
      contacts: ["jack@jackgraddon.com"],
      tosUri: import.meta.client ? window.location.origin + "/tos" : undefined,
      policyUri: import.meta.client ? window.location.origin + "/policy" : undefined,
    }
  );
}

// Generate URL
export async function getLoginUrl(
  authConfig: OidcClientConfig,
  clientId: string,
  nonce: string
): Promise<string> {
  const metadata = authConfig as unknown as ValidatedAuthMetadata;
  const homeserverUrl = getHomeserverUrl();
  const redirectUri = getRedirectUri();

  return await sdk.generateOidcAuthorizationUrl({
    metadata: metadata,
    clientId: clientId,
    redirectUri: redirectUri, // Matches registration above
    homeserverUrl: homeserverUrl,
    nonce: nonce,
  });
}

// Complete flow
export async function completeLoginFlow(authCode: string, state: string): Promise<any> {
  return await sdk.completeAuthorizationCodeGrant(authCode, state);
}
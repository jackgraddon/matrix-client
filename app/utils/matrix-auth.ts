import {
  completeAuthorizationCodeGrant,
  discoverAndValidateOIDCIssuerWellKnown,
  generateOidcAuthorizationUrl,
  registerOidcClient,
} from "matrix-js-sdk";


export const getOidcAuthUrl = async (homeserverUrl: string) => {
  // 1. Discover the OIDC issuer
  const REDIRECT_URI = `${window.location.origin}/auth/callback`;

  // Fetch .well-known/matrix/client to find the actual OIDC issuer
  // Fetch .well-known/matrix/client to find the actual OIDC issuer
  let wellKnownUrl = homeserverUrl;
  if (!wellKnownUrl.endsWith('/')) wellKnownUrl += '/';
  wellKnownUrl += '.well-known/matrix/client';

  let issuerUrl = homeserverUrl;
  try {
    const response = await fetch(wellKnownUrl);
    if (response.ok) {
      const data = await response.json();
      // Check for MSC2965 / OIDC config
      if (data['org.matrix.msc2965.authentication']?.issuer) {
        issuerUrl = data['org.matrix.msc2965.authentication'].issuer;
      }
    }
  } catch (e) {
    console.warn("Failed to fetch .well-known/matrix/client", e);
  }

  const authConfig = await discoverAndValidateOIDCIssuerWellKnown(issuerUrl);

  // 2. Client Metadata
  const clientMetadata = {
    clientName: "Ruby Client Web",
    clientUri: window.location.origin,
    redirectUris: [REDIRECT_URI] as [string, ...string[]],
    responseTypes: ["code"],
    grantTypes: ["authorization_code", "refresh_token"],
    applicationType: "web" as "web",
    contacts: [], // Optional
    tosUri: window.location.origin + "/tos", // Placeholder
    policyUri: window.location.origin + "/privacy", // Placeholder
  };

  // 3. Register Client (Dynamic Registration)
  const registration = await registerOidcClient(authConfig, clientMetadata);

  // The SDK might return the client ID directly as a string or an object
  // Cast to any to avoid "property does not exist on never" if types are wrong
  const regAny = registration as any;
  const clientId = typeof regAny === 'string' ? regAny : regAny.client_id;

  // Store clientId for later if needed, though mostly needed for the auth URL generation
  localStorage.setItem("ruby_client_client_id", clientId);
  localStorage.setItem("ruby_client_homeserver_url", homeserverUrl);

  // 4. Generate Auth URL
  const url = await generateOidcAuthorizationUrl({
    metadata: authConfig,
    redirectUri: REDIRECT_URI,
    clientId,
    homeserverUrl,
    nonce: Math.random().toString(36).substring(7), // Simple nonce for now
  });

  return url;
};

export const completeOidcLogin = async (code: string, state: string) => {
  return await completeAuthorizationCodeGrant(code, state);
};
import * as sdk from 'matrix-js-sdk';

/**
 * Connect to the homeserver URL and retrieves the supported login flows
 * @param baseUrl The URL of the homeserver (e.g. https://matrix.org)
 */

export async function getLoginFlows(baseUrl: string): Promise<any[]> {
  // Create a temporary client to get the login flows
  const client = sdk.createClient({
    baseUrl,
  });

  try {
    // Query the homeserver for supported login flows
    const response = await client.loginFlows();
    console.log("[Matrix Auth] Login flows", response.flows);
    return response.flows;
  } catch (error) {
    console.error("[Matrix Auth] Failed to get login flows", error);
    return [];
  }
}

/**
 * Detect OIDC support from login flows
 * @param flows The login flows from the homeserver
 */
export function detectOidcSupport(flows: any[]): boolean {
  const ssoFlow = flows.find((flow) => flow.type === 'm.login.sso');
  if (!ssoFlow) {
    return false;
  }
  return true;
}

/**
 * Complete an OIDC login
 */
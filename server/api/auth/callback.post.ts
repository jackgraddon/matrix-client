import { discoverOidcConfig } from '#server/utils/matrix';

interface CallbackBody {
  code: string;
  state?: string;
}

interface TokenResponse {
  accessToken: string;
  userId: string;
}

/**
 * POST /api/auth/callback
 * Handles the OIDC callback and exchanges authorization code for tokens
 */
export default defineEventHandler(async (event): Promise<TokenResponse> => {
  try {
    const body = await readBody<CallbackBody>(event);
    const { code } = body;

    if (!code) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Authorization code is required',
      });
    }

    const config = useRuntimeConfig();

    // Get OIDC configuration
    const oidcConfig = await discoverOidcConfig();

    // Exchange authorization code for tokens
    const tokenResponse = await $fetch<{
      access_token: string;
      sub: string;
      token_type: string;
      expires_in: number;
    }>(oidcConfig.token_endpoint, {
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        code: code,
        client_id: config.matrix?.clientId,
        client_secret: config.matrix?.clientSecret,
        redirect_uri: `${config.matrix?.clientUrl}${config.matrix?.redirectEndpoint}`,
      },
    });

    return {
      accessToken: tokenResponse.access_token,
      userId: tokenResponse.sub,
    };
  } catch (error) {
    console.error('OIDC callback error:', error);

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to complete authentication',
    });
  }
});
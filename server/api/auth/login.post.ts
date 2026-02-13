import { discoverOidcConfig, MATRIX_CLIENT_URL, REDIRECT_ENDPOINT, registerClient } from '#server/utils/matrix';

const config = useRuntimeConfig();

/**
 * POST /api/auth/login
 * Initiates OIDC login flow with Matrix server
 */
export default defineEventHandler(async (event) => {
    try {
        console.log("Matrix Config:", config.matrix);

        // Register the OIDC client and get the client ID
        console.log("Registering client...");
        const clientId = await registerClient();

        // Get the OIDC config for building the authorization URL
        console.log("Discovering OIDC config...");
        const oidcConfig = await discoverOidcConfig();

        console.log("Client ID:", clientId);
        console.log("OIDC Config:", oidcConfig);

        // Build the authorization URL manually
        const authorizationUrl = new URL(oidcConfig.authorization_endpoint);
        authorizationUrl.searchParams.set('client_id', clientId);
        authorizationUrl.searchParams.set('redirect_uri', `${MATRIX_CLIENT_URL}${REDIRECT_ENDPOINT}`);
        authorizationUrl.searchParams.set('response_type', 'code');
        authorizationUrl.searchParams.set('scope', 'openid profile');
        authorizationUrl.searchParams.set('response_mode', 'query');
        authorizationUrl.searchParams.set('state', 'random_state_string');
        authorizationUrl.searchParams.set('nonce', 'random_nonce_string');

        console.log("Authorization URL:", authorizationUrl.toString());

        // Redirect the user to the Matrix authorization endpoint
        return sendRedirect(event, authorizationUrl.toString());
    } catch (error) {
        console.error('OIDC login initialization failed:', error);

        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to initialize login',
        });
    }
});
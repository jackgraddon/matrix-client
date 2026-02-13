
interface CheckBody {
    baseUrl: string;
}

interface CheckResponse {
    flows: Array<{ type: string }>;
    supportedOidc: boolean;
}

/**
 * POST /api/auth/check
 * Check if a homeserver supports OIDC login
 */
export default defineEventHandler(async (event): Promise<CheckResponse> => {
    try {
        const body = await readBody<CheckBody>(event);
        const { baseUrl } = body;

        if (!baseUrl) {
            throw createError({
                statusCode: 400,
                statusMessage: 'baseUrl is required',
            });
        }

        // Fetch login flows directly from the homeserver
        const response = await $fetch<{ flows: Array<{ type: string }> }>(
            `${baseUrl}/_matrix/client/v3/login`,
            {
                method: 'GET',
            }
        );

        // Check if OIDC/SSO is supported
        const supportedOidc = response.flows.some(
            (flow) => flow.type === 'm.login.sso'
        );

        return {
            flows: response.flows,
            supportedOidc: supportedOidc,
        };
    } catch (error) {
        console.error('Auth check error:', error);

        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to check homeserver configuration',
        });
    }
});
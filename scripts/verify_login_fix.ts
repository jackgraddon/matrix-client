
// Mock the runtime config before importing the module
// Since we can't easily mock useRuntimeConfig in a standalone script without Nuxt,
// we will verify the logic by replicating it again, or by trying to import the file if possible.
// 
// However, server/utils/matrix.ts uses `useRuntimeConfig` at the top level, so it will fail to run in node without a shim.
//
// Instead, I will create a test that copies the relevant logic from matrix.ts and logic from login.post.ts
// to prove they produce the same string.

const config = {
    matrix: {
        clientUrl: 'https://localho.st:3000', // No trailing slash
        redirectEndpoint: 'api/auth/callback'  // No leading slash
    }
};

// Logic from server/utils/matrix.ts
const clientUrl = config.matrix?.clientUrl?.replace(/\/+$/, '') || '';
const redirectEndpoint = config.matrix?.redirectEndpoint?.startsWith('/') ? config.matrix?.redirectEndpoint : `/${config.matrix?.redirectEndpoint}`;
const MATRIX_CLIENT_URL = clientUrl;
const REDIRECT_ENDPOINT = redirectEndpoint;

// Logic from old server/api/auth/login.post.ts (BROKEN)
const oldRedirectUri = `${config.matrix?.clientUrl}${config.matrix?.redirectEndpoint}`;

// Logic from new server/api/auth/login.post.ts (FIXED)
const newRedirectUri = `${MATRIX_CLIENT_URL}${REDIRECT_ENDPOINT}`;

console.log('Config:', config.matrix);
console.log('Old Redirect URI (Broken):', oldRedirectUri);
console.log('New Redirect URI (Fixed):', newRedirectUri);

if (newRedirectUri === 'https://localho.st:3000/api/auth/callback') {
    console.log('PASS: New redirect URI is correct.');
} else {
    console.error('FAIL: New redirect URI is incorrect.');
    process.exit(1);
}

if (oldRedirectUri === 'https://localho.st:3000api/auth/callback') {
    console.log('Confirmed old logic was broken.');
}

/**
 * Helper to decode Base64 (handling URL-safe variants)
 */
export function decodeBase64(str: string): Uint8Array {
    const padded = str.padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Decrypts a Matrix encrypted file attachment using the Web Crypto API.
 */
export async function decryptAttachment(data: ArrayBuffer, info: any): Promise<ArrayBuffer> {
    if (!info.key || !info.iv) throw new Error('Missing key or iv');

    // Import Key
    const key = await window.crypto.subtle.importKey(
        'jwk',
        info.key,
        { name: 'AES-CTR' },
        false,
        ['encrypt', 'decrypt']
    );

    // Decode IV
    const iv = decodeBase64(info.iv);

    // Decrypt
    // Spec says: The counter must be initialized with the IV.
    // The 'length' parameter in WebCrypto AES-CTR is the number of bits in the counter block 
    // that are used for the actual counter. Matrix uses 64 (standard).
    return await window.crypto.subtle.decrypt(
        {
            name: 'AES-CTR',
            counter: iv as any, // Cast to any to avoid "SharedArrayBuffer" type mismatch
            length: 64
        },
        key,
        data
    );
}

/**
 * Fetches media from the Matrix homeserver using the authenticated MSC3916 API endpoint.
 * This is required for servers that restrict open access to _matrix/media/v3 endpoints.
 */
export async function fetchAuthenticatedDownload(client: any, mxc: string): Promise<Response> {
    if (!mxc || !mxc.startsWith('mxc://')) {
        throw new Error('Invalid MXC URL');
    }

    const mxcParts = mxc.replace('mxc://', '').split('/');
    const serverName = mxcParts[0];
    const mediaId = mxcParts[1];
    const baseUrl = client.baseUrl;

    const httpUrl = `${baseUrl}/_matrix/client/v1/media/download/${serverName}/${mediaId}`;

    const headers: Record<string, string> = {};
    const token = client.getAccessToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(httpUrl, { headers });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response;
}

/**
 * Fetches media thumbnails from the Matrix homeserver using the authenticated MSC3916 API endpoint.
 */
export async function fetchAuthenticatedThumbnail(
    client: any,
    mxc: string,
    width: number = 800,
    height: number = 600,
    resizeMethod: 'crop' | 'scale' = 'scale'
): Promise<Response> {
    if (!mxc || !mxc.startsWith('mxc://')) {
        throw new Error('Invalid MXC URL');
    }

    const mxcParts = mxc.replace('mxc://', '').split('/');
    const serverName = mxcParts[0];
    const mediaId = mxcParts[1];
    const baseUrl = client.baseUrl;

    const httpUrl = `${baseUrl}/_matrix/client/v1/media/thumbnail/${serverName}/${mediaId}?width=${width}&height=${height}&method=${resizeMethod}`;

    const headers: Record<string, string> = {};
    const token = client.getAccessToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    let response = await fetch(httpUrl, { headers });

    if (!response.ok) {
        console.warn(`Thumbnail fetch failed (${response.status}) for ${mxc}. Falling back to full download.`);
        const downloadUrl = `${baseUrl}/_matrix/client/v1/media/download/${serverName}/${mediaId}`;
        response = await fetch(downloadUrl, { headers });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} on both thumbnail and download`);
        }
    }

    return response;
}

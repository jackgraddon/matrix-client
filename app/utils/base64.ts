/**
 * Utility functions for base64 encoding and decoding.
 */

/**
 * Converts a Uint8Array or ArrayBuffer to a base64-encoded string.
 */
export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Converts a base64-encoded string to a Uint8Array.
 */
export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

/**
 * Tauri detection.
 */
export const isTauri = (typeof window !== 'undefined') && !!(window as any).__TAURI_INTERNALS__;

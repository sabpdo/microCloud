import { createHash } from 'crypto';

/**
 * Utility functions for generating SHA-256 hashes
 */

/**
 * Generates a SHA-256 hash of the provided data
 * @param data The data to hash (string, Buffer, or Uint8Array)
 * @returns A promise that resolves to the hexadecimal hash string
 */
export async function sha256(data: string | Buffer | Uint8Array): Promise<string> {
  // In Node.js, we'll use the crypto module directly
  if (typeof window === 'undefined') {
    const hash = createHash('sha256');
    hash.update(data);
    return hash.digest('hex');
  }

  // In the browser, use the Web Crypto API
  const buffer =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return bufferToHex(hashBuffer);
}

/**
 * Generates a SHA-256 hash of a file/blob
 * @param file The File or Blob to hash
 * @returns A promise that resolves to the hexadecimal hash string
 */
export async function sha256File(file: File | Blob): Promise<string> {
  if (typeof window === 'undefined') {
    // Node.js environment: read file as buffer
    const fs = await import('fs/promises');
    const buffer = await fs.readFile(file as unknown as string);
    return sha256(buffer);
  }

  // Browser environment: use FileReader
  const arrayBuffer = await file.arrayBuffer();
  return sha256(new Uint8Array(arrayBuffer));
}

/**
 * Generates a SHA-256 hash of a JSON-serializable object
 * @param obj The object to hash
 * @returns A promise that resolves to the hexadecimal hash string
 */
export async function sha256Object<T extends object>(obj: T): Promise<string> {
  // Sort object keys to ensure consistent hashing
  const sortedJson = JSON.stringify(obj, Object.keys(obj).sort());
  return sha256(sortedJson);
}

/**
 * Converts an ArrayBuffer to a hexadecimal string
 * @param buffer The buffer to convert
 * @returns A hexadecimal string representation of the buffer
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Export a sync version for Node.js environments
export const sha256Sync =
  typeof window === 'undefined'
    ? (data: string | Buffer | Uint8Array): string => {
        const hash = createHash('sha256');
        hash.update(data);
        return hash.digest('hex');
      }
    : null;

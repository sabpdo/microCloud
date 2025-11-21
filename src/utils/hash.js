'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
exports.sha256Sync = void 0;
exports.sha256 = sha256;
exports.sha256File = sha256File;
exports.sha256Object = sha256Object;
const crypto_1 = require('crypto');
/**
 * Utility functions for generating SHA-256 hashes
 */
/**
 * Generates a SHA-256 hash of the provided data
 * @param data The data to hash (string, Buffer, or Uint8Array)
 * @returns A promise that resolves to the hexadecimal hash string
 */
async function sha256(data) {
  // In Node.js, we'll use the crypto module directly
  if (typeof window === 'undefined') {
    const hash = (0, crypto_1.createHash)('sha256');
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
async function sha256File(file) {
  if (typeof window === 'undefined') {
    // Node.js environment: read file as buffer
    const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
    const buffer = await fs.readFile(file);
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
async function sha256Object(obj) {
  // Sort object keys to ensure consistent hashing
  const sortedJson = JSON.stringify(obj, Object.keys(obj).sort());
  return sha256(sortedJson);
}
/**
 * Converts an ArrayBuffer to a hexadecimal string
 * @param buffer The buffer to convert
 * @returns A hexadecimal string representation of the buffer
 */
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
// Export a sync version for Node.js environments
exports.sha256Sync =
  typeof window === 'undefined'
    ? (data) => {
        const hash = (0, crypto_1.createHash)('sha256');
        hash.update(data);
        return hash.digest('hex');
      }
    : null;

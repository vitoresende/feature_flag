import type { EncryptedTokenBlob } from "../types/codeReferences";

// OWASP-recommended PBKDF2-HMAC-SHA256 iterations
export const VAULT_PBKDF2_ITERATIONS = 600_000;
export const MIN_VAULT_PASSPHRASE_LENGTH = 10;

const SALT_BYTES = 16;
const IV_BYTES = 12;

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "Web Crypto API indisponível neste navegador (verifique se está usando HTTPS ou localhost)."
    );
  }
  return subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();

  const keyMaterial = await subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a plaintext token end-to-end inside the browser before saving to Firestore.
 * The passphrase NEVER leaves browser RAM.
 */
export async function encryptTokenWithPassphrase(
  plaintext: string,
  passphrase: string
): Promise<EncryptedTokenBlob> {
  if (passphrase.length < MIN_VAULT_PASSPHRASE_LENGTH) {
    throw new Error(
      `A senha do cofre deve ter pelo menos ${MIN_VAULT_PASSPHRASE_LENGTH} caracteres.`
    );
  }

  const subtle = getSubtleCrypto();
  const salt = new Uint8Array(new ArrayBuffer(SALT_BYTES));
  const iv = new Uint8Array(new ArrayBuffer(IV_BYTES));
  globalThis.crypto.getRandomValues(salt);
  globalThis.crypto.getRandomValues(iv);

  const key = await deriveAesKey(passphrase, salt, VAULT_PBKDF2_ITERATIONS);
  const encoded = new TextEncoder().encode(plaintext);
  const encryptedBuf = await subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  return {
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuf)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    iterations: VAULT_PBKDF2_ITERATIONS,
    algorithm: "AES-256-GCM",
  };
}

/**
 * Decrypts a stored token using the user's vault passphrase.
 * Throws a clear error if the passphrase is incorrect or data was tampered with.
 */
export async function decryptTokenWithPassphrase(
  blob: EncryptedTokenBlob,
  passphrase: string
): Promise<string> {
  const subtle = getSubtleCrypto();
  const salt = base64ToBytes(blob.salt);
  const iv = base64ToBytes(blob.iv);
  const ciphertext = base64ToBytes(blob.ciphertext);
  const iterations = blob.iterations || VAULT_PBKDF2_ITERATIONS;

  const key = await deriveAesKey(passphrase, salt, iterations);
  try {
    const decryptedBuf = await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decryptedBuf);
  } catch {
    throw new Error("Senha do cofre incorreta para descriptografar o token.");
  }
}

export function buildTokenHint(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

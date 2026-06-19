// Symmetric encryption for locker files at rest.
// Uses NaCl secretbox with a 32-byte key from process.env.LOCKER_SECRET
// (base64). If the key is absent/invalid, files are stored as-is (the database
// is still encrypted at rest by the provider) — so the locker keeps working.
//
// IMPORTANT: keep LOCKER_SECRET stable. If it changes, previously stored files
// can no longer be decrypted.
const nacl = require('tweetnacl');

function getKey() {
  const b64 = process.env.LOCKER_SECRET || '';
  if (!b64) return null;
  try {
    const k = Buffer.from(b64, 'base64');
    return k.length === 32 ? new Uint8Array(k) : null;
  } catch {
    return null;
  }
}

function encryptBuffer(buf) {
  const key = getKey();
  if (!key) return { data: buf, nonce: null, encrypted: false };
  const nonce = nacl.randomBytes(24);
  const box = nacl.secretbox(new Uint8Array(buf), nonce, key);
  return {
    data: Buffer.from(box),
    nonce: Buffer.from(nonce).toString('base64'),
    encrypted: true,
  };
}

function decryptBuffer(data, nonceB64, encrypted) {
  if (!encrypted) return data; // stored as plaintext
  const key = getKey();
  if (!key || !nonceB64) throw new Error('Locker key unavailable for decryption');
  const nonce = new Uint8Array(Buffer.from(nonceB64, 'base64'));
  const opened = nacl.secretbox.open(new Uint8Array(data), nonce, key);
  if (!opened) throw new Error('Locker decryption failed');
  return Buffer.from(opened);
}

module.exports = { encryptBuffer, decryptBuffer };

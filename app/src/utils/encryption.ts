import tweetnacl from 'tweetnacl';
import { decodeUTF8, encodeUTF8 } from 'tweetnacl-util';
import * as Crypto from 'expo-crypto';

// React Native lacks a built-in window.crypto.getRandomValues. Wire tweetnacl's
// PRNG to expo-crypto so randomBytes() works for E2E key/nonce generation.
if (!(tweetnacl as any).__novaPrngSet) {
  tweetnacl.setPRNG((x: Uint8Array, n: number) => {
    const random = Crypto.getRandomBytes(n);
    for (let i = 0; i < n; i++) x[i] = random[i];
  });
  (tweetnacl as any).__novaPrngSet = true;
}

/**
 * Client-side encryption utility for Nova Chat
 * Uses TweetNaCl.js for E2E encryption
 */

export const EncryptionUtils = {
  /**
   * Encrypt a message using recipient's public key
   */
  encryptMessage: (message: string, senderSecretKey: string, recipientPublicKey: string) => {
    try {
      const nonce = tweetnacl.randomBytes(tweetnacl.box.nonceLength);
      const messageUint8 = decodeUTF8(message);

      const secretKeyBuffer = Buffer.from(senderSecretKey, 'base64');
      const publicKeyBuffer = Buffer.from(recipientPublicKey, 'base64');

      const encryptedMessage = tweetnacl.box(
        messageUint8,
        nonce,
        publicKeyBuffer,
        secretKeyBuffer
      );

      return {
        ciphertext: Buffer.from(encryptedMessage).toString('base64'),
        nonce: Buffer.from(nonce).toString('base64')
      };
    } catch (error: any) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  },

  /**
   * Decrypt a message using sender's public key
   */
  decryptMessage: (encryptedData: any, senderPublicKey: string, recipientSecretKey: string) => {
    try {
      const ciphertextBuffer = Buffer.from(encryptedData.ciphertext, 'base64');
      const nonceBuffer = Buffer.from(encryptedData.nonce, 'base64');
      const publicKeyBuffer = Buffer.from(senderPublicKey, 'base64');
      const secretKeyBuffer = Buffer.from(recipientSecretKey, 'base64');

      const decryptedMessage = tweetnacl.box.open(
        ciphertextBuffer,
        nonceBuffer,
        publicKeyBuffer,
        secretKeyBuffer
      );

      if (!decryptedMessage) {
        throw new Error('Message could not be decrypted');
      }

      return encodeUTF8(decryptedMessage);
    } catch (error: any) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  },

  /**
   * Encrypt message for group using symmetric key
   */
  encryptGroupMessage: (message: string, groupKey: string) => {
    try {
      const nonce = tweetnacl.randomBytes(tweetnacl.secretbox.nonceLength);
      const messageUint8 = decodeUTF8(message);
      const keyBuffer = Buffer.from(groupKey, 'base64');

      const encryptedMessage = tweetnacl.secretbox(messageUint8, nonce, keyBuffer);

      return {
        ciphertext: Buffer.from(encryptedMessage).toString('base64'),
        nonce: Buffer.from(nonce).toString('base64')
      };
    } catch (error: any) {
      throw new Error(`Group encryption failed: ${error.message}`);
    }
  },

  /**
   * Decrypt group message
   */
  decryptGroupMessage: (encryptedData: any, groupKey: string) => {
    try {
      const ciphertextBuffer = Buffer.from(encryptedData.ciphertext, 'base64');
      const nonceBuffer = Buffer.from(encryptedData.nonce, 'base64');
      const keyBuffer = Buffer.from(groupKey, 'base64');

      const decryptedMessage = tweetnacl.secretbox.open(
        ciphertextBuffer,
        nonceBuffer,
        keyBuffer
      );

      if (!decryptedMessage) {
        throw new Error('Group message could not be decrypted');
      }

      return encodeUTF8(decryptedMessage);
    } catch (error: any) {
      throw new Error(`Group decryption failed: ${error.message}`);
    }
  }
};

export default EncryptionUtils;

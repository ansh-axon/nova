const nacl = require('tweetnacl');
const { v4: uuidv4 } = require('uuid');

/**
 * Encryption utility using NaCl (TweetNaCl.js)
 * Provides end-to-end encryption for messages
 */

class EncryptionManager {
  /**
   * Generate a keypair for a user
   */
  static generateKeyPair() {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
      secretKey: Buffer.from(keyPair.secretKey).toString('base64')
    };
  }

  /**
   * Encrypt a message using recipient's public key
   * Uses the sender's secret key and recipient's public key
   */
  static encryptMessage(message, senderSecretKey, recipientPublicKey) {
    try {
      const nonce = nacl.randomBytes(nacl.box.nonceLength);
      const messageUint8 = Buffer.from(message, 'utf8');
      
      const secretKeyBuffer = Buffer.from(senderSecretKey, 'base64');
      const publicKeyBuffer = Buffer.from(recipientPublicKey, 'base64');
      
      const encryptedMessage = nacl.box(
        messageUint8,
        nonce,
        publicKeyBuffer,
        secretKeyBuffer
      );

      return {
        ciphertext: Buffer.from(encryptedMessage).toString('base64'),
        nonce: Buffer.from(nonce).toString('base64')
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt a message
   */
  static decryptMessage(encryptedData, senderPublicKey, recipientSecretKey) {
    try {
      const ciphertextBuffer = Buffer.from(encryptedData.ciphertext, 'base64');
      const nonceBuffer = Buffer.from(encryptedData.nonce, 'base64');
      const publicKeyBuffer = Buffer.from(senderPublicKey, 'base64');
      const secretKeyBuffer = Buffer.from(recipientSecretKey, 'base64');

      const decryptedMessage = nacl.box.open(
        ciphertextBuffer,
        nonceBuffer,
        publicKeyBuffer,
        secretKeyBuffer
      );

      if (!decryptedMessage) {
        throw new Error('Decryption failed: message could not be decrypted');
      }

      return Buffer.from(decryptedMessage).toString('utf8');
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt message for group (using symmetric encryption)
   * All group members get a group key
   */
  static generateGroupKey() {
    const key = nacl.randomBytes(32);
    return Buffer.from(key).toString('base64');
  }

  /**
   * Encrypt for group using symmetric key
   */
  static encryptGroupMessage(message, groupKey) {
    try {
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const messageUint8 = Buffer.from(message, 'utf8');
      const keyBuffer = Buffer.from(groupKey, 'base64');

      const encryptedMessage = nacl.secretbox(messageUint8, nonce, keyBuffer);

      return {
        ciphertext: Buffer.from(encryptedMessage).toString('base64'),
        nonce: Buffer.from(nonce).toString('base64')
      };
    } catch (error) {
      throw new Error(`Group encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt group message
   */
  static decryptGroupMessage(encryptedData, groupKey) {
    try {
      const ciphertextBuffer = Buffer.from(encryptedData.ciphertext, 'base64');
      const nonceBuffer = Buffer.from(encryptedData.nonce, 'base64');
      const keyBuffer = Buffer.from(groupKey, 'base64');

      const decryptedMessage = nacl.secretbox.open(
        ciphertextBuffer,
        nonceBuffer,
        keyBuffer
      );

      if (!decryptedMessage) {
        throw new Error('Group decryption failed');
      }

      return Buffer.from(decryptedMessage).toString('utf8');
    } catch (error) {
      throw new Error(`Group decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate a verification code (for key verification UI)
   */
  static generateVerificationCode(publicKey) {
    const hash = nacl.hash(Buffer.from(publicKey, 'base64'));
    return Buffer.from(hash).toString('hex').substring(0, 12).toUpperCase();
  }
}

module.exports = EncryptionManager;

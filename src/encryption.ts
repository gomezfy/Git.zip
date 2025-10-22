import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  
  if (!secret) {
    throw new Error(
      'ENCRYPTION_SECRET não configurado! ' +
      'Configure uma chave segura nas Secrets do Replit para proteger os tokens GitHub.'
    );
  }
  
  if (secret.length < 32) {
    throw new Error(
      'ENCRYPTION_SECRET deve ter no mínimo 32 caracteres para segurança adequada.'
    );
  }
  
  const salt = crypto
    .createHash('sha256')
    .update('discord-github-bot-salt-v1')
    .digest();

  return crypto.pbkdf2Sync(secret, salt, 100000, KEY_LENGTH, 'sha256');
}

export function encryptToken(token: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    const result = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    
    return result;
  } catch (error: any) {
    console.error('Erro ao criptografar token:', error);
    throw new Error('Falha ao criptografar token de segurança');
  }
}

export function decryptToken(encryptedData: string): string {
  try {
    const key = getEncryptionKey();
    
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de token criptografado inválido');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error: any) {
    console.error('Erro ao descriptografar token:', error);
    throw new Error('Falha ao descriptografar token de segurança');
  }
}

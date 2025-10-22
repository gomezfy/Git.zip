import { promises as fs } from 'fs';
import path from 'path';
import { encryptToken, decryptToken } from './encryption.js';

interface UserTokenData {
  discordUserId: string;
  githubToken: string;
  githubUsername?: string;
  registeredAt: string;
}

interface UserTokensDatabase {
  [discordUserId: string]: UserTokenData;
}

const TOKENS_FILE = path.join(process.cwd(), 'data', 'user_tokens.json');
const LOCK_FILE = path.join(process.cwd(), 'data', 'user_tokens.lock');
const LOCK_TIMEOUT = 5000; // 5 seconds max wait for lock

// Simple file-based locking mechanism
class FileLock {
  private lockPath: string;
  private acquired: boolean = false;
  
  constructor(lockPath: string) {
    this.lockPath = lockPath;
  }
  
  async acquire(): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < LOCK_TIMEOUT) {
      try {
        // Try to create lock file exclusively (fails if exists)
        await fs.writeFile(this.lockPath, process.pid.toString(), { flag: 'wx' });
        this.acquired = true;
        return;
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // Lock exists, check if it's stale
          try {
            const lockContent = await fs.readFile(this.lockPath, 'utf-8');
            const lockAge = Date.now() - (await fs.stat(this.lockPath)).mtimeMs;
            
            // If lock is older than timeout, it's stale - remove it
            if (lockAge > LOCK_TIMEOUT) {
              await fs.unlink(this.lockPath).catch(() => {});
            }
          } catch {
            // Lock file disappeared, try again
          }
          
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 50));
        } else {
          throw error;
        }
      }
    }
    
    throw new Error('Failed to acquire file lock: timeout');
  }
  
  async release(): Promise<void> {
    if (this.acquired) {
      try {
        await fs.unlink(this.lockPath);
      } catch (error: any) {
        // Ignore errors on release
        if (error.code !== 'ENOENT') {
          console.warn('Failed to release lock:', error.message);
        }
      }
      this.acquired = false;
    }
  }
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const lock = new FileLock(LOCK_FILE);
  try {
    await lock.acquire();
    return await fn();
  } finally {
    await lock.release();
  }
}

async function ensureDataDir(): Promise<void> {
  const dataDir = path.dirname(TOKENS_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

async function loadTokens(): Promise<UserTokensDatabase> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(TOKENS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function saveTokens(tokens: UserTokensDatabase): Promise<void> {
  await ensureDataDir();
  
  // Write to temp file first, then atomic rename
  const tempFile = TOKENS_FILE + '.tmp';
  await fs.writeFile(tempFile, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  await fs.rename(tempFile, TOKENS_FILE);
  
  // Ensure restrictive permissions on final file
  await fs.chmod(TOKENS_FILE, 0o600);
}

export async function saveUserToken(
  discordUserId: string,
  githubToken: string,
  githubUsername?: string
): Promise<void> {
  await withLock(async () => {
    const tokens = await loadTokens();
    const encryptedToken = encryptToken(githubToken);
    tokens[discordUserId] = {
      discordUserId,
      githubToken: encryptedToken,
      githubUsername,
      registeredAt: new Date().toISOString(),
    };
    await saveTokens(tokens);
  });
}

export async function getUserToken(discordUserId: string): Promise<string | null> {
  const tokens = await loadTokens();
  const encryptedToken = tokens[discordUserId]?.githubToken;
  if (!encryptedToken) {
    return null;
  }
  try {
    return decryptToken(encryptedToken);
  } catch (error) {
    console.error(`Erro ao descriptografar token para usuário ${discordUserId}:`, error);
    return null;
  }
}

export async function getUserData(discordUserId: string): Promise<UserTokenData | null> {
  const tokens = await loadTokens();
  return tokens[discordUserId] || null;
}

export async function removeUserToken(discordUserId: string): Promise<boolean> {
  return await withLock(async () => {
    const tokens = await loadTokens();
    if (tokens[discordUserId]) {
      delete tokens[discordUserId];
      await saveTokens(tokens);
      return true;
    }
    return false;
  });
}

export async function hasUserToken(discordUserId: string): Promise<boolean> {
  const token = await getUserToken(discordUserId);
  return token !== null;
}

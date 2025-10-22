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
  await fs.writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf-8');
}

export async function saveUserToken(
  discordUserId: string,
  githubToken: string,
  githubUsername?: string
): Promise<void> {
  const tokens = await loadTokens();
  const encryptedToken = encryptToken(githubToken);
  tokens[discordUserId] = {
    discordUserId,
    githubToken: encryptedToken,
    githubUsername,
    registeredAt: new Date().toISOString(),
  };
  await saveTokens(tokens);
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
  const tokens = await loadTokens();
  if (tokens[discordUserId]) {
    delete tokens[discordUserId];
    await saveTokens(tokens);
    return true;
  }
  return false;
}

export async function hasUserToken(discordUserId: string): Promise<boolean> {
  const token = await getUserToken(discordUserId);
  return token !== null;
}

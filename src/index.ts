import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  EmbedBuilder,
  Attachment,
} from 'discord.js';
import { Octokit } from '@octokit/rest';
import https from 'https';
import http from 'http';
import AdmZip from 'adm-zip';
import { saveUserToken, getUserToken, removeUserToken, hasUserToken, getUserData } from './userTokens.js';
import { initEncryption } from './encryption.js';

interface ConnectionSettings {
  settings: {
    access_token?: string;
    expires_at?: string;
    oauth?: {
      credentials?: {
        access_token?: string;
      };
    };
  };
}

let githubConnectionSettings: ConnectionSettings | null = null;

async function getGitHubAccessToken(): Promise<string> {
  if (
    githubConnectionSettings &&
    githubConnectionSettings.settings.expires_at &&
    new Date(githubConnectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return githubConnectionSettings.settings.access_token!;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        Accept: 'application/json',
        X_REPLIT_TOKEN: xReplitToken,
      },
    }
  );

  const data: any = await response.json();
  githubConnectionSettings = data.items?.[0];

  const accessToken =
    githubConnectionSettings?.settings?.access_token ||
    githubConnectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!githubConnectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

function createDiscordClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
    ],
  });
  return client;
}

async function getGitHubClient(): Promise<Octokit> {
  const accessToken = await getGitHubAccessToken();
  return new Octokit({ auth: accessToken });
}

async function getUserGitHubClient(discordUserId: string): Promise<Octokit | null> {
  const token = await getUserToken(discordUserId);
  if (!token) {
    return null;
  }
  return new Octokit({ auth: token });
}

async function verifyGitHubToken(token: string): Promise<{ valid: boolean; username?: string; error?: string; scopes?: string[] }> {
  try {
    const octokit = new Octokit({ auth: token });
    
    // Get user info and check token scopes
    const response = await octokit.request('GET /user');
    const user = response.data;
    
    // GitHub returns scopes in the X-OAuth-Scopes header
    const scopes = response.headers['x-oauth-scopes']?.split(',').map(s => s.trim()) || [];
    
    // Check if token has required 'repo' scope
    const hasRepoScope = scopes.includes('repo') || 
                         scopes.includes('public_repo') ||
                         scopes.some(s => s.startsWith('repo:'));
    
    if (!hasRepoScope) {
      return { 
        valid: false, 
        error: 'Token does not have required "repo" scope. Please generate a new token with repository access.',
        scopes
      };
    }
    
    return { valid: true, username: user.login, scopes };
  } catch (error: any) {
    return { valid: false, error: sanitizeErrorMessage(error) };
  }
}

async function downloadFile(url: string): Promise<Buffer> {
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit
  const DOWNLOAD_TIMEOUT = 60000; // 60 seconds timeout
  
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const timeoutId = setTimeout(() => {
      request.destroy();
      reject(new Error('Download timeout: file took too long to download'));
    }, DOWNLOAD_TIMEOUT);
    
    const request = protocol
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          clearTimeout(timeoutId);
          response.destroy();
          reject(new Error(`Failed to download file: ${response.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        let totalSize = 0;
        
        response.on('data', (chunk: Buffer) => {
          totalSize += chunk.length;
          
          if (totalSize > MAX_FILE_SIZE) {
            clearTimeout(timeoutId);
            response.destroy();
            reject(new Error(`File too large: exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`));
            return;
          }
          
          chunks.push(chunk);
        });
        
        response.on('end', () => {
          clearTimeout(timeoutId);
          resolve(Buffer.concat(chunks));
        });
        
        response.on('error', (error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
      })
      .on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    
    request.setTimeout(DOWNLOAD_TIMEOUT, () => {
      request.destroy();
      reject(new Error('Request timeout: connection timed out'));
    });
  });
}

function isZipFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.zip');
}

async function ensureRepoHasContent(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<void> {
  try {
    await octokit.repos.getContent({
      owner,
      repo,
      path: '',
    });
  } catch (error: any) {
    if (error.status === 404) {
      const readmeContent = Buffer.from(
        '# ' + repo + '\n\nRepositório criado automaticamente pelo Discord Bot para armazenar uploads.'
      ).toString('base64');

      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: 'README.md',
        message: 'Inicialização do repositório',
        content: readmeContent,
      });

      console.log(`📝 Repositório inicializado com README.md`);
    }
  }
}

function createProgressBar(progress: number, total: number = 100): string {
  const barLength = 20;
  const filled = Math.round((progress / total) * barLength);
  const empty = barLength - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percentage = Math.round((progress / total) * 100);
  return `\`\`\`ansi\n\u001b[36;1m${bar}\u001b[0m ${percentage}%\n\`\`\``;
}

function isValidPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  
  // Decode URL encoding to check for hidden traversal attempts
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false; // Invalid encoding
  }
  
  // Check for path traversal patterns (including encoded versions)
  const dangerousPatterns = [
    /\.\./,           // Direct ..
    /%2e%2e/i,        // URL encoded ..
    /%252e%252e/i,    // Double encoded ..
    /\.\%2e/i,        // Mixed encoding
    /%2e\./i,         // Mixed encoding
    /\0/,             // Null bytes
    /[\x00-\x1f]/,    // Control characters
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(path) || pattern.test(decoded)) {
      return false;
    }
  }
  
  // Check for absolute paths
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
    return false;
  }
  
  // Check for backslashes (Windows paths)
  if (path.includes('\\')) {
    return false;
  }
  
  return true;
}

function normalizePath(path: string): string {
  if (!isValidPath(path)) {
    throw new Error('Invalid or potentially dangerous path detected');
  }
  
  let normalized = path
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .trim();
  
  const parts = normalized.split('/').filter(part => part !== '.' && part !== '..' && part !== '');
  
  return parts.join('/');
}

function findCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return '';
  if (paths.length === 1) {
    const parts = paths[0].split('/');
    return parts.length > 1 ? parts[0] + '/' : '';
  }
  
  const sortedPaths = paths.slice().sort();
  const first = sortedPaths[0].split('/');
  const last = sortedPaths[sortedPaths.length - 1].split('/');
  
  let i = 0;
  while (i < first.length && i < last.length && first[i] === last[i]) {
    i++;
  }
  
  return i > 0 && first[0] === last[0] ? first.slice(0, i).join('/') + '/' : '';
}

async function uploadZipContentsToGitHub(
  octokit: Octokit,
  owner: string,
  repo: string,
  folderPath: string,
  zipBuffer: Buffer,
  authorTag: string,
  progressCallback?: (current: number, total: number, fileName: string) => Promise<void>
): Promise<{ totalFiles: number; uploadedFiles: number; failedFiles: string[] }> {
  const MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024; // 500MB uncompressed limit
  const MAX_COMPRESSION_RATIO = 100; // Max 100:1 compression ratio
  const MAX_FILES = 10000; // Max 10k files to prevent resource exhaustion
  
  const zip = new AdmZip(zipBuffer);
  const allEntries = zip.getEntries();
  
  // ZIP bomb protection: check total uncompressed size and file count
  let totalUncompressedSize = 0;
  let fileCount = 0;
  
  for (const entry of allEntries) {
    if (!entry.isDirectory) {
      fileCount++;
      totalUncompressedSize += entry.header.size;
      
      // Check compression ratio for individual files
      const compressedSize = entry.header.compressedSize;
      if (compressedSize > 0) {
        const ratio = entry.header.size / compressedSize;
        if (ratio > MAX_COMPRESSION_RATIO) {
          throw new Error(
            `ZIP bomb detected: file "${entry.entryName}" has suspicious compression ratio (${ratio.toFixed(1)}:1)`
          );
        }
      }
    }
  }
  
  if (fileCount > MAX_FILES) {
    throw new Error(`ZIP contains too many files (${fileCount}). Maximum allowed: ${MAX_FILES}`);
  }
  
  if (totalUncompressedSize > MAX_UNCOMPRESSED_SIZE) {
    const sizeMB = (totalUncompressedSize / 1024 / 1024).toFixed(2);
    const maxMB = (MAX_UNCOMPRESSED_SIZE / 1024 / 1024).toFixed(0);
    throw new Error(`ZIP bomb detected: total uncompressed size (${sizeMB}MB) exceeds limit (${maxMB}MB)`);
  }
  
  let zipEntries = allEntries.filter(entry => {
    if (entry.isDirectory) return false;
    
    const name = entry.entryName.toLowerCase();
    const originalName = entry.entryName;
    
    // System files
    if (name.startsWith('__macosx/') || name.includes('/__macosx/')) return false;
    if (name.startsWith('.ds_store') || name.includes('/.ds_store')) return false;
    if (name === 'thumbs.db' || name.endsWith('/thumbs.db')) return false;
    
    // Version control
    if (name.startsWith('.git/') || name.includes('/.git/')) return false;
    if (name.startsWith('.svn/') || name.includes('/.svn/')) return false;
    
    // Replit specific files
    if (name.startsWith('.replit') || name.includes('/.replit')) return false;
    if (name.startsWith('.local/') || name.includes('/.local/')) return false;
    if (name.startsWith('.cache/') || name.includes('/.cache/')) return false;
    if (name.startsWith('.config/replit/') || name.includes('/.config/replit/')) return false;
    if (name.includes('.agent_state_')) return false;
    if (name.includes('replit/agent/')) return false;
    
    // IDE files
    if (name.startsWith('.vscode/') || name.includes('/.vscode/')) return false;
    if (name.startsWith('.idea/') || name.includes('/.idea/')) return false;
    
    // Temporary files
    if (name.endsWith('.tmp') || name.endsWith('.temp')) return false;
    if (name.endsWith('~') || name.startsWith('~')) return false;
    
    return true;
  });

  const commonPrefix = findCommonPrefix(zipEntries.map(e => e.entryName));

  const totalFiles = zipEntries.length;
  let uploadedFiles = 0;
  const failedFiles: string[] = [];

  await ensureRepoHasContent(octokit, owner, repo);

  const BATCH_SIZE = 5;
  let lastProgressUpdate = Date.now();
  const PROGRESS_THROTTLE_MS = 1000;
  
  for (let i = 0; i < zipEntries.length; i += BATCH_SIZE) {
    const batch = zipEntries.slice(i, i + BATCH_SIZE);
    
    await Promise.all(
      batch.map(async (entry) => {
        try {
          let fileName = entry.entryName;
          
          const pathSegments = fileName.split('/');
          const hasTraversal = pathSegments.some(segment => segment === '..');
          
          if (hasTraversal || fileName.startsWith('/') || fileName.includes('\\')) {
            console.warn(`⚠️  Ignorando arquivo com caminho suspeito: ${entry.entryName}`);
            failedFiles.push(`${entry.entryName} (caminho suspeito)`);
            return;
          }
          
          if (commonPrefix && fileName.startsWith(commonPrefix)) {
            fileName = fileName.substring(commonPrefix.length);
          }
          
          fileName = normalizePath(fileName);
          
          if (!fileName) {
            console.warn(`⚠️  Ignorando arquivo com caminho vazio após normalização: ${entry.entryName}`);
            failedFiles.push(`${entry.entryName} (caminho vazio)`);
            return;
          }
          
          const fileContent = entry.getData();
          const contentBase64 = fileContent.toString('base64');

          const filepath = normalizePath(folderPath ? `${folderPath}/${fileName}` : fileName);

          let sha: string | undefined;
          let retries = 0;
          const MAX_RETRIES = 3;
          
          while (retries < MAX_RETRIES) {
            try {
              // Get current file SHA if it exists
              try {
                const { data: existingFile } = await octokit.repos.getContent({
                  owner,
                  repo,
                  path: filepath,
                });

                if (!Array.isArray(existingFile) && 'sha' in existingFile) {
                  sha = existingFile.sha;
                }
              } catch (error: any) {
                if (error.status !== 404) throw error;
                sha = undefined; // File doesn't exist
              }

              // Try to create or update the file
              await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: filepath,
                message: `Upload: ${fileName} (enviado por ${authorTag})`,
                content: contentBase64,
                sha,
              });
              
              break; // Success, exit retry loop
              
            } catch (error: any) {
              if (error.status === 409 && retries < MAX_RETRIES - 1) {
                // SHA conflict - file was modified, retry with fresh SHA
                retries++;
                await new Promise(resolve => setTimeout(resolve, 500 * retries)); // Exponential backoff
                continue;
              }
              throw error; // Other error or max retries reached
            }
          }

          uploadedFiles++;
          
          if (progressCallback) {
            const now = Date.now();
            if (now - lastProgressUpdate >= PROGRESS_THROTTLE_MS) {
              await progressCallback(uploadedFiles, totalFiles, fileName);
              lastProgressUpdate = now;
            }
          }
        } catch (error: any) {
          console.error(`❌ Erro ao fazer upload de ${entry.entryName}:`, error.message);
          failedFiles.push(`${entry.entryName} (${error.message})`);
        }
      })
    );
  }

  if (progressCallback && totalFiles > 0 && uploadedFiles === totalFiles) {
    await progressCallback(uploadedFiles, totalFiles, 'Concluído');
  }

  return { totalFiles, uploadedFiles, failedFiles };
}

async function handleZipUpload(
  interaction: ChatInputCommandInteraction,
  attachment: Attachment,
  octokit: Octokit,
  githubUsername: string,
  repoName: string,
  folderPath: string = ''
): Promise<void> {
  const destinoDisplay = folderPath 
    ? `${githubUsername}/${repoName}/${folderPath}` 
    : `${githubUsername}/${repoName} (raiz)`;

  await interaction.editReply(
    `📤 **Iniciando extração e upload...**\n\n` +
    `📦 Arquivo ZIP: \`${attachment.name}\`\n` +
    `📁 Destino: \`${destinoDisplay}\`\n\n` +
    `🔄 Progresso:\n${createProgressBar(0)}\n` +
    `⏳ Preparando...`
  );

  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await interaction.editReply(
      `📤 **Extraindo e enviando arquivos...**\n\n` +
      `📦 Arquivo ZIP: \`${attachment.name}\`\n` +
      `📁 Destino: \`${destinoDisplay}\`\n\n` +
      `🔄 Progresso:\n${createProgressBar(10)}\n` +
      `📥 Baixando arquivo ZIP...`
    );

    console.log(`📥 Baixando arquivo: ${attachment.name}`);
    const fileContent = await downloadFile(attachment.url);
    const fileSize = fileContent.length;

    const fileSizeStr = fileSize < 1024 * 1024 
      ? `${(fileSize / 1024).toFixed(2)} KB`
      : `${(fileSize / 1024 / 1024).toFixed(2)} MB`;

    await interaction.editReply(
      `📤 **Extraindo e enviando arquivos...**\n\n` +
      `📦 Arquivo ZIP: \`${attachment.name}\` (${fileSizeStr})\n` +
      `📁 Destino: \`${destinoDisplay}\`\n\n` +
      `🔄 Progresso:\n${createProgressBar(20)}\n` +
      `📂 Extraindo conteúdo do ZIP...`
    );

    console.log(`📂 Extraindo conteúdo do ZIP e fazendo upload para GitHub...`);
    
    const uploadResult = await uploadZipContentsToGitHub(
      octokit,
      githubUsername,
      repoName,
      folderPath,
      fileContent,
      interaction.user.tag,
      async (current, total, fileName) => {
        const progress = 20 + Math.round((current / total) * 70);
        await interaction.editReply(
          `📤 **Enviando arquivos para o GitHub** ⚡\n\n` +
          `📦 Arquivo ZIP: \`${attachment.name}\` (${fileSizeStr})\n` +
          `📁 Destino: \`${destinoDisplay}\`\n\n` +
          `📄 Enviando: \`${fileName}\`\n` +
          `🔄 Progresso: ${current}/${total} arquivos\n${createProgressBar(progress)}\n` +
          `⚡ Upload paralelo (5 arquivos por vez)...`
        );
      }
    );

    const locationDisplay = folderPath 
      ? `\`${folderPath}\`` 
      : '`/ (raiz)`';

    const githubLink = folderPath
      ? `https://github.com/${githubUsername}/${repoName}/tree/main/${folderPath}`
      : `https://github.com/${githubUsername}/${repoName}`;

    let resultMessage = `✅ **Upload concluído!**\n\n` +
      `📦 Arquivo ZIP: \`${attachment.name}\` (${fileSizeStr})\n` +
      `📁 Repositório: \`${githubUsername}/${repoName}\`\n` +
      `📂 Localização: ${locationDisplay}\n\n` +
      `📊 Resultado:\n` +
      `✅ Arquivos enviados: ${uploadResult.uploadedFiles}/${uploadResult.totalFiles}\n`;

    if (uploadResult.failedFiles.length > 0) {
      resultMessage += `⚠️  Arquivos com erro: ${uploadResult.failedFiles.length}\n`;
      if (uploadResult.failedFiles.length <= 5) {
        resultMessage += `\n**Arquivos que falharam:**\n`;
        uploadResult.failedFiles.forEach((file: string) => {
          resultMessage += `• \`${file}\`\n`;
        });
      }
    }

    resultMessage += `\n🔄 Progresso:\n${createProgressBar(100)}\n` +
      `✅ Completo!\n\n` +
      `🔗 **Ver no GitHub**: ${githubLink}`;

    await interaction.editReply(resultMessage);

    console.log(`✅ Upload concluído: ${uploadResult.uploadedFiles}/${uploadResult.totalFiles} arquivos`);
  } catch (error: any) {
    console.error('❌ Erro no upload:', error);

    let errorMessage = '\n\n';

    if (error.message.includes('Not Found')) {
      errorMessage += `⚠️  O repositório \`${githubUsername}/${repoName}\` não existe.\n\n`;
      errorMessage += `📝 **Como criar o repositório:**\n`;
      errorMessage += `1. Acesse: https://github.com/new\n`;
      errorMessage += `2. Nome do repositório: \`${repoName}\`\n`;
      errorMessage += `3. Clique em "Create repository"\n`;
      errorMessage += `4. Tente enviar o arquivo novamente`;
    } else {
      errorMessage += `\`\`\`${error.message}\`\`\``;
    }

    await interaction.editReply(
      `❌ **Erro no upload!**\n\n` +
      `📦 Arquivo: \`${attachment.name}\`\n\n` +
      `🔄 Progresso:\n${createProgressBar(0)}\n` +
      `❌ Falhou` +
      errorMessage
    );
  }
}

// Registrar comandos slash
async function registerCommands(clientId: string, token: string): Promise<void> {
  const commands = [
    new SlashCommandBuilder()
      .setName('login')
      .setDescription('Fazer login com seu token GitHub')
      .addStringOption(option =>
        option.setName('token')
          .setDescription('Seu Personal Access Token do GitHub')
          .setRequired(true)
      ),
    
    new SlashCommandBuilder()
      .setName('logout')
      .setDescription('Fazer logout e remover seu token'),
    
    new SlashCommandBuilder()
      .setName('whoami')
      .setDescription('Ver informações da sua conta GitHub'),
    
    new SlashCommandBuilder()
      .setName('repos')
      .setDescription('Listar seus repositórios do GitHub (10 mais recentes)'),
    
    new SlashCommandBuilder()
      .setName('upload')
      .setDescription('Fazer upload de arquivo ZIP para seu repositório GitHub')
      .addStringOption(option =>
        option.setName('repositorio')
          .setDescription('Nome do repositório (ex: meu-projeto)')
          .setRequired(true)
      )
      .addAttachmentOption(option =>
        option.setName('arquivo')
          .setDescription('Arquivo ZIP para upload')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('pasta')
          .setDescription('Pasta de destino (opcional, deixe vazio para raiz)')
          .setRequired(false)
      ),
    
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Mostra ajuda e comandos disponíveis'),
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log('🔄 Registrando slash commands...');
    
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );

    console.log('✅ Slash commands registrados com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao registrar slash commands:', error);
  }
}

// Rate limiting
interface RateLimitEntry {
  lastCommand: number;
  commandCount: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute window
const MAX_COMMANDS_PER_WINDOW = 10; // Max 10 commands per minute
const COOLDOWN_BETWEEN_COMMANDS = 2000; // 2 seconds between commands

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  
  if (!entry) {
    rateLimitMap.set(userId, {
      lastCommand: now,
      commandCount: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    return { allowed: true };
  }
  
  // Reset counter if window expired
  if (now > entry.resetTime) {
    entry.commandCount = 1;
    entry.resetTime = now + RATE_LIMIT_WINDOW;
    entry.lastCommand = now;
    return { allowed: true };
  }
  
  // Check cooldown between commands
  const timeSinceLastCommand = now - entry.lastCommand;
  if (timeSinceLastCommand < COOLDOWN_BETWEEN_COMMANDS) {
    return { 
      allowed: false, 
      retryAfter: Math.ceil((COOLDOWN_BETWEEN_COMMANDS - timeSinceLastCommand) / 1000)
    };
  }
  
  // Check if exceeded max commands in window
  if (entry.commandCount >= MAX_COMMANDS_PER_WINDOW) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  // Allow command and increment counter
  entry.commandCount++;
  entry.lastCommand = now;
  return { allowed: true };
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime + RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(userId);
    }
  }
}, 300000); // Clean up every 5 minutes

function sanitizeErrorMessage(error: any): string {
  if (!error) return 'Unknown error';
  
  let message = error.message || String(error);
  
  // Remove potential tokens (GitHub tokens start with ghp_, gho_, ghs_, etc.)
  message = message.replace(/gh[ps]_[a-zA-Z0-9]{36,}/g, '[REDACTED_TOKEN]');
  
  // Remove Discord bot tokens
  message = message.replace(/[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g, '[REDACTED_TOKEN]');
  
  // Remove encryption secrets or keys
  message = message.replace(/secret[=:]\s*[^\s]+/gi, 'secret=[REDACTED]');
  message = message.replace(/key[=:]\s*[^\s]+/gi, 'key=[REDACTED]');
  message = message.replace(/password[=:]\s*[^\s]+/gi, 'password=[REDACTED]');
  
  // Remove file paths that might contain sensitive info
  message = message.replace(/\/home\/[^\s]+/g, '[PATH]');
  message = message.replace(/C:\\Users\\[^\s]+/g, '[PATH]');
  
  // Limit message length
  if (message.length > 500) {
    message = message.substring(0, 500) + '... [truncated]';
  }
  
  return message;
}

function validateEnvironment(): void {
  const errors: string[] = [];
  
  // Required variables
  if (!process.env.DISCORD_BOT_TOKEN) {
    errors.push('DISCORD_BOT_TOKEN is required');
  }
  
  if (!process.env.ENCRYPTION_SECRET) {
    errors.push('ENCRYPTION_SECRET is required');
  } else if (process.env.ENCRYPTION_SECRET.length < 32) {
    errors.push('ENCRYPTION_SECRET must be at least 32 characters long');
  }
  
  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(error => console.error(`   - ${error}`));
    console.error('\n📝 Required environment variables:');
    console.error('   - DISCORD_BOT_TOKEN: Your Discord bot token');
    console.error('   - ENCRYPTION_SECRET: Strong secret key (min 32 chars) for token encryption');
    throw new Error('Missing or invalid required environment variables');
  }
  
  console.log('✅ Environment variables validated');
}

async function startBot(): Promise<void> {
  console.log('🤖 Iniciando bot do Discord com Slash Commands...');

  // Validate environment before doing anything else
  validateEnvironment();
  
  // Initialize encryption with unique salt
  await initEncryption();

  const token = process.env.DISCORD_BOT_TOKEN!;

  const client = createDiscordClient();

  const isReplit = process.env.REPLIT_CONNECTORS_HOSTNAME && 
                   (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL);

  if (isReplit) {
    try {
      const octokit = await getGitHubClient();
      const { data: user } = await octokit.users.getAuthenticated();
      const githubUsername = user.login;
      console.log(`✅ Conectado ao GitHub como: ${githubUsername}`);
    } catch (error) {
      console.log('⚠️  Integração GitHub do Replit não disponível');
      console.log('✅ Modo: Autenticação individual por usuário');
    }
  } else {
    console.log('✅ Modo: Autenticação individual por usuário');
  }

  client.once('clientReady', async () => {
    console.log(`✅ Bot conectado como ${client.user?.tag}`);
    
    if (client.user) {
      await registerCommands(client.user.id, token);
    }
    
    console.log('📨 Aguardando comandos slash...');
    console.log('\n💡 Comandos disponíveis (use / no Discord):');
    console.log('   /login - Fazer login com token GitHub');
    console.log('   /logout - Fazer logout');
    console.log('   /whoami - Ver informações da conta');
    console.log('   /repos - Listar repositórios');
    console.log('   /upload - Upload de arquivo ZIP');
    console.log('   /help - Mostra ajuda completa');
    console.log(`\n🔐 Modo: Autenticação individual por usuário`);
    console.log(`📝 Cada usuário deve usar /login com seu próprio token GitHub\n`);
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // Check rate limit
    const rateLimit = checkRateLimit(interaction.user.id);
    if (!rateLimit.allowed) {
      await interaction.reply({
        content: `⏱️ **Rate limit excedido!**\n\nVocê está enviando comandos muito rápido.\nTente novamente em ${rateLimit.retryAfter} segundo(s).`,
        ephemeral: true
      });
      return;
    }

    try {
      switch (interaction.commandName) {
        case 'login':
          await handleLoginCommand(interaction);
          break;
        case 'logout':
          await handleLogoutCommand(interaction);
          break;
        case 'whoami':
          await handleWhoAmICommand(interaction);
          break;
        case 'repos':
          await handleReposCommand(interaction);
          break;
        case 'upload':
          await handleUploadCommand(interaction);
          break;
        case 'help':
          await handleHelpCommand(interaction);
          break;
      }
    } catch (error: any) {
      console.error('❌ Erro ao processar comando:', sanitizeErrorMessage(error));
      const sanitizedMessage = sanitizeErrorMessage(error);
      const errorMessage = `❌ **Erro ao processar comando**\n\n\`\`\`${sanitizedMessage}\`\`\``;
      
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(errorMessage);
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (replyError) {
        console.error('❌ Erro ao enviar mensagem de erro:', sanitizeErrorMessage(replyError));
      }
    }
  });

  client.on('error', (error: Error) => {
    console.error('❌ Erro no Discord:', sanitizeErrorMessage(error));
  });

  console.log('🔌 Conectando ao Discord...');
  await client.login(token);
}

// Handlers de comandos slash
async function handleLoginCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const token = interaction.options.getString('token', true);
  
  await interaction.deferReply({ ephemeral: true });

  const verification = await verifyGitHubToken(token);
  
  if (!verification.valid) {
    await interaction.editReply(
      `❌ **Token inválido!**\n\n` +
      `O token fornecido não é válido ou não tem as permissões necessárias.\n\n` +
      `Erro: \`${verification.error}\``
    );
    return;
  }

  try {
    await saveUserToken(interaction.user.id, token, verification.username);
    
    await interaction.editReply(
      `✅ **Login realizado com sucesso!**\n\n` +
      `👤 Usuário GitHub: \`${verification.username}\`\n` +
      `🎉 Agora você pode usar \`/upload\` para fazer upload nos seus repositórios!\n\n` +
      `💡 Use \`/repos\` para ver seus repositórios`
    );
    
    console.log(`✅ Usuário ${interaction.user.tag} autenticou como ${verification.username}`);
  } catch (error: any) {
    await interaction.editReply(`❌ Erro ao salvar token: \`${sanitizeErrorMessage(error)}\``);
  }
}

async function handleLogoutCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  const hasToken = await hasUserToken(interaction.user.id);
  
  if (!hasToken) {
    await interaction.editReply(
      `❌ Você não está autenticado!\n\n` +
      `Use \`/login\` para fazer login.`
    );
    return;
  }

  const removed = await removeUserToken(interaction.user.id);
  
  if (removed) {
    await interaction.editReply(
      `✅ **Logout realizado com sucesso!**\n\n` +
      `Seu token foi removido do sistema.\n` +
      `Use \`/login\` para fazer login novamente.`
    );
    console.log(`✅ Usuário ${interaction.user.tag} fez logout`);
  } else {
    await interaction.editReply(`❌ Erro ao remover token.`);
  }
}

async function handleWhoAmICommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  const userData = await getUserData(interaction.user.id);
  
  if (!userData) {
    await interaction.editReply(
      `❌ Você não está autenticado!\n\n` +
      `Use \`/login\` para fazer login.`
    );
    return;
  }

  const registeredDate = new Date(userData.registeredAt).toLocaleString('pt-BR');
  
  await interaction.editReply(
    `👤 **Informações da sua conta**\n\n` +
    `🐙 GitHub: \`${userData.githubUsername || 'Não disponível'}\`\n` +
    `📅 Registrado em: ${registeredDate}\n` +
    `💬 Discord: ${interaction.user.tag}`
  );
}

async function handleReposCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  
  const octokit = await getUserGitHubClient(interaction.user.id);
  
  if (!octokit) {
    await interaction.editReply(
      `❌ Você não está autenticado!\n\n` +
      `Use \`/login\` para fazer login.`
    );
    return;
  }

  try {
    const { data: user } = await octokit.users.getAuthenticated();
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 10,
    });

    if (repos.length === 0) {
      await interaction.editReply(
        `📚 **Seus Repositórios**\n\n` +
        `Você ainda não tem repositórios.\n` +
        `Crie um em: https://github.com/new`
      );
      return;
    }

    const repoList = repos
      .map((repo: any, index: number) => {
        const privacy = repo.private ? '🔒' : '🌐';
        return `${index + 1}. ${privacy} **${repo.name}**\n   ${repo.html_url}`;
      })
      .join('\n\n');

    await interaction.editReply(
      `📚 **Seus Repositórios** (10 mais recentes)\n\n` +
      `👤 Usuário: \`${user.login}\`\n\n` +
      `${repoList}\n\n` +
      `💡 Use \`/upload\` em qualquer destes repositórios!`
    );
  } catch (error: any) {
    await interaction.editReply(
      `❌ **Erro ao buscar repositórios**\n\n` +
      `\`\`\`${sanitizeErrorMessage(error)}\`\`\``
    );
  }
}

async function handleUploadCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  
  const octokit = await getUserGitHubClient(interaction.user.id);
  
  if (!octokit) {
    await interaction.editReply(
      `❌ **Você não está autenticado!**\n\n` +
      `Use \`/login\` para fazer login primeiro.\n\n` +
      `📝 **Como obter um token**:\n` +
      `1. Acesse: https://github.com/settings/tokens\n` +
      `2. Gere um novo token com permissão \`repo\`\n` +
      `3. Use: \`/login\``
    );
    return;
  }

  const repoName = interaction.options.getString('repositorio', true);
  const folderPath = interaction.options.getString('pasta') || '';
  const attachment = interaction.options.getAttachment('arquivo', true);

  if (!isZipFile(attachment.name!)) {
    await interaction.editReply(
      '❌ **Erro**: O arquivo deve ser um ZIP!\n\n' +
      `💡 Apenas arquivos com extensão \`.zip\` são aceitos.`
    );
    return;
  }

  try {
    const { data: user } = await octokit.users.getAuthenticated();
    const githubUsername = user.login;

    await handleZipUpload(
      interaction,
      attachment,
      octokit,
      githubUsername,
      repoName,
      folderPath
    );
  } catch (error: any) {
    await interaction.editReply(
      `❌ **Erro ao obter informações do usuário**\n\n` +
      `\`\`\`${sanitizeErrorMessage(error)}\`\`\`\n\n` +
      `Seu token pode estar inválido. Use \`/logout\` e \`/login\` novamente.`
    );
  }
}

async function handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  
  const isAuthenticated = await hasUserToken(interaction.user.id);
  const userData = isAuthenticated ? await getUserData(interaction.user.id) : null;
  
  let authStatus = '';
  if (isAuthenticated && userData) {
    authStatus = `\n✅ **Status**: Autenticado como \`${userData.githubUsername}\`\n`;
  } else {
    authStatus = `\n❌ **Status**: Não autenticado - Use \`/login\` primeiro\n`;
  }
  
  const helpMessage = 
    `📚 **Discord GitHub Bot - Comandos Disponíveis**\n` +
    `⚡ **Tecnologia**: Slash Commands (comandos de barra /)\n` +
    authStatus +
    `\n**Autenticação:**\n` +
    `• \`/login\` - Fazer login com seu token GitHub\n` +
    `• \`/logout\` - Fazer logout e remover seu token\n` +
    `• \`/whoami\` - Ver informações da sua conta\n\n` +
    `**Repositórios:**\n` +
    `• \`/repos\` - Listar seus repositórios\n` +
    `• \`/upload\` - Upload de ZIP extraído para repositório\n` +
    `  📂 Parâmetros:\n` +
    `     • repositorio: nome do seu repo (ex: meu-projeto)\n` +
    `     • arquivo: arquivo ZIP para upload\n` +
    `     • pasta: pasta de destino (opcional)\n` +
    `  ⚡ Arquivos existentes são substituídos automaticamente\n` +
    `  ⚡ Upload paralelo (5 arquivos por vez)\n\n` +
    `**Ajuda:**\n` +
    `• \`/help\` - Mostra esta mensagem\n\n` +
    `💡 **Dica**: Comandos \`/login\` são automaticamente privados (ephemeral)!`;

  await interaction.editReply(helpMessage);
}

startBot().catch((error: Error) => {
  console.error('❌ Erro fatal ao iniciar bot:', error);
  process.exit(1);
});

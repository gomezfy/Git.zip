import { Client, GatewayIntentBits, Message, Attachment } from 'discord.js';
import { Octokit } from '@octokit/rest';
import https from 'https';
import http from 'http';

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

async function getDiscordClient(): Promise<Client> {
  const token = process.env.DISCORD_BOT_TOKEN;
  
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN não encontrado nas variáveis de ambiente');
  }
  
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
  await client.login(token);
  return client;
}

async function getGitHubClient(): Promise<Octokit> {
  const accessToken = await getGitHubAccessToken();
  return new Octokit({ auth: accessToken });
}

async function downloadFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download file: ${response.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      })
      .on('error', reject);
  });
}

function isZipFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.zip');
}

async function uploadToGitHub(
  octokit: Octokit,
  owner: string,
  repo: string,
  filepath: string,
  content: Buffer,
  message: string
): Promise<any> {
  try {
    const contentBase64 = content.toString('base64');

    let sha: string | undefined;
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
    }

    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filepath,
      message,
      content: contentBase64,
      sha,
    });

    return data;
  } catch (error: any) {
    throw new Error(`GitHub upload error: ${error.message}`);
  }
}

async function removeOwnReaction(message: Message, emoji: string): Promise<void> {
  try {
    const reaction = message.reactions.resolve(emoji);
    if (reaction && reaction.me) {
      await reaction.users.remove(message.client.user!.id);
    }
  } catch (error: any) {
    if (error.code === 50013) {
      console.log(`Bot não tem permissão para remover reação ${emoji}`);
    } else if (error.code === 10008) {
      console.log(`Mensagem não encontrada ao remover reação ${emoji}`);
    } else {
      console.log(`Não foi possível remover reação ${emoji}: ${error.message || error}`);
    }
  }
}

async function handleZipAttachment(
  message: Message,
  attachment: Attachment,
  octokit: Octokit,
  githubUsername: string,
  repoName: string
): Promise<void> {
  let uploadSuccessful = false;
  let uploadResult: any;

  try {
    await message.react('⏳');

    console.log(`📥 Baixando arquivo: ${attachment.name}`);
    const fileContent = await downloadFile(attachment.url);

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, -5);
    const filepath = `uploads/${timestamp}_${attachment.name}`;

    console.log(`⬆️  Fazendo upload para GitHub: ${filepath}`);
    uploadResult = await uploadToGitHub(
      octokit,
      githubUsername,
      repoName,
      filepath,
      fileContent,
      `Upload: ${attachment.name} (enviado por ${message.author.tag})`
    );

    uploadSuccessful = true;
  } catch (error: any) {
    console.error('❌ Erro no upload:', error);

    await removeOwnReaction(message, '⏳');
    await message.react('❌');

    let errorMessage = '❌ **Erro ao fazer upload!**\n';

    if (error.message.includes('Not Found')) {
      errorMessage += `\n⚠️  O repositório \`${githubUsername}/${repoName}\` não existe.\n`;
      errorMessage += `\n📝 **Como criar o repositório:**\n`;
      errorMessage += `1. Acesse: https://github.com/new\n`;
      errorMessage += `2. Nome do repositório: \`${repoName}\`\n`;
      errorMessage += `3. Clique em "Create repository"\n`;
      errorMessage += `4. Tente enviar o arquivo novamente`;
    } else {
      errorMessage += `\`\`\`${error.message}\`\`\``;
    }

    await message.reply(errorMessage);
    return;
  }

  try {
    await removeOwnReaction(message, '⏳');
    await message.react('✅');

    const replyMessage =
      `✅ **Upload concluído!**\n` +
      `📦 Arquivo: \`${attachment.name}\`\n` +
      `📁 Repositório: \`${githubUsername}/${repoName}\`\n` +
      `🔗 Link: ${uploadResult.content.html_url}`;

    await message.reply(replyMessage);
    console.log(`✅ Upload concluído: ${uploadResult.content.html_url}`);
  } catch (error: any) {
    console.error('❌ Erro ao enviar confirmação:', error);
    console.log(`✅ Upload concluído (confirmação falhou): ${uploadResult.content.html_url}`);
  }
}

const COMMAND_PREFIX = '.';

async function handleHelpCommand(message: Message, githubUsername: string, repoName: string): Promise<void> {
  const helpMessage = 
    `📚 **Comandos Disponíveis**\n\n` +
    `**${COMMAND_PREFIX}upload** - Faz upload de um arquivo ZIP para o GitHub\n` +
    `   • Anexe um arquivo ZIP e use este comando\n` +
    `   • Exemplo: Envie um arquivo e digite \`${COMMAND_PREFIX}upload\`\n\n` +
    `**${COMMAND_PREFIX}help** - Mostra esta mensagem de ajuda\n\n` +
    `📁 **Repositório**: \`${githubUsername}/${repoName}\`\n` +
    `💡 **Dica**: Todos os arquivos são salvos em \`uploads/\` com timestamp`;

  await message.reply(helpMessage);
}

async function handleUploadCommand(
  message: Message,
  octokit: Octokit,
  githubUsername: string,
  repoName: string
): Promise<void> {
  if (message.attachments.size === 0) {
    await message.reply('❌ **Erro**: Você precisa anexar um arquivo ZIP para fazer upload!\n\n' +
      `💡 **Como usar**: Anexe um arquivo ZIP e digite \`${COMMAND_PREFIX}upload\``);
    return;
  }

  let hasZipFile = false;
  for (const attachment of message.attachments.values()) {
    if (isZipFile(attachment.name!)) {
      hasZipFile = true;
      await handleZipAttachment(
        message,
        attachment,
        octokit,
        githubUsername,
        repoName
      );
    }
  }

  if (!hasZipFile) {
    await message.reply('❌ **Erro**: Nenhum arquivo ZIP encontrado!\n\n' +
      `💡 Apenas arquivos com extensão \`.zip\` são aceitos.`);
  }
}

async function startBot(): Promise<void> {
  console.log('🤖 Iniciando bot do Discord...');

  const client = await getDiscordClient();
  const octokit = await getGitHubClient();

  const { data: user } = await octokit.users.getAuthenticated();
  const githubUsername = user.login;
  console.log(`✅ Conectado ao GitHub como: ${githubUsername}`);

  const GITHUB_REPO = process.env.GITHUB_REPO || 'discord-uploads';
  console.log(`📁 Repositório configurado: ${githubUsername}/${GITHUB_REPO}`);

  client.on('ready', () => {
    console.log(`✅ Bot conectado como ${client.user?.tag}`);
    console.log('📨 Aguardando comandos...');
    console.log('\n💡 Comandos disponíveis:');
    console.log(`   ${COMMAND_PREFIX}upload - Faz upload de arquivo ZIP para GitHub`);
    console.log(`   ${COMMAND_PREFIX}help - Mostra ajuda`);
    console.log(`\n📁 Repositório: ${githubUsername}/${GITHUB_REPO}\n`);
  });

  client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    if (!content.startsWith(COMMAND_PREFIX)) return;

    const args = content.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
    const command = args[0].toLowerCase();

    switch (command) {
      case 'upload':
        await handleUploadCommand(message, octokit, githubUsername, GITHUB_REPO);
        break;

      case 'help':
        await handleHelpCommand(message, githubUsername, GITHUB_REPO);
        break;

      default:
        await message.reply(
          `❌ Comando desconhecido: \`${COMMAND_PREFIX}${command}\`\n\n` +
          `Use \`${COMMAND_PREFIX}help\` para ver os comandos disponíveis.`
        );
    }
  });

  client.on('error', (error: Error) => {
    console.error('❌ Erro no Discord:', error);
  });
}

startBot().catch((error: Error) => {
  console.error('❌ Erro fatal ao iniciar bot:', error);
  process.exit(1);
});

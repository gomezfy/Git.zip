import { Client, GatewayIntentBits, Message, Attachment } from 'discord.js';
import { Octokit } from '@octokit/rest';
import https from 'https';
import http from 'http';
import { saveUserToken, getUserToken, removeUserToken, hasUserToken, getUserData } from './userTokens.js';

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
      GatewayIntentBits.DirectMessages,
    ],
  });
  await client.login(token);
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

async function verifyGitHubToken(token: string): Promise<{ valid: boolean; username?: string; error?: string }> {
  try {
    const octokit = new Octokit({ auth: token });
    const { data: user } = await octokit.users.getAuthenticated();
    return { valid: true, username: user.login };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
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

async function uploadToGitHub(
  octokit: Octokit,
  owner: string,
  repo: string,
  filepath: string,
  content: Buffer,
  message: string
): Promise<any> {
  try {
    await ensureRepoHasContent(octokit, owner, repo);

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

function createProgressBar(progress: number, total: number = 100): string {
  const barLength = 20;
  const filled = Math.round((progress / total) * barLength);
  const empty = barLength - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percentage = Math.round((progress / total) * 100);
  return `${bar} ${percentage}%`;
}

async function handleZipAttachment(
  message: Message,
  attachment: Attachment,
  octokit: Octokit,
  githubUsername: string,
  repoName: string,
  folderPath: string = 'uploads'
): Promise<void> {
  let uploadSuccessful = false;
  let uploadResult: any;
  let progressMessage: Message | null = null;
  let fileSize = 0;

  try {
    await message.react('⏳');

    progressMessage = await message.reply(
      `📤 **Iniciando upload...**\n\n` +
      `📦 Arquivo: \`${attachment.name}\`\n` +
      `📁 Destino: \`${githubUsername}/${repoName}/${folderPath}\`\n\n` +
      `🔄 Progresso:\n${createProgressBar(0)}\n` +
      `⏳ Preparando...`
    );

    await new Promise(resolve => setTimeout(resolve, 500));
    await progressMessage.edit(
      `📤 **Fazendo upload...**\n\n` +
      `📦 Arquivo: \`${attachment.name}\`\n` +
      `📁 Destino: \`${githubUsername}/${repoName}/${folderPath}\`\n\n` +
      `🔄 Progresso:\n${createProgressBar(20)}\n` +
      `📥 Baixando arquivo...`
    );

    console.log(`📥 Baixando arquivo: ${attachment.name}`);
    const fileContent = await downloadFile(attachment.url);
    fileSize = fileContent.length;

    const fileSizeStr = fileSize < 1024 * 1024 
      ? `${(fileSize / 1024).toFixed(2)} KB`
      : `${(fileSize / 1024 / 1024).toFixed(2)} MB`;

    await progressMessage.edit(
      `📤 **Fazendo upload...**\n\n` +
      `📦 Arquivo: \`${attachment.name}\` (${fileSizeStr})\n` +
      `📁 Destino: \`${githubUsername}/${repoName}/${folderPath}\`\n\n` +
      `🔄 Progresso:\n${createProgressBar(40)}\n` +
      `🔍 Verificando repositório...`
    );

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, -5);
    const filepath = `${folderPath}/${timestamp}_${attachment.name}`;

    await progressMessage.edit(
      `📤 **Fazendo upload...**\n\n` +
      `📦 Arquivo: \`${attachment.name}\` (${fileSizeStr})\n` +
      `📁 Destino: \`${githubUsername}/${repoName}/${folderPath}\`\n\n` +
      `🔄 Progresso:\n${createProgressBar(60)}\n` +
      `⬆️  Enviando para GitHub...`
    );

    console.log(`⬆️  Fazendo upload para GitHub: ${filepath}`);
    uploadResult = await uploadToGitHub(
      octokit,
      githubUsername,
      repoName,
      filepath,
      fileContent,
      `Upload: ${attachment.name} (enviado por ${message.author.tag})`
    );

    await progressMessage.edit(
      `📤 **Fazendo upload...**\n\n` +
      `📦 Arquivo: \`${attachment.name}\` (${fileSizeStr})\n` +
      `📁 Destino: \`${githubUsername}/${repoName}/${folderPath}\`\n\n` +
      `🔄 Progresso:\n${createProgressBar(90)}\n` +
      `✨ Finalizando...`
    );

    uploadSuccessful = true;
  } catch (error: any) {
    console.error('❌ Erro no upload:', error);

    if (progressMessage) {
      await progressMessage.edit(
        `❌ **Erro no upload!**\n\n` +
        `📦 Arquivo: \`${attachment.name}\`\n\n` +
        `🔄 Progresso:\n${createProgressBar(0)}\n` +
        `❌ Falhou`
      );
    }

    await removeOwnReaction(message, '⏳');
    await message.react('❌');

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

    if (progressMessage) {
      await progressMessage.edit(
        `❌ **Erro no upload!**\n\n` +
        `📦 Arquivo: \`${attachment.name}\`\n\n` +
        `🔄 Progresso:\n${createProgressBar(0)}\n` +
        `❌ Falhou` +
        errorMessage
      );
    }
    return;
  }

  try {
    await removeOwnReaction(message, '⏳');
    await message.react('✅');

    const fileSizeStr = fileSize < 1024 * 1024 
      ? `${(fileSize / 1024).toFixed(2)} KB`
      : `${(fileSize / 1024 / 1024).toFixed(2)} MB`;

    if (progressMessage) {
      await progressMessage.edit(
        `✅ **Upload concluído!**\n\n` +
        `📦 Arquivo: \`${attachment.name}\` (${fileSizeStr})\n` +
        `📁 Repositório: \`${githubUsername}/${repoName}\`\n` +
        `📂 Pasta: \`${folderPath}\`\n\n` +
        `🔄 Progresso:\n${createProgressBar(100)}\n` +
        `✅ Completo!\n\n` +
        `🔗 **Link**: ${uploadResult.content.html_url}`
      );
    }

    console.log(`✅ Upload concluído: ${uploadResult.content.html_url}`);
  } catch (error: any) {
    console.error('❌ Erro ao atualizar mensagem final:', error);
    console.log(`✅ Upload concluído (atualização falhou): ${uploadResult.content.html_url}`);
  }
}

const COMMAND_PREFIX = '.';

async function handleLoginCommand(message: Message, args: string[]): Promise<void> {
  if (args.length < 2) {
    await message.reply(
      `❌ **Erro**: Você precisa fornecer seu token GitHub!\n\n` +
      `💡 **Como usar**: \`${COMMAND_PREFIX}login <seu_token_github>\`\n\n` +
      `📝 **Como obter um token**:\n` +
      `1. Acesse: https://github.com/settings/tokens\n` +
      `2. Clique em "Generate new token" → "Generate new token (classic)"\n` +
      `3. Dê um nome (ex: "Discord Bot")\n` +
      `4. Selecione permissão: \`repo\` (acesso completo a repositórios)\n` +
      `5. Clique em "Generate token"\n` +
      `6. Copie o token e use: \`${COMMAND_PREFIX}login <token>\`\n\n` +
      `⚠️ **Atenção**: Envie o comando em DM (mensagem privada) para manter seu token seguro!`
    );
    return;
  }

  const token = args[1];
  
  await message.react('⏳');

  const verification = await verifyGitHubToken(token);
  
  if (!verification.valid) {
    await removeOwnReaction(message, '⏳');
    await message.react('❌');
    await message.reply(
      `❌ **Token inválido!**\n\n` +
      `O token fornecido não é válido ou não tem as permissões necessárias.\n\n` +
      `Erro: \`${verification.error}\``
    );
    return;
  }

  try {
    await saveUserToken(message.author.id, token, verification.username);
    
    await removeOwnReaction(message, '⏳');
    await message.react('✅');
    
    await message.reply(
      `✅ **Login realizado com sucesso!**\n\n` +
      `👤 Usuário GitHub: \`${verification.username}\`\n` +
      `🎉 Agora você pode usar \`${COMMAND_PREFIX}upload\` para fazer upload nos seus repositórios!\n\n` +
      `💡 Use \`${COMMAND_PREFIX}repos\` para ver seus repositórios`
    );
    
    console.log(`✅ Usuário ${message.author.tag} autenticou como ${verification.username}`);
    
    if (!message.guild) {
      if ('send' in message.channel) {
        await message.channel.send(
          `🗑️ Por segurança, você pode deletar a mensagem com seu token agora.`
        );
      }
    } else {
      if ('send' in message.channel) {
        await message.channel.send(
          `⚠️ **ATENÇÃO**: Token enviado em canal público! Recomendo que você:\n` +
          `1. Delete a mensagem com o token AGORA\n` +
          `2. Gere um novo token em https://github.com/settings/tokens\n` +
          `3. Revoque o token antigo\n` +
          `4. Use \`${COMMAND_PREFIX}login\` em DM (mensagem privada) da próxima vez`
        );
      }
    }
  } catch (error: any) {
    await removeOwnReaction(message, '⏳');
    await message.react('❌');
    await message.reply(`❌ Erro ao salvar token: \`${error.message}\``);
  }
}

async function handleLogoutCommand(message: Message): Promise<void> {
  const hasToken = await hasUserToken(message.author.id);
  
  if (!hasToken) {
    await message.reply(
      `❌ Você não está autenticado!\n\n` +
      `Use \`${COMMAND_PREFIX}login <token>\` para fazer login.`
    );
    return;
  }

  const removed = await removeUserToken(message.author.id);
  
  if (removed) {
    await message.react('✅');
    await message.reply(
      `✅ **Logout realizado com sucesso!**\n\n` +
      `Seu token foi removido do sistema.\n` +
      `Use \`${COMMAND_PREFIX}login\` para fazer login novamente.`
    );
    console.log(`✅ Usuário ${message.author.tag} fez logout`);
  } else {
    await message.react('❌');
    await message.reply(`❌ Erro ao remover token.`);
  }
}

async function handleWhoAmICommand(message: Message): Promise<void> {
  const userData = await getUserData(message.author.id);
  
  if (!userData) {
    await message.reply(
      `❌ Você não está autenticado!\n\n` +
      `Use \`${COMMAND_PREFIX}login <token>\` para fazer login.`
    );
    return;
  }

  const registeredDate = new Date(userData.registeredAt).toLocaleString('pt-BR');
  
  await message.reply(
    `👤 **Informações da sua conta**\n\n` +
    `🐙 GitHub: \`${userData.githubUsername || 'Não disponível'}\`\n` +
    `📅 Registrado em: ${registeredDate}\n` +
    `💬 Discord: ${message.author.tag}`
  );
}

async function handleReposCommand(message: Message, args: string[]): Promise<void> {
  const octokit = await getUserGitHubClient(message.author.id);
  
  if (!octokit) {
    await message.reply(
      `❌ Você não está autenticado!\n\n` +
      `Use \`${COMMAND_PREFIX}login <token>\` para fazer login.`
    );
    return;
  }

  await message.react('⏳');

  try {
    const { data: user } = await octokit.users.getAuthenticated();
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 10,
    });

    await removeOwnReaction(message, '⏳');
    await message.react('📚');

    if (repos.length === 0) {
      await message.reply(
        `📚 **Seus Repositórios**\n\n` +
        `Você ainda não tem repositórios.\n` +
        `Crie um em: https://github.com/new`
      );
      return;
    }

    const repoList = repos
      .map((repo, index) => {
        const privacy = repo.private ? '🔒' : '🌐';
        return `${index + 1}. ${privacy} **${repo.name}**\n   ${repo.html_url}`;
      })
      .join('\n\n');

    await message.reply(
      `📚 **Seus Repositórios** (10 mais recentes)\n\n` +
      `👤 Usuário: \`${user.login}\`\n\n` +
      `${repoList}\n\n` +
      `💡 Use \`${COMMAND_PREFIX}upload\` em qualquer destes repositórios!`
    );
  } catch (error: any) {
    await removeOwnReaction(message, '⏳');
    await message.react('❌');
    await message.reply(
      `❌ **Erro ao buscar repositórios**\n\n` +
      `\`\`\`${error.message}\`\`\``
    );
  }
}

async function handleHelpCommand(message: Message): Promise<void> {
  const isAuthenticated = await hasUserToken(message.author.id);
  const userData = isAuthenticated ? await getUserData(message.author.id) : null;
  
  let authStatus = '';
  if (isAuthenticated && userData) {
    authStatus = `\n✅ **Status**: Autenticado como \`${userData.githubUsername}\`\n`;
  } else {
    authStatus = `\n❌ **Status**: Não autenticado - Use \`${COMMAND_PREFIX}login\` primeiro\n`;
  }
  
  const helpMessage = 
    `📚 **Discord GitHub Bot - Comandos Disponíveis**\n` +
    authStatus +
    `\n**Autenticação:**\n` +
    `• \`${COMMAND_PREFIX}login <token>\` - Fazer login com seu token GitHub\n` +
    `• \`${COMMAND_PREFIX}logout\` - Fazer logout e remover seu token\n` +
    `• \`${COMMAND_PREFIX}whoami\` - Ver informações da sua conta\n\n` +
    `**Repositórios:**\n` +
    `• \`${COMMAND_PREFIX}repos\` - Listar seus repositórios\n` +
    `• \`${COMMAND_PREFIX}upload <repo> <pasta>\` - Upload de ZIP para seu repositório\n` +
    `  Exemplo: \`${COMMAND_PREFIX}upload meu-repo projetos\`\n` +
    `  (anexe um arquivo ZIP na mensagem)\n\n` +
    `**Ajuda:**\n` +
    `• \`${COMMAND_PREFIX}help\` - Mostra esta mensagem\n\n` +
    `💡 **Dica**: Use o comando \`${COMMAND_PREFIX}login\` em DM para manter seu token seguro!`;

  await message.reply(helpMessage);
}

async function handleUploadCommand(
  message: Message,
  args: string[]
): Promise<void> {
  const octokit = await getUserGitHubClient(message.author.id);
  
  if (!octokit) {
    await message.reply(
      `❌ **Você não está autenticado!**\n\n` +
      `Use \`${COMMAND_PREFIX}login <token>\` para fazer login primeiro.\n\n` +
      `📝 **Como obter um token**:\n` +
      `1. Acesse: https://github.com/settings/tokens\n` +
      `2. Gere um novo token com permissão \`repo\`\n` +
      `3. Use: \`${COMMAND_PREFIX}login <seu_token>\``
    );
    return;
  }

  if (message.attachments.size === 0) {
    await message.reply(
      '❌ **Erro**: Você precisa anexar um arquivo ZIP para fazer upload!\n\n' +
      `💡 **Como usar**: \`${COMMAND_PREFIX}upload <repositório> [pasta]\`\n\n` +
      `**Exemplos:**\n` +
      `• \`${COMMAND_PREFIX}upload meu-repo\` - Upload para raiz do repo\n` +
      `• \`${COMMAND_PREFIX}upload meu-repo projetos\` - Upload para pasta "projetos"\n\n` +
      `Anexe um arquivo ZIP na mensagem!`
    );
    return;
  }

  if (args.length < 2) {
    await message.reply(
      `❌ **Erro**: Você precisa especificar o repositório!\n\n` +
      `💡 **Como usar**: \`${COMMAND_PREFIX}upload <repositório> [pasta]\`\n\n` +
      `**Exemplos:**\n` +
      `• \`${COMMAND_PREFIX}upload meu-repo\`\n` +
      `• \`${COMMAND_PREFIX}upload meu-repo projetos\`\n\n` +
      `Use \`${COMMAND_PREFIX}repos\` para ver seus repositórios.`
    );
    return;
  }

  const repoName = args[1];
  const folderPath = args[2] || 'uploads';

  try {
    const { data: user } = await octokit.users.getAuthenticated();
    const githubUsername = user.login;

    let hasZipFile = false;
    for (const attachment of message.attachments.values()) {
      if (isZipFile(attachment.name!)) {
        hasZipFile = true;
        await handleZipAttachment(
          message,
          attachment,
          octokit,
          githubUsername,
          repoName,
          folderPath
        );
      }
    }

    if (!hasZipFile) {
      await message.reply('❌ **Erro**: Nenhum arquivo ZIP encontrado!\n\n' +
        `💡 Apenas arquivos com extensão \`.zip\` são aceitos.`);
    }
  } catch (error: any) {
    await message.react('❌');
    await message.reply(
      `❌ **Erro ao obter informações do usuário**\n\n` +
      `\`\`\`${error.message}\`\`\`\n\n` +
      `Seu token pode estar inválido. Use \`${COMMAND_PREFIX}logout\` e \`${COMMAND_PREFIX}login\` novamente.`
    );
  }
}

async function startBot(): Promise<void> {
  console.log('🤖 Iniciando bot do Discord...');

  const client = await getDiscordClient();

  // Verifica se está rodando no Replit (integração GitHub disponível)
  const isReplit = process.env.REPLIT_CONNECTORS_HOSTNAME && 
                   (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL);

  if (isReplit) {
    try {
      const octokit = await getGitHubClient();
      const { data: user } = await octokit.users.getAuthenticated();
      const githubUsername = user.login;
      console.log(`✅ Conectado ao GitHub como: ${githubUsername}`);
      const GITHUB_REPO = process.env.GITHUB_REPO || 'discord-uploads';
      console.log(`📁 Repositório configurado: ${githubUsername}/${GITHUB_REPO}`);
    } catch (error) {
      console.log('⚠️  Integração GitHub do Replit não disponível');
      console.log('✅ Modo: Autenticação individual por usuário');
    }
  } else {
    console.log('✅ Modo: Autenticação individual por usuário');
    console.log('💡 Usuários devem usar .login com seu próprio token GitHub');
  }

  client.on('ready', () => {
    console.log(`✅ Bot conectado como ${client.user?.tag}`);
    console.log('📨 Aguardando comandos...');
    console.log('\n💡 Comandos disponíveis:');
    console.log(`   ${COMMAND_PREFIX}login - Fazer login com token GitHub`);
    console.log(`   ${COMMAND_PREFIX}logout - Fazer logout`);
    console.log(`   ${COMMAND_PREFIX}whoami - Ver informações da conta`);
    console.log(`   ${COMMAND_PREFIX}repos - Listar repositórios`);
    console.log(`   ${COMMAND_PREFIX}upload <repo> [pasta] - Upload de arquivo ZIP`);
    console.log(`   ${COMMAND_PREFIX}help - Mostra ajuda completa`);
    console.log(`\n🔐 Modo: Autenticação individual por usuário`);
    console.log(`📝 Cada usuário deve usar ${COMMAND_PREFIX}login com seu próprio token GitHub\n`);
  });

  client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    if (!content.startsWith(COMMAND_PREFIX)) return;

    const args = content.slice(COMMAND_PREFIX.length).trim().split(/\s+/);
    const command = args[0].toLowerCase();

    switch (command) {
      case 'login':
        await handleLoginCommand(message, args);
        break;

      case 'logout':
        await handleLogoutCommand(message);
        break;

      case 'whoami':
        await handleWhoAmICommand(message);
        break;

      case 'repos':
        await handleReposCommand(message, args);
        break;

      case 'upload':
        await handleUploadCommand(message, args);
        break;

      case 'help':
        await handleHelpCommand(message);
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

# Deploy na Vertra Cloud

Este guia mostra como fazer deploy do Discord GitHub Bot na Vertra Cloud.

## Passo 1: Criar Conta na Vertra Cloud

1. Acesse: https://vertracloud.app/login
2. Faça login com sua conta Discord
3. Você será redirecionado para o dashboard

## Passo 2: Preparar o Projeto para Deploy

O projeto já está configurado com:
- ✅ `vertracloud.config` - Configuração da aplicação
- ✅ `.vertracloudignore` - Arquivos a ignorar no deploy

### Criar o arquivo ZIP

**Opção 1: Via Linha de Comando (Linux/Mac)**
```bash
zip -r discord-github-bot.zip . -x "node_modules/*" ".npm/*" "package-lock.json" "dist/*" ".git/*" "data/*" ".local/*" "/tmp/*" "*.log"
```

**Opção 2: Via Linha de Comando (Windows)**
```powershell
Compress-Archive -Path . -DestinationPath discord-github-bot.zip -Force -CompressionLevel Optimal -Exclude node_modules,.npm,package-lock.json,dist,.git,data,.local,tmp,*.log
```

**Opção 3: Manual**
1. Copie todos os arquivos do projeto para uma nova pasta
2. **Exclua**: `node_modules/`, `package-lock.json`, `dist/`, `.git/`, `data/`, `.local/`
3. Compacte a pasta em formato ZIP

## Passo 3: Upload na Vertra Cloud

1. Acesse: https://vertracloud.app/dashboard/new
2. Clique em **"New Project"**
3. Arraste o arquivo `discord-github-bot.zip` para a área de upload
4. Como já existe `vertracloud.config`, as configurações serão preenchidas automaticamente
5. Clique em **"Create Application"**

## Passo 4: Configurar Variáveis de Ambiente

Após criar a aplicação, você precisa adicionar as seguintes variáveis de ambiente no dashboard:

### Variáveis Obrigatórias:

1. **DISCORD_BOT_TOKEN**
   - Descrição: Token do bot Discord
   - Como obter:
     - Acesse: https://discord.com/developers/applications
     - Selecione seu bot
     - Vá em "Bot" → "Reset Token" ou "Copy"
     - Certifique-se que "Message Content Intent" está ativado

2. **ENCRYPTION_SECRET**
   - Descrição: Chave de criptografia (mínimo 32 caracteres)
   - Exemplo: `minha-chave-super-secreta-de-32-caracteres-ou-mais`
   - Use um gerador de senhas forte

### Configuração do GitHub (via Replit):

O bot já está configurado para usar a integração GitHub do Replit. Na Vertra Cloud, você tem duas opções:

**Opção A: Usar GitHub OAuth (Recomendado)**
- Configure as variáveis `REPLIT_CONNECTORS_HOSTNAME` e `REPL_IDENTITY` se disponíveis

**Opção B: Usar um Personal Access Token**
- Remova o código de integração Replit do arquivo `src/index.ts`
- Configure apenas autenticação por usuário via comando `.login`

## Passo 5: Deploy e Monitoramento

1. Após configurar as variáveis, a aplicação será deployada automaticamente
2. Monitore os logs no dashboard da Vertra Cloud
3. Você verá mensagens como:
   ```
   🤖 Iniciando bot do Discord...
   ✅ Conectado ao GitHub como: [seu-usuario]
   ✅ Bot conectado como [nome-do-bot]
   📨 Aguardando comandos...
   ```

## Comandos do Bot

### Autenticação
- `.login <token>` - Fazer login com token GitHub
- `.logout` - Fazer logout
- `.whoami` - Ver informações da conta

### Repositórios
- `.repos` - Listar repositórios
- `.upload <repo> [pasta]` - Upload de ZIP

### Ajuda
- `.help` - Ver todos os comandos

## Recursos da Vertra Cloud

- ✅ Deploy em segundos
- ✅ Escalabilidade automática
- ✅ Monitoramento 24/7
- ✅ Backups automáticos
- ✅ Suporte a Node.js
- ✅ Plano gratuito disponível

## Suporte

### Vertra Cloud
- Discord: https://discord.gg/vertracloud
- Email: support@vertracloud.app
- Docs: https://docs.vertracloud.app/

### Bot Discord
- Use `.help` no Discord para ver comandos
- GitHub: Confira o README.md do projeto

## Atualizar a Aplicação

Para atualizar o bot na Vertra Cloud:

1. Faça as alterações no código
2. Crie um novo arquivo ZIP (excluindo node_modules)
3. No dashboard da Vertra Cloud, vá até sua aplicação
4. Faça upload do novo ZIP
5. A aplicação será atualizada automaticamente

## Troubleshooting

### Bot não conecta ao Discord
- Verifique se `DISCORD_BOT_TOKEN` está correta
- Confirme que "Message Content Intent" está ativado no Discord Developer Portal

### Erro de criptografia
- Verifique se `ENCRYPTION_SECRET` tem no mínimo 32 caracteres

### Erro ao conectar GitHub
- Se usar integração Replit, configure as variáveis necessárias
- Alternativamente, remova a função `getGitHubAccessToken()` e use apenas autenticação por usuário

---

**Pronto!** Seu Discord GitHub Bot está agora hospedado na Vertra Cloud! 🚀

# 🤖 Discord GitHub Bot

Bot do Discord que permite cada usuário fazer upload de arquivos ZIP para seus próprios repositórios GitHub de forma individual e segura.

## 📋 Funcionalidades

- ✅ Sistema de autenticação individual por usuário
- ✅ Cada usuário gerencia seus próprios repositórios GitHub
- ✅ Upload de arquivos ZIP com comando personalizado
- ✅ Listagem de repositórios pessoais
- ✅ Criptografia AES-256-GCM para proteção de tokens
- ✅ Comandos intuitivos com prefixo `.`
- ✅ Tratamento de erros com mensagens informativas
- ✅ Sistema de login/logout seguro

## 🚀 Como Usar

### 1. Configuração Inicial do Bot Discord

1. Acesse: https://discord.com/developers/applications
2. Crie uma nova aplicação e adicione um bot
3. Em **Bot Settings**, ative o **Message Content Intent**
4. Em **OAuth2 → URL Generator**:
   - Scope: `bot`
   - Permissões: `View Channels`, `Send Messages`, `Attach Files`, `Add Reactions`, `Read Message History`
5. Copie o link gerado e adicione o bot ao seu servidor
6. Copie o **Bot Token** e adicione nas secrets do Replit como `DISCORD_BOT_TOKEN`

### 2. Configuração de Segurança

Configure as seguintes secrets no Replit:
- `DISCORD_BOT_TOKEN`: Token do bot Discord
- `ENCRYPTION_SECRET`: Chave de criptografia (mínimo 32 caracteres aleatórios)

### 3. Integração GitHub

A integração GitHub do Replit já está configurada no projeto.

### 4. Usando o Bot no Discord

#### Primeiro Login
1. Gere um Personal Access Token no GitHub:
   - Acesse: https://github.com/settings/tokens
   - Clique em "Generate new token" → "Generate new token (classic)"
   - Dê um nome (ex: "Discord Bot")
   - Selecione permissão: `repo` (acesso completo a repositórios)
   - Clique em "Generate token"
   - Copie o token

2. **IMPORTANTE**: Envie o comando de login em **DM (mensagem privada)** para o bot:
   ```
   .login seu_token_aqui
   ```

3. O bot confirmará seu login e mostrará seu nome de usuário GitHub

#### Comandos Disponíveis

**Autenticação:**
- `.login <token>` - Fazer login com seu token GitHub
- `.logout` - Fazer logout e remover seu token
- `.whoami` - Ver informações da sua conta

**Repositórios:**
- `.repos` - Listar seus repositórios (10 mais recentes)
- `.upload <repositório> [pasta]` - Upload de arquivo ZIP
  - Exemplo: `.upload meu-repo` - Upload para raiz
  - Exemplo: `.upload meu-repo projetos` - Upload para pasta "projetos"
  - **Importante**: Anexe um arquivo ZIP na mensagem!

**Ajuda:**
- `.help` - Mostra lista completa de comandos

#### Exemplo de Uso Completo

```
1. Em DM com o bot:
   .login ghp_seu_token_github_aqui

2. Ver seus repositórios:
   .repos

3. Fazer upload (anexe um arquivo ZIP na mensagem):
   .upload meu-repositorio projetos

4. Verificar status:
   .whoami
```

## ⚙️ Configuração Técnica

### Variáveis de Ambiente

- `DISCORD_BOT_TOKEN`: Token do bot Discord (obrigatório)
- `ENCRYPTION_SECRET`: Chave de criptografia para tokens (obrigatório, min 32 chars)
- `GITHUB_REPO`: Nome do repositório padrão (opcional, padrão: discord-uploads)

### Secrets Replit

Configure estas secrets no Replit:
1. `DISCORD_BOT_TOKEN` - Token do Discord
2. `ENCRYPTION_SECRET` - Chave aleatória forte (mínimo 32 caracteres)

### Integrações

- **GitHub**: Autenticação OAuth via Replit Connectors
- **Discord**: Bot token via Replit Secrets

## 📦 Tecnologias

- **TypeScript**: Linguagem de programação
- **Node.js**: Runtime (v20)
- **discord.js**: Biblioteca para bot do Discord (v14)
- **@octokit/rest**: Cliente da API do GitHub (v22)
- **tsx**: Runtime TypeScript para desenvolvimento
- **AES-256-GCM**: Criptografia para proteção de tokens

## 🔧 Scripts Disponíveis

- `npm start`: Inicia o bot
- `npm run dev`: Inicia em modo de desenvolvimento com hot reload
- `npm run build`: Compila TypeScript para JavaScript

## 🔐 Segurança

### Proteção de Tokens

- Todos os tokens GitHub são criptografados com **AES-256-GCM** antes de serem salvos
- A chave de criptografia é derivada usando **PBKDF2** com 100.000 iterações
- Os tokens nunca são armazenados em texto plano
- Sistema de autenticação individual - cada usuário tem seu próprio token
- Recomendação: sempre use `.login` em **DM (mensagem privada)**

### Boas Práticas

1. **Nunca** compartilhe seu token GitHub
2. Use `.login` apenas em DM com o bot
3. Use `.logout` quando não precisar mais do bot
4. Revogue tokens antigos em https://github.com/settings/tokens
5. Gere novos tokens periodicamente

## 🔄 Como Funciona

1. Usuário faz login com `.login <token>`
2. Token é validado via API GitHub
3. Token é criptografado e armazenado de forma segura
4. Usuário pode listar seus repositórios com `.repos`
5. Para upload: anexa arquivo ZIP e usa `.upload <repo> [pasta]`
6. Bot baixa o arquivo, faz upload para GitHub via API
7. Arquivo é salvo com timestamp em `<pasta>/TIMESTAMP_arquivo.zip`
8. Usuário recebe confirmação com link do GitHub

## ⚠️ Requisitos

### Bot Discord
- **Discord Bot Token**: Configure nas secrets do Replit
- **Message Content Intent**: Deve estar ativado no Discord Developer Portal
- **Permissões**: View Channels, Send Messages, Attach Files, Add Reactions, Read Message History

### Token GitHub
- **Personal Access Token** com permissão `repo`
- Gere em: https://github.com/settings/tokens

### Replit
- Integração GitHub configurada
- Secrets configuradas (DISCORD_BOT_TOKEN, ENCRYPTION_SECRET)

## 📝 Estrutura de Arquivos

```
.
├── src/
│   ├── index.ts          # Código principal do bot
│   ├── userTokens.ts     # Gerenciamento de tokens de usuários
│   └── encryption.ts     # Sistema de criptografia AES-256-GCM
├── data/
│   └── user_tokens.json  # Tokens criptografados (gerado automaticamente)
├── package.json          # Dependências e scripts
├── tsconfig.json         # Configuração TypeScript
├── .gitignore           # Arquivos ignorados pelo Git
└── README.md            # Esta documentação
```

## 🆘 Solução de Problemas

### Bot não conecta
- Verifique se `DISCORD_BOT_TOKEN` está configurado corretamente
- Confirme que "Message Content Intent" está ativado no Discord

### Login falha
- Verifique se o token GitHub tem permissão `repo`
- Certifique-se de copiar o token completo
- Token pode ter expirado - gere um novo

### Upload falha
- Verifique se você está autenticado (`.whoami`)
- Confirme que o repositório existe (`.repos`)
- Certifique-se de anexar um arquivo .zip
- Verifique se você tem permissão de escrita no repositório

### Erro de criptografia
- Certifique-se de que `ENCRYPTION_SECRET` está configurada
- Secret deve ter no mínimo 32 caracteres
- Se mudou a secret, faça logout e login novamente

## 🌐 Deploy na Vertra Cloud

O projeto está totalmente configurado para deploy na **Vertra Cloud**, uma plataforma brasileira de hospedagem para apps, bots e bancos de dados.

### Arquivos de Configuração

- ✅ `vertracloud.config` - Configurações da aplicação
- ✅ `.vertracloudignore` - Arquivos a excluir do deploy
- ✅ `DEPLOY_VERTRA.md` - Guia completo de deploy
- ✅ `criar-zip-vertra.sh` - Script para criar ZIP

### Deploy Rápido

1. **Criar arquivo ZIP:**
   ```bash
   ./criar-zip-vertra.sh
   ```

2. **Fazer deploy:**
   - Acesse: https://vertracloud.app/dashboard/new
   - Faça upload do arquivo `discord-github-bot.zip`
   - Configure as variáveis de ambiente:
     - `DISCORD_BOT_TOKEN`
     - `ENCRYPTION_SECRET`
   - Clique em "Create Application"

3. **Ver guia completo:**
   - Consulte `DEPLOY_VERTRA.md` para instruções detalhadas

### Recursos da Vertra Cloud

- ✅ Deploy em segundos
- ✅ Escalabilidade automática
- ✅ Monitoramento 24/7
- ✅ Backups automáticos
- ✅ Plano gratuito disponível

### Suporte Vertra Cloud

- 🌐 Website: https://vertracloud.app
- 📖 Documentação: https://docs.vertracloud.app
- 💬 Discord: https://discord.gg/vertracloud
- 📧 Email: support@vertracloud.app

## 🎯 Próximos Passos (Melhorias Futuras)

- [ ] Suporte para outros tipos de arquivo além de ZIP
- [ ] Comando para deletar arquivos do GitHub
- [ ] Comando para listar arquivos em um repositório
- [ ] Sistema de permissões por servidor Discord
- [ ] Logs de auditoria de uploads
- [ ] Interface web para gerenciamento

## 📄 Licença

ISC

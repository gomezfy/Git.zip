# Discord GitHub Bot

## Visão Geral
Bot do Discord desenvolvido em TypeScript que permite cada usuário fazer upload de arquivos ZIP para seus próprios repositórios GitHub. Cada usuário se autentica individualmente com seu próprio Personal Access Token do GitHub, que é armazenado de forma criptografada.

## Mudanças Recentes
- **2025-10-22**: Sistema de autenticação individual implementado
  - Adicionado sistema de login/logout por usuário
  - Implementada criptografia AES-256-GCM para tokens GitHub
  - Cada usuário gerencia seus próprios repositórios
  - Comandos: `.login`, `.logout`, `.whoami`, `.repos`
  - Comando `.upload` modificado para aceitar repositório e pasta como parâmetros
  - Sistema de armazenamento seguro com encryption.ts
  - Validação de tokens GitHub via API
  - Proteção contra exposição de tokens em canais públicos
- **2025-10-22**: Configuração no ambiente Replit
  - Instaladas todas as dependências via npm
  - Configurada integração GitHub via Replit Connectors
  - Adicionado DISCORD_BOT_TOKEN e ENCRYPTION_SECRET nas secrets
  - Workflow configurado para executar o bot automaticamente
  - Corrigido erro TypeScript no tipo de dados da API
- **2025-10-22**: Projeto original criado
  - Sistema de comandos com prefixo `.`
  - Upload de arquivos ZIP para GitHub
  - Tratamento robusto de erros e reações

## Arquitetura do Projeto

### Estrutura de Arquivos
```
.
├── src/
│   ├── index.ts          # Código principal do bot
│   ├── userTokens.ts     # Gerenciamento de tokens de usuários
│   └── encryption.ts     # Sistema de criptografia AES-256-GCM
├── data/
│   └── user_tokens.json  # Tokens criptografados (criado automaticamente)
├── package.json          # Dependências e scripts
├── tsconfig.json         # Configuração TypeScript
└── README.md            # Documentação
```

### Tecnologias
- **TypeScript**: Linguagem principal
- **Node.js**: Runtime (v20.19.3)
- **discord.js**: Biblioteca para bot Discord (v14.23.2)
- **@octokit/rest**: Cliente API GitHub (v22.0.0)
- **tsx**: Runtime TypeScript para desenvolvimento
- **crypto (Node.js)**: Módulo nativo para criptografia AES-256-GCM

### Fluxo de Autenticação e Upload
1. Usuário envia `.login <token>` (preferencialmente em DM)
2. Bot valida token via GitHub API
3. Token é criptografado com AES-256-GCM e armazenado
4. Usuário pode listar repositórios com `.repos`
5. Para upload: anexa ZIP e digita `.upload <repo> [pasta]`
6. Bot baixa arquivo e faz upload usando token do usuário
7. Arquivo salvo com timestamp em `<pasta>/TIMESTAMP_nome.zip`
8. Bot envia confirmação com link do GitHub

### Sistema de Criptografia

**Algoritmo**: AES-256-GCM (Galois/Counter Mode)
- **Chave**: Derivada via PBKDF2 (100.000 iterações) de ENCRYPTION_SECRET
- **IV**: Aleatório de 16 bytes por token
- **Auth Tag**: 16 bytes para garantir integridade
- **Formato**: `IV:AuthTag:CipherText` (tudo em hexadecimal)

**Segurança**:
- Tokens nunca armazenados em texto plano
- Chave de criptografia obrigatória (min 32 chars)
- Salt fixo para derivação de chave
- Validação de integridade via auth tag

### Comandos Disponíveis

**Autenticação:**
- `.login <token>` - Fazer login com Personal Access Token GitHub
- `.logout` - Fazer logout e remover token
- `.whoami` - Ver informações da conta autenticada

**Repositórios:**
- `.repos` - Listar seus repositórios (10 mais recentes)
- `.upload <repo> [pasta]` - Upload de ZIP para repositório específico

**Ajuda:**
- `.help` - Mostra comandos disponíveis e status de autenticação

## Configuração

### Variáveis de Ambiente
- `DISCORD_BOT_TOKEN`: Token do bot Discord (Replit Secret)
- `ENCRYPTION_SECRET`: Chave de criptografia forte (mínimo 32 caracteres)
- `GITHUB_REPO`: Nome do repositório padrão (opcional, legado)

### Integrações Replit
- **GitHub**: Autenticação OAuth via Replit Connectors
  - Usado apenas para conta do bot (conexão inicial)
  - Cada usuário usa seu próprio token via `.login`
- **Discord**: Bot token via Replit Secrets

### Workflow
- **Nome**: Discord Bot
- **Comando**: `npm start`
- **Tipo**: Backend console application
- **Auto-start**: Sim

## Requisitos

### Discord
Para usar o bot, é necessário:
1. Criar aplicação em https://discord.com/developers/applications
2. Habilitar "Message Content Intent" nas configurações do bot
3. Convidar bot com permissões:
   - View Channels
   - Send Messages
   - Attach Files
   - Add Reactions
   - Read Message History

### GitHub
Cada usuário precisa:
1. Gerar Personal Access Token em https://github.com/settings/tokens
2. Selecionar permissão `repo` (acesso completo a repositórios)
3. Fazer login com `.login <token>` (em DM preferencialmente)

## Segurança

### Proteção de Tokens
- Todos tokens criptografados com AES-256-GCM antes de salvar
- Chave derivada de ENCRYPTION_SECRET via PBKDF2
- Validação obrigatória: secret deve ter 32+ caracteres
- Arquivo data/user_tokens.json ignorado pelo Git
- Recomendação: usar `.login` apenas em DM

### Boas Práticas
- Tokens validados antes de armazenar
- Avisos se token enviado em canal público
- Sistema de logout para remover tokens
- Erros de descriptografia tratados adequadamente

## Como Executar
```bash
npm start
```

## Desenvolvimento
```bash
npm run dev  # Hot reload com tsx watch
npm run build  # Compilar TypeScript
```

## Preferências do Usuário
- Sistema de autenticação individual ao invés de conta compartilhada
- Cada usuário gerencia seus próprios repositórios
- Comandos com prefixo `.` (ponto)
- Arquivos organizados com timestamp
- Criptografia forte para proteção de dados
- Mensagens em português brasileiro

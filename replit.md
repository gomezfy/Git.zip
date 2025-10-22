# Discord GitHub Bot

## Visão Geral
Bot do Discord desenvolvido em TypeScript que faz upload de arquivos ZIP para um repositório no GitHub através de comandos com prefixo `.`

## Mudanças Recentes
- **2025-10-22**: Configuração no ambiente Replit
  - Instaladas todas as dependências via npm
  - Configurada integração GitHub via Replit Connectors
  - Adicionado DISCORD_BOT_TOKEN nas secrets
  - Workflow configurado para executar o bot automaticamente
  - Corrigido erro TypeScript no tipo de dados da API
- **2025-10-22**: Sistema de comandos implementado
  - Adicionado prefixo `.` para comandos
  - Comando `.upload` para upload de arquivos ZIP
  - Comando `.help` para mostrar ajuda
  - Upload agora funciona apenas via comando (não mais automático)
- **2025-10-22**: Projeto criado em TypeScript
  - Configurado bot Discord com discord.js v14
  - Integração com GitHub API usando Octokit
  - Tratamento robusto de erros e reações
  - Uso de Replit Integrations para GitHub OAuth
  - Bot Token configurado via Replit Secrets

## Arquitetura do Projeto

### Estrutura de Arquivos
```
.
├── src/
│   └── index.ts          # Código principal do bot
├── package.json          # Dependências e scripts
├── tsconfig.json         # Configuração TypeScript
└── README.md            # Documentação
```

### Tecnologias
- **TypeScript**: Linguagem principal
- **discord.js**: Biblioteca para bot Discord (v14.23.2)
- **@octokit/rest**: Cliente API GitHub (v22.0.0)
- **tsx**: Runtime TypeScript para desenvolvimento
- **Node.js**: Runtime (v20.19.3)

### Fluxo de Funcionamento
1. Bot escuta comandos que começam com `.`
2. Usuário anexa arquivo ZIP e digita `.upload`
3. Bot valida e baixa o arquivo ZIP
4. Faz upload para GitHub via API com timestamp
5. Envia confirmação com link do arquivo

### Comandos Disponíveis
- `.upload` - Faz upload de arquivo ZIP anexado
- `.help` - Mostra ajuda e comandos disponíveis

## Configuração

### Variáveis de Ambiente
- `DISCORD_BOT_TOKEN`: Token do bot Discord (configurado nas Replit Secrets)
- `GITHUB_REPO`: Nome do repositório GitHub (padrão: discord-uploads)

### Integrações Replit
- **GitHub**: Autenticação OAuth configurada via Replit Connectors
  - Conectado como: gomezfy
  - Repositório: gomezfy/discord-uploads
  - Permissões: read:org, read:project, read:user, repo, user:email

### Workflow
- **Nome**: Discord Bot
- **Comando**: `npm start`
- **Status**: Backend console application
- **Auto-start**: Sim

## Requisitos Discord
Para usar este bot, é necessário:
1. Criar uma aplicação Discord em https://discord.com/developers/applications
2. Habilitar "Message Content Intent" nas configurações do bot
3. Convidar o bot para o servidor com as permissões:
   - View Channels
   - Send Messages
   - Attach Files
   - Add Reactions
   - Read Message History

## Como Executar
```bash
npm start
```

## Preferências do Usuário
- Preferência por TypeScript ao invés de JavaScript
- Comandos com prefixo `.` (ponto)
- Arquivos devem ser organizados com timestamp

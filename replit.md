# Discord GitHub Bot

## Visão Geral
Bot do Discord desenvolvido em TypeScript que faz upload de arquivos ZIP para um repositório no GitHub através de comandos com prefixo `.`

## Mudanças Recentes
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
├── .gitignore           # Arquivos ignorados pelo Git
├── .env.example         # Exemplo de variáveis de ambiente
└── README.md            # Documentação
```

### Tecnologias
- **TypeScript**: Linguagem principal
- **discord.js**: Biblioteca para bot Discord
- **@octokit/rest**: Cliente API GitHub
- **tsx**: Runtime TypeScript
- **Replit Integrations**: Autenticação Discord e GitHub

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
- `GITHUB_REPO`: Nome do repositório GitHub (padrão: discord-uploads)

### Integrações Replit
- Discord: Autenticação OAuth do bot
- GitHub: Autenticação para upload de arquivos

## Preferências do Usuário
- Preferência por TypeScript ao invés de JavaScript
- Comandos com prefixo `.` (ponto)
- Arquivos devem ser organizados com timestamp

## Como Executar
```bash
npm start
```

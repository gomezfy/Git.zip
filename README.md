# 🤖 Discord GitHub Bot

Bot do Discord que faz upload automático de arquivos ZIP para o GitHub.

## 📋 Funcionalidades

- ✅ Sistema de comandos com prefixo `.`
- ✅ Upload de arquivos ZIP para GitHub via comando
- ✅ Organiza os arquivos em uma pasta `uploads/` com timestamp
- ✅ Retorna link do arquivo no GitHub após upload
- ✅ Tratamento de erros com mensagens informativas
- ✅ Comando de ajuda integrado

## 🚀 Como Usar

1. **Configure o Bot Discord**
   - Acesse: https://discord.com/developers/applications
   - Crie uma nova aplicação e adicione um bot
   - Em **Bot Settings**, ative o **Message Content Intent**
   - Em **OAuth2 → URL Generator**:
     - Scope: `bot`
     - Permissões necessárias:
       - `View Channels` (ler canais)
       - `Send Messages` (enviar mensagens)
       - `Attach Files` (anexar arquivos)
       - `Add Reactions` (adicionar reações)
       - `Read Message History` (ler histórico de mensagens)
   - Copie o link gerado e adicione o bot ao seu servidor
   - Copie o **Bot Token** e adicione nas secrets do Replit como `DISCORD_BOT_TOKEN`

2. **Configure o repositório GitHub**
   - Crie um repositório no GitHub (ex: `discord-uploads`)
   - Ou defina a variável de ambiente `GITHUB_REPO` com o nome do repositório desejado
   - A integração GitHub do Replit já está configurada

3. **Execute o bot**
   ```bash
   npm start
   ```

4. **Use os comandos no Discord**
   - `.upload` - Anexe um arquivo ZIP e use este comando para fazer upload
   - `.help` - Mostra todos os comandos disponíveis
   - Você receberá uma confirmação com o link do arquivo após o upload

## ⚙️ Configuração

### Variáveis de Ambiente

- `GITHUB_REPO`: Nome do repositório GitHub (padrão: `discord-uploads`)

### Exemplo

```bash
GITHUB_REPO=meu-repositorio npm start
```

## 📦 Tecnologias

- **TypeScript**: Linguagem de programação
- **discord.js**: Biblioteca para bot do Discord
- **@octokit/rest**: Cliente da API do GitHub
- **Replit Integrations**: Gerenciamento de autenticação Discord e GitHub

## 🔧 Scripts Disponíveis

- `npm start`: Inicia o bot
- `npm run dev`: Inicia em modo de desenvolvimento com hot reload
- `npm run build`: Compila o TypeScript para JavaScript

## 📝 Comandos Disponíveis

### `.upload`
Faz upload de um arquivo ZIP anexado para o GitHub.

**Como usar:**
1. Anexe um arquivo ZIP na mensagem
2. Digite `.upload`
3. O bot fará o upload e retornará o link do GitHub

### `.help`
Mostra a lista de comandos disponíveis e informações sobre o repositório.

## 🔄 Como Funciona

1. O bot escuta comandos que começam com `.`
2. Com o comando `.upload`, ele baixa o arquivo ZIP anexado
3. Faz upload do arquivo para o GitHub via API
4. O arquivo é salvo em `uploads/TIMESTAMP_nome-do-arquivo.zip`
5. Uma mensagem de confirmação é enviada com o link do GitHub

## ⚠️ Requisitos

- **Discord Bot Token**: Configure nas secrets do Replit
- **Message Content Intent**: Deve estar ativado no Discord Developer Portal
- **Repositório GitHub**: Deve existir antes de fazer uploads
- **Permissões do Bot**: View Channels, Send Messages, Attach Files, Add Reactions, Read Message History
- **Integração GitHub**: Configurada no Replit para autenticação OAuth

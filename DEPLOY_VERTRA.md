# 🚀 Deploy na Vertra Cloud - Guia Completo

## 📋 Pré-requisitos

Antes de fazer o deploy, você precisa:

1. ✅ Conta na Vertra Cloud ([vertracloud.app](https://vertracloud.app))
2. ✅ Token do Bot Discord configurado
3. ✅ Chave de criptografia forte (mínimo 32 caracteres)
4. ✅ Bot Discord com Message Content Intent ativado

---

## 🎯 Método 1: Deploy via Dashboard (Recomendado)

### Passo 1: Criar Pacote de Deploy

Execute o script de criação do ZIP:

```bash
./criar-zip-vertra.sh
```

Isso criará o arquivo `discord-github-bot-vertra.zip` pronto para upload.

### Passo 2: Fazer Upload na Vertra Cloud

1. Acesse: [https://vertracloud.app/dashboard/new](https://vertracloud.app/dashboard/new)
2. Clique em **"Upload Application"**
3. Selecione o arquivo `discord-github-bot-vertra.zip`
4. Aguarde o upload completar

### Passo 3: Configurar Variáveis de Ambiente

Na página de configuração, adicione as seguintes **Secrets**:

#### Obrigatórias:

```
DISCORD_BOT_TOKEN=seu_token_do_discord_aqui
ENCRYPTION_SECRET=sua_chave_forte_minimo_32_caracteres
```

**⚠️ IMPORTANTE:**
- `ENCRYPTION_SECRET` deve ter **no mínimo 32 caracteres**
- Use caracteres aleatórios: letras, números e símbolos
- Exemplo: `Kj8#mP2$nQ9@xL5&wR7!vT3%yU6^zI4*`

#### Opcionais:

```
NODE_ENV=production
```

### Passo 4: Configurar Recursos

Recursos recomendados:
- **Memória:** 512MB (mínimo)
- **CPU:** 0.5 vCPU
- **Persistência:** Ativada para `/app/data`

### Passo 5: Deploy

1. Clique em **"Create Application"**
2. Aguarde o build completar (~2-3 minutos)
3. Verifique os logs para confirmar que o bot iniciou

---

## 🎯 Método 2: Deploy via CLI

### Instalar Vertra CLI

```bash
npm install -g @vertracloud/cli
```

### Login

```bash
vertra login
```

### Deploy

```bash
# Criar aplicação
vertra create discord-github-bot

# Configurar secrets
vertra secrets:set DISCORD_BOT_TOKEN="seu_token"
vertra secrets:set ENCRYPTION_SECRET="sua_chave_forte"

# Fazer deploy
vertra deploy
```

---

## 🎯 Método 3: Deploy via Git

### Conectar Repositório

1. Acesse o dashboard da Vertra Cloud
2. Clique em **"New Application"** → **"From Git"**
3. Conecte seu repositório GitHub
4. Selecione o branch: `fix/download-timeout-and-size-limits`

### Configurar Build

A Vertra Cloud detectará automaticamente o `vertracloud.config` e usará:
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

### Configurar Secrets

Adicione as variáveis de ambiente conforme Método 1, Passo 3.

### Deploy Automático

A Vertra Cloud fará deploy automático a cada push no branch configurado.

---

## ✅ Verificação Pós-Deploy

### 1. Verificar Logs

```bash
vertra logs --tail 100
```

Ou no dashboard: **Application** → **Logs**

Você deve ver:
```
🤖 Iniciando bot do Discord com Slash Commands...
✅ Environment variables validated
✅ Generated new encryption salt
✅ Bot conectado como YourBot#1234
✅ Slash commands registrados com sucesso!
📨 Aguardando comandos slash...
```

### 2. Testar Bot no Discord

Execute no Discord:
```
/help
```

Você deve receber a lista de comandos disponíveis.

### 3. Testar Login

Em DM com o bot:
```
/login seu_token_github
```

### 4. Testar Upload

```
/repos
/upload repositorio:meu-repo arquivo:[anexar ZIP]
```

---

## 🔧 Configurações Avançadas

### Persistência de Dados

O diretório `/app/data` é persistido automaticamente e contém:
- `user_tokens.json` - Tokens criptografados dos usuários
- `encryption.salt` - Salt único da instalação
- `*.lock` - Arquivos de lock temporários

**⚠️ IMPORTANTE:** Faça backup regular deste diretório!

### Backup Automático

Configure backup na Vertra Cloud:
1. **Application** → **Settings** → **Backups**
2. Ative **"Automatic Backups"**
3. Frequência recomendada: **Diária**

### Monitoramento

Configure alertas:
1. **Application** → **Monitoring** → **Alerts**
2. Adicione alerta para:
   - CPU > 80%
   - Memória > 90%
   - Restarts > 3 em 1 hora

### Logs

Acesse logs em tempo real:
```bash
vertra logs --follow
```

Ou no dashboard: **Application** → **Logs** → **Live**

---

## 🐛 Troubleshooting

### Bot não conecta

**Problema:** Bot não aparece online no Discord

**Soluções:**
1. Verifique se `DISCORD_BOT_TOKEN` está correto
2. Confirme que Message Content Intent está ativado
3. Verifique logs: `vertra logs --tail 50`

### Erro de criptografia

**Problema:** `ENCRYPTION_SECRET não configurado`

**Solução:**
```bash
vertra secrets:set ENCRYPTION_SECRET="sua_chave_forte_32_chars"
vertra restart
```

### Comandos não aparecem

**Problema:** Comandos slash não aparecem no Discord

**Soluções:**
1. Aguarde até 1 hora (cache do Discord)
2. Saia e entre novamente no servidor
3. Verifique logs para confirmar registro de comandos

### Upload falha

**Problema:** Upload de ZIP falha com timeout

**Soluções:**
1. Verifique tamanho do arquivo (máx 50MB)
2. Verifique se ZIP não é bomb (máx 500MB descomprimido)
3. Tente arquivo menor para testar

### Rate limit

**Problema:** "Rate limit excedido"

**Solução:** Aguarde 2 segundos entre comandos. Limite: 10 comandos/minuto.

### Memória insuficiente

**Problema:** Bot reinicia frequentemente

**Solução:** Aumente memória para 1GB:
```bash
vertra resources:set --memory 1GB
```

---

## 📊 Recursos e Custos

### Plano Gratuito
- ✅ 512MB RAM
- ✅ 0.5 vCPU
- ✅ 1GB Storage
- ✅ Ideal para testes

### Plano Básico ($5/mês)
- ✅ 1GB RAM
- ✅ 1 vCPU
- ✅ 5GB Storage
- ✅ Backups automáticos
- ✅ Ideal para produção pequena

### Plano Pro ($15/mês)
- ✅ 2GB RAM
- ✅ 2 vCPU
- ✅ 20GB Storage
- ✅ Backups automáticos
- ✅ Suporte prioritário
- ✅ Ideal para produção média/grande

---

## 🔐 Segurança na Vertra Cloud

### Secrets Management
- ✅ Secrets criptografados em repouso
- ✅ Nunca expostos em logs
- ✅ Injetados como variáveis de ambiente

### Network Security
- ✅ HTTPS automático
- ✅ Isolamento de containers
- ✅ Firewall configurado

### Data Security
- ✅ Backups criptografados
- ✅ Persistência em SSD
- ✅ Replicação automática

---

## 🆘 Suporte

### Documentação Vertra Cloud
- 📖 [docs.vertracloud.app](https://docs.vertracloud.app)

### Comunidade
- 💬 Discord: [discord.gg/vertracloud](https://discord.gg/vertracloud)
- 🐦 Twitter: [@vertracloud](https://twitter.com/vertracloud)

### Suporte Técnico
- 📧 Email: support@vertracloud.app
- 💬 Chat: Disponível no dashboard

### Issues do Projeto
- 🐛 GitHub Issues: [github.com/gomezfy/Git.zip/issues](https://github.com/gomezfy/Git.zip/issues)

---

## 📝 Checklist de Deploy

Antes de fazer deploy, confirme:

- [ ] Token do Discord configurado e testado
- [ ] Message Content Intent ativado
- [ ] ENCRYPTION_SECRET gerado (min 32 chars)
- [ ] Repositório GitHub conectado (opcional)
- [ ] Recursos adequados selecionados
- [ ] Persistência ativada para `/app/data`
- [ ] Backups automáticos configurados
- [ ] Alertas de monitoramento configurados
- [ ] Bot testado localmente
- [ ] Documentação lida e compreendida

---

## 🎉 Deploy Completo!

Após seguir este guia, seu bot estará:
- ✅ Rodando 24/7 na Vertra Cloud
- ✅ Com segurança de nível empresarial
- ✅ Com backups automáticos
- ✅ Com monitoramento ativo
- ✅ Pronto para uso em produção

**Última atualização:** 2025-10-22  
**Versão:** 2.0.0-secure  
**Status:** ✅ PRODUCTION READY

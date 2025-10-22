#!/bin/bash

# Script para criar ZIP para deploy na Vertra Cloud
# Exclui automaticamente os arquivos que não devem ir para o deploy

echo "📦 Criando arquivo ZIP para deploy na Vertra Cloud..."

# Nome do arquivo de saída
OUTPUT_FILE="discord-github-bot.zip"

# Remove arquivo ZIP antigo se existir
if [ -f "$OUTPUT_FILE" ]; then
    echo "🗑️  Removendo arquivo ZIP antigo..."
    rm "$OUTPUT_FILE"
fi

# Cria o arquivo ZIP excluindo os diretórios/arquivos desnecessários
echo "🔄 Compactando projeto..."
zip -r "$OUTPUT_FILE" . \
    -x "node_modules/*" \
    -x ".npm/*" \
    -x "package-lock.json" \
    -x "dist/*" \
    -x ".git/*" \
    -x ".gitignore" \
    -x "data/*" \
    -x ".local/*" \
    -x "tmp/*" \
    -x "*.log" \
    -x "criar-zip-vertra.sh" \
    -x "$OUTPUT_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Arquivo criado com sucesso: $OUTPUT_FILE"
    echo ""
    echo "📋 Próximos passos:"
    echo "1. Acesse: https://vertracloud.app/dashboard/new"
    echo "2. Faça upload do arquivo: $OUTPUT_FILE"
    echo "3. Configure as variáveis de ambiente (DISCORD_BOT_TOKEN, ENCRYPTION_SECRET)"
    echo "4. Clique em 'Create Application'"
    echo ""
    echo "📖 Veja DEPLOY_VERTRA.md para instruções detalhadas"
else
    echo "❌ Erro ao criar arquivo ZIP"
    exit 1
fi

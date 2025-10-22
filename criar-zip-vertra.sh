#!/bin/bash

# Script para criar pacote de deploy para Vertra Cloud
# Versão: 2.0.0-secure

set -e

echo "🚀 Criando pacote de deploy para Vertra Cloud..."
echo ""

# Nome do arquivo de saída
OUTPUT_FILE="discord-github-bot-vertra.zip"

# Remover ZIP antigo se existir
if [ -f "$OUTPUT_FILE" ]; then
    echo "🗑️  Removendo pacote antigo..."
    rm "$OUTPUT_FILE"
fi

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
fi

# Executar testes
echo "🧪 Executando testes..."
npm test

# Build do projeto
echo "🔨 Compilando TypeScript..."
npm run build

# Criar diretório temporário
TEMP_DIR=$(mktemp -d)
echo "📁 Criando estrutura temporária em $TEMP_DIR..."

# Copiar arquivos necessários
echo "📋 Copiando arquivos..."

# Arquivos de configuração
cp package.json "$TEMP_DIR/"
cp package-lock.json "$TEMP_DIR/"
cp tsconfig.json "$TEMP_DIR/"
cp vertracloud.config "$TEMP_DIR/"
cp .vertracloudignore "$TEMP_DIR/"

# Código fonte
cp -r src "$TEMP_DIR/"

# Build output
if [ -d "dist" ]; then
    cp -r dist "$TEMP_DIR/"
fi

# Documentação essencial
cp README.md "$TEMP_DIR/"
cp DEPLOY_VERTRA.md "$TEMP_DIR/"
cp PRODUCTION_READY.md "$TEMP_DIR/"

# Jest config
cp jest.config.js "$TEMP_DIR/"

# Criar .gitignore para o pacote
cat > "$TEMP_DIR/.gitignore" << 'EOF'
node_modules/
.env
*.log
.DS_Store
data/
*.lock
*.tmp
EOF

# Criar diretório data vazio (será usado para persistência)
mkdir -p "$TEMP_DIR/data"
echo "# Este diretório será usado para armazenar dados persistentes" > "$TEMP_DIR/data/README.md"

# Criar arquivo de versão
cat > "$TEMP_DIR/VERSION" << EOF
Version: 2.0.0-secure
Build Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Git Commit: $(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
Security: Production Ready
EOF

# Criar ZIP
echo "📦 Criando arquivo ZIP..."
cd "$TEMP_DIR"
zip -r "$OUTPUT_FILE" . -q

# Mover ZIP para diretório original
mv "$OUTPUT_FILE" "$OLDPWD/"
cd "$OLDPWD"

# Limpar diretório temporário
echo "🧹 Limpando arquivos temporários..."
rm -rf "$TEMP_DIR"

# Informações do arquivo
FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)

echo ""
echo "✅ Pacote criado com sucesso!"
echo ""
echo "📦 Arquivo: $OUTPUT_FILE"
echo "📊 Tamanho: $FILE_SIZE"
echo ""
echo "🚀 Próximos passos:"
echo "   1. Acesse: https://vertracloud.app/dashboard/new"
echo "   2. Faça upload do arquivo: $OUTPUT_FILE"
echo "   3. Configure as variáveis de ambiente:"
echo "      - DISCORD_BOT_TOKEN"
echo "      - ENCRYPTION_SECRET (min 32 caracteres)"
echo "   4. Clique em 'Create Application'"
echo ""
echo "📖 Guia completo: DEPLOY_VERTRA.md"
echo ""

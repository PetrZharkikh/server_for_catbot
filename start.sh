#!/bin/bash

# Скрипт для запуска CatBot сервера

echo "🚀 Запуск CatBot сервера..."

# Попытка найти node в разных местах
if command -v node &> /dev/null; then
    NODE_CMD="node"
elif [ -f "/opt/homebrew/bin/node" ]; then
    NODE_CMD="/opt/homebrew/bin/node"
elif [ -f "/usr/local/bin/node" ]; then
    NODE_CMD="/usr/local/bin/node"
else
    echo "❌ Node.js не найден!"
    echo "Установите Node.js:"
    echo "  brew install node"
    echo "  или скачайте с https://nodejs.org/"
    exit 1
fi

echo "✅ Найден Node.js: $NODE_CMD"
echo "📦 Проверка зависимостей..."

# Проверка node_modules
if [ ! -d "node_modules" ]; then
    echo "Установка зависимостей..."
    if command -v npm &> /dev/null; then
        npm install
    elif [ -f "/opt/homebrew/bin/npm" ]; then
        /opt/homebrew/bin/npm install
    elif [ -f "/usr/local/bin/npm" ]; then
        /usr/local/bin/npm install
    else
        echo "❌ npm не найден!"
        exit 1
    fi
fi

echo "🚀 Запуск сервера на порту ${PORT:-3000}..."
$NODE_CMD index.js


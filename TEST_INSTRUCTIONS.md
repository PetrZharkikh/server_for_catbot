# Инструкция по тестированию CatBot

## Запуск сервера

1. Установите зависимости (если еще не установлены):
```bash
npm install
```

2. Запустите сервер:
```bash
npm start
```

Сервер запустится на порту 3000 (или на порту из переменной окружения PORT).

## Тестирование

В другом терминале запустите тесты:

```bash
npm test
```

Или вручную:

```bash
node test.js
```

## Ручное тестирование через curl

### Проверка здоровья сервера:
```bash
curl http://localhost:3000/
```

### Тест описания породы:
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "queryResult": {
      "intent": {
        "displayName": "AskBreedInfo"
      },
      "parameters": {
        "breed": "персидская"
      }
    }
  }'
```

### Тест информации об уходе:
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "queryResult": {
      "intent": {
        "displayName": "AskCareInfo"
      },
      "parameters": {
        "breed": "британская"
      }
    }
  }'
```

### Тест информации о питании:
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "queryResult": {
      "intent": {
        "displayName": "AskFoodInfo"
      },
      "parameters": {
        "breed": "мейн-кун"
      }
    }
  }'
```

### Тест с контекстом:
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "queryResult": {
      "intent": {
        "displayName": "AskCareInfo"
      },
      "parameters": {},
      "outputContexts": [
        {
          "parameters": {
            "breed": "сиамская"
          }
        }
      ]
    }
  }'
```


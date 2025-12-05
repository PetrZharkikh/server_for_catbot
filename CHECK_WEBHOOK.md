# Проверка работы Webhook

## Быстрая проверка

### 1. Проверьте, что сервер запущен на Render
- Откройте панель Render
- Убедитесь, что сервис в статусе "Live"
- Проверьте логи на наличие ошибок

### 2. Проверьте URL webhook в Dialogflow
- Dialogflow → Fulfillment → Webhook URL
- Должно быть: `https://your-app-name.onrender.com/webhook`
- Убедитесь, что URL правильный (без лишних слешей)

### 3. Увеличьте таймаут в Dialogflow
- Dialogflow → Settings → Advanced
- Webhook timeout: установите 20-30 секунд
- Сохраните изменения

### 4. Проверьте webhook напрямую

Замените `your-app-name` на имя вашего приложения на Render:

```bash
curl -X POST https://your-app-name.onrender.com/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "queryResult": {
      "intent": {
        "displayName": "AskFoodInfo"
      },
      "parameters": {
        "catbreed": "Ориентальная"
      }
    },
    "session": "projects/test/agent/sessions/test"
  }'
```

Должен вернуться JSON с `fulfillmentText`.

### 5. Проверьте логи на Render

После запроса из Dialogflow проверьте логи:
- Render → Logs
- Должны быть строки:
  - `=== Dialogflow Webhook Request ===`
  - `Intent: AskFoodInfo`
  - `Breed: Ориентальная`
  - `Sending response: ...`

Если этих строк нет - запрос не доходит до сервера.

### 6. Типичные проблемы

**"Not available" в Dialogflow:**
- Сервер не запущен → проверьте статус на Render
- Неправильный URL → проверьте в Fulfillment
- Таймаут → увеличьте до 30 секунд
- Ошибка в коде → проверьте логи на Render

**Пустой ответ:**
- Порода не найдена на koshkiwiki.ru → это нормально, бот вернёт сообщение об этом
- Ошибка парсинга → проверьте логи

**Медленный ответ:**
- koshkiwiki.ru может отвечать медленно
- Увеличьте таймаут в Dialogflow до 30 секунд

## Включение отладки

В Render → Environment Variables добавьте:
- `DEBUG=true`

Это включит подробное логирование всех запросов.


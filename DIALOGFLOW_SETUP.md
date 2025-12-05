# Настройка Dialogflow для CatBot

## Структура Dialogflow

### Интенты:
1. **AskBreedInfo** - описание породы
2. **AskCareInfo** - информация об уходе
3. **AskFoodInfo** - информация о питании

### Параметры:
- Все интенты используют один параметр: **`catbreed`** (тип: `@CatBreed`)

### Entities:
- **@CatBreed** - список из 100 пород кошек

## Настройка Webhook в Dialogflow

1. В консоли Dialogflow перейдите в **Fulfillment**
2. Включите **Webhook**
3. Укажите URL вашего сервера на Render:
   ```
   https://your-app-name.onrender.com/webhook
   ```
4. Сохраните изменения

## Настройка интентов

Для каждого интента (AskBreedInfo, AskCareInfo, AskFoodInfo):

1. Откройте интент
2. В разделе **Parameters** добавьте:
   - **Parameter name:** `catbreed`
   - **Entity:** `@CatBreed`
   - **Required:** ✅ (отмечено)
   - **Value:** `$catbreed`
3. В разделе **Fulfillment**:
   - Включите **Enable webhook call for this intent**
4. Сохраните

## Настройка контекстов (опционально)

Для сохранения породы в контексте между вопросами:

1. Создайте контекст с именем: `catbreed-context`
2. В интентах добавьте этот контекст в **Output contexts**
3. Сервер автоматически будет сохранять породу в контексте

## Тестирование

После деплоя на Render:

1. Откройте **Test Console** в Dialogflow
2. Попробуйте фразы:
   - "Расскажи о персидской кошке"
   - "Как ухаживать за британской кошкой?"
   - "Что едят мейн-куны?"
   - После вопроса о породе: "А как за ней ухаживать?" (контекст должен сохраниться)

## Формат запросов от Dialogflow

Сервер ожидает запросы в формате:
```json
{
  "queryResult": {
    "intent": {
      "displayName": "AskBreedInfo"
    },
    "parameters": {
      "catbreed": "персидская"
    },
    "outputContexts": [...]
  },
  "session": "projects/PROJECT_ID/agent/sessions/SESSION_ID"
}
```

## Формат ответов

Сервер возвращает:
```json
{
  "fulfillmentText": "Текст ответа...",
  "outputContexts": [
    {
      "name": "projects/.../sessions/.../contexts/catbreed-context",
      "lifespanCount": 5,
      "parameters": {
        "catbreed": "персидская"
      }
    }
  ]
}
```

## Отладка

Для включения логирования запросов от Dialogflow, установите переменную окружения:
```
DEBUG=true
```

В логах Render вы увидите полные запросы от Dialogflow для отладки.


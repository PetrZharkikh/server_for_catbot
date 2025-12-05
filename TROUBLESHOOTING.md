# Решение проблем с Dialogflow Webhook

## Проблема: "Not available" в Dialogflow

### Возможные причины и решения:

1. **Сервер не запущен на Render**
   - Проверьте статус сервиса в панели Render
   - Убедитесь, что сервис запущен и доступен
   - Проверьте логи на наличие ошибок

2. **Неправильный URL webhook**
   - В Dialogflow → Fulfillment → Webhook URL должно быть:
     `https://your-app-name.onrender.com/webhook`
   - Убедитесь, что URL правильный и доступен извне

3. **Таймаут запросов**
   - Dialogflow по умолчанию ждёт ответ 5 секунд
   - Если koshkiwiki.ru отвечает медленно, увеличьте таймаут в Dialogflow:
     - Settings → Advanced → Webhook timeout (увеличьте до 20-30 секунд)

4. **Проверка работы webhook**
   ```bash
   curl -X POST https://your-app.onrender.com/webhook \
     -H "Content-Type: application/json" \
     -d '{
       "queryResult": {
         "intent": {
           "displayName": "AskCareInfo"
         },
         "parameters": {
           "catbreed": "персидская"
         }
       },
       "session": "projects/test/agent/sessions/test"
     }'
   ```

5. **Проверка логов**
   - В Render откройте Logs
   - Включите DEBUG=true в Environment Variables
   - Проверьте, какие запросы приходят и какие ошибки возникают

6. **Проблемы с конкретными породами**
   - Если для породы нет информации, бот вернёт сообщение об этом
   - Добавьте породу в маппинг в `index.js` (функция `searchKoshkiWikiBreed`)

## Добавление новых пород

Чтобы добавить новую породу в маппинг:

1. Найдите URL породы на koshkiwiki.ru
2. Определите категорию породы:
   - `dlinnoshyorstnye` - Длинношёрстные
   - `poludlinnoshyorstnye` - Полудлинношёрстные
   - `korotkoshyorstnye` - Короткошёрстные
   - `lysye` - Лысые
   - `orientalnye` - Ориентальные

3. Добавьте в маппинг в `index.js`:
```javascript
"название породы": { url: "url-на-сайте", category: "категория" }
```

## Тестирование локально

```bash
# Запуск с отладкой
DEBUG=true node index.js

# Тест запроса
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "queryResult": {
      "intent": {"displayName": "AskCareInfo"},
      "parameters": {"catbreed": "персидская"}
    },
    "session": "test"
  }'
```


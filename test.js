const axios = require("axios");

// Симуляция запросов к серверу
const BASE_URL = process.env.TEST_URL || "http://localhost:3000";

async function testServer() {
  console.log("🧪 Тестирование CatBot сервера...\n");

  // Тест 1: Проверка здоровья сервера
  console.log("1️⃣ Тест: Проверка здоровья сервера");
  try {
    const response = await axios.get(`${BASE_URL}/`);
    console.log("✅ Сервер работает:", response.data);
  } catch (err) {
    console.log("❌ Ошибка:", err.message);
    return;
  }

  // Тест 2: Описание породы (персидская)
  console.log("\n2️⃣ Тест: Описание породы (персидская кошка)");
  try {
    const response = await axios.post(`${BASE_URL}/webhook`, {
      queryResult: {
        intent: {
          displayName: "AskBreedInfo"
        },
        parameters: {
          catbreed: "персидская"
        }
      }
    });
    console.log("✅ Ответ получен:");
    console.log("Длина ответа:", response.data.fulfillmentText?.length || 0, "символов");
    console.log("Первые 200 символов:", response.data.fulfillmentText?.substring(0, 200) || "Нет ответа");
  } catch (err) {
    console.log("❌ Ошибка:", err.message);
  }

  // Тест 3: Уход (британская)
  console.log("\n3️⃣ Тест: Информация об уходе (британская кошка)");
  try {
    const response = await axios.post(`${BASE_URL}/webhook`, {
      queryResult: {
        intent: {
          displayName: "AskCareInfo"
        },
        parameters: {
          catbreed: "британская"
        }
      }
    });
    console.log("✅ Ответ получен:");
    console.log("Длина ответа:", response.data.fulfillmentText?.length || 0, "символов");
    console.log("Первые 200 символов:", response.data.fulfillmentText?.substring(0, 200) || "Нет ответа");
  } catch (err) {
    console.log("❌ Ошибка:", err.message);
  }

  // Тест 4: Питание (мейн-кун)
  console.log("\n4️⃣ Тест: Информация о питании (мейн-кун)");
  try {
    const response = await axios.post(`${BASE_URL}/webhook`, {
      queryResult: {
        intent: {
          displayName: "AskFoodInfo"
        },
        parameters: {
          catbreed: "мейн-кун"
        }
      }
    });
    console.log("✅ Ответ получен:");
    console.log("Длина ответа:", response.data.fulfillmentText?.length || 0, "символов");
    console.log("Первые 200 символов:", response.data.fulfillmentText?.substring(0, 200) || "Нет ответа");
  } catch (err) {
    console.log("❌ Ошибка:", err.message);
  }

  // Тест 5: Контекст (сначала описание, потом уход)
  console.log("\n5️⃣ Тест: Использование контекста");
  try {
    // Сначала запрос описания
    const descResponse = await axios.post(`${BASE_URL}/webhook`, {
      queryResult: {
        intent: {
          displayName: "AskBreedInfo"
        },
        parameters: {
          catbreed: "сиамская"
        }
      }
    });
    console.log("✅ Описание получено");

    // Потом запрос ухода с контекстом
    const careResponse = await axios.post(`${BASE_URL}/webhook`, {
      queryResult: {
        intent: {
          displayName: "AskCareInfo"
        },
        parameters: {},
        outputContexts: [
          {
            parameters: {
              catbreed: "сиамская"
            }
          }
        ]
      }
    });
    console.log("✅ Уход получен через контекст:");
    console.log("Длина ответа:", careResponse.data.fulfillmentText?.length || 0, "символов");
  } catch (err) {
    console.log("❌ Ошибка:", err.message);
  }

  console.log("\n✨ Тестирование завершено!");
}

// Запуск тестов
testServer().catch(console.error);


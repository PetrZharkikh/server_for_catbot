const axios = require("axios");

const USER_AGENT = "CatBot/1.0 Test";
const WEBHOOK_URL = "http://localhost:3000/webhook";

// Все 100 пород из обновленной базы
const breeds = [
  "Турецкая ангора", "Мейн-кун", "Британская короткошёрстная", "Сиамская",
  "Бенгальская", "Персидская", "Сфинкс", "Норвежская лесная",
  "Русская голубая", "Абиссинская", "Шотландская вислоухая", "Шотландская прямоухая",
  "Ориентальная", "Рэгдолл", "Саванна", "Корниш-рекс",
  "Девон-рекс", "Манкс", "Курильский бобтейл", "Экзотическая короткошёрстная",
  "Американская короткошёрстная", "Сибирская", "Нибелунг", "Тойгер",
  "Ориентальная длинношёрстная", "Египетская мау", "Бирманская", "Бурманская",
  "Бомбейская", "Манчкин", "Лаперм", "Пикси-боб",
  "Регдолл", "Тонкинская", "Сингапурская", "Хайленд-фолд",
  "Хайленд-страйт", "Японский бобтейл", "Цейлонская", "Сноу-шу",
  "Селкирк-рекс", "Американский кёрл", "Бристольская", "Оцикет",
  "Серенгети", "Калифорнийская сияющая", "Минскин", "Наполеон",
  "Корат", "Ликой", "Петерболд", "Донской сфинкс",
  "Украинский левкой", "Меконгский бобтейл", "Кимрик", "Гавана",
  "Шантильи-тиффани", "Балинезийская", "Яванезийская", "Тойбоб",
  "Колор-пойнт короткошерстный", "Американская жесткошерстная", "Азиатская табби",
  "Азиатская дымчатая", "Кашмирская", "Рагамаффин", "Сококе",
  "Самфур", "Чаузи", "Бразильская короткошерстная", "Мандалай",
  "Серая дымчатая", "Тиффани", "Австралийский мист", "Квинслендская",
  "Тайская", "Американская лирандская", "Кохона", "Ликкой",
  "Селкирк-рекс длинношерстный", "Польская короткошёрстная"
];

const intents = [
  { name: "AskBreedInfo", displayName: "Описание породы" },
  { name: "AskCareInfo", displayName: "Уход" },
  { name: "AskFoodInfo", displayName: "Питание" }
];

// Проверка одного запроса
async function testRequest(breed, intent) {
  try {
    const response = await axios.post(WEBHOOK_URL, {
      queryResult: {
        intent: { displayName: intent.name },
        parameters: { catbreed: breed }
      },
      session: "test"
    }, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000
    });

    const fulfillmentText = response.data?.fulfillmentText || "";
    const hasResponse = fulfillmentText.length > 50;
    const isError = fulfillmentText.includes("не смог найти") || 
                    fulfillmentText.includes("К сожалению") ||
                    fulfillmentText.includes("Not available");

    return {
      success: hasResponse && !isError,
      length: fulfillmentText.length,
      isError: isError,
      preview: fulfillmentText.substring(0, 100)
    };
  } catch (err) {
    return {
      success: false,
      length: 0,
      isError: true,
      error: err.message
    };
  }
}

// Проверка одной породы по всем интентам
async function testBreed(breed, index, total) {
  process.stdout.write(`\r[${index + 1}/${total}] ${breed}...`);
  
  const results = {
    breed,
    intents: {}
  };

  for (const intent of intents) {
    const result = await testRequest(breed, intent);
    results.intents[intent.name] = result;
    // Небольшая задержка между запросами
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  return results;
}

// Основная функция
async function testAllBreeds() {
  console.log(`🧪 Тестирование ${breeds.length} пород по ${intents.length} интентам...\n`);
  console.log(`Всего запросов: ${breeds.length * intents.length}\n`);

  const allResults = [];
  let successCount = 0;
  let totalRequests = 0;

  for (let i = 0; i < breeds.length; i++) {
    const result = await testBreed(breeds[i], i, breeds.length);
    allResults.push(result);
    
    // Подсчет успешных ответов
    for (const intent of intents) {
      totalRequests++;
      if (result.intents[intent.name].success) {
        successCount++;
      }
    }
  }

  console.log("\n\n" + "=".repeat(80));
  console.log("📊 ИТОГОВЫЕ РЕЗУЛЬТАТЫ:");
  console.log("=".repeat(80));
  console.log(`✅ Успешных ответов: ${successCount}/${totalRequests} (${Math.round(successCount/totalRequests*100)}%)`);
  console.log(`❌ Ошибок/пустых ответов: ${totalRequests - successCount}/${totalRequests}\n`);

  // Статистика по интентам
  console.log("📋 Статистика по интентам:");
  for (const intent of intents) {
    const intentResults = allResults.map(r => r.intents[intent.name]);
    const success = intentResults.filter(r => r.success).length;
    const errors = intentResults.filter(r => r.isError).length;
    const avgLength = Math.round(intentResults.reduce((sum, r) => sum + r.length, 0) / intentResults.length);
    
    console.log(`\n   ${intent.displayName} (${intent.name}):`);
    console.log(`      ✅ Успешно: ${success}/${breeds.length} (${Math.round(success/breeds.length*100)}%)`);
    console.log(`      ❌ Ошибки: ${errors}/${breeds.length}`);
    console.log(`      📏 Средняя длина ответа: ${avgLength} символов`);
  }

  // Породы с проблемами
  console.log("\n\n⚠️  ПОРОДЫ С ПРОБЛЕМАМИ:");
  const problemBreeds = allResults.filter(r => {
    return Object.values(r.intents).some(i => !i.success);
  });

  if (problemBreeds.length > 0) {
    console.log(`\nНайдено ${problemBreeds.length} пород с проблемами:\n`);
    
    // Группируем по типу проблемы
    const breedsWithErrors = problemBreeds.filter(r => 
      Object.values(r.intents).some(i => i.isError)
    );
    
    const breedsWithShortAnswers = problemBreeds.filter(r => 
      Object.values(r.intents).some(i => !i.success && !i.isError)
    );

    if (breedsWithErrors.length > 0) {
      console.log(`❌ Породы с ошибками (${breedsWithErrors.length}):`);
      breedsWithErrors.slice(0, 20).forEach(r => {
        const problems = [];
        for (const intent of intents) {
          if (r.intents[intent.name].isError) {
            problems.push(intent.displayName);
          }
        }
        console.log(`   - ${r.breed}: ${problems.join(", ")}`);
      });
      if (breedsWithErrors.length > 20) {
        console.log(`   ... и еще ${breedsWithErrors.length - 20} пород`);
      }
    }

    if (breedsWithShortAnswers.length > 0) {
      console.log(`\n⚠️  Породы с короткими ответами (${breedsWithShortAnswers.length}):`);
      breedsWithShortAnswers.slice(0, 10).forEach(r => {
        const problems = [];
        for (const intent of intents) {
          if (!r.intents[intent.name].success && !r.intents[intent.name].isError) {
            problems.push(`${intent.displayName} (${r.intents[intent.name].length} символов)`);
          }
        }
        console.log(`   - ${r.breed}: ${problems.join(", ")}`);
      });
    }
  } else {
    console.log("✅ Все породы работают корректно!");
  }

  // Топ успешных пород
  console.log("\n\n✅ ТОП-10 ПОРОД (все интенты работают):");
  const perfectBreeds = allResults.filter(r => 
    Object.values(r.intents).every(i => i.success)
  );
  
  perfectBreeds.slice(0, 10).forEach((r, i) => {
    const lengths = Object.values(r.intents).map(i => i.length);
    const avgLength = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
    console.log(`   ${i + 1}. ${r.breed} (средняя длина: ${avgLength} символов)`);
  });

  if (perfectBreeds.length > 10) {
    console.log(`   ... и еще ${perfectBreeds.length - 10} пород`);
  }

  return allResults;
}

// Запуск теста
testAllBreeds()
  .then(() => {
    console.log("\n\n✅ Тестирование завершено!");
    process.exit(0);
  })
  .catch(err => {
    console.error("\n❌ Ошибка при тестировании:", err.message);
    process.exit(1);
  });


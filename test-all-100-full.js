const axios = require("axios");
const fs = require("fs");

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
  { name: "AskBreedInfo", displayName: "Описание" },
  { name: "AskCareInfo", displayName: "Уход" },
  { name: "AskFoodInfo", displayName: "Питание" }
];

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
      timeout: 20000
    });

    const fulfillmentText = response.data?.fulfillmentText || "";
    const hasResponse = fulfillmentText.length > 50;
    const isError = fulfillmentText.includes("не смог найти") || 
                    fulfillmentText.includes("К сожалению") ||
                    fulfillmentText.includes("Not available");

    return {
      success: hasResponse && !isError,
      length: fulfillmentText.length,
      isError: isError
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

async function testBreed(breed, index, total) {
  process.stdout.write(`\r[${index + 1}/${total}] ${breed}...`);
  
  const results = {
    breed,
    intents: {}
  };

  for (const intent of intents) {
    const result = await testRequest(breed, intent);
    results.intents[intent.name] = result;
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  return results;
}

async function main() {
  console.log(`🧪 Тестирование ${breeds.length} пород по ${intents.length} интентам...\n`);
  console.log(`Всего запросов: ${breeds.length * intents.length}\n`);

  const allResults = [];
  const resultsFile = "test-results-all-100.json";
  
  // Загружаем предыдущие результаты, если есть
  let savedResults = [];
  if (fs.existsSync(resultsFile)) {
    try {
      savedResults = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
      console.log(`📂 Загружено ${savedResults.length} предыдущих результатов\n`);
    } catch (e) {
      console.log("📂 Начинаем с нуля\n");
    }
  }

  // Продолжаем с того места, где остановились
  const startIndex = savedResults.length;
  
  for (let i = startIndex; i < breeds.length; i++) {
    const result = await testBreed(breeds[i], i, breeds.length);
    allResults.push(result);
    
    // Сохраняем результаты после каждой породы
    const combined = [...savedResults, ...allResults];
    fs.writeFileSync(resultsFile, JSON.stringify(combined, null, 2));
  }

  const finalResults = savedResults.length > 0 ? 
    [...savedResults, ...allResults] : allResults;

  // Статистика
  console.log("\n\n" + "=".repeat(80));
  console.log("📊 ИТОГОВЫЕ РЕЗУЛЬТАТЫ:");
  console.log("=".repeat(80));
  
  let totalSuccess = 0;
  let totalRequests = 0;
  
  for (const intent of intents) {
    const intentResults = finalResults.map(r => r.intents[intent.name]);
    const success = intentResults.filter(r => r.success).length;
    const errors = intentResults.filter(r => r.isError).length;
    const avgLength = Math.round(intentResults.reduce((sum, r) => sum + r.length, 0) / intentResults.length);
    
    totalSuccess += success;
    totalRequests += finalResults.length;
    
    console.log(`\n${intent.displayName} (${intent.name}):`);
    console.log(`  ✅ Успешно: ${success}/${finalResults.length} (${Math.round(success/finalResults.length*100)}%)`);
    console.log(`  ❌ Ошибки: ${errors}/${finalResults.length}`);
    console.log(`  📏 Средняя длина: ${avgLength} символов`);
  }
  
  console.log(`\n\n📈 ОБЩАЯ СТАТИСТИКА:`);
  console.log(`  ✅ Успешных ответов: ${totalSuccess}/${totalRequests} (${Math.round(totalSuccess/totalRequests*100)}%)`);
  
  // Породы с проблемами
  const problemBreeds = finalResults.filter(r => 
    Object.values(r.intents).some(i => !i.success)
  );
  
  if (problemBreeds.length > 0) {
    console.log(`\n\n⚠️  ПОРОДЫ С ПРОБЛЕМАМИ (${problemBreeds.length}):\n`);
    problemBreeds.forEach(r => {
      const problems = [];
      for (const intent of intents) {
        if (!r.intents[intent.name].success) {
          problems.push(intent.displayName);
        }
      }
      console.log(`   - ${r.breed}: ${problems.join(", ")}`);
    });
  }
  
  // Сохраняем итоговый отчет
  const report = {
    timestamp: new Date().toISOString(),
    totalBreeds: finalResults.length,
    totalRequests: totalRequests,
    totalSuccess: totalSuccess,
    successRate: Math.round(totalSuccess/totalRequests*100),
    intents: intents.map(intent => {
      const intentResults = finalResults.map(r => r.intents[intent.name]);
      return {
        name: intent.name,
        displayName: intent.displayName,
        success: intentResults.filter(r => r.success).length,
        errors: intentResults.filter(r => r.isError).length,
        avgLength: Math.round(intentResults.reduce((sum, r) => sum + r.length, 0) / intentResults.length)
      };
    }),
    problemBreeds: problemBreeds.map(r => ({
      breed: r.breed,
      problems: intents.filter(intent => !r.intents[intent.name].success).map(i => i.displayName)
    }))
  };
  
  fs.writeFileSync("test-report-all-100.json", JSON.stringify(report, null, 2));
  console.log(`\n\n💾 Результаты сохранены в: ${resultsFile}`);
  console.log(`💾 Отчет сохранен в: test-report-all-100.json`);
}

main().catch(err => {
  console.error("\n❌ Ошибка:", err.message);
  process.exit(1);
});


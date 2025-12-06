const axios = require("axios");
const fs = require("fs");

const USER_AGENT = "CatBot/1.0 Test";
const WEBHOOK_URL = "http://localhost:3000/webhook";

// Загружаем список из 100 пород
const breeds = JSON.parse(fs.readFileSync("breeds-100.json", "utf8"));

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
    // Минимальная задержка для максимальной скорости
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return results;
}

async function main() {
  console.log(`🚀 ТЕСТ НА МАКСИМАЛЬНОЙ СКОРОСТИ`);
  console.log(`🧪 Тестирование ${breeds.length} пород по ${intents.length} интентам...\n`);
  console.log(`Всего запросов: ${breeds.length * intents.length}\n`);

  const allResults = [];
  const resultsFile = "test-results-100-fast.json";
  const startTime = Date.now();
  
  // Удаляем старые результаты
  if (fs.existsSync(resultsFile)) {
    fs.unlinkSync(resultsFile);
  }
  
  for (let i = 0; i < breeds.length; i++) {
    const result = await testBreed(breeds[i], i, breeds.length);
    allResults.push(result);
    
    // Сохраняем результаты после каждой породы
    fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Статистика
  console.log("\n\n" + "=".repeat(80));
  console.log("📊 ИТОГОВЫЕ РЕЗУЛЬТАТЫ:");
  console.log("=".repeat(80));
  console.log(`⏱️  Время выполнения: ${elapsed} секунд`);
  console.log(`📈 Скорость: ${(breeds.length * intents.length / (elapsed / 60)).toFixed(1)} запросов/минуту\n`);
  
  let totalSuccess = 0;
  let totalRequests = 0;
  
  for (const intent of intents) {
    const intentResults = allResults.map(r => r.intents[intent.name]);
    const success = intentResults.filter(r => r.success).length;
    const errors = intentResults.filter(r => r.isError).length;
    const avgLength = Math.round(intentResults.reduce((sum, r) => sum + r.length, 0) / intentResults.length);
    
    totalSuccess += success;
    totalRequests += allResults.length;
    
    console.log(`${intent.displayName} (${intent.name}):`);
    console.log(`  ✅ Успешно: ${success}/${allResults.length} (${Math.round(success/allResults.length*100)}%)`);
    console.log(`  ❌ Ошибки: ${errors}/${allResults.length}`);
    console.log(`  📏 Средняя длина: ${avgLength} символов\n`);
  }
  
  console.log(`📈 ОБЩАЯ СТАТИСТИКА:`);
  console.log(`  ✅ Успешных ответов: ${totalSuccess}/${totalRequests} (${Math.round(totalSuccess/totalRequests*100)}%)`);
  
  // Породы с проблемами
  const problemBreeds = allResults.filter(r => 
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
  } else {
    console.log(`\n\n✅ ВСЕ ПОРОДЫ РАБОТАЮТ КОРРЕКТНО!`);
  }
  
  // Сохраняем итоговый отчет
  const report = {
    timestamp: new Date().toISOString(),
    totalBreeds: allResults.length,
    totalRequests: totalRequests,
    totalSuccess: totalSuccess,
    successRate: Math.round(totalSuccess/totalRequests*100),
    elapsedSeconds: parseFloat(elapsed),
    requestsPerMinute: parseFloat((breeds.length * intents.length / (elapsed / 60)).toFixed(1)),
    intents: intents.map(intent => {
      const intentResults = allResults.map(r => r.intents[intent.name]);
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
  
  fs.writeFileSync("test-report-100-fast.json", JSON.stringify(report, null, 2));
  console.log(`\n\n💾 Результаты сохранены:`);
  console.log(`   - ${resultsFile}`);
  console.log(`   - test-report-100-fast.json`);
}

main().catch(err => {
  console.error("\n❌ Ошибка:", err.message);
  process.exit(1);
});


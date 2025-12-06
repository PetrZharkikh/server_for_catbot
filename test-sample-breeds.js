const axios = require("axios");

const USER_AGENT = "CatBot/1.0 Test";
const WEBHOOK_URL = "http://localhost:3000/webhook";

// Выбираем 20 пород для быстрого теста (разные категории)
const sampleBreeds = [
  "Мейн-кун", "Британская короткошёрстная", "Сиамская", "Персидская",
  "Сфинкс", "Норвежская лесная", "Русская голубая", "Абиссинская",
  "Ориентальная", "Рэгдолл", "Саванна", "Корниш-рекс",
  "Сибирская", "Нибелунг", "Бурманская", "Манчкин",
  "Тонкинская", "Сингапурская", "Сноу-шу", "Польская короткошёрстная"
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
      isError: isError,
      preview: fulfillmentText.substring(0, 150).replace(/\s+/g, " ")
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

async function testBreed(breed) {
  const results = { breed, intents: {} };
  
  for (const intent of intents) {
    const result = await testRequest(breed, intent);
    results.intents[intent.name] = result;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return results;
}

async function main() {
  console.log(`🧪 Тестирование ${sampleBreeds.length} пород по ${intents.length} интентам\n`);
  console.log("=".repeat(80));
  
  const allResults = [];
  
  for (let i = 0; i < sampleBreeds.length; i++) {
    const breed = sampleBreeds[i];
    process.stdout.write(`\r[${i + 1}/${sampleBreeds.length}] ${breed}...`);
    
    const result = await testBreed(breed);
    allResults.push(result);
  }
  
  console.log("\n\n" + "=".repeat(80));
  console.log("📊 РЕЗУЛЬТАТЫ:");
  console.log("=".repeat(80));
  
  // Статистика
  let totalSuccess = 0;
  let totalRequests = 0;
  
  for (const intent of intents) {
    const intentResults = allResults.map(r => r.intents[intent.name]);
    const success = intentResults.filter(r => r.success).length;
    const errors = intentResults.filter(r => r.isError).length;
    const avgLength = Math.round(intentResults.reduce((sum, r) => sum + r.length, 0) / intentResults.length);
    
    totalSuccess += success;
    totalRequests += sampleBreeds.length;
    
    console.log(`\n${intent.displayName} (${intent.name}):`);
    console.log(`  ✅ Успешно: ${success}/${sampleBreeds.length} (${Math.round(success/sampleBreeds.length*100)}%)`);
    console.log(`  ❌ Ошибки: ${errors}/${sampleBreeds.length}`);
    console.log(`  📏 Средняя длина: ${avgLength} символов`);
  }
  
  console.log(`\n\n📈 ОБЩАЯ СТАТИСТИКА:`);
  console.log(`  ✅ Успешных ответов: ${totalSuccess}/${totalRequests} (${Math.round(totalSuccess/totalRequests*100)}%)`);
  
  // Детальные результаты
  console.log(`\n\n📋 ДЕТАЛЬНЫЕ РЕЗУЛЬТАТЫ ПО ПОРОДАМ:\n`);
  allResults.forEach((r, i) => {
    const status = Object.values(r.intents).every(i => i.success) ? "✅" : 
                  Object.values(r.intents).some(i => i.isError) ? "❌" : "⚠️";
    console.log(`${i + 1}. ${status} ${r.breed}`);
    
    for (const intent of intents) {
      const res = r.intents[intent.name];
      const icon = res.success ? "✅" : res.isError ? "❌" : "⚠️";
      console.log(`   ${icon} ${intent.displayName}: ${res.length} символов`);
      if (res.isError || res.length < 50) {
        console.log(`      ${res.preview}...`);
      }
    }
    console.log();
  });
}

main().catch(console.error);


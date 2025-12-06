const axios = require("axios");
const cheerio = require("cheerio");

const USER_AGENT = "CatBot/1.0 Test";

// Список всех пород из Dialogflow
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
  "Тонкинская", "Колор-пойнт короткошерстный", "Американская жесткошерстная", "Азиатская табби",
  "Азиатская дымчатая", "Кашмирская", "Рагамаффин", "Сококе",
  "Самфур", "Чаузи", "Бразильская короткошерстная", "Мандалай",
  "Серая дымчатая", "Тиффани", "Австралийский мист", "Квинслендская",
  "Тайская", "Американская лирандская", "Кохона", "Ликкой",
  "Селкирк-рекс длинношерстный"
];

// Функция нормализации (копия из index.js)
function normalizeBreed(name) {
  const translitMap = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  
  const specialCases = {
    'мейн': 'mejn',
    'персидск': 'persidsk',
    'британск': 'britansk',
    'сиамск': 'siamsk',
    'ориентал': 'oriental',
    'регдолл': 'regdoll',
    'регдол': 'regdoll',
    'рэгдолл': 'regdoll'
  };

  let normalized = name
    .toLowerCase()
    .trim()
    .replace(/\s+кошк[аиуеы]?\s*/gi, "")
    .replace(/\s+кот[ауеы]?\s*/gi, "")
    .replace(/\s+короткош[ёе]рстн[аяуюойые]?\s*/gi, "")
    .replace(/\s+длиннош[ёе]рстн[аяуюойые]?\s*/gi, "")
    .replace(/\s+полудлиннош[ёе]рстн[аяуюойые]?\s*/gi, "")
    .replace(/\s+лыс[аяуюойые]?\s*/gi, "")
    .replace(/\s+ориентальн[аяуюойые]?\s*/gi, "");

  const sortedCases = Object.entries(specialCases).sort((a, b) => b[0].length - a[0].length);
  
  for (const [key, value] of sortedCases) {
    if (normalized.includes(key)) {
      normalized = normalized.replace(key, value);
      normalized = normalized.replace(/\s+/g, " ").trim();
      if (normalized === value || normalized.startsWith(value + ' ')) {
        normalized = value;
        break;
      }
      break;
    }
  }

  if (!sortedCases.some(([key, value]) => normalized === value)) {
    normalized = normalized
      .split('')
      .map(char => {
        if (/[a-z0-9-]/.test(char)) return char;
        return translitMap[char] || '';
      })
      .join('');
  }

  normalized = normalized
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized;
}

// Проверка одной породы
async function checkBreed(breed) {
  const normalized = normalizeBreed(breed);
  
  const categories = [
    "dlinnoshyorstnye",
    "poludlinnoshyorstnye",
    "korotkoshyorstnye",
    "lysye",
    "orientalnye"
  ];

  const possibleUrls = [
    ...categories.map(cat => `https://koshkiwiki.ru/porody/${cat}/${normalized}.html`),
    ...categories.map(cat => `https://koshkiwiki.ru/porody/${cat}/${normalized}-koshka.html`)
  ];

  for (const url of possibleUrls) {
    try {
      const response = await axios.get(url, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 5000
      });

      if (response.status === 200 && 
          !response.data.includes("Запрашиваемая страница не найдена") &&
          response.data.length > 10000) {
        
        const $ = cheerio.load(response.data);
        let hasCare = false;
        let hasFood = false;
        
        $("h2").each((i, elem) => {
          const heading = $(elem).text().trim();
          if (heading === "Рекомендации по уходу" || heading.includes("Рекомендации по уходу")) {
            hasCare = true;
          }
          if (heading === "Организация питания" || heading.includes("Организация питания")) {
            hasFood = true;
          }
        });
        
        return {
          breed,
          normalized,
          found: true,
          url,
          hasCare,
          hasFood
        };
      }
    } catch (err) {
      continue;
    }
  }

  return {
    breed,
    normalized,
    found: false,
    url: null,
    hasCare: false,
    hasFood: false
  };
}

// Тестируем все породы
async function testAllBreeds() {
  console.log(`🧪 Тестирование ${breeds.length} пород...\n`);
  
  const results = {
    found: [],
    notFound: [],
    foundWithCare: [],
    foundWithFood: [],
    foundWithBoth: []
  };

  for (let i = 0; i < breeds.length; i++) {
    const breed = breeds[i];
    process.stdout.write(`\r[${i + 1}/${breeds.length}] Проверяю: ${breed}...`);
    
    const result = await checkBreed(breed);
    
    if (result.found) {
      results.found.push(result);
      if (result.hasCare) results.foundWithCare.push(result);
      if (result.hasFood) results.foundWithFood.push(result);
      if (result.hasCare && result.hasFood) results.foundWithBoth.push(result);
    } else {
      results.notFound.push(result);
    }
    
    // Небольшая задержка, чтобы не перегружать сервер
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log("\n\n" + "=".repeat(60));
  console.log("📊 РЕЗУЛЬТАТЫ:");
  console.log("=".repeat(60));
  console.log(`✅ Найдено на сайте: ${results.found.length}/${breeds.length}`);
  console.log(`❌ Не найдено: ${results.notFound.length}/${breeds.length}`);
  console.log(`\n📋 Детали:`);
  console.log(`   - С разделом "Уход": ${results.foundWithCare.length}`);
  console.log(`   - С разделом "Питание": ${results.foundWithFood.length}`);
  console.log(`   - С обоими разделами: ${results.foundWithBoth.length}`);

  if (results.notFound.length > 0) {
    console.log(`\n❌ НЕ НАЙДЕНЫ (${results.notFound.length}):`);
    results.notFound.slice(0, 20).forEach(r => {
      console.log(`   - ${r.breed} (нормализовано: ${r.normalized})`);
    });
    if (results.notFound.length > 20) {
      console.log(`   ... и еще ${results.notFound.length - 20} пород`);
    }
  }

  if (results.found.length > 0) {
    console.log(`\n✅ НАЙДЕНЫ (первые 10):`);
    results.found.slice(0, 10).forEach(r => {
      const care = r.hasCare ? "✅" : "❌";
      const food = r.hasFood ? "✅" : "❌";
      console.log(`   ${care}${food} ${r.breed} -> ${r.normalized}`);
    });
  }

  return results;
}

testAllBreeds().catch(console.error);


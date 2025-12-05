const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
app.use(express.json());

const USER_AGENT = "CatBot/1.0 (https://server-for-catbot.onrender.com)";

// ----------------------------------------
// Получаем породу из параметров или контекстов
function getBreed(req) {
  const qr = req.body.queryResult || {};
  
  // Сначала проверяем параметры запроса (Dialogflow использует catbreed)
  if (qr.parameters?.catbreed) {
    return qr.parameters.catbreed;
  }
  
  // Также проверяем breed на случай, если используется старое имя
  if (qr.parameters?.breed) {
    return qr.parameters.breed;
  }

  // Проверяем контексты из queryResult
  for (const ctx of qr.outputContexts || []) {
    if (ctx.parameters?.catbreed) {
      return ctx.parameters.catbreed;
    }
    if (ctx.parameters?.breed) {
      return ctx.parameters.breed;
    }
  }

  // Проверяем контексты из корня запроса (Dialogflow может отправлять их там)
  for (const ctx of req.body.outputContexts || []) {
    if (ctx.parameters?.catbreed) {
      return ctx.parameters.catbreed;
    }
    if (ctx.parameters?.breed) {
      return ctx.parameters.breed;
    }
  }

  return null;
}

// ----------------------------------------
// Нормализация и обрезка текста: до N предложений / символов
function cleanSummary(text, maxSentences = 8, maxChars = 1500) {
  if (!text) return "";

  // убираем лишние пробелы/переносы
  text = text.replace(/\s+/g, " ").trim();

  // режем на предложения
  let sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);

  // берём первые maxSentences
  let result = sentences.slice(0, maxSentences).join(" ");

  // ограничиваем по длине
  if (result.length > maxChars) {
    const cut = result.lastIndexOf(" ", maxChars);
    result = result.slice(0, cut > 0 ? cut : maxChars).trim();
    // Убедимся, что не обрываем на середине предложения
    if (!/[.!?]$/.test(result)) {
      const lastSentence = result.split(/(?<=[.!?])\s+/).slice(-1)[0];
      if (lastSentence.length < 20) {
        result = result.slice(0, result.lastIndexOf(".") + 1).trim();
      }
    }
  }

  // убираем дубли знаков препинания
  result = result.replace(/([.!?])\1+/g, "$1").trim();

  // добавляем точку, если вообще ничем не заканчивается
  if (!/[.!?]$/.test(result) && result.length > 0) {
    result += ".";
  }

  return result;
}

// ----------------------------------------
// Поиск статьи породы в Википедии
async function searchBreedArticle(breed) {
  // Пробуем разные варианты запросов
  const queries = [
    breed + " кошка",
    "порода кошек " + breed,
    breed,
    breed + " (порода кошек)"
  ];

  for (const query of queries) {
    const url =
      "https://ru.wikipedia.org/w/api.php" +
      `?action=query&list=search&format=json&utf8=1&srsearch=${encodeURIComponent(
        query
      )}&srlimit=10`;

    try {
      const r = await axios.get(url, {
        headers: { "User-Agent": USER_AGENT }
      });

      const results = r.data?.query?.search || [];
      if (!results.length) continue;

      // пытаемся найти что-то явно про кошек
      const match =
        results.find(x => /кошка|кот|порода/i.test(x.title)) || results[0];

      if (match) return match.title;
    } catch (err) {
      console.error(`Search error for "${query}":`, err.message);
      continue;
    }
  }

  return null;
}

// ----------------------------------------
// Краткое описание породы (summary)
async function getBreedSummary(breed) {
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  try {
    // Пробуем получить расширенное описание через summary API
    const summaryUrl =
      "https://ru.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(title);

    const summaryR = await axios.get(summaryUrl, {
      headers: { "User-Agent": USER_AGENT }
    });

    let extract = summaryR.data?.extract || "";

    // Очищаем extract от вики-разметки
    extract = stripWikiMarkup(extract);

    // Если extract короткий, попробуем получить полный текст статьи
    if (extract.length < 300) {
      const source = await getArticleSource(title);
      if (source) {
        const stripped = stripWikiMarkup(source);
        // Берём первые абзацы из начала статьи (обычно там описание)
        const paragraphs = stripped.split(/\n\n+/).filter(p => p.trim().length > 50);
        if (paragraphs.length > 0) {
          extract = paragraphs.slice(0, 3).join(" ");
        }
      }
    }

    return cleanSummary(extract, 8, 1500);
  } catch (err) {
    console.error("Error getting summary:", err.message);
    return null;
  }
}

// ----------------------------------------
// Получение вики-разметки статьи (source)
async function getArticleSource(title) {
  const url =
    "https://ru.wikipedia.org/w/rest.php/v1/page/" +
    encodeURIComponent(title);

  const r = await axios.get(url, {
    headers: { "User-Agent": USER_AGENT }
  });

  // В новом REST API текст статьи в вики-разметке лежит в поле source
  return r.data?.source || "";
}

// ----------------------------------------
// Удаляем большую часть вики-разметки (улучшенная версия)
function stripWikiMarkup(source) {
  if (!source) return "";

  let text = source;

  // убираем вложенные шаблоны {{...}} (рекурсивно)
  let prevText = "";
  while (text !== prevText) {
    prevText = text;
    text = text.replace(/\{\{[^{}]*\}\}/g, " ");
  }

  // убираем ссылки [http://..] и [..]
  text = text.replace(/\[https?:[^\]]+\]/g, " ");
  
  // Обрабатываем внутренние ссылки википедии [[текст|отображаемый текст]] -> отображаемый текст
  text = text.replace(/\[\[([^\]]+)\|([^\]]+)\]\]/g, "$2");
  // Обрабатываем простые ссылки [[текст]] -> текст
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  
  // Обрабатываем паттерны вида "Текст|текст" (остатки ссылок без скобок)
  text = text.replace(/([А-ЯЁ][а-яё]+)\|([а-яё]+)/g, "$2");
  
  text = text.replace(/\[[^\]]+\]/g, " ");

  // убираем <ref>...</ref> (включая многострочные)
  text = text.replace(/<ref[^>]*>.*?<\/ref>/gis, " ");

  // убираем html-теги
  text = text.replace(/<[^>]+>/g, " ");

  // убираем заголовки == ... ==
  text = text.replace(/^==+\s*.*?\s*==+$/gm, " ");

  // убираем списки * и #
  text = text.replace(/^[\*\#]+\s*/gm, " ");

  // убираем таблицы {| ... |}
  text = text.replace(/\{\|[\s\S]*?\|\}/g, " ");

  // убираем категории [[Категория:...]]
  text = text.replace(/\[\[Категория:[^\]]+\]\]/gi, " ");

  // убираем файлы [[Файл:...]] и паттерны "Файл:...|мини|"
  text = text.replace(/\[\[Файл:[^\]]+\]\]/gi, " ");
  text = text.replace(/Файл:[^|]+\|[^|]+\|/gi, " ");
  text = text.replace(/Файл:[^|]+\|/gi, " ");
  text = text.replace(/Файл:[^\s]+/gi, " ");

  // убираем паттерны вида "текст|текст|текст" (остатки вики-разметки)
  text = text.replace(/[А-Яа-яЁёA-Za-z0-9\s]+\|[А-Яа-яЁёA-Za-z0-9\s]+\|[А-Яа-яЁёA-Za-z0-9\s]+/g, (match) => {
    // Если это похоже на вики-разметку (много разделителей), убираем
    if ((match.match(/\|/g) || []).length >= 2) {
      // Берем последнюю часть после последнего |
      const parts = match.split('|');
      return parts[parts.length - 1] || " ";
    }
    return match;
  });

  // убираем курсив '' и жирный '''
  text = text.replace(/'''(.+?)'''/g, "$1");
  text = text.replace(/''(.+?)''/g, "$1");

  // убираем остатки вики-разметки вида |мини|, |thumb| и т.д.
  text = text.replace(/\|[а-яёa-z]+\|/gi, " ");

  // убираем одиночные вертикальные черты
  text = text.replace(/\s+\|\s+/g, " ");

  // сжимаем пробелы
  text = text.replace(/\s+/g, " ");

  return text.trim();
}

// ----------------------------------------
// Извлекаем секцию по заголовкам (== Уход == и т.п.)
function extractSectionByHeading(source, keywords) {
  if (!source) return null;

  const lines = source.replace(/\r/g, "").split("\n");
  let capturing = false;
  let buffer = [];
  let sectionLevel = 0;

  const lower = s => s.toLowerCase();

  for (let line of lines) {
    const trimmed = line.trim();
    const headerMatch = trimmed.match(/^(==+)\s*(.+?)\s*==+$/);

    if (headerMatch) {
      const level = headerMatch[1].length;
      const h = lower(headerMatch[2]);

      if (keywords.some(k => h.includes(k))) {
        capturing = true;
        sectionLevel = level;
        continue;
      }

      // Если встретили заголовок того же или более высокого уровня - заканчиваем
      if (capturing && level <= sectionLevel) {
        break;
      }
    }

    if (capturing) {
      buffer.push(trimmed);
    }
  }

  if (!buffer.length) return null;

  const raw = buffer.join(" ");
  const stripped = stripWikiMarkup(raw);
  return cleanSummary(stripped, 6, 1200);
}

// ----------------------------------------
// Если явного раздела нет — ищем по всей статье предложения с ключевыми словами
function extractSectionByKeywords(source, keywords) {
  if (!source) return null;

  const stripped = stripWikiMarkup(source);
  if (!stripped) return null;

  // Разбиваем на предложения, но сохраняем контекст
  const sentences = stripped.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 15);
  const lowerKeywords = keywords.map(k => k.toLowerCase());

  // Находим предложения с ключевыми словами и их соседей для контекста
  const matches = [];
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].toLowerCase();
    if (lowerKeywords.some(k => sentence.includes(k))) {
      // Добавляем предыдущее предложение для контекста
      if (i > 0 && !matches.includes(sentences[i - 1])) {
        matches.push(sentences[i - 1]);
      }
      matches.push(sentences[i]);
      // Добавляем следующее предложение для контекста
      if (i < sentences.length - 1 && !matches.includes(sentences[i + 1])) {
        matches.push(sentences[i + 1]);
      }
    }
  }

  if (!matches.length) return null;

  // Убираем дубликаты, сохраняя порядок
  const uniqueMatches = [...new Set(matches)];

  const joined = uniqueMatches.slice(0, 8).join(" ");
  return cleanSummary(joined, 6, 1200);
}

// ----------------------------------------
// Поиск страницы породы на koshkiwiki.ru
async function searchKoshkiWikiBreed(breed) {
  // Нормализуем название породы для URL
  const normalizeBreed = (name) => {
    // Маппинг популярных пород на их URL на сайте (формат: категория/название.html)
    const breedMap = {
      "персидская": { url: "persidskaya", category: "dlinnoshyorstnye" },
      "британская": { url: "britanskaya-korotkosherstnaya", category: "korotkoshyorstnye" },
      "мейн-кун": { url: "mejn-kun", category: "poludlinnoshyorstnye" },
      "сиамская": { url: "siamskaya", category: "orientalnye" },
      "шотландская": { url: "shotlandskaya-vislouxaya", category: "korotkoshyorstnye" },
      "сфинкс": { url: "sphinx", category: "lysye" },
      "бенгальская": { url: "bengalskaya", category: "korotkoshyorstnye" },
      "абиссинская": { url: "abissinskaya", category: "korotkoshyorstnye" },
      "русская голубая": { url: "russkaya-golubaya", category: "korotkoshyorstnye" },
      "норвежская лесная": { url: "norvezhskaya-lesnaya", category: "poludlinnoshyorstnye" }
    };

    const lower = name.toLowerCase().trim();
    if (breedMap[lower]) {
      return breedMap[lower];
    }

    // Если нет в маппинге, возвращаем нормализованную строку
    return {
      url: name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^а-яёa-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
      category: null
    };
  };

  const normalized = normalizeBreed(breed);
  
  // Если есть маппинг с категорией, используем его
  let possibleUrls = [];
  if (normalized.category) {
    possibleUrls.push(`https://koshkiwiki.ru/porody/${normalized.category}/${normalized.url}.html`);
  } else {
    // Категории пород на сайте
    const categories = [
      "dlinnoshyorstnye",      // Длинношёрстные
      "poludlinnoshyorstnye",  // Полудлинношёрстные
      "korotkoshyorstnye",     // Короткошёрстные
      "lysye",                 // Лысые
      "orientalnye"            // Ориентальные
    ];
    
    possibleUrls = [
      // Попробуем в разных категориях
      ...categories.map(cat => `https://koshkiwiki.ru/porody/${cat}/${normalized.url}.html`),
      ...categories.map(cat => `https://koshkiwiki.ru/porody/${cat}/${normalized.url}-koshka.html`),
      // Старые форматы
      `https://koshkiwiki.ru/porody-koshek/${normalized.url}`,
      `https://koshkiwiki.ru/porody-koshek/${normalized.url}-koshka`,
      `https://koshkiwiki.ru/porody/${normalized.url}`,
      `https://koshkiwiki.ru/porody/${normalized.url}-koshka`
    ];
  }

  for (const url of possibleUrls) {
    try {
      const response = await axios.get(url, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 5000
      });
      
      if (response.status === 200) {
        const html = response.data;
        // Проверяем, что это не страница ошибки и есть нужные разделы
        if (!html.includes("Запрашиваемая страница не найдена") &&
            !html.includes('class="error404"') &&
            html.length > 10000 && // Страница должна быть достаточно большой
            (html.includes("Рекомендации по уходу") || html.includes('id="i-6"'))) { // Должен быть раздел об уходе
          if (process.env.DEBUG === 'true') {
            console.log(`KoshkiWiki: Found valid page at ${url} (${html.length} bytes)`);
          }
          return { url, html };
        } else {
          if (process.env.DEBUG === 'true') {
            console.log(`KoshkiWiki: Page at ${url} is not valid`);
          }
        }
      }
    } catch (err) {
      if (process.env.DEBUG === 'true') {
        console.log(`Failed to fetch ${url}:`, err.message);
      }
      continue;
    }
  }

  return null;
}

// ----------------------------------------
// Извлечение информации об уходе с koshkiwiki.ru
async function getCareInfoFromKoshkiWiki(breed) {
  const result = await searchKoshkiWikiBreed(breed);
  if (!result) {
    if (process.env.DEBUG === 'true') {
      console.log(`KoshkiWiki: Page not found for breed "${breed}"`);
    }
    return null;
  }

  try {
    const $ = cheerio.load(result.html);
    let careText = "";

    // Ищем раздел "Рекомендации по уходу" - стандартный раздел на всех страницах
    $("h2").each((i, elem) => {
      const heading = $(elem).text().trim();
      const headingId = $(elem).find("span").attr("id") || "";
      
      // Точное совпадение или по ID якоря
      if (heading === "Рекомендации по уходу" || headingId === "i-6") {
        
        let sectionText = "";
        let current = $(elem).next();
        let depth = 0;
        
        // Собираем весь контент до следующего h2
        while (current.length && depth < 100) {
          if (current.is("h2")) break;
          
          if (current.is("p")) {
            const text = current.text().trim();
            if (text.length > 10) sectionText += text + " ";
          } else if (current.is("ul, ol")) {
            current.find("li").each((j, li) => {
              const liText = $(li).text().trim();
              if (liText.length > 10) sectionText += liText + " ";
            });
          } else if (current.is("h3, h4")) {
            const subHeading = current.text().trim();
            if (subHeading.length > 5) sectionText += subHeading + ". ";
            let subNext = current.next();
            let subDepth = 0;
            while (subNext.length && !subNext.is("h2, h3") && subDepth < 20) {
              if (subNext.is("p")) {
                const text = subNext.text().trim();
                if (text.length > 10) sectionText += text + " ";
              }
              subNext = subNext.next();
              subDepth++;
            }
          } else if (current.is("div.post__yellow, div.post__green, div.post__blue")) {
            const text = current.text().trim();
            if (text.length > 10) sectionText += text + " ";
          }
          
          current = current.next();
          depth++;
        }
        
        if (sectionText.length > 100) {
          careText = sectionText;
          return false;
        }
      }
    });

    // Если не нашли по заголовкам, ищем по ключевым словам в параграфах
    if (!careText || careText.length < 100) {
      $("p, .content p, .entry-content p").each((i, elem) => {
        const text = $(elem).text().trim();
        if (text.length > 30 && /уход|содержание|груминг|расчёсывать|купать|чистить|шерсть|вычёсывать|заботиться/i.test(text)) {
          careText += text + " ";
        }
      });
    }

    if (careText && careText.length > 100) {
      const cleaned = cleanSummary(careText, 6, 1200);
      if (process.env.DEBUG === 'true') {
        console.log(`KoshkiWiki: Found care info for "${breed}" (${cleaned.length} chars)`);
      }
      return cleaned;
    }
  } catch (err) {
    console.error("Error parsing koshkiwiki.ru:", err.message);
  }

  return null;
}

// ----------------------------------------
// Извлечение информации о питании с koshkiwiki.ru
async function getFoodInfoFromKoshkiWiki(breed) {
  const result = await searchKoshkiWikiBreed(breed);
  if (!result) {
    if (process.env.DEBUG === 'true') {
      console.log(`KoshkiWiki: Page not found for breed "${breed}"`);
    }
    return null;
  }

  try {
    const $ = cheerio.load(result.html);
    let foodText = "";

    if (process.env.DEBUG === 'true') {
      console.log(`KoshkiWiki: Parsing page for "${breed}", URL: ${result.url}`);
    }

    // Ищем раздел "Организация питания" - стандартный раздел на всех страницах
    $("h2").each((i, elem) => {
      const heading = $(elem).text().trim();
      const headingId = $(elem).find("span").attr("id") || "";
      
      if (process.env.DEBUG === 'true' && i < 10) {
        console.log(`Found h2: "${heading}", id: "${headingId}"`);
      }
      
      // Точное совпадение "Организация питания" или по ID якоря i-12
      if (heading === "Организация питания" || headingId === "i-12") {
        if (process.env.DEBUG === 'true') {
          console.log(`Found food section!`);
        }
        let sectionText = "";
        let current = $(elem).next();
        let depth = 0;
        
        // Собираем весь контент до следующего h2
        while (current.length && depth < 100) {
          if (current.is("h2")) break;
          
          if (current.is("p")) {
            const text = current.text().trim();
            if (text.length > 10) sectionText += text + " ";
          } else if (current.is("ul, ol")) {
            current.find("li").each((j, li) => {
              const liText = $(li).text().trim();
              if (liText.length > 10) sectionText += liText + " ";
            });
          } else if (current.is("h3, h4")) {
            const subHeading = current.text().trim();
            if (subHeading.length > 5) sectionText += subHeading + ". ";
            let subNext = current.next();
            let subDepth = 0;
            while (subNext.length && !subNext.is("h2, h3") && subDepth < 20) {
              if (subNext.is("p")) {
                const text = subNext.text().trim();
                if (text.length > 10) sectionText += text + " ";
              }
              subNext = subNext.next();
              subDepth++;
            }
          } else if (current.is("div.post__yellow, div.post__green, div.post__blue")) {
            const text = current.text().trim();
            if (text.length > 10) sectionText += text + " ";
          }
          
          current = current.next();
          depth++;
        }
        
        if (sectionText.length > 100) {
          foodText = sectionText;
          return false;
        }
      }
    });

    // Если не нашли по заголовкам, ищем по ключевым словам в параграфах
    if (!foodText || foodText.length < 100) {
      $("p, .content p, .entry-content p").each((i, elem) => {
        const text = $(elem).text().trim();
        if (text.length > 30 && /питание|корм|кормление|рацион|еда|кормить|сухой корм|влажный корм|натурал/i.test(text)) {
          foodText += text + " ";
        }
      });
    }

    if (foodText && foodText.length > 100) {
      const cleaned = cleanSummary(foodText, 6, 1200);
      if (process.env.DEBUG === 'true') {
        console.log(`KoshkiWiki: Found food info for "${breed}" (${cleaned.length} chars)`);
      }
      return cleaned;
    }
  } catch (err) {
    console.error("Error parsing koshkiwiki.ru:", err.message);
  }

  return null;
}

// ----------------------------------------
// Уход
async function getCareInfo(breed) {
  // Сначала пробуем koshkiwiki.ru (более специализированный источник)
  try {
    let care = await getCareInfoFromKoshkiWiki(breed);
    if (care && care.length > 200) {
      if (process.env.DEBUG === 'true') {
        console.log(`Using KoshkiWiki for care info: ${breed}`);
      }
      return care;
    }
  } catch (err) {
    if (process.env.DEBUG === 'true') {
      console.log(`KoshkiWiki error for ${breed}:`, err.message);
    }
  }

  // Fallback на Википедию
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  const source = await getArticleSource(title);
  if (!source) return null;

  // 1) пробуем по заголовкам (расширенный список)
  let section = extractSectionByHeading(source, [
    "уход",
    "содержание",
    "груминг",
    "здоров",
    "здоровье",
    "болезн",
    "характер",
    "особенности",
    "уход и содержание",
    "содержание и уход",
    "health",
    "care",
    "grooming",
    "maintenance"
  ]);

  // 2) если не нашли — ищем по ключевым словам во всём тексте (расширенный список)
  if (!section) {
    section = extractSectionByKeywords(source, [
      "уход",
      "содержание",
      "груминг",
      "расчёсывать",
      "купать",
      "чистить",
      "здоров",
      "болезн",
      "заболеван",
      "шерсть",
      "вычёсывать",
      "ухаживать",
      "health",
      "care",
      "grooming",
      "brush",
      "bath"
    ]);
  }

  // 3) Если всё ещё не нашли, ищем в общих разделах
  if (!section) {
    // Пробуем найти разделы "Характер" или "Особенности", там часто есть информация об уходе
    const charSection = extractSectionByHeading(source, ["характер", "особенности", "описание"]);
    if (charSection) {
      const charStripped = stripWikiMarkup(charSection);
      const sentences = charStripped.split(/(?<=[.!?])\s+/);
      const careSentences = sentences.filter(s => 
        /уход|содержание|груминг|расчёс|купа|чист/i.test(s)
      );
      if (careSentences.length > 0) {
        section = cleanSummary(careSentences.join(" "), 5, 1000);
      }
    }
  }

  return section;
}

// ----------------------------------------
// Питание
async function getFoodInfo(breed) {
  // Сначала пробуем koshkiwiki.ru (более специализированный источник)
  try {
    let food = await getFoodInfoFromKoshkiWiki(breed);
    if (food && food.length > 200) {
      if (process.env.DEBUG === 'true') {
        console.log(`Using KoshkiWiki for food info: ${breed}`);
      }
      return food;
    }
  } catch (err) {
    if (process.env.DEBUG === 'true') {
      console.log(`KoshkiWiki error for ${breed}:`, err.message);
    }
  }

  // Fallback на Википедию
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  const source = await getArticleSource(title);
  if (!source) return null;

  // 1) пробуем по заголовкам (расширенный список)
  let section = extractSectionByHeading(source, [
    "питание",
    "корм",
    "кормление",
    "рацион",
    "питание и кормление",
    "кормление и питание",
    "diet",
    "food",
    "feeding",
    "nutrition"
  ]);

  // 2) если не нашли — ищем по ключевым словам во всём тексте (расширенный список)
  if (!section) {
    section = extractSectionByKeywords(source, [
      "питание",
      "корм",
      "кормление",
      "рацион",
      "кормить",
      "еда",
      "питаться",
      "сухой корм",
      "влажный корм",
      "натуральный",
      "diet",
      "food",
      "feeding",
      "nutrition",
      "feed"
    ]);
  }

  // 3) Если всё ещё не нашли, ищем в общих разделах
  if (!section) {
    // Пробуем найти разделы "Характер" или "Особенности", там иногда есть информация о питании
    const charSection = extractSectionByHeading(source, ["характер", "особенности", "описание", "здоровье"]);
    if (charSection) {
      const charStripped = stripWikiMarkup(charSection);
      const sentences = charStripped.split(/(?<=[.!?])\s+/);
      const foodSentences = sentences.filter(s => 
        /питание|корм|кормление|рацион|еда/i.test(s)
      );
      if (foodSentences.length > 0) {
        section = cleanSummary(foodSentences.join(" "), 5, 1000);
      }
    }
  }

  return section;
}

// ----------------------------------------
// Создание или обновление контекста для сохранения породы
function createBreedContext(req, breed) {
  const qr = req.body.queryResult || {};
  const session = req.body.session;
  
  // Если есть существующий контекст, используем его
  const existingContext = (qr.outputContexts || []).find(ctx => 
    ctx.name?.includes('breed-context') || ctx.name?.includes('breed') || ctx.name?.includes('catbreed')
  );
  
  if (existingContext && session) {
    return {
      name: existingContext.name,
      lifespanCount: 5, // Контекст будет активен 5 оборотов диалога
      parameters: {
        ...existingContext.parameters,
        catbreed: breed
      }
    };
  }
  
  // Создаём новый контекст
  if (session) {
    // Формат: projects/PROJECT_ID/agent/sessions/SESSION_ID/contexts/CONTEXT_NAME
    const contextName = `${session}/contexts/catbreed-context`;
    return {
      name: contextName,
      lifespanCount: 5,
      parameters: {
        catbreed: breed
      }
    };
  }
  
  return null;
}

// ----------------------------------------
// Webhook для Dialogflow
app.post("/webhook", async (req, res) => {
  // Логирование для отладки (можно отключить в продакшене)
  if (process.env.DEBUG === 'true') {
    console.log("Dialogflow request:", JSON.stringify(req.body, null, 2));
  }

  const qr = req.body.queryResult || {};
  const intent = qr.intent?.displayName;
  const session = req.body.session;
  const breed = getBreed(req);

  try {
    // Описание породы
    if (intent === "AskBreedInfo") {
      if (!breed) {
        return res.json({ fulfillmentText: "Укажите породу." });
      }

      const summary = await getBreedSummary(breed);
      if (!summary) {
        return res.json({ fulfillmentText: "Информация не найдена." });
      }

      // Сохраняем породу в контексте для следующих вопросов
      const response = {
        fulfillmentText: summary
      };
      
      const breedContext = createBreedContext(req, breed);
      if (breedContext) {
        response.outputContexts = [breedContext];
      }

      return res.json(response);
    }

    // Уход
    if (intent === "AskCareInfo") {
      if (!breed) {
        return res.json({ fulfillmentText: "Укажите породу." });
      }

      const care = await getCareInfo(breed);
      if (!care) {
        const response = {
          fulfillmentText: "В статье не удалось найти текст, связанный с уходом или содержанием."
        };
        
        const breedContext = createBreedContext(req, breed);
        if (breedContext) {
          response.outputContexts = [breedContext];
        }
        
        return res.json(response);
      }

      const response = {
        fulfillmentText: care
      };
      
      const breedContext = createBreedContext(req, breed);
      if (breedContext) {
        response.outputContexts = [breedContext];
      }

      return res.json(response);
    }

    // Питание
    if (intent === "AskFoodInfo") {
      if (!breed) {
        return res.json({ fulfillmentText: "Укажите породу." });
      }

      const food = await getFoodInfo(breed);
      if (!food) {
        const response = {
          fulfillmentText: "В статье не удалось найти текст, связанный с питанием или кормлением."
        };
        
        const breedContext = createBreedContext(req, breed);
        if (breedContext) {
          response.outputContexts = [breedContext];
        }
        
        return res.json(response);
      }

      const response = {
        fulfillmentText: food
      };
      
      const breedContext = createBreedContext(req, breed);
      if (breedContext) {
        response.outputContexts = [breedContext];
      }

      return res.json(response);
    }

    // По умолчанию
    return res.json({
      fulfillmentText: "Я отвечаю на вопросы об описании породы, уходе и питании."
    });
  } catch (err) {
    console.error("ERROR:", err);
    return res.json({
      fulfillmentText: "Ошибка обработки данных."
    });
  }
});

// ----------------------------------------
app.get("/", (req, res) => res.send("CatBot is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Ready:", PORT));

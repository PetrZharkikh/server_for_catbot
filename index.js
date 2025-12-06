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
  // Нормализуем название породы для поиска
  const normalizeForSearch = (name) => {
    return name
      .toLowerCase()
      .trim()
      // Убираем описательные слова, которые могут мешать поиску
      .replace(/\s+короткош[ёе]рстн[аяуюойые]+/gi, "")
      .replace(/\s+длиннош[ёе]рстн[аяуюойые]+/gi, "")
      .replace(/\s+полудлиннош[ёе]рстн[аяуюойые]+/gi, "")
      .replace(/\s+жесткошерстн[аяуюойые]+/gi, "")
      .replace(/\s+короткошерстн[аяуюойые]+/gi, "")
      .replace(/\s+длинношерстн[аяуюойые]+/gi, "")
      .replace(/\s+кошк[аиуеы]?\s*/gi, "")
      .replace(/\s+кот[ауеы]?\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const normalized = normalizeForSearch(breed);
  
  // Пробуем разные варианты запросов (расширенный список)
  const queries = [
    breed + " кошка",
    normalized + " кошка",
    "порода кошек " + breed,
    "порода кошек " + normalized,
    breed,
    normalized,
    breed + " (порода кошек)",
    normalized + " (порода кошек)",
    // Пробуем без дополнительных слов
    breed.split(" ")[0] + " кошка", // Первое слово
    normalized.split(" ")[0] + " кошка"
  ];

  // Убираем дубликаты
  const uniqueQueries = [...new Set(queries.filter(q => q && q.length > 2))];
  
  // Дополнительные варианты для редких пород
  // Пробуем варианты с дефисами и без
  const breedVariants = [
    breed.replace(/\s+/g, "-"),
    breed.replace(/\s+/g, ""),
    breed.replace(/-/g, " "),
    breed.replace(/\s+/g, "-").toLowerCase(),
    breed.toLowerCase().replace(/\s+/g, "-")
  ];
  
  for (const variant of breedVariants) {
    if (variant !== breed && variant.length > 3) {
      uniqueQueries.push(variant + " кошка");
      uniqueQueries.push("порода кошек " + variant);
      uniqueQueries.push(variant);
    }
  }

  for (const query of uniqueQueries) {
    const url =
      "https://ru.wikipedia.org/w/api.php" +
      `?action=query&list=search&format=json&utf8=1&srsearch=${encodeURIComponent(
        query
        )}&srlimit=15`;

    try {
      const r = await axios.get(url, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 10000
      });

      const results = r.data?.query?.search || [];
      if (!results.length) continue;

      // Сначала пытаемся найти что-то явно про кошек
      let match = results.find(x => /кошка|кот|порода|breed|cat/i.test(x.title));
      
      // Если не нашли, ищем по первому слову названия породы
      if (!match) {
        const firstWord = breed.split(" ")[0].toLowerCase();
        match = results.find(x => 
          x.title.toLowerCase().includes(firstWord) && 
          (x.title.toLowerCase().includes("кош") || x.title.toLowerCase().includes("cat"))
        );
      }
      
      // Если всё ещё не нашли, берём первый результат, если он похож на название породы
      if (!match && results.length > 0) {
        const firstWord = breed.split(" ")[0].toLowerCase();
        if (results[0].title.toLowerCase().includes(firstWord)) {
          match = results[0];
        }
      }
      
      // Последний вариант - берём первый результат
      if (!match && results.length > 0) {
        match = results[0];
      }

      if (match) return match.title;
    } catch (err) {
      if (process.env.DEBUG === 'true') {
        console.error(`Search error for "${query}":`, err.message);
      }
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
  // Нормализуем название породы для URL (транслитерация кириллицы)
  const normalizeBreed = (name) => {
    // Таблица транслитерации кириллицы в латиницу (как на koshkiwiki.ru)
    // Сайт использует стандартную транслитерацию
    const translitMap = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
      'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
      'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
      'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };
    
    // Специальные случаи транслитерации (как на сайте)
    // Некоторые породы имеют особую транслитерацию на сайте
    const specialCases = {
      'мейн': 'mejn',
      'персидск': 'persidsk',
      'британск': 'britansk',
      'сиамск': 'siamsk',
      'ориентал': 'oriental',
      'регдолл': 'regdoll',
      'регдол': 'regdoll'
    };

    let normalized = name
      .toLowerCase()
      .trim()
      // Убираем слово "кошка" если есть
      .replace(/\s+кошк[аиуеы]?\s*/gi, "")
      .replace(/\s+кот[ауеы]?\s*/gi, "")
      // Убираем дополнительные описательные слова, которые не нужны в URL
      // ВАЖНО: удаляем слова целиком, включая окончания
      .replace(/\s*короткош[ёе]рстн[аяуюойые]+/gi, "")
      .replace(/\s*длиннош[ёе]рстн[аяуюойые]+/gi, "")
      .replace(/\s*полудлиннош[ёе]рстн[аяуюойые]+/gi, "")
      .replace(/\s*лыс[аяуюойые]+/gi, "")
      .replace(/\s*ориентальн[аяуюойые]+/gi, "")
      .replace(/\s*жесткошерстн[аяуюойые]+/gi, "")
      .replace(/\s*короткошерстн[аяуюойые]+/gi, "")
      .replace(/\s*длинношерстн[аяуюойые]+/gi, "")
      .replace(/\s*классическ[аяуюойые]+/gi, "")
      .replace(/\s*петербургск[аяуюойые]+/gi, "")
      .replace(/\s*американск[аяуюойые]+/gi, "")
      .replace(/\s*полосат[аяуюойые]+/gi, "")
      .replace(/\s*дымчат[аяуюойые]+/gi, "")
      // Убираем множественные пробелы после удаления слов
      .replace(/\s+/g, " ")
      .trim();

    // Проверяем специальные случаи (сначала полные совпадения, потом частичные)
    // Сортируем по длине ключа (от длинных к коротким), чтобы "регдолл" обрабатывался раньше "регдол"
    const sortedCases = Object.entries(specialCases).sort((a, b) => b[0].length - a[0].length);
    
    for (const [key, value] of sortedCases) {
      if (normalized.includes(key)) {
        // Заменяем ключ на значение
        normalized = normalized.replace(key, value);
        // После замены убираем лишние пробелы
        normalized = normalized.replace(/\s+/g, " ").trim();
        // Если это полное совпадение (порода состоит только из этого слова), возвращаем сразу
        if (normalized === value || normalized.startsWith(value + ' ') || normalized === value) {
          // Оставляем как есть, но убираем остатки после специального случая
          normalized = value;
          break;
        }
        // Если после замены осталось только окончание "ая" или "aya", транслитерируем его и добавляем к value
        const remaining = normalized.replace(value, '').trim();
        if (remaining && remaining.length < 5) {
          // Транслитерируем оставшуюся часть
          const translitRemaining = remaining
            .split('')
            .map(char => {
              if (/[a-z0-9-]/.test(char)) return char;
              return translitMap[char] || '';
            })
            .join('');
          normalized = value + translitRemaining;
        }
        break;
      }
    }

    // Транслитерируем оставшуюся кириллицу в латиницу (только если не было полного совпадения)
    if (!sortedCases.some(([key, value]) => normalized === value)) {
      normalized = normalized
        .split('')
        .map(char => {
          // Если уже латиница или дефис - оставляем как есть
          if (/[a-z0-9-]/.test(char)) return char;
          // Транслитерируем кириллицу
          return translitMap[char] || '';
        })
        .join('');
    }

    // Финальная нормализация для всех случаев
    normalized = normalized
      // Заменяем пробелы на дефисы
      .replace(/\s+/g, "-")
      // Убираем специальные символы, оставляем только буквы, цифры и дефисы
      .replace(/[^a-z0-9-]/g, "")
      // Убираем множественные дефисы
      .replace(/-+/g, "-")
      // Убираем дефисы в начале и конце
      .replace(/^-|-$/g, "")
      // Убираем дублирование окончаний (например, "britanskayaya" -> "britanskaya")
      .replace(/([a-z]+)aya(aya)+$/i, '$1aya')
      .replace(/([a-z]+)aya(aya)+/i, '$1aya')
      // Убираем дублирование "aya" в середине слова
      .replace(/([a-z]+)aya-aya([a-z]*)/i, '$1aya$2');

    return normalized;
  };

  const normalized = normalizeBreed(breed);
  
  if (!normalized || normalized.length < 2) {
    if (process.env.DEBUG === 'true') {
      console.log(`KoshkiWiki: Invalid breed name: "${breed}"`);
    }
    return null;
  }

  // Категории пород на сайте - пробуем все категории автоматически
  const categories = [
    "dlinnoshyorstnye",      // Длинношёрстные
    "poludlinnoshyorstnye",  // Полудлинношёрстные
    "korotkoshyorstnye",     // Короткошёрстные
    "lysye",                 // Лысые
    "orientalnye"            // Ориентальные
  ];
  
  // Формируем список возможных URL в порядке приоритета
  // Пробуем все варианты для любой породы из Dialogflow
  const possibleUrls = [
    // Сначала пробуем с категориями (самый вероятный формат на сайте)
    ...categories.map(cat => `https://koshkiwiki.ru/porody/${cat}/${normalized}.html`),
    ...categories.map(cat => `https://koshkiwiki.ru/porody/${cat}/${normalized}-koshka.html`),
    // Потом без категорий (старые форматы)
    `https://koshkiwiki.ru/porody-koshek/${normalized}.html`,
    `https://koshkiwiki.ru/porody-koshek/${normalized}-koshka.html`,
    `https://koshkiwiki.ru/porody/${normalized}.html`,
    `https://koshkiwiki.ru/porody/${normalized}-koshka.html`
  ];

  for (const url of possibleUrls) {
    try {
      const response = await axios.get(url, {
        headers: { "User-Agent": USER_AGENT },
        timeout: 15000 // Увеличиваем таймаут для медленных запросов
      });
      
      if (response.status === 200) {
        const html = response.data;
        // Проверяем, что это не страница ошибки
        if (!html.includes("Запрашиваемая страница не найдена") &&
            !html.includes('class="error404"') &&
            html.length > 10000) { // Страница должна быть достаточно большой
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
      
      // Ищем по точному тексту заголовка (ID может отличаться на разных страницах)
      if (heading === "Рекомендации по уходу" || heading.includes("Рекомендации по уходу")) {
        
        let sectionText = "";
        let current = $(elem).next();
        let depth = 0;
        
        // Собираем весь контент до следующего h2
        while (current.length && depth < 150) {
          if (current.is("h2")) break;
          
          // Параграфы - используем .text() для извлечения только текста
          if (current.is("p")) {
            const text = current.text().trim();
            // Убираем текст из изображений и рекламы
            if (text.length > 10 && !text.includes("Yandex.RTB") && !text.includes("data:image") && !text.includes("src=")) {
              sectionText += text + " ";
            }
          } 
          // Списки
          else if (current.is("ul, ol")) {
            current.find("li").each((j, li) => {
              const liText = $(li).text().trim();
              if (liText.length > 10) sectionText += liText + " ";
            });
          } 
          // Подзаголовки h3, h4 и их контент
          else if (current.is("h3, h4")) {
            const subHeading = current.text().trim();
            if (subHeading.length > 5 && !subHeading.includes("id=")) {
              sectionText += subHeading + ". ";
            }
            // Собираем контент после подзаголовка
            let subNext = current.next();
            let subDepth = 0;
            while (subNext.length && !subNext.is("h2, h3") && subDepth < 30) {
              if (subNext.is("p")) {
                const text = subNext.text().trim();
                if (text.length > 10 && !text.includes("Yandex.RTB")) {
                  sectionText += text + " ";
                }
              } else if (subNext.is("ul, ol")) {
                subNext.find("li").each((j, li) => {
                  const liText = $(li).text().trim();
                  if (liText.length > 10) sectionText += liText + " ";
                });
              }
              subNext = subNext.next();
              subDepth++;
            }
          } 
          // Специальные блоки с информацией
          else if (current.is("div.post__yellow, div.post__green, div.post__blue, div.post__entry")) {
            const text = current.text().trim();
            if (text.length > 20 && !text.includes("Yandex.RTB")) {
              sectionText += text + " ";
            }
          }
          
          current = current.next();
          depth++;
        }
        
        if (sectionText.length > 100) {
          careText = sectionText;
          if (process.env.DEBUG === 'true') {
            console.log(`KoshkiWiki: Extracted ${sectionText.length} chars of care info`);
          }
          return false; // Прерываем цикл, нашли нужный раздел
        } else {
          if (process.env.DEBUG === 'true') {
            console.log(`KoshkiWiki: Care section found but too short: ${sectionText.length} chars`);
          }
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
      // Очищаем от HTML-тегов и лишних пробелов
      careText = careText
        .replace(/<img[^>]*>/gi, " ") // Убираем img теги полностью
        .replace(/<[^>]+>/g, " ") // Убираем остальные HTML-теги
        .replace(/src="[^"]*"/g, "") // Убираем src атрибуты
        .replace(/alt="[^"]*"/g, "") // Убираем alt атрибуты
        .replace(/data-[^=]*="[^"]*"/g, "") // Убираем data-атрибуты
        .replace(/srcset="[^"]*"/g, "") // Убираем srcset атрибуты
        .replace(/sizes="[^"]*"/g, "") // Убираем sizes атрибуты
        .replace(/\s+/g, " ") // Убираем множественные пробелы
        .trim();
      
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
      
      // Ищем по точному тексту заголовка (ID может отличаться на разных страницах)
      if (heading === "Организация питания" || heading.includes("Организация питания")) {
        if (process.env.DEBUG === 'true') {
          console.log(`Found food section!`);
        }
        let sectionText = "";
        let current = $(elem).next();
        let depth = 0;
        
        // Собираем весь контент до следующего h2
        while (current.length && depth < 150) {
          if (current.is("h2")) break;
          
          // Параграфы
          if (current.is("p")) {
            const text = current.text().trim();
            // Убираем текст из изображений и рекламы
            if (text.length > 10 && !text.includes("Yandex.RTB") && !text.includes("data:image")) {
              sectionText += text + " ";
            }
          } 
          // Списки
          else if (current.is("ul, ol")) {
            current.find("li").each((j, li) => {
              const liText = $(li).text().trim();
              if (liText.length > 10) sectionText += liText + " ";
            });
          } 
          // Подзаголовки h3, h4 и их контент
          else if (current.is("h3, h4")) {
            const subHeading = current.text().trim();
            if (subHeading.length > 5 && !subHeading.includes("id=")) {
              sectionText += subHeading + ". ";
            }
            // Собираем контент после подзаголовка
            let subNext = current.next();
            let subDepth = 0;
            while (subNext.length && !subNext.is("h2, h3") && subDepth < 30) {
              if (subNext.is("p")) {
                const text = subNext.text().trim();
                if (text.length > 10 && !text.includes("Yandex.RTB")) {
                  sectionText += text + " ";
                }
              } else if (subNext.is("ul, ol")) {
                subNext.find("li").each((j, li) => {
                  const liText = $(li).text().trim();
                  if (liText.length > 10) sectionText += liText + " ";
                });
              }
              subNext = subNext.next();
              subDepth++;
            }
          } 
          // Специальные блоки с информацией
          else if (current.is("div.post__yellow, div.post__green, div.post__blue, div.post__entry")) {
            const text = current.text().trim();
            if (text.length > 20 && !text.includes("Yandex.RTB")) {
              sectionText += text + " ";
            }
          }
          
          current = current.next();
          depth++;
        }
        
        if (sectionText.length > 100) {
          foodText = sectionText;
          if (process.env.DEBUG === 'true') {
            console.log(`KoshkiWiki: Extracted ${sectionText.length} chars of food info`);
          }
          return false; // Прерываем цикл, нашли нужный раздел
        } else {
          if (process.env.DEBUG === 'true') {
            console.log(`KoshkiWiki: Food section found but too short: ${sectionText.length} chars`);
          }
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
      // Очищаем от HTML-тегов и лишних пробелов
      foodText = foodText
        .replace(/<img[^>]*>/gi, " ") // Убираем img теги полностью
        .replace(/<[^>]+>/g, " ") // Убираем остальные HTML-теги
        .replace(/src="[^"]*"/g, "") // Убираем src атрибуты
        .replace(/alt="[^"]*"/g, "") // Убираем alt атрибуты
        .replace(/data-[^=]*="[^"]*"/g, "") // Убираем data-атрибуты
        .replace(/srcset="[^"]*"/g, "") // Убираем srcset атрибуты
        .replace(/sizes="[^"]*"/g, "") // Убираем sizes атрибуты
        .replace(/\s+/g, " ") // Убираем множественные пробелы
        .trim();
      
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
  let title = await searchBreedArticle(breed);
  
  // Если не нашли, пробуем альтернативные варианты названия
  if (!title) {
    // Пробуем без дополнительных слов
    const simpleBreed = breed.split(" ")[0];
    if (simpleBreed !== breed && simpleBreed.length > 3) {
      title = await searchBreedArticle(simpleBreed);
    }
  }
  
  // Пробуем варианты с дефисами
  if (!title) {
    const variants = [
      breed.replace(/\s+/g, "-"),
      breed.replace(/\s+/g, ""),
      breed.replace(/-/g, " ")
    ];
    for (const variant of variants) {
      if (variant !== breed && variant.length > 3) {
        title = await searchBreedArticle(variant);
        if (title) break;
      }
    }
  }
  
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
    const charSection = extractSectionByHeading(source, ["характер", "особенности", "описание", "здоровье", "внешний вид"]);
    if (charSection) {
      const charStripped = stripWikiMarkup(charSection);
      const sentences = charStripped.split(/(?<=[.!?])\s+/);
      const careSentences = sentences.filter(s => 
        /уход|содержание|груминг|расчёс|купа|чист|шерсть|вычёсыв/i.test(s) && s.length > 30
      );
      if (careSentences.length > 0) {
        section = cleanSummary(careSentences.join(" "), 5, 1000);
      }
    }
  }

  // 4) Если всё ещё ничего не нашли, пробуем извлечь общую информацию из начала статьи
  if (!section || section.length < 100) {
    const paragraphs = source.split(/\n\n+/).slice(0, 15);
    const relevantText = paragraphs.join(" ");
    const stripped = stripWikiMarkup(relevantText);
    
    // Ищем любые упоминания об уходе в общем тексте
    if (/уход|содержание|груминг/i.test(stripped)) {
      const sentences = stripped.split(/(?<=[.!?])\s+/);
      const careMentions = sentences.filter(s => 
        /уход|содержание|груминг|расчёс|купа|чист|шерсть/i.test(s) && s.length > 30
      );
      if (careMentions.length > 0) {
        section = cleanSummary(careMentions.join(" "), 4, 800);
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
  let title = await searchBreedArticle(breed);
  
  // Если не нашли, пробуем альтернативные варианты названия
  if (!title) {
    // Пробуем без дополнительных слов
    const simpleBreed = breed.split(" ")[0];
    if (simpleBreed !== breed && simpleBreed.length > 3) {
      title = await searchBreedArticle(simpleBreed);
    }
  }
  
  // Пробуем варианты с дефисами
  if (!title) {
    const variants = [
      breed.replace(/\s+/g, "-"),
      breed.replace(/\s+/g, ""),
      breed.replace(/-/g, " ")
    ];
    for (const variant of variants) {
      if (variant !== breed && variant.length > 3) {
        title = await searchBreedArticle(variant);
        if (title) break;
      }
    }
  }
  
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
    const charSection = extractSectionByHeading(source, ["характер", "особенности", "описание", "здоровье", "внешний вид", "стандарт"]);
    if (charSection) {
      const charStripped = stripWikiMarkup(charSection);
      const sentences = charStripped.split(/(?<=[.!?])\s+/);
      const foodSentences = sentences.filter(s => 
        /питание|корм|кормление|рацион|еда|кормить/i.test(s) && s.length > 30
      );
      if (foodSentences.length > 0) {
        section = cleanSummary(foodSentences.join(" "), 5, 1000);
      }
    }
  }

  // 4) Если всё ещё ничего не нашли, пробуем извлечь общую информацию из начала статьи
  if (!section || section.length < 100) {
    const paragraphs = source.split(/\n\n+/).slice(0, 20);
    const relevantText = paragraphs.join(" ");
    const stripped = stripWikiMarkup(relevantText);
    
    // Ищем любые упоминания о питании в общем тексте
    if (/питание|корм|кормление|рацион/i.test(stripped)) {
      const sentences = stripped.split(/(?<=[.!?])\s+/);
      const foodMentions = sentences.filter(s => 
        /питание|корм|кормление|рацион|еда|кормить/i.test(s) && s.length > 30
      );
      if (foodMentions.length > 0) {
        section = cleanSummary(foodMentions.join(" "), 4, 800);
      }
    }
  }

  // 5) Последняя попытка - ищем в любом месте статьи любые упоминания о питании
  if (!section || section.length < 100) {
    const fullStripped = stripWikiMarkup(source);
    const allSentences = fullStripped.split(/(?<=[.!?])\s+/);
    const foodRelated = allSentences.filter(s => {
      const lower = s.toLowerCase();
      return (lower.includes("питание") || lower.includes("корм") || 
              lower.includes("кормление") || lower.includes("рацион") ||
              lower.includes("еда") || lower.includes("кормить")) &&
             s.length > 40 && s.length < 500;
    });
    
    if (foodRelated.length > 0) {
      // Берем первые несколько релевантных предложений
      section = cleanSummary(foodRelated.slice(0, 6).join(" "), 5, 900);
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
  // Всегда логируем запросы для отладки
  console.log("=== Dialogflow Webhook Request ===");
  console.log("Intent:", req.body.queryResult?.intent?.displayName);
  console.log("Breed:", getBreed(req));
  console.log("Session:", req.body.session);
  
  if (process.env.DEBUG === 'true') {
    console.log("Full request:", JSON.stringify(req.body, null, 2));
  }

  const qr = req.body.queryResult || {};
  const intent = qr.intent?.displayName;
  const session = req.body.session;
  const breed = getBreed(req);

  // Убеждаемся, что всегда возвращаем ответ
  try {
    // Описание породы
    if (intent === "AskBreedInfo") {
      if (!breed) {
        return res.json({ fulfillmentText: "Укажите породу." });
      }

      let summary = await getBreedSummary(breed);
      
      // Если не нашли через стандартный поиск, пробуем альтернативные варианты
      if (!summary || summary.length < 100) {
        // Пробуем поиск без дополнительных слов
        const simpleBreed = breed.split(" ")[0];
        if (simpleBreed !== breed && simpleBreed.length > 3) {
          summary = await getBreedSummary(simpleBreed);
        }
      }
      
      // Если всё ещё не нашли, пробуем поиск без последнего слова
      if (!summary || summary.length < 100) {
        const words = breed.split(" ");
        if (words.length > 1) {
          const withoutLast = words.slice(0, -1).join(" ");
          summary = await getBreedSummary(withoutLast);
        }
      }
      
      // Если всё ещё не нашли, пробуем поиск только по первому и последнему слову
      if (!summary || summary.length < 100) {
        const words = breed.split(" ").filter(w => w.length > 2);
        if (words.length > 2) {
          const firstLast = words[0] + " " + words[words.length - 1];
          summary = await getBreedSummary(firstLast);
        }
      }
      
      if (!summary || summary.length < 50) {
        return res.json({ 
          fulfillmentText: `К сожалению, я не смог найти подробную информацию о породе "${breed}". Это может быть редкая или новая порода. Попробуйте уточнить название породы или задать вопрос о другой породе.`
        });
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
        return res.json({ fulfillmentText: "Укажите породу кошки." });
      }

      try {
      let care = await getCareInfo(breed);
      
      // Если не нашли, пробуем альтернативные варианты
      if (!care || care.length < 100) {
        const simpleBreed = breed.split(" ")[0];
        if (simpleBreed !== breed && simpleBreed.length > 3) {
          care = await getCareInfo(simpleBreed);
        }
      }
      
      // Пробуем варианты с дефисами
      if (!care || care.length < 100) {
        const variants = [
          breed.replace(/\s+/g, "-"),
          breed.replace(/-/g, " ")
        ];
        for (const variant of variants) {
          if (variant !== breed && variant.length > 3) {
            care = await getCareInfo(variant);
            if (care && care.length >= 100) break;
          }
        }
      }
      
        const response = {
          fulfillmentText: care || `К сожалению, я не смог найти подробную информацию об уходе за породой "${breed}". Это может быть редкая порода. Рекомендую обратиться к ветеринару или специалисту по данной породе для получения индивидуальных рекомендаций.`
        };
        
        const breedContext = createBreedContext(req, breed);
        if (breedContext) {
          response.outputContexts = [breedContext];
        }
        
        return res.json(response);
      } catch (err) {
        console.error("Error in AskCareInfo:", err);
        return res.json({
          fulfillmentText: `Произошла ошибка при поиске информации об уходе за породой "${breed}". Попробуйте позже.`
        });
      }
    }

    // Питание
    if (intent === "AskFoodInfo") {
      if (!breed) {
        return res.json({ fulfillmentText: "Укажите породу кошки." });
      }

      try {
      let food = await getFoodInfo(breed);
      
      // Если не нашли, пробуем альтернативные варианты
      if (!food || food.length < 100) {
        const simpleBreed = breed.split(" ")[0];
        if (simpleBreed !== breed && simpleBreed.length > 3) {
          food = await getFoodInfo(simpleBreed);
        }
      }
      
        const response = {
          fulfillmentText: food || `К сожалению, я не смог найти подробную информацию о питании для породы "${breed}". Это может быть редкая порода. Рекомендую обратиться к ветеринару для составления индивидуального рациона, подходящего для вашей кошки.`
        };
        
        const breedContext = createBreedContext(req, breed);
        if (breedContext) {
          response.outputContexts = [breedContext];
        }
        
        return res.json(response);
      } catch (err) {
        console.error("Error in AskFoodInfo:", err);
        return res.json({
          fulfillmentText: `Произошла ошибка при поиске информации о питании для породы "${breed}". Попробуйте позже.`
        });
      }
    }

    // По умолчанию - если интент не распознан
    console.log("Unknown intent:", intent);
    return res.json({
      fulfillmentText: "Я отвечаю на вопросы об описании породы, уходе и питании. Укажите породу кошки."
    });
  } catch (err) {
    console.error("=== WEBHOOK ERROR ===");
    console.error("Error:", err);
    console.error("Stack:", err.stack);
    
    // Всегда возвращаем ответ, даже при ошибке
    return res.status(200).json({
      fulfillmentText: "Произошла ошибка при обработке запроса. Попробуйте позже или уточните вопрос."
    });
  }
});

// ----------------------------------------
app.get("/", (req, res) => res.send("CatBot is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Ready:", PORT));

const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const USER_AGENT = "CatBot/1.0 (https://server-for-catbot.onrender.com)";

// ----------------------------------------
// Получаем породу из параметров или контекстов
function getBreed(req) {
  const qr = req.body.queryResult || {};
  if (qr.parameters?.breed) return qr.parameters.breed;

  for (const ctx of qr.outputContexts || []) {
    if (ctx.parameters?.breed) return ctx.parameters.breed;
  }
  return null;
}

// ----------------------------------------
// Нормализация и обрезка текста: до N предложений / символов
function cleanSummary(text, maxSentences = 3, maxChars = 600) {
  if (!text) return "";

  // убираем лишние пробелы/переносы
  text = text.replace(/\s+/g, " ").trim();

  // режем на предложения
  let sentences = text.split(/(?<=[.!?])\s+/);

  // берём первые maxSentences
  let result = sentences.slice(0, maxSentences).join(" ");

  // ограничиваем по длине
  if (result.length > maxChars) {
    const cut = result.lastIndexOf(" ", maxChars);
    result = result.slice(0, cut > 0 ? cut : maxChars).trim();
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
  const query = breed + " кошка";

  const url =
    "https://ru.wikipedia.org/w/api.php" +
    `?action=query&list=search&format=json&utf8=1&srsearch=${encodeURIComponent(
      query
    )}`;

  const r = await axios.get(url, {
    headers: { "User-Agent": USER_AGENT }
  });

  const results = r.data?.query?.search || [];
  if (!results.length) return null;

  // пытаемся найти что-то явно про кошек
  const match =
    results.find(x => /кошка|кот|порода/i.test(x.title)) || results[0];

  return match.title;
}

// ----------------------------------------
// Краткое описание породы (summary)
async function getBreedSummary(breed) {
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  const url =
    "https://ru.wikipedia.org/api/rest_v1/page/summary/" +
    encodeURIComponent(title);

  const r = await axios.get(url, {
    headers: { "User-Agent": USER_AGENT }
  });

  return cleanSummary(r.data?.extract || "", 3, 600);
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
// Удаляем большую часть вики-разметки (очень грубо, но ок для извлечения фраз)
function stripWikiMarkup(source) {
  if (!source) return "";

  let text = source;

  // убираем шаблоны {{...}}
  text = text.replace(/\{\{[^}]*\}\}/g, " ");

  // убираем ссылки [http://..] и [..]
  text = text.replace(/\[https?:[^\]]+\]/g, " ");
  text = text.replace(/\[[^\]]+\]/g, " ");

  // убираем <ref>...</ref>
  text = text.replace(/<ref[^>]*>.*?<\/ref>/gi, " ");

  // убираем html-теги
  text = text.replace(/<[^>]+>/g, " ");

  // убираем заголовки == ... ==
  text = text.replace(/^==+.*?==+$/gm, " ");

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

  const lower = s => s.toLowerCase();

  for (let line of lines) {
    const trimmed = line.trim();
    const headerMatch = trimmed.match(/^==+\s*(.+?)\s*==+$/);

    if (headerMatch) {
      const h = lower(headerMatch[1]);
      if (keywords.some(k => h.includes(k))) {
        capturing = true;
        continue;
      }
      if (capturing) break;
    }

    if (capturing) {
      buffer.push(trimmed);
    }
  }

  if (!buffer.length) return null;

  const raw = buffer.join(" ");
  const stripped = stripWikiMarkup(raw);
  return cleanSummary(stripped, 3, 700);
}

// ----------------------------------------
// Если явного раздела нет — ищем по всей статье предложения с ключевыми словами
function extractSectionByKeywords(source, keywords) {
  if (!source) return null;

  const stripped = stripWikiMarkup(source);
  if (!stripped) return null;

  const sentences = stripped.split(/(?<=[.!?])\s+/);
  const lowerKeywords = keywords.map(k => k.toLowerCase());

  const matches = sentences.filter(s =>
    lowerKeywords.some(k => s.toLowerCase().includes(k))
  );

  if (!matches.length) return null;

  const joined = matches.slice(0, 3).join(" ");
  return cleanSummary(joined, 3, 700);
}

// ----------------------------------------
// Уход
async function getCareInfo(breed) {
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  const source = await getArticleSource(title);
  if (!source) return null;

  // 1) пробуем по заголовкам
  let section = extractSectionByHeading(source, [
    "уход",
    "содержание",
    "груминг",
    "здоров",
    "health",
    "care"
  ]);

  // 2) если не нашли — ищем по ключевым словам во всём тексте
  if (!section) {
    section = extractSectionByKeywords(source, [
      "уход",
      "содержание",
      "груминг",
      "здоров",
      "болезн",
      "health",
      "care"
    ]);
  }

  return section;
}

// ----------------------------------------
// Питание
async function getFoodInfo(breed) {
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  const source = await getArticleSource(title);
  if (!source) return null;

  let section = extractSectionByHeading(source, [
    "питание",
    "корм",
    "кормление",
    "рацион",
    "diet",
    "food"
  ]);

  if (!section) {
    section = extractSectionByKeywords(source, [
      "питание",
      "корм",
      "кормление",
      "рацион",
      "diet",
      "food"
    ]);
  }

  return section;
}

// ----------------------------------------
// Webhook для Dialogflow
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName;
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

      return res.json({ fulfillmentText: summary });
    }

    // Уход
    if (intent === "AskCareInfo") {
      if (!breed) {
        return res.json({ fulfillmentText: "Укажите породу." });
      }

      const care = await getCareInfo(breed);
      if (!care) {
        return res.json({
          fulfillmentText:
            "В статье не удалось найти текст, связанный с уходом или содержанием."
        });
      }

      return res.json({ fulfillmentText: care });
    }

    // Питание
    if (intent === "AskFoodInfo") {
      if (!breed) {
        return res.json({ fulfillmentText: "Укажите породу." });
      }

      const food = await getFoodInfo(breed);
      if (!food) {
        return res.json({
          fulfillmentText:
            "В статье не удалось найти текст, связанный с питанием или кормлением."
        });
      }

      return res.json({ fulfillmentText: food });
    }

    // По умолчанию
    return res.json({
      fulfillmentText:
        "Я отвечаю на вопросы об описании породы, уходе и питании."
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

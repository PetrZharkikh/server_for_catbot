const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const USER_AGENT = "CatBot/1.0 (https://server-for-catbot.onrender.com)";

// -----------------------------------------------
// Utility: random choice
const randomChoice = arr => arr[Math.floor(Math.random() * arr.length)];

// -----------------------------------------------
// Utility: extract breed from parameters OR context
function getBreed(req) {
  const qr = req.body.queryResult || {};

  if (qr.parameters?.breed) return qr.parameters.breed;

  for (const ctx of qr.outputContexts || []) {
    if (ctx.parameters?.breed) return ctx.parameters.breed;
  }

  return null;
}

// -----------------------------------------------
// Cleanup summary so responses are shorter & clearer
function cleanSummary(text) {
  if (!text) return "";

  let parts = text.split(". ").map(s => s.trim());

  // Remove generic definitions like "X — порода кошек"
  if (/—|является|порода|семейство|вид/i.test(parts[0])) {
    parts.shift();
  }

  // Return only the essence: 1–2 sentences
  return parts.slice(0, 2).join(". ") + ".";
}

// -----------------------------------------------
// Search for breed article in Wikipedia
async function searchBreedArticle(breed) {
  const query = breed + " кошка";

  const searchUrl =
    "https://ru.wikipedia.org/w/api.php" +
    `?action=query&list=search&format=json&utf8=1&srsearch=${encodeURIComponent(
      query
    )}`;

  const r = await axios.get(searchUrl, {
    headers: { "User-Agent": USER_AGENT }
  });

  const results = r.data?.query?.search || [];
  if (!results.length) return null;

  // Prefer results that clearly refer to cats
  const match =
    results.find(r => /кошка|кот|порода/i.test(r.title)) ||
    results[0];

  return match.title;
}

// -----------------------------------------------
// Get clean summary
async function getBreedSummary(breed) {
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  const summaryUrl =
    "https://ru.wikipedia.org/api/rest_v1/page/summary/" +
    encodeURIComponent(title);

  const r = await axios.get(summaryUrl, {
    headers: { "User-Agent": USER_AGENT }
  });

  return cleanSummary(r.data?.extract || "");
}

// -----------------------------------------------
// Simple local info for "care"
function getCareInfo(breed) {
  const b = breed.toLowerCase();

  if (b.includes("сиам"))
    return "Сиамские кошки активные, требуют ежедневной игровой нагрузки и периодической мягкой чистки шерсти.";

  if (b.includes("мейн") || b.includes("кун"))
    return "Мейн-куны нуждаются в регулярном вычёсывании 2–3 раза в неделю и устойчивых когтеточках.";

  if (b.includes("британ"))
    return "Британским кошкам требуется регулярное вычёсывание плотной шерсти и контроль питания.";

  return `Уход за породой «${breed}» подразумевает регулярное вычёсывание, игры и доступ к чистой воде.`;
}

// -----------------------------------------------
// Simple local info for "food"
function getFoodInfo(breed) {
  const b = breed.toLowerCase();

  if (b.includes("сиам"))
    return "Сиамским кошкам подходят корма супер-премиум класса с контролем веса.";

  if (b.includes("мейн") || b.includes("кун"))
    return "Мейн-кунам нужен высокобелковый корм и достаточное количество воды.";

  if (b.includes("британ"))
    return "Британцам подходит корм с пониженной калорийностью из-за склонности к полноте.";

  return `Для «${breed}» рекомендуется корм высокого качества или рацион по рекомендации ветеринара.`;
}

// -----------------------------------------------
// Main webhook
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName;
  const breed = getBreed(req);

  try {
    // ---------------------------------------
    // 1. Breed description
    if (intent === "AskBreedInfo") {
      if (!breed) {
        return res.json({ fulfillmentText: "Укажите породу." });
      }

      const summary = await getBreedSummary(breed);
      if (!summary) {
        return res.json({
          fulfillmentText: `Информация о «${breed}» не найдена. Уточните название.`
        });
      }

      return res.json({ fulfillmentText: summary });
    }

    // ---------------------------------------
    // 2. Care info
    if (intent === "AskCareInfo") {
      if (!breed) {
        return res.json({ fulfillmentText: "Укажите породу." });
      }

      return res.json({ fulfillmentText: getCareInfo(breed) });
    }

    // ---------------------------------------
    // 3. Food info
    if (intent === "AskFoodInfo") {
      if (!breed) {
        return res.json({ fulfillmentText: "Укажите породу." });
      }

      return res.json({ fulfillmentText: getFoodInfo(breed) });
    }

    // ---------------------------------------
    // DEFAULT
    return res.json({
      fulfillmentText: "Я отвечаю на вопросы о породах, уходе и питании."
    });

  } catch (err) {
    console.error("ERROR:", err);
    return res.json({
      fulfillmentText: "Произошла ошибка. Попробуйте позже."
    });
  }
});

// -----------------------------------------------
app.get("/", (req, res) => res.send("CatBot server works!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("CatBot ready on port", PORT));

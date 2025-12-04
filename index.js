const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const USER_AGENT = "CatBot/1.0 (https://server-for-catbot.onrender.com)";

// ----------------------------------------
// Utility: extract breed
function getBreed(req) {
  const qr = req.body.queryResult || {};
  if (qr.parameters?.breed) return qr.parameters.breed;

  for (const ctx of qr.outputContexts || [])
    if (ctx.parameters?.breed) return ctx.parameters.breed;

  return null;
}

// -----------------------------------------
// Clean summary → 1–2 предложения
function cleanSummary(text) {
  if (!text) return "";
  text = text.replace(/\s+/g, " ").trim();
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 2).join(" ").trim();
}

// -----------------------------------------
// Wikipedia search (this is stable)
async function searchBreedArticle(breed) {
  const query = breed + " кошка";

  const url =
    "https://ru.wikipedia.org/w/api.php" +
    `?action=query&list=search&format=json&utf8=1&srsearch=${encodeURIComponent(query)}`;

  const r = await axios.get(url, { headers: { "User-Agent": USER_AGENT } });
  const results = r.data?.query?.search || [];
  if (!results.length) return null;

  return (
    results.find(x => /кошка|кот|порода/i.test(x.title)) ||
    results[0]
  ).title;
}

// -----------------------------------------
// Get clean summary of breed
async function getBreedSummary(breed) {
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  // summary endpoint is OK and supported
  const url =
    "https://ru.wikipedia.org/api/rest_v1/page/summary/" +
    encodeURIComponent(title);

  const r = await axios.get(url, { headers: { "User-Agent": USER_AGENT } });
  return cleanSummary(r.data?.extract || "");
}

// -----------------------------------------
// Get wiki source (the modern correct API)
async function getArticleSource(title) {
  const url =
    "https://ru.wikipedia.org/w/rest.php/v1/page/" +
    encodeURIComponent(title);

  const r = await axios.get(url, { headers: { "User-Agent": USER_AGENT } });
  return r.data?.source || "";
}

// -----------------------------------------
// Extract section from wiki markup
function extractSection(source, keywords) {
  if (!source) return null;

  const lines = source.replace(/\r/g, "").split("\n");
  let capturing = false;
  let buffer = [];

  const lower = s => s.toLowerCase();

  for (let line of lines) {
    const trimmed = line.trim();
    const header = trimmed.match(/^==+\s*(.+?)\s*==+$/);

    if (header) {
      const h = lower(header[1]);
      if (keywords.some(k => h.includes(k))) {
        capturing = true;
        continue;
      }
      if (capturing) break;
    }

    if (capturing) buffer.push(trimmed);
  }

  if (!buffer.length) return null;

  let text = buffer.join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return cleanSummary(text);
}

// -----------------------------------------
// care info from wiki
async function getCareInfo(breed) {
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  const source = await getArticleSource(title);

  return extractSection(source, [
    "уход",
    "содержание",
    "груминг",
    "здоров",
    "health",
    "care"
  ]);
}

// -----------------------------------------
// food info from wiki
async function getFoodInfo(breed) {
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  const source = await getArticleSource(title);

  return extractSection(source, [
    "питание",
    "корм",
    "кормление",
    "рацион",
    "diet",
    "food"
  ]);
}

// -----------------------------------------
// Dialogflow webhook
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName;
  const breed = getBreed(req);

  try {
    // DESCRIPTION
    if (intent === "AskBreedInfo") {
      if (!breed) return res.json({ fulfillmentText: "Укажите породу." });

      const summary = await getBreedSummary(breed);
      if (!summary) return res.json({ fulfillmentText: "Информация не найдена." });

      return res.json({ fulfillmentText: summary });
    }

    // CARE
    if (intent === "AskCareInfo") {
      if (!breed) return res.json({ fulfillmentText: "Укажите породу." });

      const care = await getCareInfo(breed);
      if (!care)
        return res.json({
          fulfillmentText: "Раздел об уходе в статье отсутствует."
        });

      return res.json({ fulfillmentText: care });
    }

    // FOOD
    if (intent === "AskFoodInfo") {
      if (!breed) return res.json({ fulfillmentText: "Укажите породу." });

      const food = await getFoodInfo(breed);
      if (!food)
        return res.json({
          fulfillmentText: "Раздел о питании в статье отсутствует."
        });

      return res.json({ fulfillmentText: food });
    }

    return res.json({
      fulfillmentText: "Я отвечаю на вопросы о породах, уходе и питании."
    });
  } catch (err) {
    console.error("ERROR:", err);
    return res.json({
      fulfillmentText: "Ошибка обработки данных."
    });
  }
});

// -----------------------------------------
app.get("/", (req, res) => res.send("CatBot is running."));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Ready:", PORT));

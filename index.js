const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const USER_AGENT = "CatBot/1.0 (https://server-for-catbot.onrender.com)";

const randomChoice = arr => arr[Math.floor(Math.random() * arr.length)];

// -------------------
// Breed extraction
function getBreed(req) {
  const qr = req.body.queryResult || {};

  if (qr.parameters?.breed) return qr.parameters.breed;

  for (const c of qr.outputContexts || []) {
    if (c.parameters?.breed) return c.parameters.breed;
  }

  return null;
}

// -------------------
// Clean summary for description
function cleanSummary(text) {
  if (!text) return "";

  text = text.replace(/\s+/g, " ").trim();

  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 2).join(" ");
}

// -------------------
// Wikipedia search
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

  const match =
    results.find(x => /кошка|кот|порода/i.test(x.title)) ||
    results[0];

  return match.title;
}

// -------------------
// Description: using summary
async function getBreedSummary(breed) {
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  const url =
    "https://ru.wikipedia.org/api/rest_v1/page/summary/" +
    encodeURIComponent(title);

  const r = await axios.get(url, {
    headers: { "User-Agent": USER_AGENT }
  });

  return cleanSummary(r.data?.extract || "");
}

// -------------------
// FULL article for care/food extraction
async function getFullArticleSections(title) {
  const url =
    "https://ru.wikipedia.org/api/rest_v1/page/mobile-sections/" +
    encodeURIComponent(title);

  const r = await axios.get(url, {
    headers: { "User-Agent": USER_AGENT }
  });

  return r.data?.remaining?.sections || [];
}

// -------------------
// Extract section by keywords
function extractSection(sections, keywords) {
  const lower = s => s.toLowerCase();

  for (const sec of sections) {
    if (!sec.line) continue;
    const header = lower(sec.line);

    if (keywords.some(k => header.includes(k))) {
      const text = sec.text
        .replace(/<\/?[^>]+(>|$)/g, "") // remove html tags
        .replace(/\s+/g, " ")
        .trim();
      return cleanSummary(text);
    }
  }

  return null;
}

// -------------------
// Main: care info (intelligent)
async function getCareInfo(breed) {
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  const sections = await getFullArticleSections(title);
  const section = extractSection(sections, [
    "уход",
    "содержание",
    "груминг",
    "здоров",
    "groom",
    "care",
    "health"
  ]);

  return section;
}

// -------------------
// Main: food info (intelligent)
async function getFoodInfo(breed) {
  const title = await searchBreedArticle(breed);
  if (!title) return null;

  const sections = await getFullArticleSections(title);
  const section = extractSection(sections, [
    "питание",
    "корм",
    "diet",
    "food",
    "ration"
  ]);

  return section;
}

// -------------------
// Webhook
app.post("/webhook", async (req, res) => {
  const intent = req.body.queryResult?.intent?.displayName;
  const breed = getBreed(req);

  try {
    // ----- DESCRIPTION -----
    if (intent === "AskBreedInfo") {
      if (!breed)
        return res.json({ fulfillmentText: "Укажите породу." });

      const summary = await getBreedSummary(breed);
      if (!summary)
        return res.json({ fulfillmentText: "Информация не найдена." });

      return res.json({ fulfillmentText: summary });
    }

    // ----- CARE -----
    if (intent === "AskCareInfo") {
      if (!breed)
        return res.json({ fulfillmentText: "Укажите породу." });

      const care = await getCareInfo(breed);
      if (!care)
        return res.json({
          fulfillmentText: "Раздел об уходе в статье отсутствует."
        });

      return res.json({ fulfillmentText: care });
    }

    // ----- FOOD -----
    if (intent === "AskFoodInfo") {
      if (!breed)
        return res.json({ fulfillmentText: "Укажите породу." });

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

  } catch (e) {
    console.error(e);
    return res.json({
      fulfillmentText: "Ошибка обработки данных."
    });
  }
});

// -------------------
app.get("/", (req, res) => res.send("CatBot is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Ready:", PORT));

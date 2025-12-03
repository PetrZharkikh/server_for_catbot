const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const USER_AGENT = "CatBot/1.0 (https://server-for-catbot.onrender.com)";

app.post("/webhook", async (req, res) => {
  console.log("Webhook body:", JSON.stringify(req.body, null, 2));

  const breed = req.body.queryResult?.parameters?.breed;
  console.log("Breed param:", breed);

  if (!breed) {
    return res.json({
      fulfillmentText: "Не понял, какую породу ты ищешь 😿"
    });
  }

  try {
    // 1) Ищем породу
    const searchUrl = `https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      breed
    )}&format=json&utf8=1`;

    console.log("Search URL:", searchUrl);

    const searchResp = await axios.get(searchUrl, {
      headers: { "User-Agent": USER_AGENT }
    });

    const bestMatch = searchResp.data?.query?.search?.[0];
    console.log("Best match from search:", bestMatch);

    if (!bestMatch) {
      return res.json({
        fulfillmentText: "К сожалению, я не нашёл информацию об этой породе."
      });
    }

    const title = bestMatch.title;
    console.log("Using title:", title);

    // 2) Берём summary по найденному title
    const summaryUrl = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title
    )}`;
    console.log("Summary URL:", summaryUrl);

    const summaryResp = await axios.get(summaryUrl, {
      headers: { "User-Agent": USER_AGENT }
    });

    const summary =
      summaryResp.data?.extract ||
      "К сожалению, я не нашёл информации об этой породе.";

    console.log("Summary to send:", summary);

    return res.json({
      fulfillmentText: summary
    });

  } catch (e) {
    console.error(
      "Error while calling Wikipedia:",
      e?.response?.status,
      e?.response?.data || e.message
    );

    return res.json({
      fulfillmentText: "Не смог найти информацию об этой породе 😿"
    });
  }
});

app.get("/", (req, res) => res.send("CatBot server works!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

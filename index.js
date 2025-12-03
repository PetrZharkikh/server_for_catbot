const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  console.log("Webhook body:", JSON.stringify(req.body, null, 2));

  const breed = req.body.queryResult?.parameters?.breed;
  console.log("Breed param:", breed);

  if (!breed) {
    return res.json({
      fulfillmentText: "Не понял, какую породу ты ищешь 😿"
    });
  }

  const url = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(breed)}`;
  console.log("Wikipedia URL:", url);

  try {
    const r = await axios.get(url);
    console.log("Wiki response keys:", Object.keys(r.data));

    const summary =
      r.data?.extract || "К сожалению, я не нашёл информации об этой породе.";

    console.log("Summary to send:", summary);

    return res.json({
      fulfillmentText: summary
    });

  } catch (e) {
    console.error("Error while calling Wikipedia:", e?.response?.status, e?.response?.data || e.message);

    return res.json({
      fulfillmentText: "Не смог найти информацию об этой породе 😿"
    });
  }
});

app.get("/", (req, res) => res.send("CatBot server works!"));

// ВАЖНО для Render:
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

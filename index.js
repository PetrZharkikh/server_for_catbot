const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  const breed = req.body.queryResult?.parameters?.breed;

  if (!breed) {
    return res.json({
      fulfillmentText: "Не понял, какую породу ты ищешь 😿"
    });
  }

  const url = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(breed)}`;

  try {
    const r = await axios.get(url);
    const summary = r.data.extract || "К сожалению, я не нашёл информации об этой породе.";

    return res.json({
      fulfillmentText: summary
    });

  } catch (e) {
    return res.json({
      fulfillmentText: "Не смог найти информацию об этой породе 😿"
    });
  }
});

app.get("/", (req, res) => res.send("CatBot server works!"));

app.listen(3000, () => console.log("Server started!"));

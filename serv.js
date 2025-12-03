const express = require('express');
const app = express();
app.use(express.json());

const axios = require('axios');

app.post('/webhook', async (req, res) => {
  const breed = req.body.queryResult.parameters.breed;

  // Wikipedia API
  const url = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(breed)}`;

  try {
    const r = await axios.get(url);
    
    // Если нашли статью
    const summary = r.data.extract || "К сожалению, я не нашёл информацию.";

    return res.json({
      fulfillmentText: summary
    });

  } catch (e) {
    return res.json({
      fulfillmentText: "Не смог найти информацию об этой породе 😿"
    });
  }
});

app.listen(3000, () => console.log("Webhook работает!"));

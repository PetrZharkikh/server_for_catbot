const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const USER_AGENT = "CatBot/1.0 (https://server-for-catbot.onrender.com)";

// ---- вспомогательные функции ----

// случайный элемент из массива
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// достаём породу из параметров или контекста
function getBreedFromReq(req) {
  const qr = req.body.queryResult || {};
  let breed = qr.parameters?.breed;

  if (breed) return breed;

  const contexts = qr.outputContexts || [];
  for (const ctx of contexts) {
    if (ctx.parameters?.breed) {
      return ctx.parameters.breed;
    }
  }

  return null;
}

// получаем summary породы из Википедии (поиск + summary)
async function getBreedSummary(breed) {
  // 1) поиск
  const searchUrl =
    "https://ru.wikipedia.org/w/api.php" +
    `?action=query&list=search&srsearch=${encodeURIComponent(breed)}` +
    "&format=json&utf8=1";

  const searchResp = await axios.get(searchUrl, {
    headers: { "User-Agent": USER_AGENT }
  });

  const bestMatch = searchResp.data?.query?.search?.[0];
  if (!bestMatch) {
    return null;
  }

  const title = bestMatch.title;

  // 2) summary по title
  const summaryUrl =
    "https://ru.wikipedia.org/api/rest_v1/page/summary/" +
    encodeURIComponent(title);

  const summaryResp = await axios.get(summaryUrl, {
    headers: { "User-Agent": USER_AGENT }
  });

  return {
    title,
    text:
      summaryResp.data?.extract ||
      "К сожалению, я не нашёл информации об этой породе."
  };
}

// простая база по уходу
function getCareText(breed) {
  const b = (breed || "").toLowerCase();

  if (b.includes("сиам")) {
    return "Сиамские кошки очень общительные и активные. Им важно уделять много внимания, играть каждый день и следить за чистотой ушей и глаз. Шерсть короткая, поэтому достаточно иногда вычёсывать мягкой щёткой.";
  }

  if (b.includes("мейн") || b.includes("кун")) {
    return "Мейн-куны крупные и пушистые, поэтому их лучше вычёсывать несколько раз в неделю, особенно в период линьки. Обязательно нужны устойчивые когтеточки и активные игры — это большие, но добрые коты.";
  }

  if (b.includes("британ")) {
    return "Британские кошки обычно спокойные, но им тоже нужны игры и внимание. Уход включает регулярное вычёсывание плотной шерсти, контроль веса и качественный корм — они легко набирают лишнее.";
  }

  // дефолт
  return `В целом уход за породой ${breed} включает три вещи: качественное питание, регулярные игры и базовый уход за шерстью и когтями. Если хочешь, я могу подсказать общие правила содержания домашней кошки 🐾`;
}

// простая база по питанию
function getFoodText(breed) {
  const b = (breed || "").toLowerCase();

  if (b.includes("сиам")) {
    return "Для сиамских кошек хорошо подходят качественные промышленные корма супер-премиум класса или рацион, согласованный с ветеринаром. Важно следить за весом и не перекармливать — они активные, но худоба не всегда норма.";
  }

  if (b.includes("мейн") || b.includes("кун")) {
    return "Мейн-кунам нужен корм для крупных пород или просто высококачественный рацион с достаточным содержанием белка. Важно не допускать лишнего веса и давать достаточно воды.";
  }

  if (b.includes("британ")) {
    return "Британцам часто рекомендуют корма для стерилизованных кошек и контроль калорий — у них есть склонность к полноте. Вода — всегда в свободном доступе, лакомства — по минимуму.";
  }

  return `Обычно для породы ${breed} подойдёт качественный промышленный корм супер-премиум класса или натуральный рацион, но составленный совместно с ветеринаром. Главное — не кормить со стола и следить за весом 😼`;
}

// ---- основной webhook ----

app.post("/webhook", async (req, res) => {
  console.log("Webhook body:", JSON.stringify(req.body, null, 2));

  const qr = req.body.queryResult || {};
  const intent = qr.intent?.displayName || "UnknownIntent";
  let breed = getBreedFromReq(req);

  console.log("Intent:", intent);
  console.log("Breed param (resolved):", breed);

  try {
    // --- INTENT: информация о породе ---
    if (intent === "AskBreedInfo") {
      if (!breed) {
        return res.json({
          fulfillmentText: "Не понял, какую породу ты ищешь 😿 Назови, пожалуйста, породу."
        });
      }

      const info = await getBreedSummary(breed);

      if (!info) {
        return res.json({
          fulfillmentText: `Я не смог найти информацию про породу «${breed}» 😿 Может, попробуем ещё раз или укажем полное название?`
        });
      }

      const templates = [
        `😺 Вот что я нашёл про породу «${info.title}»:\n\n${info.text}`,
        `Если коротко про «${info.title}»: ${info.text}`,
        `Хороший выбор! Порода «${info.title}» — это интересно. Вот что про неё пишут:\n\n${info.text}`,
        `Давай расскажу про «${info.title}» 🐾\n\n${info.text}`
      ];

      const answer = randomChoice(templates);

      return res.json({
        fulfillmentText: answer
      });
    }

    // --- INTENT: уход за породой ---
    if (intent === "AskCareInfo") {
      if (!breed) {
        return res.json({
          fulfillmentText: "За какой породой ты хочешь научиться ухаживать? 😺"
        });
      }

      const care = getCareText(breed);

      const templates = [
        `По уходу за породой «${breed» могу сказать так:\n\n${care}`,
        `😺 Уход за породой «${breed}» в общих чертах такой:\n\n${care}`,
        `Если говорить про уход за «${breed}», важно помнить следующее:\n\n${care}`
      ];

      const answer = randomChoice(templates);

      return res.json({
        fulfillmentText: answer
      });
    }

    // --- INTENT: питание породы ---
    if (intent === "AskFoodInfo") {
      if (!breed) {
        return res.json({
          fulfillmentText: "Для какой породы ты хочешь подобрать питание? 🐾"
        });
      }

      const food = getFoodText(breed);

      const templates = [
        `По питанию породы «${breed» могу подсказать следующее:\n\n${food}`,
        `😺 Кормить породу «${breed}» лучше так:\n\n${food}`,
        `Если коротко про питание для «${breed}»:\n\n${food}`
      ];

      const answer = randomChoice(templates);

      return res.json({
        fulfillmentText: answer
      });
    }

    // --- DEFAULT: вдруг что-то пошло не так ---
    return res.json({
      fulfillmentText:
        "Мяу, я пока не очень понял, чего ты хочешь 😿 Попробуй спросить про породу, уход или питание."
    });

  } catch (e) {
    console.error(
      "Global error in webhook:",
      e?.response?.status,
      e?.response?.data || e.message
    );

    return res.json({
      fulfillmentText:
        "Со мной что-то пошло не так, шуршу усами и пытаюсь разобраться 😿 Попробуй чуть позже."
    });
  }
});

app.get("/", (req, res) => res.send("CatBot server works!"));

// ВАЖНО для Render:
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

const botui = new BotUI("botui-app");
let stopList = [];
let darkMode = false;

// 🌙/🌞 Theme toggle button
const themeToggleBtn = document.getElementById("theme-toggle");

themeToggleBtn.addEventListener("click", () => {
  darkMode = !darkMode;
  const botuiApp = document.getElementById("botui-app");
  botuiApp.classList.toggle("dark-chat", darkMode);
  themeToggleBtn.textContent = darkMode ? "🌞" : "🌙";
});

window.addEventListener("DOMContentLoaded", () => {
  themeToggleBtn.textContent = darkMode ? "🌞" : "🌙";
});

// Start the chat
function startChat() {
  let fareType = "", origin = "", destination = "", routes = [];

  botui.message
    .add({ content: "Hi! 👋 We are National Transport Commission!" })
    .then(() => botui.message.add({
      content: "We can help you find the interprovincial bus fares.",
    }))
    .then(() => botui.message.add({
      content: "What type of fare would you like to check?",
    }))
    .then(() => botui.action.button({
      action: [
        { text: "Normal / Semi / AC", value: "normal" },
        { text: "Highway", value: "highway" },
      ],
    }))
    .then(res => {
      fareType = res.value;
      return fetchStopList(fareType);
    })
    .then(() => botui.message.add({ content: "What's your origin?" }))
    .then(() => getTextWithSuggestions("origin"))
    .then(res => {
      origin = res.trim();
      return botui.message.add({ content: "And your destination?" });
    })
    .then(() => getTextWithSuggestions("destination"))
    .then(res => {
      destination = res.trim();
      return botui.message.bot({ loading: true }).then(() =>
        fetchFareData(fareType, origin, destination).then(r => {
          return new Promise(resolve => {
            setTimeout(() => {
              const loader = document.querySelector(
                "#botui-app .botui-message-content.loading"
              );
              if (loader && loader.closest(".botui-message")) {
                loader.closest(".botui-message").remove();
              }
              resolve(r);
            }, 800);
          });
        })
      );
    })
    .then(r => {
      routes = r;
      if (!routes.length) {
        return botui.message.add({
          content: "😕 No fare data found for that route.",
        });
      }

      return botui.message.add({
        type: "html",
        content: formatFareMessage(routes[0], fareType, origin, destination),
      });
    })
    .then(() => {
      if (routes.length <= 1) {
        return botui.message.add({
          type: "html",
          content:
            `☎️ For other information, call <strong>1955</strong> or contact us on ` +
            `📱 WhatsApp: <strong>071 259 5555</strong>.`,
        });
      }

      return botui.message
        .add({
          content: `📊 There are <strong>${routes.length}</strong> possible routes from <em>${origin}</em> to <em>${destination}</em>.`,
          type: "html",
        })
        .then(() => botui.message.add({
          content: "❓ Would you like to see other possible routes?",
        }))
        .then(() => botui.action.button({
          action: [
            { text: "Yes", value: "yes" },
            { text: "No", value: "no" },
          ],
        }))
        .then(async res => {
          if (res.value === "yes") {
            const others = routes.slice(1);
            await showAllRemaining(others, fareType, origin, destination);
          }
          return botui.message.add({
            type: "html",
            content:
              `☎️ For other information, call <strong>1955</strong> or contact us on ` +
              `📱 WhatsApp: <strong>071 259 5555</strong>.`,
          });
        });
    })
    .then(() => botui.message.add({ content: "Would you like to search another route?" }))
    .then(() => botui.action.button({
      action: [
        { text: "Yes", value: "yes" },
        { text: "No", value: "no" },
      ],
    }))
    .then(res => {
      if (res.value === "yes") startChat();
      else botui.message.add({ content: "👋 Thank you! & Safe travels! 💖" });
    });
}

function fetchFareData(type, origin, destination) {
  const ep = type === "highway" ? "./php/searchHighway.php" : "./php/searchRoutes.php";
  const url = `${ep}?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
  return fetch(url)
    .then(res => res.json())
    .then(data => (Array.isArray(data) ? data : data.routes || []))
    .catch(() => []);
}

function fetchStopList(type) {
  const ep = type === "highway" ? "./php/get_highway.php" : "./php/get_sections.php";
  return fetch(ep)
    .then(res => res.json())
    .then(data => {
      const raw = Array.isArray(data) ? data : data.sections || [];
      stopList = raw.filter(item => typeof item === "string");
    })
    .catch(() => {
      stopList = [];
    });
}

// ✅ Smarter input handling with fallback
async function getTextWithSuggestions(fieldLabel) {
  let input = "";
  let attempts = 0;
  const MAX_ATTEMPTS = 3;
  let done = false;

  while (!done) {
    const { value } = await botui.action.text({
      action: { placeholder: `Enter ${fieldLabel}` },
    });
    input = value.trim();

    const matches = stopList
      .filter(name => name.toLowerCase().includes(input.toLowerCase()))
      .slice(0, 8);

    if (matches.length === 0) {
      attempts++;

      if (attempts >= MAX_ATTEMPTS) {
        await botui.message.add({
          type: "html",
          content: `
            ❗ I couldn't find matches for "<strong>${input}</strong>".<br>
            💡 Try typing only the city or town name.<br>
            📍 Example: <em>Colombo, Kandy, Galle</em>.
          `,
        });
        attempts = 0;
      } else {
        await botui.message.add({
          content: `😕 No matches found for “${input}”. Try again.`,
        });
      }
      continue;
    }

    await botui.message.add({
      type: "html",
      content: '<div style="text-align:left"><strong>🔍 Suggestions:</strong></div>',
    });

    const buttons = matches.map(name => ({ text: name, value: name }));
    buttons.push({ text: "Type again", value: "__retry__" });

    const choice = await botui.action.button({ action: buttons });

    if (choice.value === "__retry__") continue;

    input = choice.value;
    done = true;
  }

  return input;
}

function formatFareMessage(r, type, origin, destination) {
  if (type === "normal") {
    return `
      <div style="text-align:left;line-height:1.8">
        🚍 <strong>Fare from <em>${origin}</em> to <em>${destination}</em>:</strong><br>
        • <strong>Route No:</strong> ${r.route_no || "N/A"}<br>
        • <strong>Route Name:</strong> ${r.route_name || "N/A"}<br>
        <span style="color:orange;">• Normal Fare:</span> Rs. ${r.normal || "N/A"}<br>
        <span style="color:steelblue;">• Semi-Luxury Fare:</span> Rs. ${r.semi || "N/A"}<br>
        <span style="color:green;">• AC Fare:</span> Rs. ${r.ac || "N/A"}
      </div>`;
  } else {
    return `
      <div style="text-align:left;line-height:1.8">
        🛣️ <strong>Highway Fare from <em>${origin}</em> to <em>${destination}</em>:</strong><br>
        • <strong>Route No:</strong> ${r.route_no || "N/A"}<br>
        • <strong>Route Name:</strong> ${r.route_name || "N/A"}<br>
        <span style="color:green;">• Highway Fare:</span> Rs. ${r.highway || "N/A"}<br>
        • <strong>Service Type:</strong> ${r.service_type || "N/A"}
      </div>`;
  }
}

async function showAllRemaining(others, type, origin, destination) {
  for (const r of others) {
    await botui.message.add({
      type: "html",
      content: formatFareMessage(r, type, origin, destination),
    });
  }
}

// 🚀 Initialize chat
startChat();

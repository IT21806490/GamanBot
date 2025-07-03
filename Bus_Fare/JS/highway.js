document.addEventListener("DOMContentLoaded", () => {
  /* ---------- Auto-suggest town names ---------- */
  fetch("./php/get_highway.php")
    .then((res) => res.json())
    .then((data) => {
      const sections =
        Array.isArray(data) ? data : Array.isArray(data.sections) ? data.sections : [];

      const originSuggestions = document.getElementById("originSuggestions");
      const destinationSuggestions = document.getElementById("destinationSuggestions");

      sections.forEach((s) => {
        if (typeof s === "string" && s.trim()) {
          const o = document.createElement("option");
          const d = document.createElement("option");
          o.value = s;
          d.value = s;
          originSuggestions.appendChild(o);
          destinationSuggestions.appendChild(d);
        }
      });
    });

  /* ---------- Fare search ---------- */
  const fareBtn   = document.getElementById("calculateFare");
  const spinner   = document.getElementById("loadingSpinner");
  const resultsEl = document.getElementById("results");

  fareBtn.addEventListener("click", () => {
    const origin      = document.getElementById("origin").value.trim().toUpperCase();
    const destination = document.getElementById("destination").value.trim().toUpperCase();

    if (!origin || !destination) {
      resultsEl.innerHTML =
        "<p class='text-danger'>⚠️ Please enter both Origin and Destination.</p>";
      return;
    }

    startBusAnimation();                           // cosmetic; defined below
    spinner.classList.remove("d-none");

    fetch(
      `./php/searchHighway.php?origin=${encodeURIComponent(
        origin
      )}&destination=${encodeURIComponent(destination)}`
    )
      .then((r) => r.json())
      .then((data) => {
        spinner.classList.add("d-none");
        displayResults(normaliseResponse(data));
      })
      .catch(() => {
        spinner.classList.add("d-none");
        resultsEl.innerHTML =
          "<p class='text-danger'>❗ Error fetching fare data. Please try again.</p>";
      });
  });

  /* ---------- Helpers ---------- */
  function normaliseResponse(data) {
    if (!data) return [];

    // PHP returned an array straight away
    if (Array.isArray(data)) return data;

    // PHP wrapped results in { routes: […] }
    if (Array.isArray(data.routes)) return data.routes;

    // Single object (rare, but handle it)
    if (data.route_no) return [data];

    // Anything else (e.g., { error: … })
    return [];
  }

  function displayResults(routes) {
    if (!routes.length) {
      resultsEl.innerHTML = "<p class='text-danger'>🚫 No results found.</p>";
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="table table-striped table-bordered">
          <thead class="table-dark">
            <tr>
              <th>Route No</th>
              <th>Route Name</th>
              <th class="highway-fare-header">Highway Fare</th>
              <th>Service Type</th>
            </tr>
          </thead>
          <tbody>`;

    routes.forEach((r) => {
      html += `
        <tr>
          <td>${r.route_no ?? "N/A"}</td>
          <td>${r.route_name ?? "N/A"}</td>
          <td class="highway-fare">Rs. ${r.highway ?? "N/A"}</td>
          <td>${r.service_type ?? "N/A"}</td>
        </tr>`;
    });

    html += "</tbody></table></div>";
    resultsEl.innerHTML = html;
  }

  function startBusAnimation() {
    const busWrapper     = document.querySelector(".bus-with-smoke");
    const smokeContainer = document.querySelector(".smoke-container");

    if (!busWrapper) return;

    // restart CSS animation by forcing reflow
    busWrapper.classList.remove("bus-driving");
    void busWrapper.offsetWidth;
    busWrapper.classList.add("bus-driving");

    if (!smokeContainer) return;

    const puffInterval = setInterval(() => {
      const puff = document.createElement("div");
      puff.classList.add("smoke-puff");
      smokeContainer.appendChild(puff);
      setTimeout(() => smokeContainer.removeChild(puff), 1200);
    }, 150);

    setTimeout(() => clearInterval(puffInterval), 4000);
  }
});

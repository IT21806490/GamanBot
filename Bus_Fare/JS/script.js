document.addEventListener("DOMContentLoaded", function () {
  fetch("./php/get_sections.php")
    .then((res) => res.json())
    .then((data) => {
      const sections = Array.isArray(data) ? data : data.sections || [];
      const originSuggestions = document.getElementById("originSuggestions");
      const destinationSuggestions = document.getElementById(
        "destinationSuggestions"
      );

      if (originSuggestions && destinationSuggestions) {
        sections.forEach((section) => {
          if (typeof section === "string" && section.trim() !== "") {
            const opt1 = document.createElement("option");
            const opt2 = document.createElement("option");
            opt1.value = section;
            opt2.value = section;
            originSuggestions.appendChild(opt1);
            destinationSuggestions.appendChild(opt2);
          }
        });
      }
    });

  const fareButton = document.getElementById("calculateFare");

  fareButton.addEventListener("click", function () {
    const origin = document.getElementById("origin").value.trim();
    const destination = document.getElementById("destination").value.trim();
    const resultsDiv = document.getElementById("results");
    const spinner = document.getElementById("loadingSpinner");
    const busImage = document.getElementById("busImage");
    const busImageWrapper = document.querySelector(".bus-with-smoke");

    if (!origin || !destination) {
      resultsDiv.innerHTML = `<p class='text-danger'>⚠️ Please enter both Origin and Destination.</p>`;
      return;
    }

    const busWrapper = document.querySelector(".bus-with-smoke");
    const smokeContainer = document.querySelector(".smoke-container");

    if (busWrapper) {
      // Reset animation
      busWrapper.classList.remove("bus-driving");
      void busWrapper.offsetWidth;
      busWrapper.classList.add("bus-driving");

      // Generate trailing smoke
      if (smokeContainer) {
        let puffInterval = setInterval(() => {
          const puff = document.createElement("div");
          puff.classList.add("smoke-puff");
          smokeContainer.appendChild(puff);

          // Remove after animation ends
          setTimeout(() => {
            smokeContainer.removeChild(puff);
          }, 1200);
        }, 150); // One puff every 150ms

        // Stop puffing after bus animation ends
        setTimeout(() => {
          clearInterval(puffInterval);
        }, 4000); // Same as bus animation duration
      }
    }

    spinner.classList.remove("d-none");

    fetch(
      `./php/searchRoutes.php?origin=${encodeURIComponent(
        origin
      )}&destination=${encodeURIComponent(destination)}`
    )
      .then((res) => res.json())
      .then((data) => {
        const routes = Array.isArray(data) ? data : data.routes || [];
        displayResults(routes);
      })
      .catch(() => {
        resultsDiv.innerHTML = `<p class='text-danger'>❗ Error fetching fare data. Please try again.</p>`;
      })
      .finally(() => {
        // Hide the bus after the animation finishes
        setTimeout(() => {
          spinner.classList.add("d-none");
          fareButton.disabled = false;
        }, 100); // Match animation duration
      });
  });

  function displayResults(dataArray) {
    const resultsDiv = document.getElementById("results");
    const rowsPerPage = 5;
    let currentPage = 1;

    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      resultsDiv.innerHTML = `<p class='text-danger'>🚫 No results found.</p>`;
      return;
    }

    function renderPage(page) {
      const start = (page - 1) * rowsPerPage;
      const end = start + rowsPerPage;
      const pageData = dataArray.slice(start, end);

      let html = `<div class="table-responsive">
        <table class="table table-striped table-bordered">
          <thead class="table-dark">
            <tr>
              <th>Route No</th>
              <th>Route Name</th>
              <th class="normal-fare-header">Normal Fare</th>
              <th class="semi-fare-header">Semi-Luxury Fare</th>
              <th class="ac-fare-header">AC Fare</th>
            </tr>
          </thead>
          <tbody>`;

      pageData.forEach((route) => {
        html += `<tr>
          <td>${route.route_no || "N/A"}</td>
          <td>${route.route_name || "N/A"}</td>
          <td class="normal-fare">Rs. ${route.normal || "N/A"}</td>
          <td class="semi-fare">Rs. ${route.semi || "N/A"}</td>
          <td class="ac-fare">Rs. ${route.ac || "N/A"}</td>
        </tr>`;
      });

      html += `</tbody></table></div>`;

      const totalPages = Math.ceil(dataArray.length / rowsPerPage);
      let pagination = `<div class="d-flex justify-content-center gap-3 mt-3">`;

      if (page > 1)
        pagination += `<button class="btn btn-sm btn-outline-primary" id="prevPage">Previous</button>`;
      pagination += `<span class="pt-1">Page ${page} of ${totalPages}</span>`;
      if (page < totalPages)
        pagination += `<button class="btn btn-sm btn-outline-primary" id="nextPage">Next</button>`;

      pagination += `</div>`;
      resultsDiv.innerHTML = html + pagination;

      if (page > 1) {
        document.getElementById("prevPage").addEventListener("click", () => {
          currentPage--;
          renderPage(currentPage);
        });
      }

      if (page < totalPages) {
        document.getElementById("nextPage").addEventListener("click", () => {
          currentPage++;
          renderPage(currentPage);
        });
      }
    }

    renderPage(currentPage);
  }
});

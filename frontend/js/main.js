const AWS_ALWAR_CENTER = { lat: 27.5634, lng: 76.6344 };
const AWS_CATEGORY_COLORS = {
  safe: "#00c774",
  moderate: "#f59e0b",
  unsafe: "#ef4444",
};

let awsMap = null;
let awsMarkersLayer = null;
let awsUserLocationMarker = null;
let awsAreaCache = [];
let awsReportsRefreshIntervalId = null;

function awsEscapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function awsCategoryPillClass(category) {
  if (category === "safe") return "aws-pill-safe";
  if (category === "moderate") return "aws-pill-moderate";
  return "aws-pill-unsafe";
}

function awsCategoryLabel(category) {
  if (category === "safe") return "Safe";
  if (category === "moderate") return "Moderate";
  return "Unsafe";
}

function awsHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (degree) => (degree * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRad(lat2 - lat1);
  const deltaLon = toRad(lon2 - lon1);

  const calculation =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const arc = 2 * Math.atan2(Math.sqrt(calculation), Math.sqrt(1 - calculation));
  return earthRadiusKm * arc;
}

function awsNormalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function awsExtractAddressTokens(addressData) {
  const address = addressData?.address || {};
  const tokenSources = [
    address.neighbourhood,
    address.suburb,
    address.quarter,
    address.city_district,
    address.village,
    address.town,
    address.city,
    address.county,
    address.road,
    address.display_name,
  ].filter(Boolean);

  const tokens = tokenSources
    .flatMap((value) => awsNormalizeText(value).split(" "))
    .filter((token) => token.length >= 3);

  return [...new Set(tokens)];
}

function awsFindAreaByAddress(addressData, latitude, longitude) {
  if (!addressData || !Array.isArray(awsAreaCache) || !awsAreaCache.length) {
    return null;
  }

  const tokens = awsExtractAddressTokens(addressData);
  if (!tokens.length) return null;

  let bestMatch = null;

  awsAreaCache.forEach((area) => {
    const normalizedName = awsNormalizeText(area.name);
    if (!normalizedName) return;

    const nameWords = normalizedName.split(" ").filter((word) => word.length >= 3);
    let score = 0;

    tokens.forEach((token) => {
      if (normalizedName.includes(token)) {
        score += 3;
        return;
      }

      const partialMatch = nameWords.some(
        (word) => word.startsWith(token) || token.startsWith(word)
      );
      if (partialMatch) {
        score += 1;
      }
    });

    if (score <= 0) return;

    const distanceKm =
      typeof area.latitude === "number" && typeof area.longitude === "number"
        ? awsHaversineDistanceKm(latitude, longitude, area.latitude, area.longitude)
        : Number.POSITIVE_INFINITY;

    if (
      !bestMatch ||
      score > bestMatch.score ||
      (score === bestMatch.score && distanceKm < bestMatch.distanceKm)
    ) {
      bestMatch = { area, score, distanceKm };
    }
  });

  return bestMatch;
}

function awsBuildRegionReasons(area, finalScore, adjustedCategory, modifiers = []) {
  const reasons = [];

  if (typeof area.crimeRate === "number") {
    if (area.crimeRate >= 7) {
      reasons.push(`High crime rate (${area.crimeRate}/10) increases region risk.`);
    } else if (area.crimeRate <= 3) {
      reasons.push(`Low crime rate (${area.crimeRate}/10) supports safer conditions.`);
    } else {
      reasons.push(`Moderate crime rate (${area.crimeRate}/10) requires caution.`);
    }
  }

  if (area.lighting === "poor") {
    reasons.push("Poor lighting reduces visibility after sunset.");
  } else if (area.lighting === "good") {
    reasons.push("Good lighting improves visibility and confidence.");
  }

  if (typeof area.crowdDensity === "number") {
    if (area.crowdDensity <= 3) {
      reasons.push(`Low crowd density (${area.crowdDensity}/10) means fewer nearby helpers.`);
    } else if (area.crowdDensity >= 7) {
      reasons.push(`Higher crowd density (${area.crowdDensity}/10) generally improves perceived safety.`);
    }
  }

  if (Array.isArray(modifiers) && modifiers.length) {
    modifiers.forEach((modifier) => {
      reasons.push(`${modifier.reason} applied (${modifier.impact}).`);
    });
  }

  reasons.push(
    `Final score is ${finalScore}/100, so this region is currently ${awsCategoryLabel(
      adjustedCategory
    )}.`
  );

  return reasons;
}

function updateDateTime() {
  const datetimeElement = document.getElementById("datetime");
  if (!datetimeElement) return;

  const renderDateTime = () => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const formattedTime = now.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    datetimeElement.textContent = `${formattedDate} | ${formattedTime}`;
  };

  renderDateTime();
  setInterval(renderDateTime, 1000);
}

function fetchWeather() {
  const weatherDisplay = document.getElementById("weather-display");
  if (!weatherDisplay) return;

  const weatherMap = {
    0: { emoji: "☀️", label: "Clear sky" },
    1: { emoji: "🌤️", label: "Mainly clear" },
    2: { emoji: "⛅", label: "Partly cloudy" },
    3: { emoji: "☁️", label: "Overcast" },
    45: { emoji: "🌫️", label: "Fog" },
    48: { emoji: "🌫️", label: "Rime fog" },
    51: { emoji: "🌦️", label: "Light drizzle" },
    53: { emoji: "🌦️", label: "Moderate drizzle" },
    55: { emoji: "🌧️", label: "Dense drizzle" },
    61: { emoji: "🌧️", label: "Slight rain" },
    63: { emoji: "🌧️", label: "Moderate rain" },
    65: { emoji: "🌧️", label: "Heavy rain" },
    71: { emoji: "🌨️", label: "Slight snow" },
    73: { emoji: "🌨️", label: "Moderate snow" },
    75: { emoji: "❄️", label: "Heavy snow" },
    80: { emoji: "🌦️", label: "Rain showers" },
    81: { emoji: "🌧️", label: "Heavy showers" },
    95: { emoji: "⛈️", label: "Thunderstorm" },
  };

  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=27.5634&longitude=76.6344&current_weather=true";

  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Weather API failed with status ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      const weatherCode = data?.current_weather?.weathercode;
      const temperature = data?.current_weather?.temperature;
      const weatherInfo = weatherMap[weatherCode] || {
        emoji: "🌤️",
        label: "Unknown weather",
      };

      weatherDisplay.textContent = `${weatherInfo.emoji} ${weatherInfo.label} | ${
        temperature ?? "--"
      }°C`;
    })
    .catch((error) => {
      console.error(`[Frontend] Weather fetch failed: ${error.message}`);
      weatherDisplay.textContent = "Weather unavailable";
    });
}

function awsPopulateAreaDatalists() {
  const areaNames = awsAreaCache.map((area) => area.name).filter(Boolean);

  ["area-suggestions", "report-area-suggestions"].forEach((listId) => {
    const dataList = document.getElementById(listId);
    if (!dataList) return;

    dataList.innerHTML = "";
    areaNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      dataList.appendChild(option);
    });
  });
}

function setupAreaSearchSuggestions() {
  const areaInput = document.getElementById("area-input");
  const suggestionBox = document.getElementById("area-suggestion-box");

  if (!areaInput || !suggestionBox) return;

  const hideSuggestions = () => {
    suggestionBox.innerHTML = "";
    suggestionBox.classList.add("aws-hidden");
  };

  const showSuggestions = (query) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      hideSuggestions();
      return;
    }

    const matches = awsAreaCache
      .filter((area) => String(area.name || "").toLowerCase().includes(normalizedQuery))
      .slice(0, 6);

    if (!matches.length) {
      hideSuggestions();
      return;
    }

    suggestionBox.innerHTML = "";
    matches.forEach((area) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "aws-suggestion-item";
      button.textContent = area.name;
      button.dataset.name = area.name;
      suggestionBox.appendChild(button);
    });

    suggestionBox.classList.remove("aws-hidden");
  };

  areaInput.addEventListener("input", () => showSuggestions(areaInput.value));
  areaInput.addEventListener("focus", () => showSuggestions(areaInput.value));
  areaInput.addEventListener("blur", () => setTimeout(hideSuggestions, 150));

  suggestionBox.addEventListener("mousedown", (event) => {
    const suggestion = event.target.closest(".aws-suggestion-item");
    if (!suggestion) return;
    areaInput.value = suggestion.dataset.name || "";
    hideSuggestions();
    checkAreaSafety();
  });

  document.addEventListener("click", (event) => {
    if (!suggestionBox.contains(event.target) && event.target !== areaInput) {
      hideSuggestions();
    }
  });
}

function checkAreaSafety() {
  const areaInput = document.getElementById("area-input");
  const errorElement = document.getElementById("area-error");
  const resultCard = document.getElementById("result-card");

  if (!areaInput || !errorElement || !resultCard) return;

  const rawAreaName = areaInput.value.trim();

  if (!rawAreaName) {
    errorElement.textContent = "Please enter an area name before checking.";
    resultCard.className = "aws-result-card aws-glass";
    resultCard.innerHTML = "";
    return;
  }

  errorElement.textContent = "";

  fetch(`/api/areas/${encodeURIComponent(rawAreaName)}`)
    .then((response) =>
      response
        .json()
        .catch(() => ({}))
        .then((payload) => {
          if (!response.ok) {
            const requestError = new Error(payload.message || "Request failed");
            requestError.status = response.status;
            throw requestError;
          }
          return payload;
        })
    )
    .then((payload) => {
      const area = payload.data || {};
      const baseScore = payload.baseScore ?? area.score ?? 0;
      const finalScore = payload.finalScore ?? baseScore;
      const adjustedCategory = payload.adjustedCategory || area.category || "unsafe";
      const modifiers = payload.modifiers || [];
      const tip = area.tip || "Stay alert and use emergency contacts if required.";
      const regionReasons = awsBuildRegionReasons(area, finalScore, adjustedCategory, modifiers);

      const modifiersHtml = modifiers.length
        ? modifiers
            .map(
              (item) =>
                `<li>${awsEscapeHtml(item.reason)} (${item.impact > 0 ? "+" : ""}${
                  item.impact
                })</li>`
            )
            .join("")
        : "<li>No active risk modifiers applied.</li>";

      const categoryClass = awsCategoryPillClass(adjustedCategory);
      const isUnsafe = adjustedCategory === "unsafe";

      resultCard.className = `aws-result-card aws-glass aws-result-visible ${
        isUnsafe ? "aws-unsafe-pulse" : ""
      }`;

      resultCard.innerHTML = `
        <h3 class="aws-result-title">${awsEscapeHtml(area.name || rawAreaName)}</h3>
        <div class="aws-result-row">
          <span>Base Score</span>
          <strong>${baseScore}</strong>
        </div>
        <div class="aws-result-row">
          <span>Final Score</span>
          <strong>${finalScore}</strong>
        </div>
        <div class="aws-result-row">
          <span>Adjusted Category</span>
          <span class="aws-category-pill ${categoryClass}">${awsEscapeHtml(
            awsCategoryLabel(adjustedCategory)
          )}</span>
        </div>
        <div class="aws-result-row">
          <span>Safety Tip</span>
          <strong>${awsEscapeHtml(tip)}</strong>
        </div>
        <p class="aws-analysis-heading">Why this region is ${awsEscapeHtml(
          awsCategoryLabel(adjustedCategory)
        )}:</p>
        <ul class="aws-analysis-list">
          ${regionReasons.map((reason) => `<li>${awsEscapeHtml(reason)}</li>`).join("")}
        </ul>
        <p><strong>Modifiers:</strong></p>
        <ul class="aws-modifier-list">${modifiersHtml}</ul>
        <div class="aws-progress-wrap">
          <div id="aws-risk-progress" class="aws-progress-fill"></div>
        </div>
      `;

      const progressElement = document.getElementById("aws-risk-progress");
      if (progressElement) {
        progressElement.style.background =
          AWS_CATEGORY_COLORS[adjustedCategory] || AWS_CATEGORY_COLORS.unsafe;
        setTimeout(() => {
          progressElement.style.width = `${Math.max(0, Math.min(finalScore, 100))}%`;
        }, 60);
      }

      if (awsMap && area.latitude && area.longitude) {
        awsMap.setView([area.latitude, area.longitude], 14, { animate: true });
      }
    })
    .catch((error) => {
      console.error(`[Frontend] Area safety lookup failed: ${error.message}`);

      if (error.status === 404) {
        resultCard.className = "aws-result-card aws-glass aws-result-visible";
        resultCard.innerHTML = `
          <h3 class="aws-result-title">Area not found</h3>
          <p>The searched area is not in the database yet.</p>
          <button id="aws-report-not-found" class="aws-btn aws-btn-secondary" type="button">
            Report this area
          </button>
        `;

        const reportButton = document.getElementById("aws-report-not-found");
        if (reportButton) {
          reportButton.addEventListener("click", () => {
            const reportAreaInput = document.getElementById("report-areaName");
            if (reportAreaInput) {
              reportAreaInput.value = rawAreaName;
              document.getElementById("report")?.scrollIntoView({ behavior: "smooth" });
            } else {
              window.location.href = `/report?area=${encodeURIComponent(rawAreaName)}`;
            }
          });
        }
      } else {
        resultCard.className = "aws-result-card aws-glass aws-result-visible";
        resultCard.innerHTML =
          "<h3 class='aws-result-title'>Unable to fetch area safety right now.</h3>";
      }
    });
}

function renderAreaGrid(areas) {
  const areasGrid = document.getElementById("areas-grid");
  if (!areasGrid) return;

  if (!areas.length) {
    areasGrid.innerHTML = "<div class='aws-area-card aws-glass'><p>No areas available.</p></div>";
    return;
  }

  areasGrid.innerHTML = areas
    .map(
      (area) => `
      <div class="aws-area-card aws-glass" data-name="${awsEscapeHtml(
        area.name
      )}" data-category="${awsEscapeHtml(area.category)}">
        <h3>${awsEscapeHtml(area.name)}</h3>
        <p>
          <span class="aws-category-pill ${awsCategoryPillClass(area.category)}">${awsEscapeHtml(
        awsCategoryLabel(area.category)
      )}</span>
        </p>
        <p>Base Score: ${area.score}</p>
        <p>Crime Rate: ${area.crimeRate}/10</p>
        <p>${awsEscapeHtml(area.tip || "No tip available")}</p>
      </div>
    `
    )
    .join("");

  areasGrid.querySelectorAll(".aws-area-card").forEach((card) => {
    card.addEventListener("click", () => {
      const selectedName = card.getAttribute("data-name") || "";
      const areaInput = document.getElementById("area-input");
      if (areaInput) {
        areaInput.value = selectedName;
        checkAreaSafety();
      } else {
        window.location.href = `/?area=${encodeURIComponent(selectedName)}`;
      }
    });
  });
}

function renderMapMarkers() {
  if (!awsMap || !awsMarkersLayer) return;

  awsMarkersLayer.clearLayers();

  awsAreaCache.forEach((area) => {
    if (typeof area.latitude !== "number" || typeof area.longitude !== "number") return;

    const markerColor = AWS_CATEGORY_COLORS[area.category] || AWS_CATEGORY_COLORS.unsafe;

    const marker = L.circleMarker([area.latitude, area.longitude], {
      radius: 8,
      color: markerColor,
      fillColor: markerColor,
      fillOpacity: 0.82,
      weight: 2,
    }).bindPopup(`
      <strong>${awsEscapeHtml(area.name)}</strong><br/>
      Risk: ${awsEscapeHtml(awsCategoryLabel(area.category))}<br/>
      Score: ${area.score}<br/>
      Tip: ${awsEscapeHtml(area.tip || "No tip")}
    `);

    marker.addTo(awsMarkersLayer);
  });
}

function loadAllAreas() {
  return fetch("/api/areas")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load areas (${response.status})`);
      }
      return response.json();
    })
    .then((payload) => {
      awsAreaCache = payload.data || [];
      awsPopulateAreaDatalists();
      renderAreaGrid(awsAreaCache);
      renderMapMarkers();
    })
    .catch((error) => {
      console.error(`[Frontend] Failed to load all areas: ${error.message}`);
      const areasGrid = document.getElementById("areas-grid");
      if (areasGrid) {
        areasGrid.innerHTML =
          "<div class='aws-area-card aws-glass'><p>Unable to load areas at this time.</p></div>";
      }
    });
}

function filterAreas(category) {
  const cards = document.querySelectorAll("#areas-grid .aws-area-card");
  cards.forEach((card) => {
    const cardCategory = card.getAttribute("data-category");
    const shouldShow = category === "all" || cardCategory === category;
    card.style.display = shouldShow ? "block" : "none";
  });

  document.querySelectorAll(".aws-filter-btn").forEach((button) => {
    const isActive = button.getAttribute("data-filter") === category;
    button.classList.toggle("aws-active", isActive);
  });
}

function awsGetNearestArea(latitude, longitude) {
  if (!Array.isArray(awsAreaCache) || !awsAreaCache.length) return null;

  let nearestArea = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  awsAreaCache.forEach((area) => {
    if (typeof area.latitude !== "number" || typeof area.longitude !== "number") return;

    const distanceKm = awsHaversineDistanceKm(latitude, longitude, area.latitude, area.longitude);
    if (distanceKm < nearestDistance) {
      nearestDistance = distanceKm;
      nearestArea = area;
    }
  });

  if (!nearestArea) return null;

  return {
    ...nearestArea,
    distanceKm: nearestDistance,
  };
}

function awsGetLocationPrediction(latitude, longitude, addressData = null) {
  const nearestArea = awsGetNearestArea(latitude, longitude);
  const localityMatch = awsFindAreaByAddress(addressData, latitude, longitude);

  let selectedArea = nearestArea;
  let matchType = "nearest";

  if (localityMatch) {
    const shouldUseLocalityMatch =
      !nearestArea ||
      localityMatch.score >= 2 ||
      localityMatch.distanceKm <= nearestArea.distanceKm + 1.5;

    if (shouldUseLocalityMatch) {
      selectedArea = {
        ...localityMatch.area,
        distanceKm: localityMatch.distanceKm,
      };
      matchType = "locality";
    }
  }

  if (!selectedArea) return Promise.resolve(null);

  return fetch(`/api/areas/${encodeURIComponent(selectedArea.name)}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Area prediction API failed (${response.status})`);
      }
      return response.json();
    })
    .then((payload) => {
      const area = payload.data || nearestArea;
      const finalScore = payload.finalScore ?? area.score ?? 0;
      const adjustedCategory = payload.adjustedCategory || area.category || "unsafe";
      const modifiers = payload.modifiers || [];

      return {
        area,
        finalScore,
        adjustedCategory,
        modifiers,
        nearestDistanceKm: selectedArea.distanceKm,
        matchType,
        reasons: awsBuildRegionReasons(area, finalScore, adjustedCategory, modifiers),
      };
    })
    .catch((error) => {
      console.error(`[Frontend] Location safety prediction failed: ${error.message}`);
      return null;
    });
}

function awsGetBestCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"));
      return;
    }

    let bestPosition = null;
    let watchId = null;
    let timeoutId = null;
    let settled = false;

    const finish = (position, error) => {
      if (settled) return;
      settled = true;

      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (timeoutId !== null) clearTimeout(timeoutId);

      if (position) {
        resolve(position);
      } else {
        reject(error || new Error("Unable to detect location"));
      }
    };

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
          bestPosition = position;
        }

        if (position.coords.accuracy <= 30) {
          finish(position);
        }
      },
      (error) => {
        if (bestPosition) {
          finish(bestPosition);
        } else {
          finish(null, error);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );

    timeoutId = setTimeout(() => {
      if (bestPosition) {
        finish(bestPosition);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => finish(position),
        (error) => finish(null, error),
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        }
      );
    }, 7000);
  });
}

function detectLocation() {
  const locationOutput = document.getElementById("location-output");
  if (!locationOutput) return;

  if (!navigator.geolocation) {
    locationOutput.innerHTML = "<p>Geolocation is not supported by your browser.</p>";
    return;
  }

  locationOutput.innerHTML = "<p>Detecting your location with high-accuracy mode...</p>";

  awsGetBestCurrentPosition()
    .then((position) => {
      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      const distanceKm = awsHaversineDistanceKm(
        latitude,
        longitude,
        AWS_ALWAR_CENTER.lat,
        AWS_ALWAR_CENTER.lng
      ).toFixed(2);

      const accuracyLabel =
        accuracy <= 30
          ? "High"
          : accuracy <= 100
            ? "Medium"
            : "Low (move outdoors for better GPS precision)";

      const reverseGeocodeUrl = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2&addressdetails=1&zoom=18`;

      const reverseAddressPromise = fetch(reverseGeocodeUrl)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Reverse geocode failed (${response.status})`);
          }
          return response.json();
        })
        .catch((error) => {
          console.error(`[Frontend] Reverse geocoding failed: ${error.message}`);
          return null;
        });

      const ensureAreasPromise = awsAreaCache.length
        ? Promise.resolve()
        : loadAllAreas().catch(() => Promise.resolve());

      ensureAreasPromise
        .then(() => reverseAddressPromise)
        .then((addressData) =>
          Promise.all([
            Promise.resolve(addressData),
            awsGetLocationPrediction(latitude, longitude, addressData),
          ])
        )
        .then(([addressData, prediction]) => {
          const address = addressData?.display_name || "Address unavailable";
          const locality =
            addressData?.address?.suburb ||
            addressData?.address?.neighbourhood ||
            addressData?.address?.quarter ||
            addressData?.address?.city_district ||
            addressData?.address?.village ||
            addressData?.address?.town ||
            addressData?.address?.city ||
            "";

          let predictionHtml =
            "<p><strong>Prediction:</strong> Unable to predict safety right now.</p>";

          if (prediction) {
            const categoryClass = awsCategoryPillClass(prediction.adjustedCategory);
            const isOutsideCoverage = prediction.nearestDistanceKm > 8;
            const approxNote =
              prediction.matchType === "locality"
                ? "Prediction matched your detected locality name and nearby monitored region."
                : isOutsideCoverage
                  ? "You are outside core monitored coverage, so this is an approximate nearest-area prediction."
                  : "Prediction is based on nearest monitored region and dynamic modifiers.";

            predictionHtml = `
              <p>
                <strong>Nearest Monitored Area:</strong> ${awsEscapeHtml(
                  prediction.area.name
                )} (${prediction.nearestDistanceKm.toFixed(2)} km away)
              </p>
              <p>
                <strong>Predicted Safety:</strong>
                <span class="aws-category-pill ${categoryClass}">${awsEscapeHtml(
              awsCategoryLabel(prediction.adjustedCategory)
            )}</span>
                <strong>${prediction.finalScore}/100</strong>
              </p>
              <p class="aws-analysis-heading">Why this prediction:</p>
              <ul class="aws-analysis-list">
                ${prediction.reasons
                  .map((reason) => `<li>${awsEscapeHtml(reason)}</li>`)
                  .join("")}
              </ul>
              <p>${awsEscapeHtml(approxNote)}</p>
            `;
          }

          locationOutput.innerHTML = `
            <div class="aws-location-card">
              <p><strong>Latitude:</strong> ${latitude.toFixed(6)}</p>
              <p><strong>Longitude:</strong> ${longitude.toFixed(6)}</p>
              <p><strong>Accuracy:</strong> ±${accuracy.toFixed(2)} meters (${awsEscapeHtml(
            accuracyLabel
          )})</p>
              ${
                locality
                  ? `<p><strong>Detected Locality:</strong> ${awsEscapeHtml(locality)}</p>`
                  : ""
              }
              <p><strong>Address:</strong> ${awsEscapeHtml(address)}</p>
              <p><strong>Distance from Alwar center:</strong> ${distanceKm} km</p>
              ${predictionHtml}
            </div>
          `;
        });

      if (awsMap) {
        awsMap.setView([latitude, longitude], 14, { animate: true });
        if (awsUserLocationMarker) {
          awsMap.removeLayer(awsUserLocationMarker);
        }
        awsUserLocationMarker = L.marker([latitude, longitude]).addTo(awsMap);
        awsUserLocationMarker.bindPopup("You are here").openPopup();
      }
    })
    .catch((error) => {
      if (error.code === 1) {
        locationOutput.innerHTML =
          "<p>Location permission denied. Please enable location access.</p>";
      } else {
        locationOutput.innerHTML =
          "<p>Unable to detect your location accurately. Please try again outdoors.</p>";
      }
    });
}

function initMap() {
  if (typeof L === "undefined") return;

  const mapElement = document.getElementById("aws-map");
  if (!mapElement) return;

  awsMap = L.map("aws-map").setView([AWS_ALWAR_CENTER.lat, AWS_ALWAR_CENTER.lng], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(awsMap);

  awsMarkersLayer = L.layerGroup().addTo(awsMap);

  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function onAddLegend() {
    const div = L.DomUtil.create("div", "aws-map-legend");
    div.innerHTML = `
      <strong>Risk Legend</strong><br/>
      <span class="aws-map-dot" style="background:${AWS_CATEGORY_COLORS.safe}"></span> Safe<br/>
      <span class="aws-map-dot" style="background:${AWS_CATEGORY_COLORS.moderate}"></span> Moderate<br/>
      <span class="aws-map-dot" style="background:${AWS_CATEGORY_COLORS.unsafe}"></span> Unsafe
    `;
    return div;
  };
  legend.addTo(awsMap);

  renderMapMarkers();
}

function submitReport() {
  const areaNameInput = document.getElementById("report-areaName");
  const reasonInput = document.getElementById("report-reason");
  const timeInput = document.getElementById("report-timeOfIncident");
  const reportedByInput = document.getElementById("report-reportedBy");
  const incidentTextInput = document.getElementById("report-incidentText");
  const reportMessage = document.getElementById("report-message");

  if (
    !areaNameInput ||
    !reasonInput ||
    !timeInput ||
    !reportedByInput ||
    !reportMessage
  ) {
    return;
  }

  const areaName = areaNameInput.value.trim();
  if (!areaName) {
    reportMessage.textContent = "Please enter area name before submitting a report.";
    reportMessage.className = "aws-report-message aws-unsafe";
    return;
  }

  const payload = {
    areaName,
    reason: reasonInput.value,
    timeOfIncident: timeInput.value.trim(),
    reportedBy: reportedByInput.value.trim() || "Anonymous",
    incidentText: incidentTextInput?.value.trim() || "",
  };

  fetch("/api/reports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then((response) =>
      response
        .json()
        .catch(() => ({}))
        .then((data) => {
          if (!response.ok) {
            throw new Error(data.message || "Report submission failed");
          }
          return data;
        })
    )
    .then((data) => {
      reportMessage.textContent = data.message || "Report submitted successfully.";
      reportMessage.className = "aws-report-message aws-safe";

      areaNameInput.value = "";
      reasonInput.value = "Poor Lighting";
      timeInput.value = "";
      reportedByInput.value = "";
      if (incidentTextInput) {
        incidentTextInput.value = "";
      }

      loadReports();
    })
    .catch((error) => {
      console.error(`[Frontend] Report submission failed: ${error.message}`);
      reportMessage.textContent = "Unable to submit report right now.";
      reportMessage.className = "aws-report-message aws-unsafe";
    });
}

function loadReports() {
  const reportsTable = document.getElementById("reports-table");
  if (!reportsTable) return;

  const reportSection = document.getElementById("report");
  const hideReviewed = reportSection?.dataset.showReviewed === "false";

  fetch("/api/reports")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load reports (${response.status})`);
      }
      return response.json();
    })
    .then((payload) => {
      const allReports = payload.data || payload.reports || [];
      const reports = hideReviewed
        ? allReports.filter((report) => (report.status || "pending") !== "reviewed")
        : allReports;

      if (!reports.length) {
        reportsTable.innerHTML = hideReviewed
          ? "<tr><td colspan='7'>No active pending reports</td></tr>"
          : "<tr><td colspan='7'>No reports yet</td></tr>";
        return;
      }

      reportsTable.innerHTML = reports
        .map((report) => {
          const reportDate = report.createdAt
            ? new Date(report.createdAt).toLocaleString("en-IN")
            : "-";
          const reportStatus = report.status || "pending";
          const statusClass =
            reportStatus === "reviewed" ? "aws-status-reviewed" : "aws-status-pending";

          return `
            <tr>
              <td>${awsEscapeHtml(report.areaName || "-")}</td>
              <td>${awsEscapeHtml(report.reason || "-")}</td>
              <td>${awsEscapeHtml(report.incidentText || "-")}</td>
              <td>${awsEscapeHtml(report.timeOfIncident || "-")}</td>
              <td>${awsEscapeHtml(report.reportedBy || "Anonymous")}</td>
              <td>
                <span class="aws-status-badge ${statusClass}">${awsEscapeHtml(reportStatus)}</span>
              </td>
              <td>${awsEscapeHtml(reportDate)}</td>
            </tr>
          `;
        })
        .join("");
    })
    .catch((error) => {
      console.error(`[Frontend] Failed to load reports: ${error.message}`);
      reportsTable.innerHTML = "<tr><td colspan='7'>No reports yet</td></tr>";
    });
}

function animateCounters() {
  const counters = document.querySelectorAll(".counter");

  counters.forEach((counterElement) => {
    const target = Number(counterElement.getAttribute("data-target")) || 0;
    const duration = 2000;
    const steps = 50;
    const increment = target / steps;
    const intervalDuration = Math.max(20, Math.floor(duration / steps));

    counterElement.textContent = "0";
    let current = 0;

    const intervalId = setInterval(() => {
      current += increment;

      if (current >= target) {
        counterElement.textContent = String(Math.round(target));
        clearInterval(intervalId);
      } else {
        counterElement.textContent = String(Math.round(current));
      }
    }, intervalDuration);
  });
}

function loadStats() {
  const totalAreasCounter = document.getElementById("stat-totalAreas");
  if (!totalAreasCounter) return;

  fetch("/api/admin/stats")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Stats API failed (${response.status})`);
      }
      return response.json();
    })
    .then((payload) => {
      const stats = payload.data || {};

      const safeCounter = document.getElementById("stat-safe");
      const moderateCounter = document.getElementById("stat-moderate");
      const unsafeCounter = document.getElementById("stat-unsafe");

      totalAreasCounter.setAttribute("data-target", String(stats.totalAreas || 0));
      if (safeCounter) safeCounter.setAttribute("data-target", String(stats.safeCount || 0));
      if (moderateCounter) {
        moderateCounter.setAttribute("data-target", String(stats.moderateCount || 0));
      }
      if (unsafeCounter) {
        unsafeCounter.setAttribute("data-target", String(stats.unsafeCount || 0));
      }

      animateCounters();
    })
    .catch((error) => {
      console.error(`[Frontend] Failed to load stats: ${error.message}`);
      animateCounters();
    });
}

function awsPrefillInputsFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const areaParam = params.get("area");
  if (!areaParam) return;

  const areaInput = document.getElementById("area-input");
  if (areaInput) {
    areaInput.value = areaParam;
  }

  const reportAreaInput = document.getElementById("report-areaName");
  if (reportAreaInput) {
    reportAreaInput.value = areaParam;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateDateTime();
  fetchWeather();
  awsPrefillInputsFromQuery();

  const areaInput = document.getElementById("area-input");
  const areasGrid = document.getElementById("areas-grid");
  const mapElement = document.getElementById("aws-map");
  const reportAreaSuggestions = document.getElementById("report-area-suggestions");
  const reportsTable = document.getElementById("reports-table");

  if (mapElement) {
    initMap();
  }

  if (areaInput || areasGrid || mapElement || reportAreaSuggestions) {
    loadAllAreas().then(() => {
      if (areaInput && areaInput.value.trim()) {
        checkAreaSafety();
      }
    });
  }

  if (areaInput) {
    setupAreaSearchSuggestions();
  }

  if (reportsTable) {
    loadReports();
    if (awsReportsRefreshIntervalId) {
      clearInterval(awsReportsRefreshIntervalId);
    }
    awsReportsRefreshIntervalId = setInterval(loadReports, 15000);
  }

  if (document.querySelector(".counter")) {
    animateCounters();
    loadStats();
  }

  const checkButton = document.getElementById("check-button");
  const detectButton = document.getElementById("detect-location-btn");
  const submitReportButton = document.getElementById("submit-report-btn");

  if (checkButton) {
    checkButton.addEventListener("click", checkAreaSafety);
  }

  if (areaInput) {
    areaInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        checkAreaSafety();
      }
    });
  }

  document.querySelectorAll(".aws-filter-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedFilter = button.getAttribute("data-filter") || "all";
      filterAreas(selectedFilter);
    });
  });

  if (detectButton) {
    detectButton.addEventListener("click", detectLocation);
  }

  if (submitReportButton) {
    submitReportButton.addEventListener("click", submitReport);
  }
});

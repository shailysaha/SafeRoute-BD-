/* =========================================================
   WEATHER SERVICE
   Open-Meteo based weather service
   No API key required.
========================================================= */

const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast";

const WEATHER_CACHE_DURATION_MS =
  10 * 60 * 1000;

const weatherCache = new Map();

/* =========================================================
   NUMBER HELPER
========================================================= */

const toNumber = (value, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};

/* =========================================================
   WEATHER DESCRIPTION
========================================================= */

export const getWeatherDescription = (
  weatherCode
) => {
  const code = Number(weatherCode);

  if (code === 0) {
    return "Clear sky";
  }

  if ([1, 2, 3].includes(code)) {
    return "Cloudy";
  }

  if ([45, 48].includes(code)) {
    return "Fog";
  }

  if ([51, 53, 55].includes(code)) {
    return "Drizzle";
  }

  if ([56, 57].includes(code)) {
    return "Freezing drizzle";
  }

  if ([61, 63, 65].includes(code)) {
    return "Rain";
  }

  if ([66, 67].includes(code)) {
    return "Freezing rain";
  }

  if ([71, 73, 75, 77].includes(code)) {
    return "Snow";
  }

  if ([80, 81, 82].includes(code)) {
    return "Rain showers";
  }

  if ([85, 86].includes(code)) {
    return "Snow showers";
  }

  if (code === 95) {
    return "Thunderstorm";
  }

  if ([96, 99].includes(code)) {
    return "Thunderstorm with hail";
  }

  return "Unknown";
};

/* =========================================================
   WEATHER CLASSIFICATION
========================================================= */

export const classifyWeather = (weather) => {
  if (!weather) {
    return {
      level: "Unknown",
      score: 0,
      category: "unknown",
      description: "Weather data unavailable",
      warnings: [],
    };
  }

  const code = Number(weather.weatherCode);

  const rain = toNumber(weather.rain);
  const showers = toNumber(weather.showers);
  const precipitation = toNumber(
    weather.precipitation
  );

  const wind = toNumber(weather.windSpeed);

  const visibility = toNumber(
    weather.visibility
  );

  let score = 0;

  let category = "clear";

  const warnings = [];

  /* =======================================================
     THUNDERSTORM
  ======================================================= */

  if ([95, 96, 99].includes(code)) {
    category = "thunderstorm";

    score = 5;

    warnings.push(
      "Thunderstorm conditions detected."
    );
  }

  /* =======================================================
     HEAVY RAIN
  ======================================================= */

  else if (
    code === 65 ||
    code === 82 ||
    rain >= 7.6 ||
    precipitation >= 7.6 ||
    showers >= 7.6
  ) {
    category = "heavyRain";

    score = 4;

    warnings.push(
      "Heavy rain may reduce road visibility and braking safety."
    );
  }

  /* =======================================================
     NORMAL RAIN
  ======================================================= */

  else if (
    [51, 53, 55, 61, 63, 80, 81].includes(
      code
    ) ||
    rain > 0 ||
    precipitation > 0
  ) {
    category = "rain";

    score = 2;

    warnings.push(
      "Rain may make roads slippery."
    );
  }

  /* =======================================================
     FOG
  ======================================================= */

  else if ([45, 48].includes(code)) {
    category = "fog";

    score = 3;

    warnings.push(
      "Fog may reduce visibility."
    );
  }

  /* =======================================================
     SNOW
  ======================================================= */

  else if (
    [71, 73, 75, 77, 85, 86].includes(code)
  ) {
    category = "snow";

    score = 5;

    warnings.push(
      "Snow or icy conditions may affect road safety."
    );
  }

  /* =======================================================
     CLOUD
  ======================================================= */

  else if ([1, 2, 3].includes(code)) {
    category = "cloudy";

    score = 1;
  }

  /* =======================================================
     STRONG WIND
  ======================================================= */

  if (wind >= 45) {
    score += 3;

    warnings.push(
      "Strong wind may affect vehicle stability."
    );
  }

  /* =======================================================
     LOW VISIBILITY
  ======================================================= */

  if (
    visibility > 0 &&
    visibility < 1000
  ) {
    score += 2;

    warnings.push(
      "Very low visibility detected."
    );
  }

  let level = "Safe";

  if (score >= 7) {
    level = "High";
  } else if (score >= 4) {
    level = "Medium";
  } else if (score > 0) {
    level = "Low";
  }

  return {
    level,
    score,
    category,
    description:
      getWeatherDescription(
        weather.weatherCode
      ),
    warnings,
  };
};

/* =========================================================
   CACHE KEY
========================================================= */

const getCacheKey = (lat, lng) => {
  return `${Number(lat).toFixed(3)},${Number(
    lng
  ).toFixed(3)}`;
};

/* =========================================================
   FETCH CURRENT WEATHER
========================================================= */

export const fetchWeather = async (
  lat,
  lng
) => {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const cacheKey = getCacheKey(
    latitude,
    longitude
  );

  const cached =
    weatherCache.get(cacheKey);

  if (
    cached &&
    Date.now() - cached.timestamp <
      WEATHER_CACHE_DURATION_MS
  ) {
    return cached.data;
  }

  try {
    const url =
      `${WEATHER_URL}?latitude=${encodeURIComponent(
        latitude
      )}` +
      `&longitude=${encodeURIComponent(
        longitude
      )}` +
      `&current=temperature_2m,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,visibility` +
      `&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Weather API error: ${response.status}`
      );
    }

    const data = await response.json();

    if (!data?.current) {
      return null;
    }

    const current = data.current;

    const weather = {
      latitude,
      longitude,

      temperature: toNumber(
        current.temperature_2m
      ),

      precipitation: toNumber(
        current.precipitation
      ),

      rain: toNumber(current.rain),

      showers: toNumber(
        current.showers
      ),

      snowfall: toNumber(
        current.snowfall
      ),

      weatherCode: toNumber(
        current.weather_code
      ),

      windSpeed: toNumber(
        current.wind_speed_10m
      ),

      visibility: toNumber(
        current.visibility
      ),

      time: current.time || null,

      timezone:
        data.timezone || null,
    };

    weatherCache.set(cacheKey, {
      timestamp: Date.now(),
      data: weather,
    });

    return weather;
  } catch (error) {
    console.error(
      "Weather fetch failed:",
      error
    );

    return null;
  }
};

/* =========================================================
   ROUTE WEATHER SAMPLE POINTS
========================================================= */

export const getRouteWeatherPoints = (
  routeCoordinates
) => {
  if (
    !Array.isArray(routeCoordinates) ||
    routeCoordinates.length === 0
  ) {
    return [];
  }

  const validPoints =
    routeCoordinates
      .map((point) => {
        if (!point) {
          return null;
        }

        const lat = Number(point.lat);
        const lng = Number(point.lng);

        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)
        ) {
          return null;
        }

        return {
          lat,
          lng,
        };
      })
      .filter(Boolean);

  if (validPoints.length === 0) {
    return [];
  }

  const indexes = [
    0,
    Math.floor(validPoints.length * 0.25),
    Math.floor(validPoints.length * 0.5),
    Math.floor(validPoints.length * 0.75),
    validPoints.length - 1,
  ];

  return [
    ...new Set(indexes),
  ].map(
    (index) => validPoints[index]
  );
};

/* =========================================================
   ROUTE WEATHER
========================================================= */

export const getRouteWeather = async (
  routeCoordinates
) => {
  const points =
    getRouteWeatherPoints(
      routeCoordinates
    );

  if (points.length === 0) {
    return {
      samples: [],
      score: 0,
      level: "Unknown",
      warnings: [],
      primary: null,
    };
  }

  const results = await Promise.all(
    points.map((point) =>
      fetchWeather(
        point.lat,
        point.lng
      )
    )
  );

  const validWeather =
    results.filter(Boolean);

  if (validWeather.length === 0) {
    return {
      samples: [],
      score: 0,
      level: "Unknown",
      warnings: [],
      primary: null,
    };
  }

  const classified =
    validWeather.map((weather) => ({
      ...weather,
      ...classifyWeather(weather),
    }));

  const worst = [...classified].sort(
    (a, b) => b.score - a.score
  )[0];

  const totalScore =
    classified.reduce(
      (total, item) =>
        total + item.score,
      0
    );

  const averageScore =
    totalScore / classified.length;

  const routeScore = Math.round(
    averageScore + worst.score * 0.5
  );

  let level = "Safe";

  if (routeScore >= 7) {
    level = "High";
  } else if (routeScore >= 4) {
    level = "Medium";
  } else if (routeScore > 0) {
    level = "Low";
  }

  const warnings = [
    ...new Set(
      classified.flatMap(
        (item) => item.warnings || []
      )
    ),
  ];

  return {
    samples: classified,
    score: routeScore,
    level,
    warnings,
    primary: worst,
  };
};

/* =========================================================
   CLEAR WEATHER CACHE
========================================================= */

export const clearWeatherCache = () => {
  weatherCache.clear();
};
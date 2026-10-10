/* =========================================================
   AI ROAD RISK SERVICE
   ---------------------------------------------------------
   Rule-based road risk estimation.

   Inputs:
   - Historical incidents
   - Current route incidents
   - Weather
   - Time of day
   - Day of week
   - Incident severity
   - Traffic/congestion
   - Road hazards
   - Flood/waterlogging

   IMPORTANT:
   This produces a RISK ESTIMATE.
   It does NOT guarantee that an accident will happen.
========================================================= */

/* =========================================================
   NUMBER HELPER
========================================================= */

const toNumber = (
  value,
  fallback = 0
) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};

/* =========================================================
   INCIDENT SEVERITY
========================================================= */

export const getSeverityWeight = (
  severity
) => {
  switch (
    String(
      severity || ""
    ).toLowerCase()
  ) {
    case "high":
      return 3;

    case "medium":
      return 2;

    case "low":
      return 1;

    default:
      return 1;
  }
};

/* =========================================================
   INCIDENT TEXT
========================================================= */

const getIncidentText = (
  incident
) => {
  return `
    ${incident?.incidentType || ""}
    ${incident?.type || ""}
    ${incident?.description || ""}
    ${incident?.title || ""}
    ${incident?.category || ""}
    ${incident?.roadCondition || ""}
  `.toLowerCase();
};

/* =========================================================
   FLOOD DETECTION
========================================================= */

export const isFloodIncident = (
  incident
) => {
  const text =
    getIncidentText(incident);

  return (
    text.includes("flood") ||
    text.includes("waterlogging") ||
    text.includes("water logging") ||
    text.includes("water logged") ||
    text.includes("water level") ||
    text.includes("inundation")
  );
};

/* =========================================================
   TRAFFIC DETECTION
========================================================= */

export const isTrafficIncident = (
  incident
) => {
  const text =
    getIncidentText(incident);

  return (
    text.includes("traffic") ||
    text.includes("congestion") ||
    text.includes("jam") ||
    text.includes("slow traffic")
  );
};

/* =========================================================
   ROAD HAZARD DETECTION
========================================================= */

export const isRoadHazard = (
  incident
) => {
  const text =
    getIncidentText(incident);

  return (
    text.includes("hazard") ||
    text.includes("pothole") ||
    text.includes("broken road") ||
    text.includes("damaged road") ||
    text.includes("road damage") ||
    text.includes("construction") ||
    text.includes("debris") ||
    text.includes("blocked") ||
    text.includes("closure")
  );
};

/* =========================================================
   ACCIDENT DETECTION
========================================================= */

export const isAccidentIncident = (
  incident
) => {
  const text =
    getIncidentText(incident);

  return (
    text.includes("accident") ||
    text.includes("collision") ||
    text.includes("crash")
  );
};

/* =========================================================
   ACTIVE INCIDENT
========================================================= */

export const isIncidentActive = (
  incident
) => {
  const status =
    String(
      incident?.status || ""
    ).toLowerCase();

  return ![
    "resolved",
    "closed",
    "inactive",
  ].includes(status);
};

/* =========================================================
   ROUTE INCIDENT DISTANCE
========================================================= */

const calculateDistanceKm = (
  lat1,
  lng1,
  lat2,
  lng2
) => {
  const latitude1 = Number(lat1);
  const longitude1 = Number(lng1);
  const latitude2 = Number(lat2);
  const longitude2 = Number(lng2);

  if (
    !Number.isFinite(latitude1) ||
    !Number.isFinite(longitude1) ||
    !Number.isFinite(latitude2) ||
    !Number.isFinite(longitude2)
  ) {
    return Infinity;
  }

  const R = 6371;

  const dLat =
    ((latitude2 - latitude1) *
      Math.PI) /
    180;

  const dLng =
    ((longitude2 - longitude1) *
      Math.PI) /
    180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      (latitude1 * Math.PI) /
        180
    ) *
      Math.cos(
        (latitude2 * Math.PI) /
          180
      ) *
      Math.sin(dLng / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
};

const getIncidentCoordinates = (
  incident
) => {
  if (!incident) {
    return null;
  }

  const lat = Number(
    incident.lat
  );

  const lng = Number(
    incident.lng
  );

  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return {
      lat,
      lng,
    };
  }

  if (incident.location) {
    const locationLat = Number(
      incident.location.lat
    );

    const locationLng = Number(
      incident.location.lng
    );

    if (
      Number.isFinite(locationLat) &&
      Number.isFinite(locationLng)
    ) {
      return {
        lat: locationLat,
        lng: locationLng,
      };
    }
  }

  return null;
};

const distancePointToSegmentKm = (
  point,
  a,
  b
) => {
  const p = getIncidentCoordinates({
    lat: point.lat,
    lng: point.lng,
  });

  if (!p || !a || !b) {
    return Infinity;
  }

  const latRad =
    (p.lat * Math.PI) / 180;

  const kmLat = 111.32;

  const kmLng =
    111.32 * Math.cos(latRad);

  const ax =
    (a.lng - p.lng) * kmLng;

  const ay =
    (a.lat - p.lat) * kmLat;

  const bx =
    (b.lng - p.lng) * kmLng;

  const by =
    (b.lat - p.lat) * kmLat;

  const dx = bx - ax;
  const dy = by - ay;

  const length =
    dx * dx + dy * dy;

  if (length === 0) {
    return Math.sqrt(
      ax * ax + ay * ay
    );
  }

  let t =
    -(
      ax * dx +
      ay * dy
    ) / length;

  t = Math.max(
    0,
    Math.min(1, t)
  );

  const x = ax + t * dx;
  const y = ay + t * dy;

  return Math.sqrt(
    x * x + y * y
  );
};

const distancePointToRouteKm = (
  incident,
  routeCoordinates
) => {
  const point =
    getIncidentCoordinates(
      incident
    );

  if (
    !point ||
    !Array.isArray(routeCoordinates) ||
    routeCoordinates.length === 0
  ) {
    return Infinity;
  }

  let minimum = Infinity;

  for (
    let i = 0;
    i < routeCoordinates.length - 1;
    i++
  ) {
    const a = routeCoordinates[i];
    const b =
      routeCoordinates[i + 1];

    const aPoint = {
      lat: Number(a.lat),
      lng: Number(a.lng),
    };

    const bPoint = {
      lat: Number(b.lat),
      lng: Number(b.lng),
    };

    if (
      !Number.isFinite(
        aPoint.lat
      ) ||
      !Number.isFinite(
        aPoint.lng
      ) ||
      !Number.isFinite(
        bPoint.lat
      ) ||
      !Number.isFinite(
        bPoint.lng
      )
    ) {
      continue;
    }

    const distance =
      distancePointToSegmentKm(
        point,
        aPoint,
        bPoint
      );

    minimum = Math.min(
      minimum,
      distance
    );
  }

  return minimum;
};

/* =========================================================
   GET ROUTE INCIDENTS
========================================================= */

export const getRouteIncidents = (
  routeCoordinates,
  incidents,
  thresholdKm = 1
) => {
  if (
    !Array.isArray(routeCoordinates) ||
    !Array.isArray(incidents)
  ) {
    return [];
  }

  return incidents.filter(
    (incident) => {
      if (
        !isIncidentActive(
          incident
        )
      ) {
        return false;
      }

      const distance =
        distancePointToRouteKm(
          incident,
          routeCoordinates
        );

      return (
        distance <= thresholdKm
      );
    }
  );
};

/* =========================================================
   HISTORICAL INCIDENTS
========================================================= */

export const getHistoricalIncidents = (
  incidents,
  routeCoordinates,
  thresholdKm = 3
) => {
  if (
    !Array.isArray(incidents) ||
    !Array.isArray(routeCoordinates)
  ) {
    return [];
  }

  return incidents.filter(
    (incident) => {
      const distance =
        distancePointToRouteKm(
          incident,
          routeCoordinates
        );

      return (
        distance <= thresholdKm
      );
    }
  );
};

/* =========================================================
   TIME RISK
========================================================= */

export const calculateTimeRisk = (
  date = new Date()
) => {
  const hour = date.getHours();

  const day = date.getDay();

  let score = 0;

  const factors = [];

  /*
   * Morning/evening commuting periods.
   */

  if (
    (hour >= 7 && hour <= 10) ||
    (hour >= 17 && hour <= 21)
  ) {
    score += 2;

    factors.push(
      "Peak travel time may increase traffic exposure."
    );
  }

  /*
   * Late night / early morning.
   */

  if (
    hour >= 22 ||
    hour <= 5
  ) {
    score += 1;

    factors.push(
      "Low-light or late-night travel may reduce visibility and road awareness."
    );
  }

  /*
   * Friday/Saturday are treated only
   * as contextual factors, not unsafe
   * by default.
   */

  if (day === 5 || day === 6) {
    score += 0.5;

    factors.push(
      "Weekend travel patterns may differ from normal weekday traffic."
    );
  }

  return {
    score,
    factors,
  };
};

/* =========================================================
   WEATHER RISK
========================================================= */

export const calculateWeatherRisk = (
  weather
) => {
  if (!weather) {
    return {
      score: 0,
      factors: [],
    };
  }

  let score = 0;

  const factors = [];

  const category =
    String(
      weather.category || ""
    ).toLowerCase();

  const weatherScore =
    toNumber(
      weather.score
    );

  score += weatherScore;

  if (
    category === "rain"
  ) {
    factors.push(
      "Rain may make the road surface slippery."
    );
  }

  if (
    category === "heavyRain"
  ) {
    factors.push(
      "Heavy rain may reduce visibility and braking performance."
    );
  }

  if (
    category === "thunderstorm"
  ) {
    factors.push(
      "Thunderstorm conditions can create elevated travel risk."
    );
  }

  if (
    category === "fog"
  ) {
    factors.push(
      "Fog can reduce driver visibility."
    );
  }

  if (
    toNumber(
      weather.windSpeed
    ) >= 45
  ) {
    factors.push(
      "Strong wind may affect vehicle stability."
    );
  }

  return {
    score,
    factors,
  };
};

/* =========================================================
   INCIDENT RISK
========================================================= */

export const calculateIncidentRisk = (
  routeIncidents
) => {
  let score = 0;

  const factors = [];

  let high = 0;
  let medium = 0;
  let low = 0;

  routeIncidents.forEach(
    (incident) => {
      const severity =
        String(
          incident?.severity || ""
        ).toLowerCase();

      const weight =
        getSeverityWeight(
          severity
        );

      score += weight;

      if (severity === "high") {
        high++;
      } else if (
        severity === "medium"
      ) {
        medium++;
      } else {
        low++;
      }

      if (
        isAccidentIncident(
          incident
        )
      ) {
        score += 1;

        factors.push(
          "An accident/collision incident is near the route."
        );
      }

      if (
        isTrafficIncident(
          incident
        )
      ) {
        score += 1;

        factors.push(
          "Traffic or congestion has been reported near the route."
        );
      }

      if (
        isRoadHazard(
          incident
        )
      ) {
        score += 1;

        factors.push(
          "A road-condition hazard has been reported near the route."
        );
      }

      if (
        isFloodIncident(
          incident
        )
      ) {
        score += 2;

        factors.push(
          "Flooding or waterlogging has been reported near the route."
        );
      }
    }
  );

  if (high > 0) {
    factors.push(
      `${high} high-severity incident${
        high > 1 ? "s" : ""
      } detected near the route.`
    );
  }

  if (medium > 0) {
    factors.push(
      `${medium} medium-severity incident${
        medium > 1 ? "s" : ""
      } detected near the route.`
    );
  }

  if (low > 0) {
    factors.push(
      `${low} low-severity incident${
        low > 1 ? "s" : ""
      } detected near the route.`
    );
  }

  return {
    score,
    factors,
    high,
    medium,
    low,
  };
};

/* =========================================================
   HISTORICAL PATTERN RISK
========================================================= */

export const calculateHistoricalRisk = (
  historicalIncidents
) => {
  if (
    !Array.isArray(
      historicalIncidents
    ) ||
    historicalIncidents.length === 0
  ) {
    return {
      score: 0,
      factors: [
        "No historical incident pattern was found near this route.",
      ],
      count: 0,
    };
  }

  const count =
    historicalIncidents.length;

  let score = 0;

  /*
   * This is deliberately capped.
   * Historical reports should influence
   * the estimate without dominating it.
   */

  if (count >= 2) {
    score += 1;
  }

  if (count >= 5) {
    score += 2;
  }

  if (count >= 10) {
    score += 2;
  }

  const highSeverityCount =
    historicalIncidents.filter(
      (incident) =>
        getSeverityWeight(
          incident?.severity
        ) >= 3
    ).length;

  if (highSeverityCount >= 2) {
    score += 2;
  }

  const factors = [];

  if (count >= 5) {
    factors.push(
      `Historical data shows ${count} reported incidents around this route area.`
    );
  } else {
    factors.push(
      `${count} historical incident${
        count > 1 ? "s" : ""
      } found around this route area.`
    );
  }

  if (highSeverityCount >= 2) {
    factors.push(
      "Several historical incidents were high severity."
    );
  }

  return {
    score,
    factors,
    count,
    highSeverityCount,
  };
};

/* =========================================================
   WEATHER + ROAD INTERACTION
========================================================= */

export const calculateWeatherIncidentInteraction =
  (
    weather,
    routeIncidents
  ) => {
    if (
      !weather ||
      !Array.isArray(routeIncidents)
    ) {
      return {
        score: 0,
        factors: [],
        elevated: false,
        floodCombination: false,
      };
    }

    const category =
      String(
        weather.category || ""
      ).toLowerCase();

    const rainy =
      category === "rain" ||
      category === "heavyRain" ||
      category === "thunderstorm";

    const heavyWeather =
      category ===
        "heavyRain" ||
      category ===
        "thunderstorm";

    const flood =
      routeIncidents.some(
        isFloodIncident
      );

    const traffic =
      routeIncidents.some(
        isTrafficIncident
      );

    const hazards =
      routeIncidents.some(
        isRoadHazard
      );

    const highSeverity =
      routeIncidents.some(
        (incident) =>
          getSeverityWeight(
            incident?.severity
          ) >= 3
      );

    let score = 0;

    const factors = [];

    let floodCombination = false;

    /*
     * Rain + flood.
     */

    if (
      rainy &&
      flood
    ) {
      score += 6;

      floodCombination = true;

      factors.push(
        "Rain is combined with a reported flood/waterlogging hazard."
      );
    }

    /*
     * Heavy rain + high severity.
     */

    if (
      heavyWeather &&
      highSeverity
    ) {
      score += 4;

      factors.push(
        "Severe weather is combined with a high-severity road incident."
      );
    }

    /*
     * Rain + traffic.
     */

    if (
      rainy &&
      traffic
    ) {
      score += 2;

      factors.push(
        "Wet-weather conditions are combined with traffic/congestion."
      );
    }

    /*
     * Rain + road hazard.
     */

    if (
      rainy &&
      hazards
    ) {
      score += 3;

      factors.push(
        "Wet weather may increase the impact of a reported road hazard."
      );
    }

    /*
     * Thunderstorm + incident.
     */

    if (
      category ===
        "thunderstorm" &&
      routeIncidents.length > 0
    ) {
      score += 3;

      factors.push(
        "Thunderstorm conditions are combined with active road incidents."
      );
    }

    return {
      score,
      factors,
      elevated: score > 0,
      floodCombination,
    };
  };

/* =========================================================
   FINAL RISK LEVEL
========================================================= */

export const getRiskLevel = (
  score
) => {
  const numericScore =
    toNumber(score);

  if (numericScore >= 15) {
    return "High";
  }

  if (numericScore >= 8) {
    return "Medium";
  }

  if (numericScore > 0) {
    return "Low";
  }

  return "Safe";
};

/* =========================================================
   MAIN AI RISK ANALYSIS
========================================================= */

export const analyzeRouteRisk = ({
  routeCoordinates = [],
  incidents = [],
  weather = null,
  journeyDate = new Date(),
}) => {
  const routeIncidents =
    getRouteIncidents(
      routeCoordinates,
      incidents,
      1
    );

  const historicalIncidents =
    getHistoricalIncidents(
      incidents,
      routeCoordinates,
      3
    );

  const incidentRisk =
    calculateIncidentRisk(
      routeIncidents
    );

  const historicalRisk =
    calculateHistoricalRisk(
      historicalIncidents
    );

  const weatherRisk =
    calculateWeatherRisk(
      weather
    );

  const timeRisk =
    calculateTimeRisk(
      journeyDate
    );

  const interaction =
    calculateWeatherIncidentInteraction(
      weather,
      routeIncidents
    );

  /*
   * Final estimated score.
   */

  const rawScore =
    incidentRisk.score +
    historicalRisk.score +
    weatherRisk.score +
    timeRisk.score +
    interaction.score;

  /*
   * Keep score within a readable range.
   */

  const riskScore = Math.min(
    30,
    Math.round(rawScore)
  );

  const riskLevel =
    getRiskLevel(riskScore);

  /*
   * Explanation factors.
   */

  const factors = [
    ...incidentRisk.factors,
    ...historicalRisk.factors,
    ...weatherRisk.factors,
    ...timeRisk.factors,
    ...interaction.factors,
  ];

  const uniqueFactors = [
    ...new Set(
      factors.filter(Boolean)
    ),
  ];

  /*
   * Main explanation.
   */

  let explanation =
    "The route currently has a relatively low estimated risk based on the available road, weather, historical and time-related data.";

  if (riskLevel === "Low") {
    explanation =
      "The route has some risk factors, but the available data suggests a relatively low estimated travel risk.";
  }

  if (riskLevel === "Medium") {
    explanation =
      "Several road, weather, historical or time-related factors are increasing the estimated travel risk.";
  }

  if (riskLevel === "High") {
    explanation =
      "Multiple significant risk factors were detected. Weather and/or road conditions may substantially increase travel risk.";
  }

  return {
    riskScore,

    riskLevel,

    explanation,

    factors:
      uniqueFactors.slice(0, 8),

    routeIncidents,

    historicalIncidents,

    incidentCount:
      routeIncidents.length,

    historicalIncidentCount:
      historicalIncidents.length,

    weatherScore:
      weatherRisk.score,

    historicalScore:
      historicalRisk.score,

    timeScore:
      timeRisk.score,

    incidentScore:
      incidentRisk.score,

    interactionScore:
      interaction.score,

    weatherInteraction:
      interaction,

    isPrediction: true,

    disclaimer:
      "This is a rule-based risk estimate based on available data. It is not a guarantee or prediction that an accident will occur.",
  };
};

/* =========================================================
   ESTIMATED DELAY
========================================================= */

export const calculateEstimatedDelay = ({
  routeIncidents = [],
  weather = null,
  weatherInteraction = null,
}) => {
  let delay = 0;

  routeIncidents.forEach(
    (incident) => {
      const severity =
        String(
          incident?.severity || ""
        ).toLowerCase();

      if (severity === "high") {
        delay += 15;
      } else if (
        severity === "medium"
      ) {
        delay += 8;
      } else {
        delay += 3;
      }

      const text =
        getIncidentText(
          incident
        );

      if (
        text.includes("block") ||
        text.includes("closure") ||
        text.includes("closed")
      ) {
        delay += 10;
      }

      if (
        isAccidentIncident(
          incident
        )
      ) {
        delay += 5;
      }

      if (
        isTrafficIncident(
          incident
        )
      ) {
        delay += 5;
      }

      if (
        isFloodIncident(
          incident
        )
      ) {
        delay += 15;
      }
    }
  );

  const weatherLevel =
    String(
      weather?.level || ""
    ).toLowerCase();

  if (
    weatherLevel === "high"
  ) {
    delay += 15;
  } else if (
    weatherLevel === "medium"
  ) {
    delay += 8;
  } else if (
    weatherLevel === "low"
  ) {
    delay += 3;
  }

  if (
    weatherInteraction?.elevated
  ) {
    delay += 10;
  }

  return delay;
};
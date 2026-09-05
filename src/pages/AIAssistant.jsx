import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import DashboardLayout from "../layout/DashboardLayout";
import "./AIAssistant.css";

function AIAssistant() {
  const navigate = useNavigate();

  // =========================================================
  // 1. CHAT STATE
  // =========================================================

  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "ai",
      text:
        "Hello! 👋 I'm SafeRoute AI. I can analyze nearby road risk using your location, historical incidents, time, and weather conditions.",
    },
  ]);

  const [input, setInput] = useState("");

  // =========================================================
  // 2. FIRESTORE INCIDENT STATE
  // =========================================================

  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);

  // =========================================================
  // 3. GPS STATE
  // =========================================================

  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  // =========================================================
  // 4. LOAD INCIDENTS FROM FIRESTORE
  // =========================================================

  useEffect(() => {
    let mounted = true;

    const fetchIncidents = async () => {
      try {
        const snapshot = await getDocs(
          collection(db, "incidents")
        );

        if (!mounted) return;

        const firebaseIncidents = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setIncidents(firebaseIncidents);

        console.log(
          "AI INCIDENT DATA:",
          firebaseIncidents
        );
      } catch (error) {
        console.error(
          "Error loading incidents:",
          error
        );
      } finally {
        if (mounted) {
          setLoadingIncidents(false);
        }
      }
    };

    fetchIncidents();

    return () => {
      mounted = false;
    };
  }, []);

  // =========================================================
  // 5. GET CURRENT GPS LOCATION
  // =========================================================

  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(
          new Error(
            "Geolocation is not supported by this browser."
          )
        );

        return;
      }

      setLocationLoading(true);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };

          setCurrentLocation(location);
          setLocationLoading(false);

          console.log(
            "AI CURRENT LOCATION:",
            location
          );

          resolve(location);
        },

        (error) => {
          setLocationLoading(false);

          let message =
            "Unable to get your current location.";

          if (
            error.code ===
            error.PERMISSION_DENIED
          ) {
            message =
              "Location permission was denied. Please allow location access and try again.";
          } else if (
            error.code ===
            error.POSITION_UNAVAILABLE
          ) {
            message =
              "Your current location is unavailable.";
          } else if (
            error.code ===
            error.TIMEOUT
          ) {
            message =
              "Location request timed out. Please try again.";
          }

          reject(new Error(message));
        },

        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    });
  };

  // =========================================================
  // 6. REVERSE GEOCODING
  // Convert GPS coordinates into a readable place name
  // =========================================================

  const getLocationName = async (location) => {
    if (!location) {
      return "Unknown location";
    }

    try {
      const url =
        `https://nominatim.openstreetmap.org/reverse` +
        `?format=jsonv2` +
        `&lat=${encodeURIComponent(location.lat)}` +
        `&lon=${encodeURIComponent(location.lng)}` +
        `&zoom=18` +
        `&addressdetails=1`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          "Location name could not be loaded."
        );
      }

      const data = await response.json();
      const address = data.address || {};

      const parts = [];

      const area =
        address.suburb ||
        address.neighbourhood ||
        address.quarter ||
        address.village ||
        address.town ||
        address.city_district;

      if (area) {
        parts.push(area);
      }

      const city =
        address.city ||
        address.municipality ||
        address.town ||
        address.county;

      if (
        city &&
        city !== area
      ) {
        parts.push(city);
      }

      const district =
        address.state_district;

      if (
        district &&
        !parts.includes(district)
      ) {
        parts.push(district);
      }

      if (address.country) {
        parts.push(address.country);
      }

      if (parts.length > 0) {
        return parts.join(", ");
      }

      if (data.display_name) {
        return data.display_name;
      }

      return "Current location";
    } catch (error) {
      console.error(
        "Reverse geocoding error:",
        error
      );

      return "Current location";
    }
  };

  // =========================================================
  // 7. HAVERSINE DISTANCE
  // =========================================================

  const calculateDistance = (
    lat1,
    lng1,
    lat2,
    lng2
  ) => {
    const earthRadius = 6371;

    const dLat =
      ((lat2 - lat1) * Math.PI) / 180;

    const dLng =
      ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(
        (lat1 * Math.PI) / 180
      ) *
        Math.cos(
          (lat2 * Math.PI) / 180
        ) *
        Math.sin(dLng / 2) ** 2;

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      );

    return earthRadius * c;
  };

  // =========================================================
  // 8. FIND NEARBY INCIDENTS
  // =========================================================

  const getNearbyIncidents = (
    location,
    radiusKm = 5
  ) => {
    if (
      !location ||
      !incidents.length
    ) {
      return [];
    }

    return incidents
      .filter((incident) => {
        const lat = Number(incident.lat);
        const lng = Number(incident.lng);

        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)
        ) {
          return false;
        }

        const distance =
          calculateDistance(
            location.lat,
            location.lng,
            lat,
            lng
          );

        return distance <= radiusKm;
      })
      .map((incident) => {
        const distance =
          calculateDistance(
            location.lat,
            location.lng,
            Number(incident.lat),
            Number(incident.lng)
          );

        return {
          ...incident,
          distance,
        };
      })
      .sort(
        (a, b) =>
          a.distance - b.distance
      );
  };

  // =========================================================
  // 9. GET WEATHER
  // =========================================================

  const getWeather = async (
    location
  ) => {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(location.lat)}` +
      `&longitude=${encodeURIComponent(location.lng)}` +
      `&current=temperature_2m,precipitation,weather_code,wind_speed_10m` +
      `&timezone=auto`;

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Weather information could not be loaded."
      );
    }

    const data =
      await response.json();

    const current =
      data.current;

    return {
      temperature:
        current.temperature_2m,

      precipitation:
        current.precipitation,

      weatherCode:
        current.weather_code,

      windSpeed:
        current.wind_speed_10m,
    };
  };

  // =========================================================
  // 10. WEATHER DESCRIPTION
  // =========================================================

  const getWeatherDescription = (
    code
  ) => {
    if (code === 0) {
      return "Clear";
    }

    if (
      [1, 2, 3].includes(code)
    ) {
      return "Cloudy";
    }

    if (
      [45, 48].includes(code)
    ) {
      return "Foggy";
    }

    if (
      [51, 53, 55, 56, 57].includes(
        code
      )
    ) {
      return "Drizzle";
    }

    if (
      [61, 63, 65, 66, 67].includes(
        code
      )
    ) {
      return "Rain";
    }

    if (
      [71, 73, 75, 77].includes(
        code
      )
    ) {
      return "Snow";
    }

    if (
      [80, 81, 82].includes(
        code
      )
    ) {
      return "Rain showers";
    }

    if (
      [85, 86].includes(
        code
      )
    ) {
      return "Snow showers";
    }

    if (
      [95, 96, 99].includes(
        code
      )
    ) {
      return "Thunderstorm";
    }

    return "Variable weather";
  };

  // =========================================================
  // 11. TIME INFORMATION
  // =========================================================

  const getTimeInformation = () => {
    const now = new Date();

    const hour =
      now.getHours();

    let period;

    if (
      hour >= 5 &&
      hour < 12
    ) {
      period = "Morning";
    } else if (
      hour >= 12 &&
      hour < 17
    ) {
      period = "Afternoon";
    } else if (
      hour >= 17 &&
      hour < 21
    ) {
      period = "Evening";
    } else {
      period = "Night";
    }

    return {
      hour,
      period,
    };
  };

  // =========================================================
  // 12. CALCULATE ROAD RISK
  // =========================================================

  const calculateRoadRisk = (
    nearbyIncidents,
    weather,
    time
  ) => {
    let score = 0;

    // -----------------------------------------
    // Historical incident frequency
    // -----------------------------------------

    const incidentScore =
      Math.min(
        nearbyIncidents.length * 5,
        25
      );

    score += incidentScore;

    // -----------------------------------------
    // Severity
    // -----------------------------------------

    const high =
      nearbyIncidents.filter(
        (incident) =>
          incident.severity
            ?.toLowerCase() === "high"
      ).length;

    const medium =
      nearbyIncidents.filter(
        (incident) =>
          incident.severity
            ?.toLowerCase() === "medium"
      ).length;

    const low =
      nearbyIncidents.filter(
        (incident) =>
          incident.severity
            ?.toLowerCase() === "low"
      ).length;

    score += high * 15;
    score += medium * 8;
    score += low * 3;

    // -----------------------------------------
    // Very close incidents
    // -----------------------------------------

    const veryClose =
      nearbyIncidents.filter(
        (incident) =>
          incident.distance <= 1
      ).length;

    score += Math.min(
      veryClose * 5,
      10
    );

    // -----------------------------------------
    // Time factor
    // -----------------------------------------

    if (
      time.period === "Night"
    ) {
      score += 8;
    } else if (
      time.period === "Evening"
    ) {
      score += 5;
    }

    // -----------------------------------------
    // Weather factor
    // -----------------------------------------

    if (weather) {
      const description =
        getWeatherDescription(
          weather.weatherCode
        );

      if (
        description === "Rain" ||
        description === "Rain showers" ||
        description === "Drizzle"
      ) {
        score += 10;
      }

      if (
        description ===
        "Thunderstorm"
      ) {
        score += 15;
      }

      if (
        description === "Foggy"
      ) {
        score += 8;
      }
    }

    // -----------------------------------------
    // Limit score
    // -----------------------------------------

    score = Math.min(
      Math.round(score),
      100
    );

    let level;

    if (score >= 70) {
      level = "High";
    } else if (score >= 40) {
      level = "Moderate";
    } else {
      level = "Low";
    }

    return {
      score,
      level,
      high,
      medium,
      low,
      veryClose,
    };
  };

  // =========================================================
  // 13. GET CURRENT LOCATION + NAME
  // =========================================================

  const getCurrentLocationDetails =
    async () => {
      const location =
        currentLocation ||
        (await getCurrentLocation());

      const locationName =
        await getLocationName(
          location
        );

      return {
        location,
        locationName,
      };
    };

  // =========================================================
  // 14. LOCATION RESPONSE
  // =========================================================

  const getLocationResponse =
    async () => {
      try {
        const {
          location,
          locationName,
        } =
          await getCurrentLocationDetails();

        return (
          `📍 YOUR CURRENT LOCATION\n\n` +
          `${locationName}\n\n` +
          `SafeRoute detected your current position successfully.`
        );
      } catch (error) {
        console.error(
          "Location response error:",
          error
        );

        return (
          `❌ I couldn't determine your current location.\n\n` +
          `${error.message}`
        );
      }
    };

  // =========================================================
  // 15. WEATHER RESPONSE
  // =========================================================

  const getWeatherResponse =
    async () => {
      try {
        const {
          location,
          locationName,
        } =
          await getCurrentLocationDetails();

        const weather =
          await getWeather(
            location
          );

        const description =
          getWeatherDescription(
            weather.weatherCode
          );

        return (
          `🌦️ CURRENT WEATHER\n\n` +
          `📍 ${locationName}\n\n` +
          `${description}\n` +
          `Temperature: ${weather.temperature}°C\n` +
          `Precipitation: ${weather.precipitation} mm\n` +
          `Wind: ${weather.windSpeed} km/h`
        );
      } catch (error) {
        console.error(
          "Weather response error:",
          error
        );

        return (
          `❌ I couldn't load the current weather.\n\n` +
          `${error.message}`
        );
      }
    };

  // =========================================================
  // 16. NEARBY INCIDENT RESPONSE
  // =========================================================

  const getNearbyIncidentResponse =
    async () => {
      if (loadingIncidents) {
        return (
          "⏳ I'm still loading SafeRoute incident data. Please try again in a moment."
        );
      }

      try {
        const {
          location,
          locationName,
        } =
          await getCurrentLocationDetails();

        const nearbyIncidents =
          getNearbyIncidents(
            location,
            5
          );

        if (
          nearbyIncidents.length ===
          0
        ) {
          return (
            `📍 ${locationName}\n\n` +
            `✅ No reported incidents were found within 5 km of your current location.`
          );
        }

        const high =
          nearbyIncidents.filter(
            (incident) =>
              incident.severity
                ?.toLowerCase() ===
              "high"
          ).length;

        const medium =
          nearbyIncidents.filter(
            (incident) =>
              incident.severity
                ?.toLowerCase() ===
              "medium"
          ).length;

        const low =
          nearbyIncidents.filter(
            (incident) =>
              incident.severity
                ?.toLowerCase() ===
              "low"
          ).length;

        const closest =
          nearbyIncidents
            .slice(0, 5)
            .map(
              (incident, index) => {
                const title =
                  incident.title ||
                  incident.type ||
                  incident.category ||
                  "Reported incident";

                const severity =
                  incident.severity ||
                  "Unknown";

                return (
                  `${index + 1}. ${title} — ` +
                  `${severity} — ` +
                  `${incident.distance.toFixed(2)} km away`
                );
              }
            )
            .join("\n");

        return (
          `⚠️ NEARBY INCIDENTS\n\n` +

          `📍 ${locationName}\n` +

          `${nearbyIncidents.length} incident(s) found within 5 km.\n\n` +

          `High: ${high}\n` +
          `Medium: ${medium}\n` +
          `Low: ${low}\n\n` +

          `📌 Closest incidents\n` +
          `${closest}`
        );
      } catch (error) {
        console.error(
          "Nearby incident error:",
          error
        );

        return (
          `❌ I couldn't check nearby incidents.\n\n` +
          `${error.message}`
        );
      }
    };

  // =========================================================
  // 17. COMPLETE ROAD RISK ANALYSIS
  // =========================================================

  const performRoadRiskAnalysis =
    async () => {
      if (loadingIncidents) {
        return (
          "⏳ I'm still loading SafeRoute incident data. Please try again in a moment."
        );
      }

      try {
        const location =
          currentLocation ||
          (await getCurrentLocation());

        // Run location name and weather
        // at the same time.
        const locationNamePromise =
          getLocationName(
            location
          );

        const weatherPromise =
          getWeather(
            location
          );

        // Incident calculation is local,
        // so it does not need to wait.
        const nearbyIncidents =
          getNearbyIncidents(
            location,
            5
          );

        const [
          locationName,
          weather,
        ] =
          await Promise.all([
            locationNamePromise,
            weatherPromise,
          ]);

        const time =
          getTimeInformation();

        const risk =
          calculateRoadRisk(
            nearbyIncidents,
            weather,
            time
          );

        const weatherDescription =
          getWeatherDescription(
            weather.weatherCode
          );

        let recommendation;

        if (
          risk.level === "High"
        ) {
          recommendation =
            "⚠️ Extra caution is recommended. Consider using a safer route and avoid unnecessary travel if possible.";
        } else if (
          risk.level === "Moderate"
        ) {
          recommendation =
            "⚠️ Stay alert and consider checking the route before travelling.";
        } else {
          recommendation =
            "✅ Current conditions appear relatively low-risk based on available SafeRoute data.";
        }

        return (
          `🧠 AI ROAD RISK ANALYSIS\n\n` +

          `📊 Risk Score: ${risk.score}/100\n` +
          `⚠️ Risk Level: ${risk.level}\n\n` +

          `📍 Current Location\n` +
          `${locationName}\n\n` +

          `⚠️ Nearby Incidents\n` +
          `${nearbyIncidents.length} incident(s) found within 5 km\n` +
          `High: ${risk.high}\n` +
          `Medium: ${risk.medium}\n` +
          `Low: ${risk.low}\n` +
          `Within 1 km: ${risk.veryClose}\n\n` +

          `🕐 Time\n` +
          `${time.period}\n\n` +

          `🌦️ Weather\n` +
          `${weatherDescription}\n` +
          `Temperature: ${weather.temperature}°C\n` +
          `Precipitation: ${weather.precipitation} mm\n` +
          `Wind: ${weather.windSpeed} km/h\n\n` +

          `🤖 Analysis\n` +

          `The estimated road risk is ${risk.level.toLowerCase()} ` +
          `with a score of ${risk.score}/100. ` +
          `The estimate considers historical incident activity, ` +
          `incident severity, proximity, time of day, and current weather conditions.\n\n` +

          `${recommendation}\n\n` +

          `⚠️ IMPORTANT\n` +

          `This is a risk estimate based on available SafeRoute ` +
          `data and current conditions. It does NOT guarantee ` +
          `that an accident will or will not occur.`
        );
      } catch (error) {
        console.error(
          "Road risk analysis error:",
          error
        );

        return (
          `❌ I couldn't complete the road risk analysis.\n\n` +
          `${error.message}`
        );
      }
    };

  // =========================================================
  // 18. ALL INCIDENTS SUMMARY
  // =========================================================

  const getIncidentSummary =
    () => {
      if (loadingIncidents) {
        return (
          "⏳ Loading live incident data from Firestore..."
        );
      }

      if (
        incidents.length === 0
      ) {
        return (
          "No reported incidents are currently available in SafeRoute's Firestore data."
        );
      }

      const high =
        incidents.filter(
          (incident) =>
            incident.severity
              ?.toLowerCase() ===
            "high"
        ).length;

      const medium =
        incidents.filter(
          (incident) =>
            incident.severity
              ?.toLowerCase() ===
            "medium"
        ).length;

      const low =
        incidents.filter(
          (incident) =>
            incident.severity
              ?.toLowerCase() ===
            "low"
        ).length;

      return (
        `⚠️ SAFEROUTE INCIDENT SUMMARY\n\n` +

        `SafeRoute currently has ${incidents.length} reported incidents.\n\n` +

        `🔴 High severity: ${high}\n` +
        `🟠 Medium severity: ${medium}\n` +
        `🟢 Low severity: ${low}\n\n` +

        `For incidents near your current location, ask: ` +
        `"Are there any incidents near me?"`
      );
    };

  // =========================================================
  // 19. NORMALIZE USER QUESTION
  // =========================================================

  const normalizeQuestion = (
    question
  ) => {
    return question
      .toLowerCase()
      .trim()
      .replace(/[?!.,;:]+/g, " ")
      .replace(/\s+/g, " ");
  };

  // =========================================================
  // 20. KEYWORD HELPER
  // =========================================================

  const hasAny = (
    text,
    keywords
  ) => {
    return keywords.some(
      (keyword) =>
        text.includes(keyword)
    );
  };

  // =========================================================
  // 21. INTENT DETECTION
  // =========================================================

  const detectIntent = (
    question
  ) => {
    const q =
      normalizeQuestion(
        question
      );

    // -----------------------------------------
    // LOCATION
    // -----------------------------------------

    if (
      hasAny(q, [
        "where am i",
        "my location",
        "current location",
        "my current location",
        "where is my location",
        "what is my location",
        "show my location",
        "tell me my location",
        "location near me",
      ])
    ) {
      return "location";
    }

    // -----------------------------------------
    // WEATHER
    // -----------------------------------------

    if (
      hasAny(q, [
        "weather",
        "temperature",
        "rain",
        "raining",
        "will it rain",
        "is it raining",
        "wind speed",
        "forecast",
        "climate",
        "hot outside",
        "cold outside",
      ])
    ) {
      return "weather";
    }

    // -----------------------------------------
    // ROAD RISK / SAFETY
    // -----------------------------------------

    if (
      hasAny(q, [
        "road risk",
        "risk score",
        "risk analysis",
        "analyze road",
        "road safety",
        "safe to travel",
        "safe for travel",
        "safe right now",
        "safe now",
        "safe tonight",
        "safe today",
        "is it safe",
        "is this road safe",
        "is my area safe",
        "is the area safe",
        "how safe",
        "how dangerous",
        "how risky",
        "danger near me",
        "danger around me",
        "dangerous near me",
        "risk near me",
        "risk around me",
        "risk around my location",
        "safety near me",
        "safety around me",
        "travel safely",
        "should i travel",
        "can i travel",
        "travel tonight",
        "travel now",
        "road dangerous",
        "roads dangerous",
        "dangerous road",
      ])
    ) {
      return "roadRisk";
    }

    // -----------------------------------------
    // NEARBY INCIDENTS
    // -----------------------------------------

    if (
      hasAny(q, [
        "nearby incident",
        "nearby incidents",
        "incidents near me",
        "incident near me",
        "danger near me",
        "dangers near me",
        "what happened nearby",
        "what happened around me",
        "what happened near me",
        "reported nearby",
        "reports near me",
        "reports around me",
        "anything dangerous nearby",
        "anything dangerous around me",
        "accident near me",
        "accidents near me",
        "crime near me",
        "crimes near me",
      ])
    ) {
      return "nearbyIncidents";
    }

    // -----------------------------------------
    // EMERGENCY
    // -----------------------------------------

    if (
      hasAny(q, [
        "emergency",
        "sos",
        "help me",
        "i need help",
        "i am in danger",
        "im in danger",
        "immediate danger",
        "urgent help",
        "police emergency",
        "medical emergency",
      ])
    ) {
      return "emergency";
    }

    // -----------------------------------------
    // HOSPITAL / POLICE / SERVICES
    // -----------------------------------------

    if (
      hasAny(q, [
        "hospital",
        "hospitals",
        "medical center",
        "medical service",
        "doctor",
        "police station",
        "police stations",
        "police",
        "emergency service",
        "emergency services",
        "ambulance",
      ])
    ) {
      return "services";
    }

    // -----------------------------------------
    // ROUTE
    // -----------------------------------------

    if (
      hasAny(q, [
        "safer route",
        "safe route",
        "find a route",
        "find route",
        "best route",
        "route to",
        "route from",
        "directions",
        "journey",
        "plan journey",
        "plan my journey",
        "travel route",
        "avoid danger",
        "avoid dangerous roads",
        "avoid risky roads",
      ])
    ) {
      return "route";
    }

    // -----------------------------------------
    // REPORTING
    // -----------------------------------------

    if (
      hasAny(q, [
        "how do i report",
        "how can i report",
        "report an incident",
        "report incident",
        "submit report",
        "submit an incident",
        "make a report",
        "create a report",
        "add a report",
        "report danger",
      ])
    ) {
      return "report";
    }

    // -----------------------------------------
    // GENERAL INCIDENT SUMMARY
    // -----------------------------------------

    if (
      hasAny(q, [
        "how many incidents",
        "total incidents",
        "all incidents",
        "incident statistics",
        "incident stats",
        "incident summary",
        "reported incidents",
        "how many reports",
        "how many dangers",
      ])
    ) {
      return "incidentSummary";
    }

    // -----------------------------------------
    // GENERAL SAFEROUTE QUESTIONS
    // -----------------------------------------

    if (
      hasAny(q, [
        "what is saferoute",
        "what is safe route",
        "what can you do",
        "what do you do",
        "how does saferoute work",
        "how does safe route work",
        "tell me about saferoute",
        "about saferoute",
        "what is this app",
      ])
    ) {
      return "about";
    }

    return "general";
  };

  // =========================================================
  // 22. AI RESPONSE ENGINE
  // =========================================================

  const getAIResponse =
    async (question) => {
      const intent =
        detectIntent(question);

      console.log(
        "AI INTENT:",
        intent
      );

      switch (intent) {
        // -----------------------------------------
        // LOCATION
        // -----------------------------------------

        case "location":
          return await getLocationResponse();

        // -----------------------------------------
        // WEATHER
        // -----------------------------------------

        case "weather":
          return await getWeatherResponse();

        // -----------------------------------------
        // ROAD RISK
        // -----------------------------------------

        case "roadRisk":
          return await performRoadRiskAnalysis();

        // -----------------------------------------
        // NEARBY INCIDENTS
        // -----------------------------------------

        case "nearbyIncidents":
          return await getNearbyIncidentResponse();

        // -----------------------------------------
        // EMERGENCY
        // -----------------------------------------

        case "emergency":
          return (
            "🚨 EMERGENCY ASSISTANCE\n\n" +

            "If you are in immediate danger, " +
            "please use the Emergency section and SOS feature immediately.\n\n" +

            "You can also access nearby hospitals " +
            "and police stations through SafeRoute."
          );

        // -----------------------------------------
        // SERVICES
        // -----------------------------------------

        case "services":
          return (
            "🏥 EMERGENCY SERVICES\n\n" +

            "SafeRoute can help you find nearby " +
            "hospitals and police stations.\n\n" +

            "Open the Emergency Assistance section " +
            "to view available emergency services."
          );

        // -----------------------------------------
        // ROUTE
        // -----------------------------------------

        case "route":
          return (
            "🗺️ SAFER ROUTE\n\n" +

            "Open Plan Journey and enter your starting " +
            "point and destination.\n\n" +

            "SafeRoute can then display the route " +
            "and available safety information."
          );

        // -----------------------------------------
        // REPORT
        // -----------------------------------------

        case "report":
          return (
            "⚠️ REPORT AN INCIDENT\n\n" +

            "You can report a dangerous incident " +
            "through the SafeRoute reporting feature.\n\n" +

            "Add the incident location, type, description, " +
            "and severity so the community can be informed."
          );

        // -----------------------------------------
        // INCIDENT SUMMARY
        // -----------------------------------------

        case "incidentSummary":
          return getIncidentSummary();

        // -----------------------------------------
        // ABOUT
        // -----------------------------------------

        case "about":
          return (
            "🛡️ ABOUT SAFEROUTE\n\n" +

            "SafeRoute is a road and community safety " +
            "platform designed to help users identify " +
            "dangerous areas and make safer travel decisions.\n\n" +

            "SafeRoute AI can use GPS location, " +
            "historical incidents, time of day, " +
            "and current weather to estimate road risk."
          );

        // -----------------------------------------
        // GENERAL
        // -----------------------------------------

        default:
          return (
            "🤖 I can help you with SafeRoute safety information.\n\n" +

            "Try asking me things like:\n\n" +

            "📍 \"Where am I?\"\n" +
            "⚠️ \"Are there any incidents near me?\"\n" +
            "🧠 \"Is it safe to travel right now?\"\n" +
            "🌦️ \"What's the weather near me?\"\n" +
            "🗺️ \"How can I find a safer route?\"\n" +
            "🚨 \"I need emergency help\"\n" +
            "🏥 \"Where are nearby hospitals?\"\n" +
            "📊 \"How many incidents have been reported?\""
          );
      }
    };

  // =========================================================
  // 23. SEND MESSAGE
  // =========================================================

  const sendMessage = async (
    customText = null
  ) => {
    const text = (
      customText ?? input
    ).trim();

    if (!text) return;

    const userMessage = {
      id: Date.now(),
      sender: "user",
      text,
    };

    setMessages((prev) => [
      ...prev,
      userMessage,
    ]);

    setInput("");

    try {
      const response =
        await getAIResponse(
          text
        );

      const aiMessage = {
        id:
          Date.now() + 1,
        sender: "ai",
        text: response,
      };

      setMessages((prev) => [
        ...prev,
        aiMessage,
      ]);
    } catch (error) {
      console.error(
        "AI response error:",
        error
      );

      const errorMessage = {
        id:
          Date.now() + 1,
        sender: "ai",
        text:
          "❌ Something went wrong while processing your request. Please try again.",
      };

      setMessages((prev) => [
        ...prev,
        errorMessage,
      ]);
    }
  };

  // =========================================================
  // 24. ENTER KEY
  // =========================================================

  const handleKeyDown = (
    event
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendMessage();
    }
  };

  // =========================================================
  // 25. QUICK ACTIONS
  // =========================================================

  const quickActions = [
    {
      icon: "🗺️",
      title: "Find a safer route",
      text: "Help me find a safer route.",
    },

    {
      icon: "⚠️",
      title: "Nearby incidents",
      text: "Explain nearby incidents.",
    },

    {
      icon: "🚨",
      title: "Emergency help",
      text: "I need emergency help.",
    },

    {
      icon: "🏥",
      title: "Emergency services",
      text: "Find nearby emergency services.",
    },

    {
      icon: "🧠",
      title: "Road Risk Analysis",
      text: "What is the road risk near me?",
    },
  ];

  // =========================================================
  // 26. QUICK ACTION HANDLER
  // =========================================================

  const handleQuickAction = (
    action
  ) => {
    if (
      action.title ===
      "Emergency help"
    ) {
      navigate("/emergency");
      return;
    }

    if (
      action.title ===
      "Find a safer route"
    ) {
      navigate("/plan-journey");
      return;
    }

    if (
      action.title ===
      "Nearby incidents"
    ) {
      navigate("/map");
      return;
    }

    sendMessage(
      action.text
    );
  };

  // =========================================================
  // 27. UI
  // =========================================================

  return (
    <DashboardLayout>
      <div className="ai-page">
        <div className="ai-container">

          {/* HEADER */}

          <header className="ai-header">

            <div className="ai-header-icon">
              🤖
            </div>

            <div>
              <h1>SafeRoute AI</h1>

              <p>
                Intelligent road safety assistant
              </p>
            </div>

            <div className="ai-status">
              <span></span>
              Online
            </div>

          </header>

          {/* MAIN CONTENT */}

          <div className="ai-content">

            {/* LEFT PANEL */}

            <aside className="ai-info-panel">

              <div className="ai-welcome">

                <div className="ai-big-icon">
                  🛡️
                </div>

                <h2>
                  How can I help?
                </h2>

                <p>
                  Ask SafeRoute AI about
                  road risk, incidents,
                  routes, or emergency
                  services.
                </p>

              </div>

              <div className="quick-title">
                Quick Actions
              </div>

              <div className="quick-actions">

                {quickActions.map(
                  (action) => (
                    <button
                      key={action.title}
                      className="quick-action"
                      onClick={() =>
                        handleQuickAction(
                          action
                        )
                      }
                    >

                      <span className="quick-icon">
                        {action.icon}
                      </span>

                      <span>
                        <strong>
                          {action.title}
                        </strong>

                        <small>
                          {action.text}
                        </small>
                      </span>

                      <span className="quick-arrow">
                        →
                      </span>

                    </button>
                  )
                )}

              </div>

              <div className="ai-safety-note">

                <span>🔒</span>

                <div>

                  <strong>
                    Safety first
                  </strong>

                  <p>
                    Risk analysis is an
                    estimate. For immediate
                    danger, use Emergency.
                  </p>

                </div>

              </div>

            </aside>

            {/* CHAT */}

            <main className="ai-chat">

              <div className="chat-header">

                <div className="chat-avatar">
                  🤖
                </div>

                <div>

                  <strong>
                    SafeRoute Assistant
                  </strong>

                  <span>
                    GPS & incident-aware
                    safety analysis
                  </span>

                </div>

              </div>

              {/* MESSAGES */}

              <div className="messages">

                {messages.map(
                  (message) => (

                    <div
                      key={message.id}
                      className={`message-row ${message.sender}`}
                    >

                      {message.sender ===
                        "ai" && (
                        <div className="message-avatar">
                          🤖
                        </div>
                      )}

                      <div className="message-bubble">
                        {message.text}
                      </div>

                    </div>

                  )
                )}

              </div>

              {/* SUGGESTIONS */}

              <div className="chat-suggestions">

                <button
                  onClick={() =>
                    sendMessage(
                      "What is the road risk near me?"
                    )
                  }
                >
                  🧠 Road risk
                </button>

                <button
                  onClick={() =>
                    sendMessage(
                      "What are nearby incidents?"
                    )
                  }
                >
                  ⚠️ Incidents
                </button>

                <button
                  onClick={() =>
                    sendMessage(
                      "How can I find a safer route?"
                    )
                  }
                >
                  🗺️ Safer route
                </button>

              </div>

              {/* INPUT */}

              <div className="chat-input-area">

                <textarea
                  value={input}
                  onChange={(e) =>
                    setInput(
                      e.target.value
                    )
                  }
                  onKeyDown={
                    handleKeyDown
                  }
                  placeholder={
                    locationLoading
                      ? "Getting your location..."
                      : "Ask SafeRoute AI something..."
                  }
                  rows="1"
                />

                <button
                  className="send-button"
                  onClick={() =>
                    sendMessage()
                  }
                  disabled={
                    !input.trim()
                  }
                  aria-label="Send message"
                >
                  ➤
                </button>

              </div>

              <p className="ai-disclaimer">

                SafeRoute AI provides
                estimated safety analysis
                using available incident,
                location, time, and weather
                data. Risk scores are not
                guaranteed predictions.

              </p>

            </main>

          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}

export default AIAssistant;

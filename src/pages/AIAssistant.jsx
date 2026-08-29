import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import DashboardLayout from "../layout/DashboardLayout";
import "./AIAssistant.css";

function AIAssistant() {
  const navigate = useNavigate();

  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "ai",
      text:
        "Hello! 👋 I'm SafeRoute AI. I can analyze nearby road risk using your location, historical incidents, time, and weather conditions.",
    },
  ]);

  const [input, setInput] = useState("");

  // Firestore incidents
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);

  // GPS
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  // =========================================================
  // 1. LOAD INCIDENTS FROM FIRESTORE
  // =========================================================

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const snapshot = await getDocs(
          collection(db, "incidents")
        );

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
        setLoadingIncidents(false);
      }
    };

    fetchIncidents();
  }, []);

  // =========================================================
  // 2. GET CURRENT GPS LOCATION
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
          }

          if (
            error.code ===
            error.POSITION_UNAVAILABLE
          ) {
            message =
              "Your current location is unavailable.";
          }

          if (
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
  // 3. HAVERSINE DISTANCE
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
  // 4. FIND INCIDENTS WITHIN 5 KM
  // =========================================================

  const getNearbyIncidents = (
    location,
    radiusKm = 5
  ) => {
    if (!location || !incidents.length) {
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
  // 5. GET WEATHER
  // =========================================================

  const getWeather = async (
    location
  ) => {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${location.lat}` +
      `&longitude=${location.lng}` +
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
  // 6. WEATHER DESCRIPTION
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
      [51, 53, 55, 61, 63, 65].includes(
        code
      )
    ) {
      return "Rain";
    }

    if (
      [71, 73, 75].includes(code)
    ) {
      return "Snow";
    }

    if (
      [95, 96, 99].includes(code)
    ) {
      return "Thunderstorm";
    }

    return "Variable weather";
  };

  // =========================================================
  // 7. TIME ANALYSIS
  // =========================================================

  const getTimeInformation = () => {
    const now = new Date();

    const hour =
      now.getHours();

    let period;

    if (hour >= 5 && hour < 12) {
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
  // 8. CALCULATE ROAD RISK
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
        description === "Rain"
      ) {
        score += 10;
      }

      if (
        description ===
        "Thunderstorm"
      ) {
        score += 15;
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
  // 9. COMPLETE ROAD RISK ANALYSIS
  // =========================================================

  const performRoadRiskAnalysis =
    async () => {
      if (loadingIncidents) {
        return (
          "⏳ I'm still loading SafeRoute incident data. Please try again in a moment."
        );
      }

      try {
        // GPS
        const location =
          currentLocation ||
          (await getCurrentLocation());

        // Nearby incidents
        const nearbyIncidents =
          getNearbyIncidents(
            location,
            5
          );

        // Weather
        const weather =
          await getWeather(
            location
          );

        // Time
        const time =
          getTimeInformation();

        // Risk
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

        return (
          `🧠 AI ROAD RISK ANALYSIS\n\n` +

          `📊 Risk Score: ${risk.score}/100\n` +
          `⚠️ Risk Level: ${risk.level}\n\n` +

          `📍 Location\n` +
          `Latitude: ${location.lat.toFixed(5)}\n` +
          `Longitude: ${location.lng.toFixed(5)}\n\n` +

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
  // 10. QUICK ACTIONS
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
  // 11. AI RESPONSE
  // =========================================================

  const getAIResponse =
    async (question) => {
      const q =
        question.toLowerCase();

      // ROAD RISK
      if (
        q.includes("road risk") ||
        q.includes("risk score") ||
        q.includes("risk analysis") ||
        q.includes("road safety") ||
        q.includes("danger near me") ||
        q.includes("risk near me") ||
        q.includes("danger around me") ||
        q.includes("analyze road")
      ) {
        return await performRoadRiskAnalysis();
      }

      // EMERGENCY
      if (
        q.includes("emergency") ||
        q.includes("sos")
      ) {
        return (
          "🚨 If you are in immediate danger, " +
          "use the Emergency section and SOS feature. " +
          "You can also check nearby hospitals and police stations."
        );
      }

      // INCIDENT
      if (
        q.includes("incident") ||
        q.includes("danger") ||
        q.includes("report")
      ) {
        if (loadingIncidents) {
          return "⏳ Loading live incident data from Firestore...";
        }

        if (incidents.length === 0) {
          return (
            "No reported incidents are currently available in SafeRoute's Firestore data."
          );
        }

        const high =
          incidents.filter(
            (r) =>
              r.severity
                ?.toLowerCase() ===
              "high"
          ).length;

        const medium =
          incidents.filter(
            (r) =>
              r.severity
                ?.toLowerCase() ===
              "medium"
          ).length;

        const low =
          incidents.filter(
            (r) =>
              r.severity
                ?.toLowerCase() ===
              "low"
          ).length;

        return (
          `SafeRoute currently has ${incidents.length} reported incidents: ` +
          `${high} high severity, ` +
          `${medium} medium severity, ` +
          `${low} low severity.`
        );
      }

      // ROUTE
      if (
        q.includes("route") ||
        q.includes("journey") ||
        q.includes("safer") ||
        q.includes("plan")
      ) {
        return (
          "You can use Plan Journey to enter your starting point and destination. " +
          "SafeRoute can then display route and safety information."
        );
      }

      // SERVICES
      if (
        q.includes("hospital") ||
        q.includes("police") ||
        q.includes("service")
      ) {
        return (
          "Open Emergency Assistance to view nearby hospitals and police stations."
        );
      }

      return (
        "I can analyze nearby road risk using GPS, " +
        "historical incidents, time, and weather. " +
        "Try asking: \"What is the road risk near me?\""
      );
    };

  // =========================================================
  // 12. SEND MESSAGE
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

    const response =
      await getAIResponse(text);

    const aiMessage = {
      id: Date.now() + 1,
      sender: "ai",
      text: response,
    };

    setMessages((prev) => [
      ...prev,
      aiMessage,
    ]);
  };

  // =========================================================
  // 13. ENTER KEY
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
  // 14. QUICK ACTION HANDLER
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

    sendMessage(action.text);
  };

  // =========================================================
  // 15. UI
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
                    setInput(e.target.value)
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
                  disabled={!input.trim()}
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
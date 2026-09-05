import {
  useEffect,
  useState,
  useCallback,
} from "react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

import DashboardLayout from "../layout/DashboardLayout";
import MyLocationButton from "../components/MyLocationButton";
import SearchLocation from "../components/SearchLocation";
import { notify } from "../utils/notify";

import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

import {
  redIcon,
  orangeIcon,
  greenIcon,
  blueIcon,
} from "../utils/markerIcons";

import {
  getRouteWeather,
} from "../services/weatherService";

import {
  analyzeRouteRisk,
  calculateEstimatedDelay,
  getSeverityWeight,
  isFloodIncident,
} from "../services/aiRiskService";

import "./PlanJourney.css";

/* =========================================================
   CONFIGURATION
========================================================= */

const MAX_DISPLAYED_ROUTES = 3;

const OSRM_ALTERNATIVES = 3;

const OSRM_URL =
  "https://router.project-osrm.org/route/v1/driving";

/* =========================================================
   POINT HELPERS
========================================================= */

const getPointCoordinates = (
  point
) => {
  if (!point) {
    return null;
  }

  if (
    point.lat !== undefined &&
    point.lng !== undefined
  ) {
    const lat = Number(point.lat);
    const lng = Number(point.lng);

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      return {
        lat,
        lng,
      };
    }
  }

  if (
    Array.isArray(point) &&
    point.length >= 2
  ) {
    const lat = Number(point[0]);
    const lng = Number(point[1]);

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      return {
        lat,
        lng,
      };
    }
  }

  return null;
};

/* =========================================================
   INCIDENT COORDINATES
========================================================= */

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
    const locationLat =
      Number(
        incident.location.lat
      );

    const locationLng =
      Number(
        incident.location.lng
      );

    if (
      Number.isFinite(
        locationLat
      ) &&
      Number.isFinite(
        locationLng
      )
    ) {
      return {
        lat: locationLat,
        lng: locationLng,
      };
    }
  }

  return null;
};

/* =========================================================
   INCIDENT LABEL
========================================================= */

const getIncidentTypeLabel = (
  incident
) => {
  return (
    incident?.incidentType ||
    incident?.type ||
    "Road Hazard"
  );
};

/* =========================================================
   INCIDENT DELAY
========================================================= */

const getIncidentDelay = (
  incident
) => {
  const severity =
    String(
      incident?.severity || ""
    ).toLowerCase();

  const type =
    String(
      incident?.incidentType ||
        incident?.type ||
        ""
    ).toLowerCase();

  let delay = 3;

  if (severity === "high") {
    delay = 15;
  } else if (
    severity === "medium"
  ) {
    delay = 8;
  }

  if (
    type.includes("road block") ||
    type.includes("block") ||
    type.includes("closure") ||
    type.includes("closed")
  ) {
    delay += 10;
  }

  if (
    type.includes("accident") ||
    type.includes("collision") ||
    type.includes("crash")
  ) {
    delay += 5;
  }

  if (
    type.includes("congestion") ||
    type.includes("traffic")
  ) {
    delay += 5;
  }

  if (
    type.includes("hazard") ||
    type.includes("danger")
  ) {
    delay += 3;
  }

  if (
    type.includes("flood") ||
    type.includes("waterlogging") ||
    type.includes("water logging")
  ) {
    delay += 15;
  }

  return delay;
};

/* =========================================================
   ACTIVE INCIDENT
========================================================= */

const isIncidentActive = (
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
   ROUTING CONTROL
========================================================= */

function RoutingControl({
  startLocation,
  destination,
  onRoutesFound,
}) {
  useEffect(() => {
    let cancelled = false;

    const requestRoutes =
      async () => {
        if (
          !startLocation ||
          !destination
        ) {
          return;
        }

        const startLat =
          Number(
            startLocation.lat
          );

        const startLng =
          Number(
            startLocation.lng
          );

        const destinationLat =
          Number(
            destination.lat
          );

        const destinationLng =
          Number(
            destination.lng
          );

        if (
          !Number.isFinite(
            startLat
          ) ||
          !Number.isFinite(
            startLng
          ) ||
          !Number.isFinite(
            destinationLat
          ) ||
          !Number.isFinite(
            destinationLng
          )
        ) {
          onRoutesFound([]);

          return;
        }

        try {
          const coordinates =
            `${startLng},${startLat};${destinationLng},${destinationLat}`;

          const url =
            `${OSRM_URL}/${coordinates}` +
            `?alternatives=${OSRM_ALTERNATIVES}` +
            `&overview=full` +
            `&geometries=geojson` +
            `&steps=false`;

          console.log(
            "🛣 Requesting OSRM routes:",
            url
          );

          const response =
            await fetch(url);

          if (!response.ok) {
            throw new Error(
              `OSRM HTTP ${response.status}`
            );
          }

          const data =
            await response.json();

          if (
            data.code !==
            "Ok"
          ) {
            throw new Error(
              data.message ||
                data.code ||
                "OSRM routing failed"
            );
          }

          if (cancelled) {
            return;
          }

          const routes =
            Array.isArray(
              data.routes
            )
              ? data.routes
              : [];

          const convertedRoutes =
            routes
              .slice(
                0,
                MAX_DISPLAYED_ROUTES
              )
              .map(
                (
                  route,
                  index
                ) => {
                  const geometry =
                    route
                      ?.geometry
                      ?.coordinates;

                  const coordinates =
                    Array.isArray(
                      geometry
                    )
                      ? geometry
                          .map(
                            (
                              coordinate
                            ) => {
                              if (
                                !Array.isArray(
                                  coordinate
                                ) ||
                                coordinate.length <
                                  2
                              ) {
                                return null;
                              }

                              const lng =
                                Number(
                                  coordinate[0]
                                );

                              const lat =
                                Number(
                                  coordinate[1]
                                );

                              if (
                                !Number.isFinite(
                                  lat
                                ) ||
                                !Number.isFinite(
                                  lng
                                )
                              ) {
                                return null;
                              }

                              return {
                                lat,
                                lng,
                              };
                            }
                          )
                          .filter(
                            Boolean
                          )
                      : [];

                  return {
                    index,

                    coordinates,

                    distance:
                      Number(
                        route.distance ||
                          0
                      ),

                    time:
                      Number(
                        route.duration ||
                          0
                      ),

                    osrmWeight:
                      Number(
                        route.weight ||
                          0
                      ),

                    osrmWeightName:
                      route.weight_name ||
                      "",
                  };
                }
              )
              .filter(
                (route) =>
                  route.coordinates
                    .length > 1
              );

          console.log(
            "🛣 Usable routes:",
            convertedRoutes.length
          );

          onRoutesFound(
            convertedRoutes
          );
        } catch (error) {
          if (!cancelled) {
            console.error(
              "❌ OSRM routing error:",
              error
            );

            onRoutesFound([]);
          }
        }
      };

    requestRoutes();

    return () => {
      cancelled = true;
    };
  }, [
    startLocation,
    destination,
    onRoutesFound,
  ]);

  return null;
}

/* =========================================================
   ROUTE POLYLINES
========================================================= */

function RoutePolylines({
  routeOptions,
  selectedRouteIndex,
  onSelectRoute,
}) {
  if (
    !Array.isArray(
      routeOptions
    )
  ) {
    return null;
  }

  return (
    <>
      {routeOptions.map(
        (route, index) => {
          if (
            !Array.isArray(
              route.coordinates
            ) ||
            route.coordinates
              .length === 0
          ) {
            return null;
          }

          const isSelected =
            selectedRouteIndex ===
            index;

          const isRecommended =
            route.isRecommended;

          let routeColor =
            "#94a3b8";

          let routeWeight = 4;

          let routeOpacity = 0.55;

          let dashArray =
            "10, 10";

          if (isSelected) {
            routeColor =
              "#10b981";

            routeWeight = 8;

            routeOpacity = 0.95;

            dashArray =
              undefined;
          } else if (
            isRecommended
          ) {
            routeColor =
              "#2563eb";

            routeWeight = 6;

            routeOpacity = 0.8;

            dashArray =
              undefined;
          }

          return (
            <Polyline
              key={`route-${index}`}
              positions={route.coordinates
                .map(
                  (point) => {
                    const coordinates =
                      getPointCoordinates(
                        point
                      );

                    if (
                      !coordinates
                    ) {
                      return null;
                    }

                    return [
                      coordinates.lat,
                      coordinates.lng,
                    ];
                  }
                )
                .filter(
                  Boolean
                )}
              pathOptions={{
                color:
                  routeColor,

                weight:
                  routeWeight,

                opacity:
                  routeOpacity,

                dashArray,

                lineCap:
                  "round",

                lineJoin:
                  "round",
              }}
              eventHandlers={{
                click: () =>
                  onSelectRoute(
                    index
                  ),
              }}
            />
          );
        }
      )}
    </>
  );
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

function PlanJourney() {
  const [
    startLocation,
    setStartLocation,
  ] = useState(null);

  const [
    destination,
    setDestination,
  ] = useState(null);

  const [
    showRoute,
    setShowRoute,
  ] = useState(false);

  const [
    routeData,
    setRouteData,
  ] = useState(null);

  const [
    routeOptions,
    setRouteOptions,
  ] = useState([]);

  const [
    selectedRouteIndex,
    setSelectedRouteIndex,
  ] = useState(0);

  const [
    incidents,
    setIncidents,
  ] = useState([]);

  const [
    routeAlerts,
    setRouteAlerts,
  ] = useState([]);

  const [
    savingJourney,
    setSavingJourney,
  ] = useState(false);

  const [
    loadingRoute,
    setLoadingRoute,
  ] = useState(false);

  /* =======================================================
     LOAD INCIDENTS
  ======================================================= */

  const loadIncidents =
    useCallback(async () => {
      try {
        const snapshot =
          await getDocs(
            collection(
              db,
              "incidents"
            )
          );

        const data =
          snapshot.docs.map(
            (docItem) => ({
              id: docItem.id,
              ...docItem.data(),
            })
          );

        setIncidents(data);

        console.log(
          "✅ Incidents loaded:",
          data.length
        );
      } catch (error) {
        console.error(
          "❌ Failed to load incidents:",
          error
        );

        setIncidents([]);
      }
    }, []);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  /* =======================================================
     MARKER ICON
  ======================================================= */

  const getMarkerIcon = (
    severity
  ) => {
    switch (
      String(
        severity || ""
      ).toLowerCase()
    ) {
      case "high":
        return redIcon;

      case "medium":
        return orangeIcon;

      case "low":
        return greenIcon;

      default:
        return blueIcon;
    }
  };

  /* =======================================================
     PROCESS ROUTES
  ======================================================= */

  const handleRoutesFound =
    useCallback(
      async (foundRoutes) => {
        setLoadingRoute(false);

        if (
          !Array.isArray(
            foundRoutes
          ) ||
          foundRoutes.length === 0
        ) {
          setRouteOptions([]);

          setRouteData(null);

          setRouteAlerts([]);

          notify(
            "❌ No driving route could be found between these locations."
          );

          return;
        }

        try {
          console.log(
            "🤖 AI risk analysis started."
          );

          const processedRoutes =
            await Promise.all(
              foundRoutes
                .slice(
                  0,
                  MAX_DISPLAYED_ROUTES
                )
                .map(
                  async (
                    route,
                    index
                  ) => {
                    /*
                     * WEATHER
                     */

                    const weather =
                      await getRouteWeather(
                        route.coordinates
                      );

                    /*
                     * AI RISK
                     */

                    const aiRisk =
                      analyzeRouteRisk({
                        routeCoordinates:
                          route.coordinates,

                        incidents,

                        weather,

                        journeyDate:
                          new Date(),
                      });

                    /*
                     * DELAY
                     */

                    const estimatedDelay =
                      calculateEstimatedDelay(
                        {
                          routeIncidents:
                            aiRisk.routeIncidents,

                          weather,

                          weatherInteraction:
                            aiRisk.weatherInteraction,
                        }
                      );

                    return {
                      index,

                      coordinates:
                        route.coordinates,

                      distance:
                        Number(
                          route.distance ||
                            0
                        ),

                      time:
                        Number(
                          route.time ||
                            0
                        ),

                      incidents:
                        aiRisk.routeIncidents,

                      historicalIncidents:
                        aiRisk.historicalIncidents,

                      riskScore:
                        aiRisk.riskScore,

                      riskLevel:
                        aiRisk.riskLevel,

                      estimatedDelay,

                      weather,

                      weatherInteraction:
                        aiRisk.weatherInteraction,

                      aiRisk,

                      isRecommended:
                        false,
                    };
                  }
                )
            );

          /*
           * SAFEST ROUTE
           *
           * Priority:
           * 1. Risk score
           * 2. Risk level
           * 3. Estimated delay
           * 4. Travel time
           */

          const sortedRoutes =
            [
              ...processedRoutes,
            ].sort(
              (a, b) => {
                if (
                  a.riskScore !==
                  b.riskScore
                ) {
                  return (
                    a.riskScore -
                    b.riskScore
                  );
                }

                if (
                  a.estimatedDelay !==
                  b.estimatedDelay
                ) {
                  return (
                    a.estimatedDelay -
                    b.estimatedDelay
                  );
                }

                return (
                  a.time -
                  b.time
                );
              }
            );

          const safestOriginalIndex =
            sortedRoutes[0]
              ?.index ?? 0;

          const finalRoutes =
            processedRoutes.map(
              (route) => ({
                ...route,

                isRecommended:
                  route.index ===
                  safestOriginalIndex,
              })
            );

          const actualSelectedIndex =
            finalRoutes.findIndex(
              (route) =>
                route.index ===
                safestOriginalIndex
            );

          const safeIndex =
            actualSelectedIndex >=
            0
              ? actualSelectedIndex
              : 0;

          setRouteOptions(
            finalRoutes
          );

          setSelectedRouteIndex(
            safeIndex
          );

          const safestRoute =
            finalRoutes[
              safeIndex
            ];

          if (safestRoute) {
            setRouteData({
              coordinates:
                safestRoute.coordinates,

              distance:
                safestRoute.distance,

              time:
                safestRoute.time,

              riskLevel:
                safestRoute.riskLevel,

              riskScore:
                safestRoute.riskScore,

              estimatedDelay:
                safestRoute.estimatedDelay,

              weather:
                safestRoute.weather,

              weatherInteraction:
                safestRoute.weatherInteraction,

              aiRisk:
                safestRoute.aiRisk,
            });

            setRouteAlerts(
              safestRoute.incidents
            );

            /*
             * WEATHER WARNING
             */

            if (
              safestRoute.weather
                ?.level ===
                "High"
            ) {
              notify(
                "🌧️ Elevated weather risk detected on the recommended route."
              );
            } else if (
              safestRoute.weather
                ?.level ===
                "Medium"
            ) {
              notify(
                "⚠️ Weather conditions may increase travel risk."
              );
            }

            /*
             * WEATHER + ROAD
             */

            if (
              safestRoute
                .weatherInteraction
                ?.elevated
            ) {
              notify(
                "⚠️ Weather + road conditions are creating elevated travel risk."
              );
            }

            /*
             * FLOOD
             */

            if (
              safestRoute
                .weatherInteraction
                ?.floodCombination
            ) {
              notify(
                "🚨 Rain + flood/waterlogging risk detected near the recommended route."
              );
            }

            /*
             * AI HIGH RISK
             */

            if (
              safestRoute.aiRisk
                ?.riskLevel ===
              "High"
            ) {
              notify(
                "🚨 AI road-risk analysis estimates HIGH travel risk for this route."
              );
            }

            console.log(
              "🤖 AI Route Risk:",
              safestRoute.aiRisk
            );
          }

          if (
            finalRoutes.length ===
            1
          ) {
            console.log(
              "ℹ️ OSRM returned only one usable route."
            );
          } else {
            console.log(
              `🛣 ${finalRoutes.length} alternative routes available.`
            );
          }
        } catch (error) {
          console.error(
            "❌ Route risk processing failed:",
            error
          );

          setRouteOptions([]);
          setRouteData(null);
          setRouteAlerts([]);

          notify(
            "❌ Could not calculate route risk."
          );
        }
      },
      [incidents]
    );

  /* =======================================================
     SELECT ROUTE
  ======================================================= */

  const selectRoute =
    useCallback(
      (index) => {
        setRouteOptions(
          (previousRoutes) => {
            const selected =
              previousRoutes[
                index
              ];

            if (!selected) {
              return previousRoutes;
            }

            setSelectedRouteIndex(
              index
            );

            setRouteData({
              coordinates:
                selected.coordinates,

              distance:
                selected.distance,

              time:
                selected.time,

              riskLevel:
                selected.riskLevel,

              riskScore:
                selected.riskScore,

              estimatedDelay:
                selected.estimatedDelay,

              weather:
                selected.weather,

              weatherInteraction:
                selected.weatherInteraction,

              aiRisk:
                selected.aiRisk,
            });

            setRouteAlerts(
              selected.incidents
            );

            /*
             * WEATHER
             */

            if (
              selected.weather
                ?.level ===
              "High"
            ) {
              notify(
                "🌧️ Warning: this selected route has high weather risk."
              );
            } else if (
              selected.weather
                ?.level ===
              "Medium"
            ) {
              notify(
                "⚠️ Weather conditions may increase risk on this selected route."
              );
            }

            /*
             * FLOOD
             */

            if (
              selected
                .weatherInteraction
                ?.floodCombination
            ) {
              notify(
                "🚨 Warning: rain + flood/waterlogging risk detected on this route."
              );
            }

            /*
             * AI RISK
             */

            if (
              selected.aiRisk
                ?.riskLevel ===
              "High"
            ) {
              notify(
                "🚨 AI risk estimate: HIGH travel risk on this selected route."
              );
            }

            return previousRoutes;
          }
        );
      },
      []
    );

  /* =======================================================
     SAVE JOURNEY
  ======================================================= */

  const saveJourney =
    async () => {
      const currentUser =
        auth.currentUser;

      if (!currentUser) {
        notify(
          "Please login before saving a journey."
        );

        return;
      }

      if (
        !startLocation ||
        !destination ||
        !routeData
      ) {
        notify(
          "Generate a route before saving the journey."
        );

        return;
      }

      try {
        setSavingJourney(true);

        const startName =
          startLocation.name ||
          startLocation.area ||
          "Current Location";

        const destinationName =
          destination.name ||
          destination.area ||
          "Destination";

        const routeName = `${
          startName.split(",")[0]
        } → ${
          destinationName.split(
            ","
          )[0]
        }`;

        const savedJourney = {
          userId:
            currentUser.uid,

          userEmail:
            currentUser.email ||
            "",

          routeName,

          startName,

          startArea:
            startLocation.area ||
            "",

          startDistrict:
            startLocation.district ||
            "",

          startLat:
            Number(
              startLocation.lat
            ),

          startLng:
            Number(
              startLocation.lng
            ),

          destinationName,

          destinationArea:
            destination.area ||
            "",

          destinationDistrict:
            destination.district ||
            "",

          destinationLat:
            Number(
              destination.lat
            ),

          destinationLng:
            Number(
              destination.lng
            ),

          distanceKm:
            Number(
              routeData.distance
            ) / 1000,

          durationMinutes:
            Number(
              routeData.time
            ) / 60,

          routeRiskLevel:
            routeData.riskLevel ||
            "Safe",

          routeRiskScore:
            Number(
              routeData.riskScore ||
                0
            ),

          estimatedDelayMinutes:
            Number(
              routeData.estimatedDelay ||
                0
            ),

          alertCount:
            routeAlerts.length,

          /* WEATHER */

          weatherRiskLevel:
            routeData.weather
              ?.level ||
            "Unknown",

          weatherRiskScore:
            Number(
              routeData.weather
                ?.score || 0
            ),

          weatherDescription:
            routeData.weather
              ?.primary
              ?.description ||
            "",

          weatherCategory:
            routeData.weather
              ?.primary
              ?.category ||
            "",

          weatherWarnings:
            routeData.weather
              ?.warnings || [],

          weatherIncidentRisk:
            Number(
              routeData
                .weatherInteraction
                ?.score || 0
            ),

          floodWeatherCombination:
            Boolean(
              routeData
                .weatherInteraction
                ?.floodCombination
            ),

          /* AI RISK */

          aiRiskScore:
            Number(
              routeData.aiRisk
                ?.riskScore || 0
            ),

          aiRiskLevel:
            routeData.aiRisk
              ?.riskLevel ||
            "Safe",

          aiRiskExplanation:
            routeData.aiRisk
              ?.explanation ||
            "",

          aiRiskFactors:
            routeData.aiRisk
              ?.factors || [],

          historicalIncidentCount:
            Number(
              routeData.aiRisk
                ?.historicalIncidentCount ||
                0
            ),

          aiRiskDisclaimer:
            routeData.aiRisk
              ?.disclaimer ||
            "This is a rule-based risk estimate and not a guaranteed prediction.",

          routeCoordinates:
            routeData.coordinates?.map(
              (point) => ({
                lat: Number(
                  point.lat
                ),

                lng: Number(
                  point.lng
                ),
              })
            ) || [],

          status: "Saved",

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        };

        const savedJourneyRef =
          await addDoc(
            collection(
              db,
              "savedRoutes"
            ),
            savedJourney
          );

        /*
         * NOTIFICATION
         */

        const notification = {
          senderId:
            currentUser.uid,

          recipientId:
            currentUser.uid,

          recipientEmail:
            currentUser.email ||
            "",

          type:
            "SAVED_JOURNEY",

          title:
            "🛣 Journey Saved",

          message: `Your journey from ${
            startName.split(
              ","
            )[0]
          } to ${
            destinationName.split(
              ","
            )[0]
          } has been saved successfully.`,

          routeName,

          startName,

          destinationName,

          distanceKm:
            Number(
              routeData.distance
            ) / 1000,

          durationMinutes:
            Number(
              routeData.time
            ) / 60,

          routeRiskLevel:
            routeData.riskLevel ||
            "Safe",

          routeRiskScore:
            Number(
              routeData.riskScore ||
                0
            ),

          estimatedDelayMinutes:
            Number(
              routeData.estimatedDelay ||
                0
            ),

          alertCount:
            routeAlerts.length,

          weatherRiskLevel:
            routeData.weather
              ?.level ||
            "Unknown",

          weatherDescription:
            routeData.weather
              ?.primary
              ?.description ||
            "",

          weatherWarnings:
            routeData.weather
              ?.warnings || [],

          floodWeatherCombination:
            Boolean(
              routeData
                .weatherInteraction
                ?.floodCombination
            ),

          aiRiskLevel:
            routeData.aiRisk
              ?.riskLevel ||
            "Safe",

          aiRiskScore:
            Number(
              routeData.aiRisk
                ?.riskScore || 0
            ),

          aiRiskExplanation:
            routeData.aiRisk
              ?.explanation ||
            "",

          status: "Saved",

          createdAt:
            serverTimestamp(),

          savedJourneyId:
            savedJourneyRef.id,
        };

        await addDoc(
          collection(
            db,
            "notifications"
          ),
          notification
        );

        notify(
          "✅ Journey saved successfully!\n\n🔔 You can see it in Notifications."
        );
      } catch (error) {
        console.error(
          "Save journey error:",
          error
        );

        if (
          error.code ===
          "permission-denied"
        ) {
          notify(
            "❌ You do not have permission to save this journey or create notifications."
          );
        } else {
          notify(
            `❌ Failed to save journey.\n\n${
              error.message ||
              "Unknown error"
            }`
          );
        }
      } finally {
        setSavingJourney(false);
      }
    };

  /* =======================================================
     FORMAT DISTANCE
  ======================================================= */

  const formatDistance =
    (meters) => {
      return (
        Number(
          meters || 0
        ) / 1000
      ).toFixed(1);
    };

  /* =======================================================
     FORMAT TIME
  ======================================================= */

  const formatTime =
    (seconds) => {
      const minutes =
        Math.round(
          Number(
            seconds || 0
          ) / 60
        );

      if (minutes < 60) {
        return `${minutes} min`;
      }

      const hours =
        Math.floor(
          minutes / 60
        );

      const remaining =
        minutes % 60;

      return `${hours}h ${remaining}m`;
    };

  /* =======================================================
     RISK CLASS
  ======================================================= */

  const getRiskClass =
    (riskLevel) => {
      switch (
        String(
          riskLevel || ""
        ).toLowerCase()
      ) {
        case "high":
          return "risk-high";

        case "medium":
          return "risk-medium";

        case "low":
          return "risk-low";

        default:
          return "risk-safe";
      }
    };

  /* =======================================================
     RESET
  ======================================================= */

  const resetRoute =
    () => {
      setRouteData(null);

      setRouteAlerts([]);

      setRouteOptions([]);

      setSelectedRouteIndex(
        0
      );

      setShowRoute(false);

      setLoadingRoute(false);
    };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <DashboardLayout>
      <div className="plan-journey-page">

        {/* HEADER */}

        <div className="journey-page-heading">
          <h1>
            🛣 Plan Safe Journey
          </h1>

          <p>
            Plan your route and get
            automatic warnings about
            road hazards, weather
            conditions and estimated
            road risk.
          </p>
        </div>

        {/* START + DESTINATION */}

        <div className="journey-controls">

          <div className="journey-field">
            <h3>
              Starting Location
            </h3>

            <div className="journey-location-button">
              <MyLocationButton
                onLocate={(
                  location
                ) => {
                  setStartLocation(
                    location
                  );

                  setRouteData(null);

                  setRouteAlerts([]);

                  setRouteOptions([]);

                  setSelectedRouteIndex(
                    0
                  );

                  setShowRoute(false);
                }}
              />
            </div>

            {startLocation && (
              <p>
                📍{" "}
                {startLocation.area ||
                  startLocation.name ||
                  "My Current Location"}
              </p>
            )}
          </div>

          <div className="journey-field">
            <h3>
              Destination
            </h3>

            <SearchLocation
              onLocationSelect={(
                location
              ) => {
                setDestination(
                  location
                );

                setRouteData(null);

                setRouteAlerts([]);

                setRouteOptions([]);

                setSelectedRouteIndex(
                  0
                );

                setShowRoute(false);
              }}
            />

            {destination && (
              <p>
                📍{" "}
                {destination.area ||
                  destination.name ||
                  "Selected Destination"}
              </p>
            )}
          </div>
        </div>

        {/* GENERATE */}

        {startLocation &&
          destination &&
          !showRoute && (
            <button
              type="button"
              className="generate-route-btn"
              onClick={() => {
                setLoadingRoute(true);

                setRouteData(null);

                setRouteAlerts([]);

                setRouteOptions([]);

                setSelectedRouteIndex(
                  0
                );

                setShowRoute(true);
              }}
            >
              🛡 Generate Safe Route
            </button>
          )}

        {/* MAP */}

        {showRoute &&
          startLocation &&
          destination && (
            <div className="route-map-wrapper">

              {loadingRoute && (
                <div className="route-loading">
                  <div className="route-loading-spinner" />

                  <strong>
                    Calculating your
                    safest route...
                  </strong>

                  <span>
                    Checking alternative
                    routes, historical
                    incidents, current road
                    hazards and weather.
                  </span>
                </div>
              )}

              <MapContainer
                center={[
                  Number(
                    startLocation.lat
                  ),
                  Number(
                    startLocation.lng
                  ),
                ]}
                zoom={13}
                className="journey-map"
              >

                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />

                <RoutingControl
                  startLocation={
                    startLocation
                  }
                  destination={
                    destination
                  }
                  onRoutesFound={
                    handleRoutesFound
                  }
                />

                <RoutePolylines
                  routeOptions={
                    routeOptions
                  }
                  selectedRouteIndex={
                    selectedRouteIndex
                  }
                  onSelectRoute={
                    selectRoute
                  }
                />

                {/* START */}

                <Marker
                  position={[
                    Number(
                      startLocation.lat
                    ),
                    Number(
                      startLocation.lng
                    ),
                  ]}
                  icon={blueIcon}
                >
                  <Popup>
                    <strong>
                      📍 Start Location
                    </strong>
                  </Popup>
                </Marker>

                {/* DESTINATION */}

                <Marker
                  position={[
                    Number(
                      destination.lat
                    ),
                    Number(
                      destination.lng
                    ),
                  ]}
                  icon={blueIcon}
                >
                  <Popup>
                    <strong>
                      🏁 Destination
                    </strong>
                  </Popup>
                </Marker>

                {/* INCIDENTS */}

                {routeAlerts.map(
                  (incident) => {
                    const coordinates =
                      getIncidentCoordinates(
                        incident
                      );

                    if (
                      !coordinates
                    ) {
                      return null;
                    }

                    return (
                      <Marker
                        key={
                          incident.id
                        }
                        position={[
                          coordinates.lat,
                          coordinates.lng,
                        ]}
                        icon={getMarkerIcon(
                          incident.severity
                        )}
                      >
                        <Popup>

                          <strong>
                            ⚠{" "}
                            {getIncidentTypeLabel(
                              incident
                            )}
                          </strong>

                          <br />

                          Severity:{" "}
                          {incident.severity ||
                            "-"}

                          <br />

                          Status:{" "}
                          {incident.status ||
                            "Active"}

                          <br />

                          Estimated delay:{" "}
                          {getIncidentDelay(
                            incident
                          )}{" "}
                          min

                        </Popup>
                      </Marker>
                    );
                  }
                )}

              </MapContainer>
            </div>
          )}

        {/* =================================================
            ROUTE OPTIONS
        ================================================= */}

        {routeOptions.length >
          0 && (
          <div className="route-options-section">

            <div className="section-heading-row">
              <div>

                <h2>
                  🛣 Available Routes
                </h2>

                <p>
                  Compare routes using
                  road incidents, historical
                  patterns, weather, time
                  and estimated risk.
                </p>

              </div>
            </div>

            {routeOptions.length >
              1 && (
              <div className="route-alternative-info">
                🛣{" "}
                {
                  routeOptions.length
                }{" "}
                real route options found.
                The safest option is marked
                as recommended.
              </div>
            )}

            {routeOptions.length ===
              1 && (
              <div className="route-alternative-info">
                ℹ️ Only one usable driving
                route was returned by OSRM.
              </div>
            )}

            <div className="route-options-grid">

              {routeOptions.map(
                (
                  route,
                  index
                ) => (
                  <div
                    key={
                      `route-card-${index}`
                    }
                    className={`route-option-card ${
                      selectedRouteIndex ===
                      index
                        ? "selected-route"
                        : ""
                    }`}
                  >

                    <div className="route-option-top">

                      <div>

                        <h3>
                          {route.isRecommended
                            ? "🛡 Recommended Safe Route"
                            : `Route ${
                                index +
                                1
                              }`}
                        </h3>

                        {route.isRecommended && (
                          <span className="recommended-badge">
                            SAFER CHOICE
                          </span>
                        )}

                      </div>

                      <span
                        className={`risk-badge ${getRiskClass(
                          route.riskLevel
                        )}`}
                      >
                        {
                          route.riskLevel
                        }
                      </span>

                    </div>

                    <div className="route-option-stats">

                      <div>
                        <span>
                          Distance
                        </span>

                        <strong>
                          {formatDistance(
                            route.distance
                          )}{" "}
                          km
                        </strong>
                      </div>

                      <div>
                        <span>
                          Travel Time
                        </span>

                        <strong>
                          {formatTime(
                            route.time
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Route Alerts
                        </span>

                        <strong>
                          {
                            route
                              .incidents
                              .length
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Est. Delay
                        </span>

                        <strong>
                          +
                          {
                            route.estimatedDelay
                          }{" "}
                          min
                        </strong>
                      </div>

                    </div>

                    {/* WEATHER */}

                    {route.weather && (
                      <div className="route-option-warning">

                        {route.weather.level ===
                        "High"
                          ? "🌧️"
                          : route.weather.level ===
                            "Medium"
                          ? "⚠️"
                          : route.weather.level ===
                            "Low"
                          ? "🌦️"
                          : "☀️"}{" "}

                        Weather:{" "}

                        {
                          route.weather
                            .primary
                            ?.description
                        }

                        {" • "}

                        Risk:{" "}
                        {
                          route.weather
                            .level
                        }

                      </div>
                    )}

                    {/* AI RISK */}

                    {route.aiRisk && (
                      <div
                        className={`route-option-warning ${getRiskClass(
                          route.aiRisk
                            .riskLevel
                        )}`}
                      >
                        🤖 AI Risk Estimate:{" "}
                        <strong>
                          {
                            route.aiRisk
                              .riskLevel
                          }
                        </strong>{" "}
                        (
                        {
                          route.aiRisk
                            .riskScore
                        }
                        /30)
                      </div>
                    )}

                    {/* HISTORICAL */}

                    {route.aiRisk
                      ?.historicalIncidentCount >
                      0 && (
                      <div className="route-option-warning">
                        📊{" "}
                        {
                          route.aiRisk
                            .historicalIncidentCount
                        }{" "}
                        historical incident
                        {route.aiRisk
                          .historicalIncidentCount >
                        1
                          ? "s"
                          : ""}{" "}
                        found near this
                        route area.
                      </div>
                    )}

                    {/* WEATHER + FLOOD */}

                    {route
                      .weatherInteraction
                      ?.floodCombination && (
                      <div className="route-option-warning">
                        🚨 Rain + flood/waterlogging
                        combination detected near
                        this route.
                      </div>
                    )}

                    {/* INCIDENTS */}

                    {route.incidents
                      .length >
                    0 ? (
                      <div className="route-option-warning">
                        ⚠{" "}
                        {
                          route
                            .incidents
                            .length
                        }{" "}
                        active incident
                        {route.incidents
                          .length >
                        1
                          ? "s"
                          : ""}{" "}
                        detected near this
                        route.
                      </div>
                    ) : (
                      <div className="route-option-safe">
                        ✅ No active incidents
                        detected near this
                        route.
                      </div>
                    )}

                    <button
                      type="button"
                      className={
                        selectedRouteIndex ===
                        index
                          ? "use-route-btn active"
                          : "use-route-btn"
                      }
                      onClick={() =>
                        selectRoute(
                          index
                        )
                      }
                    >
                      {selectedRouteIndex ===
                      index
                        ? "✓ Using This Route"
                        : "Use This Route"}
                    </button>

                  </div>
                )
              )}

            </div>
          </div>
        )}

        {/* =================================================
            ROUTE SUMMARY
        ================================================= */}

        {routeData && (
          <div className="route-summary">

            <div>
              <strong>
                Distance
              </strong>

              <p>
                {formatDistance(
                  routeData.distance
                )}{" "}
                km
              </p>
            </div>

            <div>
              <strong>
                Estimated Time
              </strong>

              <p>
                {formatTime(
                  routeData.time
                )}
              </p>
            </div>

            <div>
              <strong>
                Route Risk
              </strong>

              <p
                className={getRiskClass(
                  routeData.riskLevel
                )}
              >
                {
                  routeData.riskLevel
                }
              </p>
            </div>

            <div>
              <strong>
                Estimated Delay
              </strong>

              <p>
                +
                {
                  routeData.estimatedDelay
                }{" "}
                min
              </p>
            </div>

          </div>
        )}

        {/* =================================================
            AI RISK ANALYSIS
        ================================================= */}

        {routeData?.aiRisk && (
          <div
            className={`route-warning-panel ${getRiskClass(
              routeData.aiRisk
                .riskLevel
            )}`}
          >

            <div className="route-warning-icon">
              🤖
            </div>

            <div className="route-warning-content">

              <h2>
                AI Road Risk Analysis
              </h2>

              <p>
                Estimated risk:{" "}
                <strong>
                  {
                    routeData.aiRisk
                      .riskLevel
                  }
                </strong>{" "}
                — Score{" "}
                <strong>
                  {
                    routeData.aiRisk
                      .riskScore
                  }
                  /30
                </strong>
              </p>

              <p>
                {
                  routeData.aiRisk
                    .explanation
                }
              </p>

              {routeData.aiRisk
                .factors?.length >
                0 && (
                <ul>
                  {routeData.aiRisk.factors.map(
                    (
                      factor,
                      index
                    ) => (
                      <li
                        key={`ai-factor-${index}`}
                      >
                        {factor}
                      </li>
                    )
                  )}
                </ul>
              )}

              <small>
                ⚠️{" "}
                {
                  routeData.aiRisk
                    .disclaimer
                }
              </small>

            </div>
          </div>
        )}

        {/* =================================================
            WEATHER SUMMARY
        ================================================= */}

        {routeData?.weather && (
          <div
            className={`route-warning-panel ${getRiskClass(
              routeData.weather.level
            )}`}
          >

            <div className="route-warning-icon">

              {routeData.weather.level ===
              "High"
                ? "🌧️"
                : routeData.weather.level ===
                  "Medium"
                ? "⚠️"
                : routeData.weather.level ===
                  "Low"
                ? "🌦️"
                : "☀️"}

            </div>

            <div className="route-warning-content">

              <h2>
                Weather Safety
              </h2>

              <p>
                Current route weather:{" "}
                <strong>
                  {
                    routeData.weather
                      .primary
                      ?.description
                  }
                </strong>
              </p>

              <p>
                Weather risk:{" "}
                <strong>
                  {
                    routeData.weather
                      .level
                  }
                </strong>
              </p>

              {routeData.weather
                .warnings?.length >
                0 && (
                <ul>
                  {routeData.weather.warnings.map(
                    (
                      warning,
                      index
                    ) => (
                      <li
                        key={`weather-warning-${index}`}
                      >
                        {warning}
                      </li>
                    )
                  )}
                </ul>
              )}

              {routeData
                .weatherInteraction
                ?.elevated && (
                <strong>
                  ⚠️ Weather is increasing
                  the road-safety risk on
                  this route.
                </strong>
              )}

              {routeData
                .weatherInteraction
                ?.floodCombination && (
                <strong>
                  🚨 Heavy rain + flood/
                  waterlogging risk detected.
                  Consider using the safer
                  alternative route.
                </strong>
              )}

            </div>
          </div>
        )}

        {/* =================================================
            ACTIONABLE WARNING
        ================================================= */}

        {routeData && (
          <div
            className={`route-warning-panel ${getRiskClass(
              routeData.riskLevel
            )}`}
          >

            <div className="route-warning-icon">

              {routeData.riskLevel ===
              "High"
                ? "🚨"
                : routeData.riskLevel ===
                  "Medium"
                ? "⚠️"
                : routeData.riskLevel ===
                  "Low"
                ? "⚠"
                : "✅"}

            </div>

            <div className="route-warning-content">

              <h2>
                {routeData.riskLevel ===
                "Safe"
                  ? "Route Looks Safe"
                  : "Route Safety Warning"}
              </h2>

              {routeAlerts.length ===
              0 ? (
                <p>
                  No active road incidents
                  were found close to your
                  selected route.
                </p>
              ) : (
                <>
                  <p>
                    {
                      routeAlerts.length
                    }{" "}
                    active road incident
                    {routeAlerts.length >
                    1
                      ? "s"
                      : ""}{" "}
                    detected near your
                    selected route.
                  </p>

                  <strong>
                    Estimated additional
                    delay: +
                    {
                      routeData.estimatedDelay
                    }{" "}
                    minutes.
                  </strong>
                </>
              )}

              {routeData.weather
                ?.level !==
                "Safe" &&
                routeData.weather
                  ?.level !==
                  "Unknown" && (
                  <p>
                    🌦 Weather is also
                    contributing to the
                    route risk.
                  </p>
                )}

              {routeData
                .weatherInteraction
                ?.elevated && (
                <strong>
                  ⚠️ Weather + road conditions
                  are creating elevated travel
                  risk.
                </strong>
              )}

            </div>

            {routeOptions.length >
              1 &&
              selectedRouteIndex !==
                routeOptions.findIndex(
                  (route) =>
                    route.isRecommended
                ) && (
                <button
                  type="button"
                  className="alternative-action-btn"
                  onClick={() => {
                    const saferIndex =
                      routeOptions.findIndex(
                        (route) =>
                          route.isRecommended
                      );

                    if (
                      saferIndex >=
                      0
                    ) {
                      selectRoute(
                        saferIndex
                      );
                    }
                  }}
                >
                  🛡 Use Safer Route
                </button>
              )}

          </div>
        )}

        {/* =================================================
            SAVE JOURNEY
        ================================================= */}

        {routeData && (
          <div className="save-journey-section">

            <div>
              <h3>
                Ready to travel?
              </h3>

              <p>
                Save this selected route
                to monitor road and
                weather conditions later
                from My Journeys.
              </p>
            </div>

            <button
              type="button"
              className="save-journey-btn"
              onClick={
                saveJourney
              }
              disabled={
                savingJourney
              }
            >
              {savingJourney
                ? "Saving Journey..."
                : "💾 Save Journey"}
            </button>

          </div>
        )}

        {/* =================================================
            ALERT DETAILS
        ================================================= */}

        {routeData && (
          <div className="route-alert-section">

            <h2>
              Route Safety Alerts
            </h2>

            {routeAlerts.length ===
            0 ? (
              <div className="route-safe-message">
                ✅ No active road
                incidents were found
                close to this route.
              </div>
            ) : (
              routeAlerts.map(
                (
                  incident
                ) => (
                  <div
                    className={`route-alert-card ${getRiskClass(
                      incident.severity
                    )}`}
                    key={
                      incident.id
                    }
                  >

                    <div className="alert-card-header">

                      <h3>
                        ⚠{" "}
                        {getIncidentTypeLabel(
                          incident
                        )}
                      </h3>

                      <span
                        className={`risk-badge ${getRiskClass(
                          incident.severity
                        )}`}
                      >
                        {incident.severity ||
                          "Unknown"}
                      </span>

                    </div>

                    <p>
                      <strong>
                        Location:
                      </strong>{" "}
                      {incident.area ||
                        "-"}
                      {incident.district
                        ? `, ${incident.district}`
                        : ""}
                    </p>

                    <p>
                      <strong>
                        Status:
                      </strong>{" "}
                      {incident.status ||
                        "Active"}
                    </p>

                    <p>
                      <strong>
                        Estimated impact:
                      </strong>{" "}
                      +
                      {
                        getIncidentDelay(
                          incident
                        )
                      }{" "}
                      minutes
                    </p>

                    {isFloodIncident(
                      incident
                    ) && (
                      <p>
                        <strong>
                          🌊 Flooding:
                        </strong>{" "}
                        Water/flood-related
                        hazard detected.
                      </p>
                    )}

                  </div>
                )
              )
            )}

          </div>
        )}

        {/* =================================================
            PLAN AGAIN
        ================================================= */}

        {routeData && (
          <button
            type="button"
            className="plan-again-btn"
            onClick={
              resetRoute
            }
          >
            ↻ Plan Another Journey
          </button>
        )}

      </div>
    </DashboardLayout>
  );
}

export default PlanJourney;
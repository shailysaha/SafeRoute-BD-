import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "../firebase/firebase";
import DashboardLayout from "../layout/DashboardLayout";

import "./AccidentAnalytics.css";

// ======================================================
// CONSTANTS
// ======================================================

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const SEVERITIES = ["High", "Medium", "Low"];

const UNKNOWN = "Unknown";

// ======================================================
// SAFE VALUE HELPERS
// ======================================================

function clean(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function firstValue(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }

    if (clean(value)) {
      return value;
    }
  }

  return "";
}

function getDateValue(value) {
  if (!value) return null;

  if (value?.toDate instanceof Function) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (
    typeof value === "object" &&
    typeof value.seconds === "number"
  ) {
    return new Date(value.seconds * 1000);
  }

  return null;
}

function formatDate(value) {
  const date = getDateValue(value);

  if (!date) {
    return "Unknown";
  }

  return date.toLocaleDateString("en-BD", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  const date = getDateValue(value);

  if (!date) {
    return "Unknown";
  }

  return date.toLocaleString("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// ======================================================
// ACCIDENT DETECTION
// ======================================================

function isAccident(incident) {
  const type = lower(
    firstValue(
      incident.incidentType,
      incident.dangerType,
      incident.type
    )
  );

  return (
    type.includes("accident") ||
    type.includes("collision") ||
    type.includes("crash") ||
    type.includes("road accident") ||
    incident.isAccident === true
  );
}

// ======================================================
// NORMALIZE ACCIDENT DATA
// ======================================================

function normalizeAccident(incident) {
  const accident =
    incident.accident &&
    typeof incident.accident === "object"
      ? incident.accident
      : {};

  const reportedFactorsRaw = firstValue(
    accident.reportedFactors,
    incident.reportedFactors,
    accident.factors,
    incident.factors
  );

  let reportedFactors = [];

  if (Array.isArray(reportedFactorsRaw)) {
    reportedFactors = reportedFactorsRaw
      .map(clean)
      .filter(Boolean);
  } else if (clean(reportedFactorsRaw)) {
    reportedFactors = clean(reportedFactorsRaw)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const date =
    getDateValue(
      accident.accidentTime
    ) ||
    getDateValue(
      incident.accidentTime
    ) ||
    getDateValue(
      incident.occurredAt
    ) ||
    getDateValue(
      incident.createdAt
    );

  return {
    ...incident,

    accidentTime: date,

    weather:
      firstValue(
        accident.weather,
        incident.weather
      ) || UNKNOWN,

    roadType:
      firstValue(
        accident.roadType,
        incident.roadType
      ) || UNKNOWN,

    vehicleType:
      firstValue(
        accident.vehicleType,
        incident.vehicleType
      ) || UNKNOWN,

    reportedFactors,

    area:
      firstValue(
        accident.area,
        incident.area
      ) || UNKNOWN,

    district:
      firstValue(
        accident.district,
        incident.district
      ) || UNKNOWN,

    severity:
      firstValue(
        accident.severity,
        incident.severity
      ) || UNKNOWN,

    incidentType:
      firstValue(
        accident.incidentType,
        incident.incidentType,
        incident.dangerType
      ) || "Road Accident",

    lat: Number(
      firstValue(
        accident.lat,
        incident.lat,
        accident.latitude,
        incident.latitude
      )
    ),

    lng: Number(
      firstValue(
        accident.lng,
        incident.lng,
        accident.longitude,
        incident.longitude
      )
    ),
  };
}

// ======================================================
// COUNTER HELPER
// ======================================================

function incrementCounter(object, key) {
  const normalized =
    clean(key) || UNKNOWN;

  object[normalized] =
    (object[normalized] || 0) + 1;
}

// ======================================================
// CSV HELPERS
// ======================================================

function csvEscape(value) {
  const text = clean(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function downloadCSV(accidents) {
  if (!accidents.length) {
    alert("No accident records available to export.");
    return;
  }

  const headers = [
    "Incident ID",
    "Date",
    "Area",
    "District",
    "Latitude",
    "Longitude",
    "Incident Type",
    "Severity",
    "Weather",
    "Road Type",
    "Vehicle Type",
    "Reported Factors",
    "Status",
  ];

  const rows = accidents.map((accident) => [
    accident.id,
    formatDateTime(accident.accidentTime),
    accident.area,
    accident.district,
    Number.isFinite(accident.lat)
      ? accident.lat
      : "",
    Number.isFinite(accident.lng)
      ? accident.lng
      : "",
    accident.incidentType,
    accident.severity,
    accident.weather,
    accident.roadType,
    accident.vehicleType,
    accident.reportedFactors.join("; "),
    accident.status || UNKNOWN,
  ]);

  const csv = [
    headers,
    ...rows,
  ]
    .map((row) =>
      row
        .map(csvEscape)
        .join(",")
    )
    .join("\n");

  const blob = new Blob(
    ["\ufeff" + csv],
    {
      type: "text/csv;charset=utf-8;",
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download =
    `saferoute-accident-report-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

// ======================================================
// MAIN COMPONENT
// ======================================================

export default function AccidentAnalytics({
  embedded = false,
}) {
  const [incidents, setIncidents] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [authorized, setAuthorized] =
    useState(false);

  const [authChecking, setAuthChecking] =
    useState(true);

  const [error, setError] =
    useState("");

  // Filters
  const [districtFilter, setDistrictFilter] =
    useState("All");

  const [severityFilter, setSeverityFilter] =
    useState("All");

  const [weatherFilter, setWeatherFilter] =
    useState("All");

  const [roadFilter, setRoadFilter] =
    useState("All");

  const [vehicleFilter, setVehicleFilter] =
    useState("All");

  const [dateFrom, setDateFrom] =
    useState("");

  const [dateTo, setDateTo] =
    useState("");

  // ====================================================
  // ADMIN AUTHORIZATION
  // ====================================================

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (currentUser) => {
          try {
            setAuthChecking(true);

            if (!currentUser) {
              setAuthorized(false);
              return;
            }

            const userSnapshot =
              await getDocs(
                collection(db, "users")
              );

            const userDocument =
              userSnapshot.docs.find(
                (item) =>
                  item.id === currentUser.uid
              );

            const role =
              userDocument?.data()?.role;

            setAuthorized(
              role === "admin"
            );
          } catch (authError) {
            console.error(
              "Admin authorization error:",
              authError
            );

            setAuthorized(false);
          } finally {
            setAuthChecking(false);
          }
        }
      );

    return () => unsubscribe();
  }, []);

  // ====================================================
  // LOAD INCIDENTS
  // ====================================================

  useEffect(() => {
    if (!authorized) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadIncidents() {
      try {
        setLoading(true);
        setError("");

        const snapshot =
          await getDocs(
            collection(db, "incidents")
          );

        if (cancelled) return;

        const accidentRecords =
          snapshot.docs
            .map((docSnapshot) => ({
              id: docSnapshot.id,
              ...docSnapshot.data(),
            }))
            .filter(isAccident)
            .map(normalizeAccident);

        setIncidents(
          accidentRecords
        );
      } catch (loadError) {
        console.error(
          "Accident analytics loading error:",
          loadError
        );

        if (!cancelled) {
          setError(
            "Unable to load accident analytics. Please check your Firestore permissions."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadIncidents();

    return () => {
      cancelled = true;
    };
  }, [authorized]);

  // ====================================================
  // FILTER OPTIONS
  // ====================================================

  const filterOptions = useMemo(() => {
    const districts = new Set();
    const weathers = new Set();
    const roads = new Set();
    const vehicles = new Set();

    incidents.forEach((accident) => {
      if (accident.district !== UNKNOWN) {
        districts.add(
          accident.district
        );
      }

      if (accident.weather !== UNKNOWN) {
        weathers.add(
          accident.weather
        );
      }

      if (accident.roadType !== UNKNOWN) {
        roads.add(
          accident.roadType
        );
      }

      if (accident.vehicleType !== UNKNOWN) {
        vehicles.add(
          accident.vehicleType
        );
      }
    });

    return {
      districts: [
        ...districts,
      ].sort(),

      weathers: [
        ...weathers,
      ].sort(),

      roads: [
        ...roads,
      ].sort(),

      vehicles: [
        ...vehicles,
      ].sort(),
    };
  }, [incidents]);

  // ====================================================
  // FILTER ACCIDENTS
  // ====================================================

  const filteredAccidents =
    useMemo(() => {
      return incidents.filter(
        (accident) => {
          if (
            districtFilter !== "All" &&
            accident.district !==
              districtFilter
          ) {
            return false;
          }

          if (
            severityFilter !== "All" &&
            lower(accident.severity) !==
              lower(severityFilter)
          ) {
            return false;
          }

          if (
            weatherFilter !== "All" &&
            accident.weather !==
              weatherFilter
          ) {
            return false;
          }

          if (
            roadFilter !== "All" &&
            accident.roadType !==
              roadFilter
          ) {
            return false;
          }

          if (
            vehicleFilter !== "All" &&
            accident.vehicleType !==
              vehicleFilter
          ) {
            return false;
          }

          if (
            dateFrom &&
            accident.accidentTime
          ) {
            const start =
              new Date(
                `${dateFrom}T00:00:00`
              );

            if (
              accident.accidentTime <
              start
            ) {
              return false;
            }
          }

          if (
            dateTo &&
            accident.accidentTime
          ) {
            const end =
              new Date(
                `${dateTo}T23:59:59.999`
              );

            if (
              accident.accidentTime >
              end
            ) {
              return false;
            }
          }

          return true;
        }
      );
    }, [
      incidents,
      districtFilter,
      severityFilter,
      weatherFilter,
      roadFilter,
      vehicleFilter,
      dateFrom,
      dateTo,
    ]);

  // ====================================================
  // KPI STATISTICS
  // ====================================================

  const statistics =
    useMemo(() => {
      const high =
        filteredAccidents.filter(
          (item) =>
            lower(item.severity) ===
            "high"
        ).length;

      const medium =
        filteredAccidents.filter(
          (item) =>
            lower(item.severity) ===
            "medium"
        ).length;

      const low =
        filteredAccidents.filter(
          (item) =>
            lower(item.severity) ===
            "low"
        ).length;

      const verified =
        filteredAccidents.filter(
          (item) =>
            lower(item.status) ===
              "verified" ||
            lower(
              item.verificationStatus
            ) === "verified"
        ).length;

      const falseReports =
        filteredAccidents.filter(
          (item) =>
            lower(item.status) ===
              "false report" ||
            lower(
              item.verificationStatus
            ) === "false"
        ).length;

      return {
        total:
          filteredAccidents.length,
        high,
        medium,
        low,
        verified,
        falseReports,
      };
    }, [filteredAccidents]);

  // ====================================================
  // MONTHLY TREND
  // ====================================================

  const monthlyTrend =
    useMemo(() => {
      const values =
        Array(12).fill(0);

      filteredAccidents.forEach(
        (accident) => {
          if (!accident.accidentTime) {
            return;
          }

          values[
            accident.accidentTime.getMonth()
          ] += 1;
        }
      );

      return values.map(
        (count, index) => ({
          month:
            MONTH_NAMES[index],
          count,
        })
      );
    }, [filteredAccidents]);

  // ====================================================
  // HOURLY TREND
  // ====================================================

  const hourlyTrend =
    useMemo(() => {
      const values =
        Array(24).fill(0);

      filteredAccidents.forEach(
        (accident) => {
          if (!accident.accidentTime) {
            return;
          }

          values[
            accident.accidentTime.getHours()
          ] += 1;
        }
      );

      return values.map(
        (count, hour) => ({
          hour,
          count,
          label:
            `${String(hour).padStart(
              2,
              "0"
            )}:00`,
        })
      );
    }, [filteredAccidents]);

  const peakHour =
    useMemo(() => {
      if (!filteredAccidents.length) {
        return null;
      }

      return hourlyTrend.reduce(
        (highest, current) =>
          current.count >
          highest.count
            ? current
            : highest,
        hourlyTrend[0]
      );
    }, [
      hourlyTrend,
      filteredAccidents.length,
    ]);

  // ====================================================
  // CATEGORY COUNTERS
  // ====================================================

  const vehicleStats =
    useMemo(() => {
      const counter = {};

      filteredAccidents.forEach(
        (accident) => {
          incrementCounter(
            counter,
            accident.vehicleType
          );
        }
      );

      return Object.entries(
        counter
      )
        .sort(
          (a, b) =>
            b[1] - a[1]
        )
        .map(
          ([label, count]) => ({
            label,
            count,
          })
        );
    }, [filteredAccidents]);

  const weatherStats =
    useMemo(() => {
      const counter = {};

      filteredAccidents.forEach(
        (accident) => {
          incrementCounter(
            counter,
            accident.weather
          );
        }
      );

      return Object.entries(
        counter
      )
        .sort(
          (a, b) =>
            b[1] - a[1]
        )
        .map(
          ([label, count]) => ({
            label,
            count,
          })
        );
    }, [filteredAccidents]);

  const roadStats =
    useMemo(() => {
      const counter = {};

      filteredAccidents.forEach(
        (accident) => {
          incrementCounter(
            counter,
            accident.roadType
          );
        }
      );

      return Object.entries(
        counter
      )
        .sort(
          (a, b) =>
            b[1] - a[1]
        )
        .map(
          ([label, count]) => ({
            label,
            count,
          })
        );
    }, [filteredAccidents]);

  const factorStats =
    useMemo(() => {
      const counter = {};

      filteredAccidents.forEach(
        (accident) => {
          accident.reportedFactors.forEach(
            (factor) => {
              incrementCounter(
                counter,
                factor
              );
            }
          );
        }
      );

      return Object.entries(
        counter
      )
        .sort(
          (a, b) =>
            b[1] - a[1]
        )
        .map(
          ([label, count]) => ({
            label,
            count,
          })
        );
    }, [filteredAccidents]);

  // ====================================================
  // HIGH-RISK AREAS
  // ====================================================

  const riskAreas =
    useMemo(() => {
      const areaMap = {};

      filteredAccidents.forEach(
        (accident) => {
          const key =
            accident.district ||
            UNKNOWN;

          if (!areaMap[key]) {
            areaMap[key] = {
              area: key,
              total: 0,
              high: 0,
              medium: 0,
              low: 0,
            };
          }

          areaMap[key].total += 1;

          const severity =
            lower(
              accident.severity
            );

          if (severity === "high") {
            areaMap[key].high += 1;
          } else if (
            severity === "medium"
          ) {
            areaMap[key].medium += 1;
          } else if (
            severity === "low"
          ) {
            areaMap[key].low += 1;
          }
        }
      );

      return Object.values(
        areaMap
      )
        .map((item) => ({
          ...item,

          riskScore:
            item.high * 3 +
            item.medium * 2 +
            item.low,
        }))
        .sort(
          (a, b) =>
            b.riskScore -
            a.riskScore
        );
    }, [filteredAccidents]);

  // ====================================================
  // CLEAR FILTERS
  // ====================================================

  function clearFilters() {
    setDistrictFilter("All");
    setSeverityFilter("All");
    setWeatherFilter("All");
    setRoadFilter("All");
    setVehicleFilter("All");
    setDateFrom("");
    setDateTo("");
  }

  // ====================================================
  // ANALYTICS CONTENT
  // ====================================================

  const analyticsContent = (
    <div className="accident-analytics-page">
      {/* ============================================
          HEADER
      ============================================ */}

      <div className="analytics-header">
        <div>
          <span className="analytics-eyebrow">
            SAFEROUTE BD
          </span>

          <h1>
            Accident Analytics
          </h1>

          <p>
            Analyze accident trends,
            severity, peak times and
            high-risk areas.
          </p>
        </div>

        <div className="analytics-actions">
          <button
            className="analytics-btn secondary"
            onClick={clearFilters}
          >
            Reset Filters
          </button>

          <button
            className="analytics-btn"
            onClick={() =>
              downloadCSV(
                filteredAccidents
              )
            }
            disabled={
              !filteredAccidents.length
            }
          >
            ⬇ Download CSV
          </button>

          <button
            className="analytics-btn dark"
            onClick={() =>
              window.print()
            }
          >
            🖨 PDF / Print
          </button>
        </div>
      </div>

      {/* ============================================
          ERROR
      ============================================ */}

      {error && (
        <div className="analytics-error">
          ⚠️ {error}
        </div>
      )}

      {/* ============================================
          LOADING
      ============================================ */}

      {loading ? (
        <div className="analytics-loading">
          Loading accident data...
        </div>
      ) : (
        <>
          {/* ========================================
              FILTERS
          ======================================== */}

          <section className="analytics-filter-card">
            <div className="filter-heading">
              <div>
                <h2>
                  Analytics Filters
                </h2>

                <p>
                  Filter accident records
                  before calculating the
                  statistics.
                </p>
              </div>

              <span className="record-count">
                {filteredAccidents.length}{" "}
                records
              </span>
            </div>

            <div className="analytics-filters">
              <label>
                District
                <select
                  value={
                    districtFilter
                  }
                  onChange={(event) =>
                    setDistrictFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="All">
                    All Districts
                  </option>

                  {filterOptions.districts.map(
                    (district) => (
                      <option
                        key={district}
                        value={district}
                      >
                        {district}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Severity
                <select
                  value={
                    severityFilter
                  }
                  onChange={(event) =>
                    setSeverityFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="All">
                    All Severity
                  </option>

                  {SEVERITIES.map(
                    (severity) => (
                      <option
                        key={severity}
                        value={severity}
                      >
                        {severity}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Weather
                <select
                  value={
                    weatherFilter
                  }
                  onChange={(event) =>
                    setWeatherFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="All">
                    All Weather
                  </option>

                  {filterOptions.weathers.map(
                    (weather) => (
                      <option
                        key={weather}
                        value={weather}
                      >
                        {weather}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Road Type
                <select
                  value={
                    roadFilter
                  }
                  onChange={(event) =>
                    setRoadFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="All">
                    All Roads
                  </option>

                  {filterOptions.roads.map(
                    (road) => (
                      <option
                        key={road}
                        value={road}
                      >
                        {road}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Vehicle
                <select
                  value={
                    vehicleFilter
                  }
                  onChange={(event) =>
                    setVehicleFilter(
                      event.target.value
                    )
                  }
                >
                  <option value="All">
                    All Vehicles
                  </option>

                  {filterOptions.vehicles.map(
                    (vehicle) => (
                      <option
                        key={vehicle}
                        value={vehicle}
                      >
                        {vehicle}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                From
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) =>
                    setDateFrom(
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                To
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) =>
                    setDateTo(
                      event.target.value
                    )
                  }
                />
              </label>
            </div>
          </section>

          {/* ========================================
              KPI CARDS
          ======================================== */}

          <section className="analytics-kpi-grid">
            <div className="analytics-kpi-card">
              <span className="kpi-icon">
                🚗
              </span>

              <div>
                <span>
                  Total Accidents
                </span>

                <strong>
                  {statistics.total}
                </strong>
              </div>
            </div>

            <div className="analytics-kpi-card high">
              <span className="kpi-icon">
                🔴
              </span>

              <div>
                <span>
                  High Severity
                </span>

                <strong>
                  {statistics.high}
                </strong>
              </div>
            </div>

            <div className="analytics-kpi-card medium">
              <span className="kpi-icon">
                🟠
              </span>

              <div>
                <span>
                  Medium Severity
                </span>

                <strong>
                  {statistics.medium}
                </strong>
              </div>
            </div>

            <div className="analytics-kpi-card low">
              <span className="kpi-icon">
                🟢
              </span>

              <div>
                <span>
                  Low Severity
                </span>

                <strong>
                  {statistics.low}
                </strong>
              </div>
            </div>

            <div className="analytics-kpi-card">
              <span className="kpi-icon">
                ✅
              </span>

              <div>
                <span>
                  Verified
                </span>

                <strong>
                  {statistics.verified}
                </strong>
              </div>
            </div>

            <div className="analytics-kpi-card">
              <span className="kpi-icon">
                ⚠️
              </span>

              <div>
                <span>
                  False Reports
                </span>

                <strong>
                  {statistics.falseReports}
                </strong>
              </div>
            </div>
          </section>

          {/* ========================================
              MONTHLY TREND
          ======================================== */}

          <section className="analytics-card">
            <div className="analytics-card-header">
              <div>
                <h2>
                  Accident Trend
                </h2>

                <p>
                  Monthly accident
                  distribution
                </p>
              </div>
            </div>

            <div className="monthly-chart">
              {monthlyTrend.map(
                (item) => {
                  const max =
                    Math.max(
                      ...monthlyTrend.map(
                        (entry) =>
                          entry.count
                      ),
                      1
                    );

                  const height =
                    item.count === 0
                      ? 4
                      : Math.max(
                          12,
                          (item.count /
                            max) *
                            100
                        );

                  return (
                    <div
                      className="month-column"
                      key={
                        item.month
                      }
                    >
                      <div className="month-value">
                        {item.count}
                      </div>

                      <div className="month-bar-area">
                        <div
                          className="month-bar"
                          style={{
                            height: `${height}%`,
                          }}
                        />
                      </div>

                      <span>
                        {item.month}
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          </section>

          {/* ========================================
              PEAK TIME
          ======================================== */}

          <section className="analytics-two-column">
            <div className="analytics-card">
              <div className="analytics-card-header">
                <div>
                  <h2>
                    Peak Accident Time
                  </h2>

                  <p>
                    Accidents grouped by
                    hour of day
                  </p>
                </div>
              </div>

              <div className="peak-time-card">
                <div className="peak-time-icon">
                  🕒
                </div>

                <div>
                  <span>
                    Peak Hour
                  </span>

                  <strong>
                    {peakHour
                      ? peakHour.label
                      : "--"}
                  </strong>

                  <small>
                    {peakHour
                      ? `${peakHour.count} accident${peakHour.count === 1 ? "" : "s"}`
                      : "No data"}
                  </small>
                </div>
              </div>

              <div className="hour-chart">
                {hourlyTrend.map(
                  (item) => {
                    const max =
                      Math.max(
                        ...hourlyTrend.map(
                          (entry) =>
                            entry.count
                        ),
                        1
                      );

                    const width =
                      item.count === 0
                        ? 2
                        : Math.max(
                            4,
                            (item.count /
                              max) *
                              100
                          );

                    return (
                      <div
                        className="hour-row"
                        key={
                          item.hour
                        }
                      >
                        <span>
                          {
                            item.label
                          }
                        </span>

                        <div className="hour-track">
                          <div
                            className="hour-fill"
                            style={{
                              width: `${width}%`,
                            }}
                          />
                        </div>

                        <strong>
                          {item.count}
                        </strong>
                      </div>
                    );
                  }
                )}
              </div>
            </div>

            {/* SEVERITY */}
            <div className="analytics-card">
              <div className="analytics-card-header">
                <div>
                  <h2>
                    Severity Distribution
                  </h2>

                  <p>
                    Accident severity
                    breakdown
                  </p>
                </div>
              </div>

              <div className="severity-list">
                {[
                  {
                    label:
                      "High",
                    count:
                      statistics.high,
                    className:
                      "high",
                  },
                  {
                    label:
                      "Medium",
                    count:
                      statistics.medium,
                    className:
                      "medium",
                  },
                  {
                    label:
                      "Low",
                    count:
                      statistics.low,
                    className:
                      "low",
                  },
                ].map(
                  (item) => {
                    const percentage =
                      statistics.total
                        ? Math.round(
                            (item.count /
                              statistics.total) *
                              100
                          )
                        : 0;

                    return (
                      <div
                        className="severity-row"
                        key={
                          item.label
                        }
                      >
                        <div className="severity-row-top">
                          <span>
                            {item.label}
                          </span>

                          <strong>
                            {
                              item.count
                            }{" "}
                            (
                            {
                              percentage
                            }
                            %)
                          </strong>
                        </div>

                        <div className="severity-track">
                          <div
                            className={`severity-fill ${item.className}`}
                            style={{
                              width: `${percentage}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </section>

          {/* ========================================
              CATEGORY ANALYTICS
          ======================================== */}

          <section className="analytics-three-column">
            <AnalyticsList
              title="Vehicle Types"
              subtitle="Vehicles involved"
              items={vehicleStats}
              icon="🚘"
            />

            <AnalyticsList
              title="Weather"
              subtitle="Weather conditions"
              items={weatherStats}
              icon="🌧️"
            />

            <AnalyticsList
              title="Road Types"
              subtitle="Road environments"
              items={roadStats}
              icon="🛣️"
            />
          </section>

          {/* ========================================
              REPORTED FACTORS
          ======================================== */}

          <section className="analytics-card">
            <div className="analytics-card-header">
              <div>
                <h2>
                  Reported Factors
                </h2>

                <p>
                  Factors associated with
                  reported accidents
                </p>
              </div>
            </div>

            {factorStats.length === 0 ? (
              <div className="empty-analytics">
                No structured reported
                factors are available.
              </div>
            ) : (
              <div className="factor-grid">
                {factorStats.map(
                  (factor) => {
                    const max =
                      Math.max(
                        ...factorStats.map(
                          (item) =>
                            item.count
                        ),
                        1
                      );

                    const percentage =
                      Math.round(
                        (factor.count /
                          max) *
                          100
                      );

                    return (
                      <div
                        className="factor-card"
                        key={
                          factor.label
                        }
                      >
                        <div>
                          <strong>
                            {
                              factor.label
                            }
                          </strong>

                          <span>
                            {
                              factor.count
                            }
                          </span>
                        </div>

                        <div className="factor-track">
                          <div
                            className="factor-fill"
                            style={{
                              width: `${percentage}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </section>

          {/* ========================================
              HIGH RISK AREAS
          ======================================== */}

          <section className="analytics-card">
            <div className="analytics-card-header">
              <div>
                <h2>
                  High-Risk Areas
                </h2>

                <p>
                  Districts ranked using
                  severity-weighted accident
                  counts.
                </p>
              </div>
            </div>

            {riskAreas.length === 0 ? (
              <div className="empty-analytics">
                No accident location data
                available.
              </div>
            ) : (
              <div className="risk-table-wrapper">
                <table className="risk-table">
                  <thead>
                    <tr>
                      <th>
                        Rank
                      </th>

                      <th>
                        District
                      </th>

                      <th>
                        Total
                      </th>

                      <th>
                        High
                      </th>

                      <th>
                        Medium
                      </th>

                      <th>
                        Low
                      </th>

                      <th>
                        Risk Score
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {riskAreas
                      .slice(
                        0,
                        10
                      )
                      .map(
                        (
                          area,
                          index
                        ) => (
                          <tr
                            key={
                              area.area
                            }
                          >
                            <td>
                              <span className="rank-badge">
                                {
                                  index +
                                  1
                                }
                              </span>
                            </td>

                            <td>
                              <strong>
                                {
                                  area.area
                                }
                              </strong>
                            </td>

                            <td>
                              {
                                area.total
                              }
                            </td>

                            <td className="high-text">
                              {
                                area.high
                              }
                            </td>

                            <td className="medium-text">
                              {
                                area.medium
                              }
                            </td>

                            <td className="low-text">
                              {
                                area.low
                              }
                            </td>

                            <td>
                              <strong>
                                {
                                  area.riskScore
                                }
                              </strong>
                            </td>
                          </tr>
                        )
                      )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ========================================
              RECENT ACCIDENTS
          ======================================== */}

          <section className="analytics-card">
            <div className="analytics-card-header">
              <div>
                <h2>
                  Recent Accidents
                </h2>

                <p>
                  Latest records included in
                  the current filter.
                </p>
              </div>
            </div>

            {filteredAccidents.length ===
            0 ? (
              <div className="empty-analytics">
                No accident records match
                the selected filters.
              </div>
            ) : (
              <div className="recent-accident-list">
                {[
                  ...filteredAccidents,
                ]
                  .sort(
                    (
                      a,
                      b
                    ) =>
                      (b.accidentTime?.getTime() ||
                        0) -
                      (a.accidentTime?.getTime() ||
                        0)
                  )
                  .slice(
                    0,
                    8
                  )
                  .map(
                    (
                      accident
                    ) => (
                      <div
                        className="recent-accident"
                        key={
                          accident.id
                        }
                      >
                        <div className="recent-accident-main">
                          <div className="recent-accident-icon">
                            🚗
                          </div>

                          <div>
                            <strong>
                              {
                                accident.incidentType
                              }
                            </strong>

                            <span>
                              {
                                accident.area
                              }
                              ,{" "}
                              {
                                accident.district
                              }
                            </span>

                            <small>
                              {
                                formatDateTime(
                                  accident.accidentTime
                                )
                              }
                            </small>
                          </div>
                        </div>

                        <div className="recent-accident-meta">
                          <span
                            className={`severity-pill ${lower(
                              accident.severity
                            )}`}
                          >
                            {
                              accident.severity
                            }
                          </span>

                          <span>
                            {
                              accident.vehicleType
                            }
                          </span>
                        </div>
                      </div>
                    )
                  )}
              </div>
            )}
          </section>

          {/* ========================================
              REPORT FOOTER
          ======================================== */}

          <div className="analytics-report-footer">
            <span>
              SafeRoute BD • Accident
              Analytics
            </span>

            <span>
              Generated:{" "}
              {new Date().toLocaleString(
                "en-BD"
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );

  // ====================================================
  // RETURN WITH OR WITHOUT LAYOUT
  // ====================================================

  // If auth is still checking, show loading
  if (authChecking) {
    return embedded ? (
      <div className="accident-analytics-page">
        <div className="analytics-loading">
          Checking administrator access...
        </div>
      </div>
    ) : (
      <DashboardLayout>
        <div className="accident-analytics-page">
          <div className="analytics-loading">
            Checking administrator access...
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // If not authorized, show access denied
  if (!authorized) {
    const accessDenied = (
      <div className="accident-analytics-page">
        <div className="analytics-access-card">
          <div className="access-icon">
            🔐
          </div>

          <h2>
            Administrator Access Required
          </h2>

          <p>
            Accident Analytics is
            available only to authorized
            SafeRoute BD administrators.
          </p>
        </div>
      </div>
    );

    return embedded ? accessDenied : (
      <DashboardLayout>
        {accessDenied}
      </DashboardLayout>
    );
  }

  // Return content with or without layout
  return embedded ? analyticsContent : (
    <DashboardLayout>
      {analyticsContent}
    </DashboardLayout>
  );
}

// ======================================================
// REUSABLE ANALYTICS LIST
// ======================================================

function AnalyticsList({
  title,
  subtitle,
  items,
  icon,
}) {
  return (
    <div className="analytics-card list-card">
      <div className="analytics-card-header">
        <div>
          <h2>
            {icon} {title}
          </h2>

          <p>{subtitle}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-analytics">
          No structured data available.
        </div>
      ) : (
        <div className="analytics-list">
          {items
            .slice(0, 8)
            .map((item) => {
              const max =
                Math.max(
                  ...items.map(
                    (entry) =>
                      entry.count
                  ),
                  1
                );

              const width =
                Math.max(
                  5,
                  (item.count /
                    max) *
                    100
                );

              return (
                <div
                  className="analytics-list-item"
                  key={
                    item.label
                  }
                >
                  <div className="analytics-list-top">
                    <span>
                      {item.label}
                    </span>

                    <strong>
                      {item.count}
                    </strong>
                  </div>

                  <div className="analytics-list-track">
                    <div
                      className="analytics-list-fill"
                      style={{
                        width: `${width}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
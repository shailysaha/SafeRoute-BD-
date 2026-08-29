import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { db } from "../firebase/firebase";
import DashboardLayout from "../layout/DashboardLayout";

import "./Analytics.css";

function Analytics() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trendMode, setTrendMode] = useState("daily");

  // =====================================
  // 1. LOAD INCIDENTS IN REAL TIME
  // =====================================

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "incidents"),
      (snapshot) => {
        const data = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        setIncidents(data);
        setLoading(false);
      },
      (error) => {
        console.error("Analytics loading error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // =====================================
  // 2. BASIC STATISTICS
  // =====================================

  const totalIncidents = incidents.length;

  const highRisk = incidents.filter(
    (item) => item.severity === "High"
  ).length;

  const verified = incidents.filter(
    (item) => item.status === "Verified"
  ).length;

  const resolved = incidents.filter(
    (item) => item.status === "Resolved"
  ).length;

  // =====================================
  // 3. SEVERITY DATA
  // =====================================

  const severityData = useMemo(() => {
    return [
      {
        name: "High",
        value: incidents.filter((item) => item.severity === "High").length,
      },
      {
        name: "Medium",
        value: incidents.filter((item) => item.severity === "Medium").length,
      },
      {
        name: "Low",
        value: incidents.filter((item) => item.severity === "Low").length,
      },
    ];
  }, [incidents]);

  // =====================================
  // 4. INCIDENT TYPE DATA
  // =====================================

  const typeData = useMemo(() => {
    const counter = {};

    incidents.forEach((incident) => {
      const type =
        incident.incidentType ||
        incident.dangerType ||
        incident.type ||
        "Other";

      counter[type] = (counter[type] || 0) + 1;
    });

    return Object.entries(counter)
      .map(([name, value]) => ({
        name,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [incidents]);

  // =====================================
  // 5. DISTRICT DATA
  // =====================================

  const districtData = useMemo(() => {
    const counter = {};

    incidents.forEach((incident) => {
      const district = incident.district || "Unknown";

      counter[district] = (counter[district] || 0) + 1;
    });

    return Object.entries(counter)
      .map(([name, value]) => ({
        name,
        value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [incidents]);

  // =====================================
  // 6. STATUS DATA
  // =====================================

  const statusData = useMemo(() => {
    const counter = {};

    incidents.forEach((incident) => {
      const status = incident.status || "Unverified";

      counter[status] = (counter[status] || 0) + 1;
    });

    return Object.entries(counter).map(([name, value]) => ({
      name,
      value,
    }));
  }, [incidents]);

  // =====================================
  // 7. HIGH RISK DISTRICTS
  // =====================================

  const highRiskDistricts = useMemo(() => {
    const counter = {};

    incidents.forEach((incident) => {
      if (incident.severity !== "High") {
        return;
      }

      const district = incident.district || "Unknown";

      counter[district] = (counter[district] || 0) + 1;
    });

    return Object.entries(counter)
      .map(([district, count]) => ({
        district,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [incidents]);

  // =====================================
  // TIME-BASED INCIDENT TRENDS
  // Daily / Weekly / Monthly
  // =====================================

  const trendData = useMemo(() => {
    const counter = {};

    incidents.forEach((incident) => {
      if (!incident.createdAt) return;

      let date;

      // Firestore Timestamp
      if (incident.createdAt?.toDate) {
        date = incident.createdAt.toDate();
      } else if (incident.createdAt?.seconds) {
        date = new Date(incident.createdAt.seconds * 1000);
      } else {
        date = new Date(incident.createdAt);
      }

      if (Number.isNaN(date.getTime())) {
        return;
      }

      let key;
      let sortValue;

      // =========================
      // DAILY
      // =========================
      if (trendMode === "daily") {
        key = date.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
        });

        sortValue = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate()
        ).getTime();
      }
      // =========================
      // WEEKLY
      // =========================
      else if (trendMode === "weekly") {
        const weekStart = new Date(date);
        const day = weekStart.getDay();
        const difference = weekStart.getDate() - day + (day === 0 ? -6 : 1);

        weekStart.setDate(difference);
        weekStart.setHours(0, 0, 0, 0);

        key = `Week of ${weekStart.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
        })}`;

        sortValue = weekStart.getTime();
      }
      // =========================
      // MONTHLY
      // =========================
      else {
        key = date.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        });

        sortValue = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
      }

      if (!counter[key]) {
        counter[key] = {
          date: key,
          incidents: 0,
          sortValue,
        };
      }

      counter[key].incidents += 1;
    });

    return Object.values(counter)
      .sort((a, b) => a.sortValue - b.sortValue)
      .map((item) => ({
        date: item.date,
        incidents: item.incidents,
      }));
  }, [incidents, trendMode]);

  // =====================================
  // RISK AREA SCORE COMPUTATION
  // =====================================

  const riskAreaData = useMemo(() => {
    const areas = {};

    incidents.forEach((incident) => {
      // Ignore rejected reports
      if (incident.status === "Rejected") {
        return;
      }

      const district = incident.district?.trim() || "Unknown";
      const area = incident.area?.trim() || district;
      const key = `${area}-${district}`;

      if (!areas[key]) {
        areas[key] = {
          area,
          district,
          incidents: 0,
          high: 0,
          medium: 0,
          low: 0,
          verified: 0,
          score: 0,
        };
      }

      const item = areas[key];
      item.incidents += 1;

      // =========================
      // SEVERITY SCORE
      // =========================
      if (incident.severity === "High") {
        item.high += 1;
        item.score += 3;
      } else if (incident.severity === "Medium") {
        item.medium += 1;
        item.score += 2;
      } else {
        item.low += 1;
        item.score += 1;
      }

      // =========================
      // VERIFICATION SCORE
      // =========================
      if (incident.status === "Verified") {
        item.verified += 1;
        item.score += 2;
      }

      if (incident.status === "Community Confirmed") {
        item.score += 1;
      }

      // Resolved incidents should have
      // less effect on current danger
      if (incident.status === "Resolved") {
        item.score = Math.max(0, item.score - 1);
      }
    });

    return Object.values(areas)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [incidents]);

  // =====================================
  // RISK LEVEL HELPER
  // =====================================

  const getRiskLevel = (score) => {
    if (score >= 12) {
      return {
        label: "Very High",
        className: "very-high",
      };
    }

    if (score >= 8) {
      return {
        label: "High",
        className: "high-risk",
      };
    }

    if (score >= 4) {
      return {
        label: "Medium",
        className: "medium-risk",
      };
    }

    return {
      label: "Low",
      className: "low-risk",
    };
  };

  const PIE_COLORS = [
    "#ef4444",
    "#f59e0b",
    "#22c55e",
    "#3b82f6",
    "#8b5cf6",
    "#06b6d4",
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="analytics-loading">
          Loading road safety analytics...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="analytics-page">
        {/* HEADER */}
        <div className="analytics-header">
          <div>
            <span className="analytics-label">ROAD SAFETY INTELLIGENCE</span>
            <h1>📊 Analytics Dashboard</h1>
            <p>
              Real-time incident patterns and road safety intelligence from
              SafeRoute BD reports.
            </p>
          </div>

          <div className="analytics-live">
            <span></span>
            Live Data
          </div>
        </div>

        {/* SUMMARY */}
        <div className="analytics-summary">
          <div className="analytics-stat">
            <div className="analytics-stat-icon">📍</div>
            <div>
              <h2>{totalIncidents}</h2>
              <p>Total Incidents</p>
            </div>
          </div>

          <div className="analytics-stat">
            <div className="analytics-stat-icon danger">⚠</div>
            <div>
              <h2>{highRisk}</h2>
              <p>High Risk</p>
            </div>
          </div>

          <div className="analytics-stat">
            <div className="analytics-stat-icon verified">✓</div>
            <div>
              <h2>{verified}</h2>
              <p>Verified</p>
            </div>
          </div>

          <div className="analytics-stat">
            <div className="analytics-stat-icon resolved">✓</div>
            <div>
              <h2>{resolved}</h2>
              <p>Resolved</p>
            </div>
          </div>
        </div>

        {/* TIME-BASED INCIDENT TRENDS */}
        <div className="analytics-card trend-card">
          <div className="trend-header">
            <div>
              <h2>📈 Accident Trends</h2>
              <p>Analyze how reported road incidents change over time.</p>
            </div>

            <div className="trend-filter">
              <button
                className={trendMode === "daily" ? "active" : ""}
                onClick={() => setTrendMode("daily")}
              >
                Daily
              </button>
              <button
                className={trendMode === "weekly" ? "active" : ""}
                onClick={() => setTrendMode("weekly")}
              >
                Weekly
              </button>
              <button
                className={trendMode === "monthly" ? "active" : ""}
                onClick={() => setTrendMode("monthly")}
              >
                Monthly
              </button>
            </div>
          </div>

          {trendData.length > 0 ? (
            <div className="trend-chart">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={trendData}
                  margin={{
                    top: 10,
                    right: 20,
                    left: 0,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{
                      fontSize: 11,
                    }}
                  />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="incidents"
                    name="Incidents"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{
                      r: 4,
                    }}
                    activeDot={{
                      r: 6,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-empty">No dated incident data available.</div>
          )}
        </div>

        {/* FIRST GRAPH ROW */}
        <div className="analytics-grid">
          {/* INCIDENT TYPES */}
          <div className="analytics-card large-card">
            <div className="analytics-card-header">
              <div>
                <h2>Incidents by Type</h2>
                <p>Most frequently reported road hazards</p>
              </div>
            </div>

            {typeData.length > 0 ? (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={typeData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{
                        fontSize: 11,
                      }}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="value"
                      fill="#3b82f6"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="chart-empty">No incident data available.</div>
            )}
          </div>

          {/* SEVERITY */}
          <div className="analytics-card">
            <div className="analytics-card-header">
              <div>
                <h2>Severity Distribution</h2>
                <p>Risk level of reported incidents</p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={severityData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label
                >
                  {severityData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* SECOND GRAPH ROW */}
        <div className="analytics-grid">
          {/* DISTRICTS */}
          <div className="analytics-card large-card">
            <div className="analytics-card-header">
              <div>
                <h2>Incidents by District</h2>
                <p>Districts with the highest number of reports</p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={districtData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{
                    fontSize: 11,
                  }}
                />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* STATUS */}
          <div className="analytics-card">
            <div className="analytics-card-header">
              <div>
                <h2>Verification Status</h2>
                <p>Current report verification lifecycle</p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label
                >
                  {statusData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* =====================================
            HIGH-RISK AREA INTELLIGENCE
        ===================================== */}
        <div className="analytics-card risk-intelligence-card">
          <div className="analytics-card-header">
            <div>
              <h2>⚠ High-Risk Area Intelligence</h2>
              <p>
                Risk ranking based on incident frequency, severity and verification.
              </p>
            </div>

            <span className="risk-analysis-badge">Intelligence Score</span>
          </div>

          {riskAreaData.length > 0 ? (
            <div className="risk-intelligence-table">
              <div className="risk-table-header">
                <span>Rank</span>
                <span>Location</span>
                <span>Reports</span>
                <span>High</span>
                <span>Verified</span>
                <span>Score</span>
                <span>Risk Level</span>
              </div>

              {riskAreaData.map((item, index) => {
                const risk = getRiskLevel(item.score);

                return (
                  <div
                    className="risk-table-row"
                    key={`${item.area}-${item.district}`}
                  >
                    <div
                      className={
                        index < 3
                          ? "risk-position top-risk"
                          : "risk-position"
                      }
                    >
                      #{index + 1}
                    </div>

                    <div className="risk-location">
                      <strong>{item.area}</strong>
                      <small>{item.district}</small>
                    </div>

                    <div>{item.incidents}</div>
                    <div>{item.high}</div>
                    <div>{item.verified}</div>

                    <div className="intelligence-score">{item.score}</div>

                    <div>
                      <span className={`risk-level ${risk.className}`}>
                        {risk.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="chart-empty">
              No incident data available for risk analysis.
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Analytics;
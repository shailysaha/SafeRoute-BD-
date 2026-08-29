import { useState } from "react";

import "./AIReportAssistant.css";

function AIReportAssistant({
  onApplySuggestion,
}) {
  const [description, setDescription] =
    useState("");

  const [analysis, setAnalysis] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const analyzeReport = async () => {
    const text = description
      .trim()
      .toLowerCase();

    if (!text) {
      alert(
        "Please describe the road incident first."
      );
      return;
    }

    try {
      setLoading(true);

      /*
       * Stage 9A:
       * Temporary local classification.
       *
       * Later this function will call:
       * aiIncidentService.js
       *      ↓
       * secure backend AI endpoint
       */

      let incidentType = "Other";
      let severity = "Medium";
      let roadStatus = "Open";
      let trafficImpact = "Low";

      // Flood / water
      if (
        text.includes("flood") ||
        text.includes("water") ||
        text.includes("pani") ||
        text.includes("জল") ||
        text.includes("পানি")
      ) {
        incidentType = "Flooded Road";
        severity = "High";
        roadStatus = "Blocked";
        trafficImpact = "Heavy";
      }

      // Accident
      else if (
        text.includes("accident") ||
        text.includes("crash") ||
        text.includes("collision") ||
        text.includes("দুর্ঘটনা")
      ) {
        incidentType = "Road Accident";
        severity = "High";
        roadStatus = "Partially Blocked";
        trafficImpact = "Heavy";
      }

      // Road blockage
      else if (
        text.includes("block") ||
        text.includes("blocked") ||
        text.includes("road closed")
      ) {
        incidentType = "Road Blockage";
        severity = "High";
        roadStatus = "Blocked";
        trafficImpact = "Heavy";
      }

      // Pothole
      else if (
        text.includes("pothole") ||
        text.includes("hole") ||
        text.includes("গর্ত")
      ) {
        incidentType = "Pothole";
        severity = "Medium";
        roadStatus = "Open";
        trafficImpact = "Moderate";
      }

      // Broken traffic light
      else if (
        text.includes("traffic light") ||
        text.includes("signal") ||
        text.includes("traffic signal")
      ) {
        incidentType =
          "Broken Traffic Light";

        severity = "Medium";
        roadStatus = "Open";
        trafficImpact = "Moderate";
      }

      // Construction
      else if (
        text.includes("construction") ||
        text.includes("repair")
      ) {
        incidentType =
          "Road Construction";

        severity = "Medium";
        roadStatus =
          "Partially Blocked";

        trafficImpact = "Moderate";
      }

      // Fallen tree
      else if (
        text.includes("tree") &&
        (
          text.includes("fallen") ||
          text.includes("road")
        )
      ) {
        incidentType = "Fallen Tree";
        severity = "High";
        roadStatus = "Blocked";
        trafficImpact = "Heavy";
      }

      const result = {
        incidentType,
        severity,
        roadStatus,
        trafficImpact,
        description:
          description.trim(),
      };

      console.log(
        "AI REPORT RESULT:",
        result
      );

      setAnalysis(result);

    } catch (error) {
      console.error(
        "AI analysis error:",
        error
      );

      alert(
        "Unable to analyze the report."
      );

    } finally {
      setLoading(false);
    }
  };

  const applySuggestion = () => {
    if (!analysis) return;

    onApplySuggestion?.(analysis);
  };

  const clearAssistant = () => {
    setDescription("");
    setAnalysis(null);
  };

  return (
    <div className="ai-report-assistant">

      <div className="ai-assistant-heading">

        <div>
          <span className="ai-badge">
            ✨ AI Assistant
          </span>

          <h3>
            Describe What Happened
          </h3>

          <p>
            Describe the incident naturally.
            SafeRoute BD will suggest
            structured report information.
          </p>
        </div>

      </div>

      <textarea
        className="ai-description"
        placeholder="Example: Heavy rain caused water on the road and vehicles cannot pass..."
        value={description}
        onChange={(event) =>
          setDescription(
            event.target.value
          )
        }
      />

      <button
        type="button"
        className="analyze-report-btn"
        onClick={analyzeReport}
        disabled={loading}
      >
        {loading
          ? "Analyzing..."
          : "✨ Analyze Report"}
      </button>


      {analysis && (
        <div className="ai-analysis-result">

          <div className="ai-result-title">
            <h4>
              AI Suggestions
            </h4>

            <span>
              Review before applying
            </span>
          </div>


          <div className="ai-result-grid">

            <div>
              <span>
                Incident Type
              </span>

              <strong>
                {analysis.incidentType}
              </strong>
            </div>


            <div>
              <span>
                Severity
              </span>

              <strong>
                {analysis.severity}
              </strong>
            </div>


            <div>
              <span>
                Road Status
              </span>

              <strong>
                {analysis.roadStatus}
              </strong>
            </div>


            <div>
              <span>
                Traffic Impact
              </span>

              <strong>
                {analysis.trafficImpact}
              </strong>
            </div>

          </div>


          <div className="ai-result-actions">

            <button
              type="button"
              className="apply-ai-btn"
              onClick={
                applySuggestion
              }
            >
              ✓ Use Suggestions
            </button>

            <button
              type="button"
              className="clear-ai-btn"
              onClick={
                clearAssistant
              }
            >
              Clear
            </button>

          </div>

        </div>
      )}

    </div>
  );
}

export default AIReportAssistant;
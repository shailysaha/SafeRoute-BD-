import { useState } from "react";
import { auth } from "../firebase/firebase";
import { createIncident } from "../services/incidentService";

const ReportIncident = () => {
  const [incidentType, setIncidentType] = useState("accident");
  const [severity, setSeverity] = useState("medium");
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");

  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const user = auth.currentUser;

    if (!user) {
      setMessage("Please login before reporting an incident.");
      return;
    }

    if (!latitude || !longitude) {
      setMessage("Location is required.");
      return;
    }

    try {
      await createIncident({
        reporterId: user.uid,

        incidentType,
        severity,
        description,
        locationName,

        latitude: Number(latitude),
        longitude: Number(longitude),
      });

      setMessage("Incident reported successfully.");

      setDescription("");
      setLocationName("");
      setLatitude("");
      setLongitude("");
    } catch (error) {
      console.error(error);
      setMessage("Failed to submit incident.");
    }
  };

  return (
    <div className="report-page">
      <h1>Report Road Incident</h1>

      <p>Help other road users by reporting accidents and road hazards.</p>

      <form onSubmit={handleSubmit}>
        <label>Incident Type</label>

        <select
          value={incidentType}
          onChange={(e) => setIncidentType(e.target.value)}
        >
          <option value="accident">Accident</option>
          <option value="traffic">Traffic Jam</option>
          <option value="flood">Flooded Road</option>
          <option value="pothole">Pothole</option>
          <option value="roadblock">Road Block</option>
          <option value="construction">Construction</option>
          <option value="fallen-tree">Fallen Tree</option>
          <option value="broken-light">Broken Traffic Light</option>
          <option value="other">Other Hazard</option>
        </select>

        <label>Severity</label>

        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <label>Description</label>

        <textarea
          placeholder="Describe what happened..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        <label>Location</label>

        <input
          type="text"
          placeholder="Location name"
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          required
        />

        <input
          type="number"
          step="any"
          placeholder="Latitude"
          value={latitude}
          onChange={(e) => setLatitude(e.target.value)}
        />

        <input
          type="number"
          step="any"
          placeholder="Longitude"
          value={longitude}
          onChange={(e) => setLongitude(e.target.value)}
        />

        <button type="submit">Submit Incident</button>

        {message && <p>{message}</p>}
      </form>
    </div>
  );
};

export default ReportIncident;
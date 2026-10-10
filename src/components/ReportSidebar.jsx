import "./ReportSidebar.css";
import { useEffect, useState } from "react";

import { auth } from "../firebase/firebase";

import SearchLocation from "./SearchLocation";
import VoiceReport from "./VoiceReport";
import AIReportAssistant from "./ai/AIReportAssistant";
import { notify } from "../utils/notify";

function ReportSidebar({
  selectedLocation,
  setSelectedLocation,
  onSubmit,
}) {
  // =====================================================
  // FORM DATA
  // =====================================================

  const [formData, setFormData] = useState({
    area: "",
    district: "",
    lat: "",
    lng: "",

    incidentType: "",
    severity: "",
    description: "",

    roadStatus: "",
    trafficImpact: "",

    // =====================================
    // ACCIDENT ANALYTICS FIELDS
    // =====================================

    accidentTime: "",
    weather: "",
    roadType: "",
    vehicleType: "",
    reportedFactors: [],

    status: "Unverified",
  });

  // =====================================================
  // EVIDENCE
  // =====================================================

  const [evidenceFiles, setEvidenceFiles] = useState([]);

  // =====================================================
  // LOADING
  // =====================================================

  const [submitting, setSubmitting] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  // =====================================================
  // UPDATE LOCATION
  // =====================================================

  useEffect(() => {
    if (!selectedLocation) {
      return;
    }

    console.log("📍 Selected Location:", selectedLocation);

    const lat = Number(
      selectedLocation.lat ??
        selectedLocation.latitude
    );

    const lng = Number(
      selectedLocation.lng ??
        selectedLocation.lon ??
        selectedLocation.longitude
    );

    setFormData((previous) => ({
      ...previous,

      area:
        selectedLocation.area ||
        previous.area ||
        "",

      district:
        selectedLocation.district ||
        previous.district ||
        "",

      lat: Number.isFinite(lat)
        ? lat
        : previous.lat,

      lng: Number.isFinite(lng)
        ? lng
        : previous.lng,
    }));
  }, [selectedLocation]);

  // =====================================================
  // REVERSE GEOCODING
  // =====================================================

  const reverseGeocode = async (
    lat,
    lng
  ) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          "Reverse geocoding failed."
        );
      }

      const data =
        await response.json();

      const address =
        data.address || {};

      const area =
        address.suburb ||
        address.neighbourhood ||
        address.quarter ||
        address.city_district ||
        address.road ||
        address.village ||
        address.town ||
        address.hamlet ||
        "";

      const district =
        address.state_district ||
        address.county ||
        address.district ||
        address.city_district ||
        address.city ||
        address.state ||
        "";

      return {
        area,
        district,
        displayName:
          data.display_name || "",
      };

    } catch (error) {
      console.error(
        "❌ Reverse geocoding error:",
        error
      );

      return {
        area: "",
        district: "",
        displayName: "",
      };
    }
  };

  // =====================================================
  // SEARCH LOCATION
  // =====================================================

  const handleSearchLocation = async (
    location
  ) => {
    if (!location) {
      return;
    }

    const lat = Number(
      location.lat ??
        location.latitude
    );

    const lng = Number(
      location.lng ??
        location.lon ??
        location.longitude
    );

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      notify(
        "Unable to get coordinates for this location."
      );

      return;
    }

    const addressData =
      await reverseGeocode(
        lat,
        lng
      );

    const finalLocation = {
      ...location,

      lat,
      lng,

      area:
        addressData.area ||
        location.area ||
        "",

      district:
        addressData.district ||
        location.district ||
        "",

      name:
        location.name ||
        location.display_name ||
        addressData.displayName ||
        "Selected Location",
    };

    setSelectedLocation(
      finalLocation
    );

    setFormData((previous) => ({
      ...previous,

      area:
        finalLocation.area || "",

      district:
        finalLocation.district || "",

      lat,
      lng,
    }));
  };

  // =====================================================
  // CURRENT GPS
  // =====================================================

  const getCurrentGPS = () => {
    if (!navigator.geolocation) {
      notify(
        "❌ GPS is not supported by your browser."
      );

      return;
    }

    setGpsLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat =
            position.coords.latitude;

          const lng =
            position.coords.longitude;

          console.log(
            "📍 CURRENT GPS:",
            lat,
            lng
          );

          const addressData =
            await reverseGeocode(
              lat,
              lng
            );

          const gpsLocation = {
            lat,
            lng,

            area:
              addressData.area || "",

            district:
              addressData.district || "",

            name:
              "My Current GPS Location",
          };

          setFormData(
            (previous) => ({
              ...previous,

              lat,
              lng,

              area:
                addressData.area ||
                previous.area ||
                "",

              district:
                addressData.district ||
                previous.district ||
                "",
            })
          );

          setSelectedLocation(
            gpsLocation
          );

        } catch (error) {
          console.error(
            "GPS location error:",
            error
          );

          notify(
            "GPS location found, but address could not be determined."
          );

        } finally {
          setGpsLoading(false);
        }
      },

      (error) => {
        console.error(
          "GPS Error:",
          error
        );

        setGpsLoading(false);

        switch (error.code) {
          case error.PERMISSION_DENIED:
            notify(
              "❌ Location permission denied. Please allow location access."
            );
            break;

          case error.POSITION_UNAVAILABLE:
            notify(
              "❌ Current location is unavailable."
            );
            break;

          case error.TIMEOUT:
            notify(
              "❌ GPS request timed out. Please try again."
            );
            break;

          default:
            notify(
              "❌ Unable to get your current location."
            );
        }
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  // =====================================================
  // AI SUGGESTION
  // =====================================================

  const handleAISuggestion = (
    suggestion
  ) => {
    if (!suggestion) {
      return;
    }

    setFormData((previous) => ({
      ...previous,

      incidentType:
        suggestion.incidentType ||
        suggestion.dangerType ||
        previous.incidentType,

      severity:
        suggestion.severity ||
        previous.severity,

      description:
        suggestion.description ||
        previous.description,

      roadStatus:
        suggestion.roadStatus ||
        previous.roadStatus,

      trafficImpact:
        suggestion.trafficImpact ||
        previous.trafficImpact,

      // =====================================
      // ACCIDENT ANALYTICS FIELDS
      // =====================================

      accidentTime:
        suggestion.accidentTime ||
        previous.accidentTime,

      weather:
        suggestion.weather ||
        previous.weather,

      roadType:
        suggestion.roadType ||
        previous.roadType,

      vehicleType:
        suggestion.vehicleType ||
        previous.vehicleType,

      reportedFactors:
        suggestion.reportedFactors ||
        previous.reportedFactors,
    }));
  };

  // =====================================================
  // VOICE RESULT
  // =====================================================

  const handleVoiceResult = (
    voiceData
  ) => {
    if (!voiceData) {
      return;
    }

    console.log(
      "🎤 Voice report result:",
      voiceData
    );

    setFormData((previous) => ({
      ...previous,

      area:
        voiceData.area ||
        previous.area,

      district:
        voiceData.district ||
        previous.district,

      lat:
        voiceData.lat ||
        previous.lat,

      lng:
        voiceData.lng ||
        previous.lng,

      incidentType:
        voiceData.incidentType ||
        voiceData.dangerType ||
        previous.incidentType,

      severity:
        voiceData.severity ||
        previous.severity,

      description:
        voiceData.description ||
        previous.description,

      roadStatus:
        voiceData.roadStatus ||
        previous.roadStatus,

      trafficImpact:
        voiceData.trafficImpact ||
        previous.trafficImpact,

      // =====================================
      // ACCIDENT ANALYTICS FIELDS
      // =====================================

      accidentTime:
        voiceData.accidentTime ||
        previous.accidentTime,

      weather:
        voiceData.weather ||
        previous.weather,

      roadType:
        voiceData.roadType ||
        previous.roadType,

      vehicleType:
        voiceData.vehicleType ||
        previous.vehicleType,

      reportedFactors:
        voiceData.reportedFactors ||
        previous.reportedFactors,
    }));
  };

  // =====================================================
  // EVIDENCE SELECT
  // =====================================================

  const handleEvidenceChange = (
    event
  ) => {
    const selectedFiles =
      Array.from(
        event.target.files || []
      );

    if (
      selectedFiles.length === 0
    ) {
      return;
    }

    const MAX_IMAGE_SIZE =
      10 * 1024 * 1024;

    const MAX_VIDEO_SIZE =
      50 * 1024 * 1024;

    const allowedImages = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    const allowedVideos = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];

    const validFiles = [];

    for (const file of selectedFiles) {
      const isImage =
        allowedImages.includes(
          file.type
        );

      const isVideo =
        allowedVideos.includes(
          file.type
        );

      if (!isImage && !isVideo) {
        notify(
          `${file.name}: Only JPG, PNG, WEBP, MP4, WEBM and MOV files are allowed.`
        );

        continue;
      }

      if (
        isImage &&
        file.size > MAX_IMAGE_SIZE
      ) {
        notify(
          `${file.name}: Image must be smaller than 10 MB.`
        );

        continue;
      }

      if (
        isVideo &&
        file.size > MAX_VIDEO_SIZE
      ) {
        notify(
          `${file.name}: Video must be smaller than 50 MB.`
        );

        continue;
      }

      validFiles.push(file);
    }

    const combinedFiles = [
      ...evidenceFiles,
      ...validFiles,
    ];

    if (combinedFiles.length > 5) {
      notify(
        "⚠️ Maximum 5 evidence files allowed."
      );

      setEvidenceFiles(
        combinedFiles.slice(0, 5)
      );
    } else {
      setEvidenceFiles(
        combinedFiles
      );
    }

    event.target.value = "";
  };

  // =====================================================
  // REMOVE EVIDENCE
  // =====================================================

  const removeEvidence = (
    index
  ) => {
    setEvidenceFiles(
      (previous) =>
        previous.filter(
          (_, fileIndex) =>
            fileIndex !== index
        )
    );
  };

  // =====================================================
  // FILE SIZE
  // =====================================================

  const formatFileSize = (
    bytes
  ) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (
      bytes <
      1024 * 1024
    ) {
      return `${(
        bytes / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(1)} MB`;
  };

  // =====================================================
  // VALIDATE ACCIDENT DETAILS
  // =====================================================

  const validateAccidentDetails = () => {
    const isAccident = formData.incidentType
      ?.toLowerCase()
      .includes("accident");

    if (!isAccident) {
      return true;
    }

    const errors = [];

    if (!formData.accidentTime) {
      errors.push("Accident Date & Time");
    }

    if (!formData.weather) {
      errors.push("Weather Condition");
    }

    if (!formData.roadType) {
      errors.push("Road Type");
    }

    if (!formData.vehicleType) {
      errors.push("Vehicle Type");
    }

    if (!formData.reportedFactors || formData.reportedFactors.length === 0) {
      errors.push("Reported Factors (at least one)");
    }

    if (errors.length > 0) {
      notify(
        `⚠️ Please fill all accident details:\n\n${errors.join("\n")}`
      );
      return false;
    }

    return true;
  };

  // =====================================================
  // SUBMIT
  // IMPORTANT:
  // This component DOES NOT write to Firestore.
  // MapPage is responsible for the ONE Firestore write.
  // =====================================================

  const handleSubmit = async () => {
    const currentUser =
      auth.currentUser;

    // -----------------------------------------------
    // AUTH
    // -----------------------------------------------

    if (!currentUser) {
      notify(
        "Please login before submitting an incident."
      );

      return;
    }

    // -----------------------------------------------
    // LOCATION
    // -----------------------------------------------

    const lat =
      Number(formData.lat);

    const lng =
      Number(formData.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      notify(
        "Please select a location on the map, search for a location, or use GPS."
      );

      return;
    }

    // -----------------------------------------------
    // REQUIRED FIELDS
    // -----------------------------------------------

    if (
      !formData.area ||
      !formData.district ||
      !formData.incidentType ||
      !formData.severity ||
      !formData.description.trim()
    ) {
      notify(
        "Please fill all required fields."
      );

      return;
    }

    // -----------------------------------------------
    // VALIDATE ACCIDENT DETAILS (if accident type)
    // -----------------------------------------------

    if (!validateAccidentDetails()) {
      return;
    }

    // -----------------------------------------------
    // SUBMIT
    // -----------------------------------------------

    try {
      setSubmitting(true);

      const success =
        await onSubmit({
          area:
            formData.area,

          district:
            formData.district,

          lat,

          lng,

          incidentType:
            formData.incidentType,

          dangerType:
            formData.incidentType,

          severity:
            formData.severity,

          description:
            formData.description.trim(),

          roadStatus:
            formData.roadStatus || "",

          trafficImpact:
            formData.trafficImpact || "",

          // =====================================
          // ACCIDENT ANALYTICS FIELDS
          // =====================================

          accidentTime:
            formData.accidentTime
              ? new Date(
                  formData.accidentTime
                ).toISOString()
              : null,

          weather:
            formData.weather || "",

          roadType:
            formData.roadType || "",

          vehicleType:
            formData.vehicleType || "",

          reportedFactors:
            Array.isArray(
              formData.reportedFactors
            )
              ? formData.reportedFactors
              : [],

          status:
            "Unverified",

          evidenceFiles:
            evidenceFiles,
        });

      // IMPORTANT:
      // If MapPage failed, DO NOT clear form.
      if (!success) {
        return;
      }

      // -----------------------------------------------
      // SUCCESS MESSAGE
      // -----------------------------------------------

      notify(
        evidenceFiles.length > 0
          ? "✅ Road Incident and evidence submitted successfully!\n\nStatus: Unverified"
          : "✅ Road Incident submitted successfully!\n\nStatus: Unverified"
      );

      // -----------------------------------------------
      // RESET FORM
      // -----------------------------------------------

      setFormData({
        area: "",
        district: "",
        lat: "",
        lng: "",

        incidentType: "",
        severity: "",
        description: "",

        roadStatus: "",
        trafficImpact: "",

        accidentTime: "",
        weather: "",
        roadType: "",
        vehicleType: "",
        reportedFactors: [],

        status:
          "Unverified",
      });

      setEvidenceFiles([]);

      setSelectedLocation(null);

    } catch (error) {
      console.error(
        "❌ Report sidebar submission error:",
        error
      );

      notify(
        `❌ Failed to submit incident.\n\n${
          error?.message ||
          "Unknown error"
        }`
      );

    } finally {
      setSubmitting(false);
    }
  };

  // =====================================================
  // INPUT HANDLER
  // =====================================================

  const handleChange = (event) => {
    const { name, value } = event.target;
    
    setFormData(
      (previous) => ({
        ...previous,
        [name]: value,
      })
    );
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="report-sidebar">

      {/* =========================================
          HEADER
      ========================================= */}

      <h2>
        🚧 Report Road Incident
      </h2>

      <p>
        Report accidents and road hazards
        to help other road users.
      </p>

      {/* =========================================
          STATUS
      ========================================= */}

      <div
        style={{
          padding: "10px",
          marginBottom: "12px",
          borderRadius: "8px",
          background: "#fff3cd",
          border:
            "1px solid #ffe69c",
          color: "#856404",
          fontWeight: "600",
        }}
      >
        🟡 Status: Unverified
      </div>

      {/* =========================================
          SEARCH
      ========================================= */}

      <SearchLocation
        onLocationSelect={
          handleSearchLocation
        }
      />

      {/* =========================================
          GPS
      ========================================= */}

      <button
        type="button"
        onClick={getCurrentGPS}
        disabled={gpsLoading}
        style={{
          width: "100%",
          marginTop: "10px",
          marginBottom: "12px",
          padding: "10px",
          borderRadius: "8px",
          border: "none",
          cursor: gpsLoading
            ? "not-allowed"
            : "pointer",
          fontWeight: "600",
        }}
      >
        {gpsLoading
          ? "📍 Getting GPS..."
          : "📍 Use My Current GPS Location"}
      </button>

      {/* =========================================
          BANGLA VOICE
      ========================================= */}

      <VoiceReport
        selectedLocation={
          selectedLocation
        }
        onVoiceResult={
          handleVoiceResult
        }
      />

      {/* =========================================
          AI
      ========================================= */}

      <AIReportAssistant
        onApplySuggestion={
          handleAISuggestion
        }
      />

      <hr
        style={{
          margin: "15px 0",
          border:
            "0.5px solid #ccc",
        }}
      />

      {/* =========================================
          AREA
      ========================================= */}

      <input
        placeholder="Area Name"
        value={formData.area}
        disabled
      />

      {/* =========================================
          DISTRICT
      ========================================= */}

      <input
        placeholder="District Name"
        value={
          formData.district
        }
        disabled
      />

      {/* =========================================
          INCIDENT TYPE
      ========================================= */}

      <select
        name="incidentType"
        value={
          formData.incidentType
        }
        onChange={handleChange}
      >
        <option value="">
          Select Incident Type
        </option>

        <option value="Accident">
          Road Accident
        </option>

        <option value="Traffic Jam">
          Traffic Jam
        </option>

        <option value="Flooded Road">
          Flooded Road
        </option>

        <option value="Pothole">
          Pothole
        </option>

        <option value="Road Blockage">
          Road Blockage
        </option>

        <option value="Road Construction">
          Road Construction
        </option>

        <option value="Fallen Tree">
          Fallen Tree
        </option>

        <option value="Broken Traffic Light">
          Broken Traffic Light
        </option>

        <option value="Poor Lighting">
          Poor Lighting
        </option>

        <option value="Poor Visibility">
          Poor Visibility
        </option>

        <option value="Fire">
          Fire
        </option>

        <option value="Other">
          Other Road Hazard
        </option>
      </select>

      {/* =========================================
          SEVERITY
      ========================================= */}

      <select
        name="severity"
        value={
          formData.severity
        }
        onChange={handleChange}
      >
        <option value="">
          Select Severity
        </option>

        <option value="Low">
          Low
        </option>

        <option value="Medium">
          Medium
        </option>

        <option value="High">
          High
        </option>
      </select>

      {/* =========================================
          DESCRIPTION
      ========================================= */}

      <textarea
        placeholder="Describe the road incident or hazard..."
        name="description"
        value={
          formData.description
        }
        onChange={handleChange}
      />

      {/* =========================================
          ACCIDENT DETAILS - Only shown when incidentType is Accident
      ========================================= */}

      {formData.incidentType
        ?.toLowerCase()
        .includes("accident") && (
        <div className="accident-details-section">
          <div className="form-section-title">
            🚗 Accident Details
          </div>

          <div
            style={{
              padding: "8px 12px",
              marginBottom: "12px",
              borderRadius: "6px",
              background: "#fff3cd",
              border: "1px solid #ffe69c",
              color: "#856404",
              fontSize: "13px",
            }}
          >
            ⚠️ All accident details are required for accident reports.
          </div>

          <label>
            Accident Date & Time <span style={{ color: "red" }}>*</span>
            <input
              type="datetime-local"
              name="accidentTime"
              value={formData.accidentTime}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Weather Condition <span style={{ color: "red" }}>*</span>
            <select
              name="weather"
              value={formData.weather}
              onChange={handleChange}
              required
            >
              <option value="">
                Select weather
              </option>
              <option value="Clear">
                Clear
              </option>
              <option value="Rainy">
                Rainy
              </option>
              <option value="Foggy">
                Foggy
              </option>
              <option value="Stormy">
                Stormy
              </option>
              <option value="Cloudy">
                Cloudy
              </option>
              <option value="Other">
                Other
              </option>
            </select>
          </label>

          <label>
            Road Type <span style={{ color: "red" }}>*</span>
            <select
              name="roadType"
              value={formData.roadType}
              onChange={handleChange}
              required
            >
              <option value="">
                Select road type
              </option>
              <option value="Highway">
                Highway
              </option>
              <option value="Urban Road">
                Urban Road
              </option>
              <option value="Residential Road">
                Residential Road
              </option>
              <option value="Intersection">
                Intersection
              </option>
              <option value="Rural Road">
                Rural Road
              </option>
              <option value="Bridge">
                Bridge
              </option>
              <option value="Other">
                Other
              </option>
            </select>
          </label>

          <label>
            Vehicle Type <span style={{ color: "red" }}>*</span>
            <select
              name="vehicleType"
              value={formData.vehicleType}
              onChange={handleChange}
              required
            >
              <option value="">
                Select vehicle
              </option>
              <option value="Motorcycle">
                Motorcycle
              </option>
              <option value="Car">
                Car
              </option>
              <option value="Bus">
                Bus
              </option>
              <option value="Truck">
                Truck
              </option>
              <option value="CNG">
                CNG
              </option>
              <option value="Rickshaw">
                Rickshaw
              </option>
              <option value="Auto Rickshaw">
                Auto Rickshaw
              </option>
              <option value="Bicycle">
                Bicycle
              </option>
              <option value="Multiple Vehicles">
                Multiple Vehicles
              </option>
              <option value="Other">
                Other
              </option>
            </select>
          </label>

          <label>
            Reported Factors <span style={{ color: "red" }}>*</span>
            <select
              multiple
              name="reportedFactors"
              value={formData.reportedFactors}
              onChange={(event) => {
                const values =
                  Array.from(
                    event.target.selectedOptions
                  ).map(
                    (option) =>
                      option.value
                  );

                setFormData((previous) => ({
                  ...previous,
                  reportedFactors: values,
                }));
              }}
              required
            >
              <option value="Speeding">
                Speeding
              </option>

              <option value="Reckless Driving">
                Reckless Driving
              </option>

              <option value="Wet Road">
                Wet Road
              </option>

              <option value="Poor Lighting">
                Poor Lighting
              </option>

              <option value="Road Damage">
                Road Damage
              </option>

              <option value="Driver Distraction">
                Driver Distraction
              </option>

              <option value="Overtaking">
                Overtaking
              </option>

              <option value="Mechanical Failure">
                Mechanical Failure
              </option>

              <option value="Unknown Cause">
                Unknown Cause
              </option>
            </select>

            <small>
              Hold Ctrl/Cmd to select multiple factors.
            </small>
          </label>
        </div>
      )}

      {/* =========================================
          EVIDENCE
      ========================================= */}

      <div
        style={{
          marginTop: "15px",
          marginBottom: "15px",
        }}
      >
        <label
          htmlFor="incident-evidence"
          style={{
            display: "block",
            fontWeight: "600",
            marginBottom: "8px",
          }}
        >
          📷 Evidence
        </label>

        <input
          id="incident-evidence"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
          multiple
          onChange={
            handleEvidenceChange
          }
        />

        <small
          style={{
            display: "block",
            marginTop: "5px",
            color: "#666",
          }}
        >
          Maximum 5 files. Images up to
          10 MB and videos up to 50 MB.
        </small>

        {evidenceFiles.length > 0 && (
          <div
            style={{
              marginTop: "12px",
            }}
          >
            <strong>
              Selected Evidence (
              {evidenceFiles.length}
              )
            </strong>

            {evidenceFiles.map(
              (file, index) => {
                const isImage =
                  file.type.startsWith(
                    "image/"
                  );

                const previewURL =
                  URL.createObjectURL(
                    file
                  );

                return (
                  <div
                    key={`${file.name}-${index}`}
                    style={{
                      marginTop:
                        "10px",

                      padding:
                        "8px",

                      border:
                        "1px solid #ddd",

                      borderRadius:
                        "8px",
                    }}
                  >
                    {isImage ? (
                      <img
                        src={previewURL}
                        alt={file.name}
                        style={{
                          width: "100%",
                          maxHeight:
                            "180px",
                          objectFit:
                            "cover",
                          borderRadius:
                            "6px",
                        }}
                      />
                    ) : (
                      <video
                        src={previewURL}
                        controls
                        style={{
                          width: "100%",
                          maxHeight:
                            "180px",
                          borderRadius:
                            "6px",
                        }}
                      />
                    )}

                    <p
                      style={{
                        fontSize:
                          "13px",
                        margin:
                          "6px 0",
                        wordBreak:
                          "break-word",
                      }}
                    >
                      {file.name}
                      <br />
                      {formatFileSize(
                        file.size
                      )}
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        removeEvidence(
                          index
                        )
                      }
                      style={{
                        padding:
                          "5px 10px",
                        border: "none",
                        borderRadius:
                          "5px",
                        cursor:
                          "pointer",
                      }}
                    >
                      🗑 Remove
                    </button>
                  </div>
                );
              }
            )}
          </div>
        )}
      </div>

      {/* =========================================
          COORDINATES
      ========================================= */}

      <p>
        LAT:{" "}
        {formData.lat
          ? Number(
              formData.lat
            ).toFixed(6)
          : "-"}
      </p>

      <p>
        LNG:{" "}
        {formData.lng
          ? Number(
              formData.lng
            ).toFixed(6)
          : "-"}
      </p>

      <input
        placeholder="Latitude"
        value={
          formData.lat
            ? Number(
                formData.lat
              ).toFixed(6)
            : ""
        }
        disabled
      />

      <input
        placeholder="Longitude"
        value={
          formData.lng
            ? Number(
                formData.lng
              ).toFixed(6)
            : ""
        }
        disabled
      />

      {/* =========================================
          SUBMIT
      ========================================= */}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting
          ? "Uploading & Submitting..."
          : "🚨 Submit Incident"}
      </button>

    </div>
  );
}

export default ReportSidebar;
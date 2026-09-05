import { useCallback, useEffect, useRef, useState } from "react";
import "./VoiceReport.css";

function VoiceReport({ onVoiceResult, selectedLocation }) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [incidentData, setIncidentData] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);

  const recognitionRef = useRef(null);

  // =========================================================
  // INCIDENT KEYWORDS
  // =========================================================

  const incidentKeywords = {
    accident: [
      "দুর্ঘটনা",
      "এক্সিডেন্ট",
      "অ্যাক্সিডেন্ট",
      "সংঘর্ষ",
      "গাড়ি ধাক্কা",
      "গাড়ি ধাক্কা",
      "বাস দুর্ঘটনা",
      "রিকশা দুর্ঘটনা",
      "মোটরসাইকেল দুর্ঘটনা",
      "বাইক দুর্ঘটনা",
    ],

    traffic: [
      "জ্যাম",
      "যানজট",
      "ট্রাফিক জ্যাম",
      "ট্রাফিক",
      "তীব্র যানজট",
      "অনেক জ্যাম",
    ],

    flood: [
      "পানি",
      "জলাবদ্ধ",
      "জলাবদ্ধতা",
      "বন্যা",
      "পানিতে ডুবে",
      "পানি জমেছে",
      "রাস্তা পানিতে",
    ],

    pothole: [
      "গর্ত",
      "রাস্তা ভাঙা",
      "ভাঙা রাস্তা",
      "বড় গর্ত",
      "বড় গর্ত",
      "রাস্তার গর্ত",
    ],

    blockage: [
      "রাস্তা বন্ধ",
      "রাস্তা অবরোধ",
      "অবরোধ",
      "যাতায়াত বন্ধ",
      "যাতায়াত বন্ধ",
      "রাস্তা আটকে",
      "রাস্তা আটকানো",
    ],

    construction: [
      "নির্মাণ",
      "নির্মাণ কাজ",
      "কাজ চলছে",
      "রাস্তার কাজ",
      "রাস্তা মেরামত",
      "মেরামতের কাজ",
    ],

    tree: [
      "গাছ পড়ে",
      "গাছ পড়ে",
      "গাছ পড়েছে",
      "গাছ পড়েছে",
      "গাছ রাস্তার উপর",
      "গাছ পড়ে গেছে",
      "গাছ পড়ে গেছে",
    ],

    trafficLight: [
      "ট্রাফিক লাইট",
      "ট্রাফিক সিগন্যাল",
      "সিগন্যাল নষ্ট",
      "সিগন্যাল কাজ করছে না",
      "লাইট নষ্ট",
    ],

    lighting: [
      "আলো নেই",
      "অন্ধকার",
      "লাইট নেই",
      "রাস্তার আলো নেই",
      "স্ট্রিট লাইট নেই",
    ],

    visibility: [
      "কুয়াশা",
      "কুয়াশা",
      "দেখা যাচ্ছে না",
      "দৃষ্টিসীমা কম",
      "দৃষ্টিসীমা নেই",
      "ঘন কুয়াশা",
      "ঘন কুয়াশা",
    ],

    fire: [
      "আগুন",
      "আগুন লেগেছে",
      "অগ্নিকাণ্ড",
      "আগুন ধরেছে",
      "আগুন জ্বলছে",
    ],
  };

  // =========================================================
  // KEYWORD MATCH HELPER
  // =========================================================

  const containsAny = useCallback((text, keywords) => {
    return keywords.some((keyword) => text.includes(keyword));
  }, []);

  // =========================================================
  // EXTRACT INCIDENT DATA
  // =========================================================

  const extractIncidentData = useCallback(
    (text) => {
      const normalizedText = text.toLowerCase().trim();

      let incidentType = "Other";
      let severity = "Medium";
      let injured = "No";
      let roadStatus = "Normal";
      let trafficImpact = "Medium";

      // -------------------------------------------------------
      // INCIDENT TYPE
      // -------------------------------------------------------

      if (
        containsAny(normalizedText, incidentKeywords.accident)
      ) {
        incidentType = "Accident";
      } else if (
        containsAny(normalizedText, incidentKeywords.traffic)
      ) {
        incidentType = "Traffic Jam";
      } else if (
        containsAny(normalizedText, incidentKeywords.flood)
      ) {
        incidentType = "Flooded Road";
      } else if (
        containsAny(normalizedText, incidentKeywords.pothole)
      ) {
        incidentType = "Pothole";
      } else if (
        containsAny(normalizedText, incidentKeywords.blockage)
      ) {
        incidentType = "Road Blockage";
      } else if (
        containsAny(normalizedText, incidentKeywords.construction)
      ) {
        incidentType = "Road Construction";
      } else if (
        containsAny(normalizedText, incidentKeywords.tree)
      ) {
        incidentType = "Fallen Tree";
      } else if (
        containsAny(
          normalizedText,
          incidentKeywords.trafficLight
        )
      ) {
        incidentType = "Broken Traffic Light";
      } else if (
        containsAny(normalizedText, incidentKeywords.lighting)
      ) {
        incidentType = "Poor Lighting";
      } else if (
        containsAny(normalizedText, incidentKeywords.visibility)
      ) {
        incidentType = "Poor Visibility";
      } else if (
        containsAny(normalizedText, incidentKeywords.fire)
      ) {
        incidentType = "Fire";
      }

      // -------------------------------------------------------
      // SEVERITY
      // -------------------------------------------------------

      if (
        containsAny(normalizedText, [
          "খুব বিপজ্জনক",
          "অত্যন্ত বিপজ্জনক",
          "গুরুতর",
          "মারাত্মক",
          "মৃত্যু",
          "মারা গেছে",
          "মারা গেছেন",
          "অনেক আহত",
          "গুরুতর আহত",
          "জরুরি",
          "ভয়াবহ",
          "ভয়াবহ",
          "বড় দুর্ঘটনা",
          "বড় দুর্ঘটনা",
          "আগুন ছড়িয়ে",
          "আগুন ছড়িয়ে",
        ])
      ) {
        severity = "High";
      } else if (
        containsAny(normalizedText, [
          "সামান্য",
          "কম ঝুঁকি",
          "কম বিপদ",
          "ছোট সমস্যা",
          "ছোটখাটো",
          "তেমন সমস্যা নেই",
        ])
      ) {
        severity = "Low";
      }

      // -------------------------------------------------------
      // INJURED
      // -------------------------------------------------------

      if (
        containsAny(normalizedText, [
          "আহত",
          "আঘাত",
          "হাসপাতাল",
          "রক্তাক্ত",
          "অসুস্থ",
          "আহত হয়েছে",
          "আহত হয়েছে",
          "আহত হয়েছেন",
          "আহত হয়েছেন",
          "চিকিৎসা",
        ])
      ) {
        injured = "Yes";
      }

      // -------------------------------------------------------
      // ROAD STATUS
      // -------------------------------------------------------

      if (
        containsAny(normalizedText, [
          "রাস্তা বন্ধ",
          "রাস্তা অবরোধ",
          "যাতায়াত বন্ধ",
          "যাতায়াত বন্ধ",
          "রাস্তা পুরোপুরি বন্ধ",
          "রাস্তা আটকে",
          "রাস্তা আটকানো",
        ])
      ) {
        roadStatus = "Blocked";
      } else if (
        containsAny(normalizedText, [
          "রাস্তা খারাপ",
          "ভাঙা রাস্তা",
          "রাস্তা ভাঙা",
          "গর্ত",
          "রাস্তার গর্ত",
        ])
      ) {
        roadStatus = "Damaged";
      } else if (
        containsAny(normalizedText, [
          "রাস্তা ভেজা",
          "পিচ্ছিল",
          "রাস্তা পিচ্ছিল",
        ])
      ) {
        roadStatus = "Slippery";
      } else if (
        containsAny(normalizedText, [
          "পানিতে ডুবে",
          "পানি জমেছে",
          "জলাবদ্ধ",
          "বন্যা",
        ])
      ) {
        roadStatus = "Flooded";
      }

      // -------------------------------------------------------
      // TRAFFIC IMPACT
      // -------------------------------------------------------

      if (
        containsAny(normalizedText, [
          "অনেক জ্যাম",
          "তীব্র যানজট",
          "ভয়াবহ যানজট",
          "ভয়াবহ যানজট",
          "ট্রাফিক বেশি",
          "প্রচুর জ্যাম",
          "অনেক যানজট",
          "তীব্র জ্যাম",
        ])
      ) {
        trafficImpact = "High";
      } else if (
        containsAny(normalizedText, [
          "সামান্য জ্যাম",
          "কম যানজট",
          "হালকা জ্যাম",
          "অল্প জ্যাম",
        ])
      ) {
        trafficImpact = "Low";
      }

      // -------------------------------------------------------
      // LOCATION
      // -------------------------------------------------------

      const area =
        selectedLocation?.area ||
        selectedLocation?.name ||
        selectedLocation?.address ||
        "";

      const district =
        selectedLocation?.district || "";

      const lat =
        selectedLocation?.lat ??
        selectedLocation?.latitude ??
        "";

      const lng =
        selectedLocation?.lng ??
        selectedLocation?.longitude ??
        "";

      return {
        incidentType,
        severity,
        injured,
        roadStatus,
        trafficImpact,
        description: text,

        area,
        district,
        lat,
        lng,
      };
    },
    [containsAny, selectedLocation]
  );

  // =========================================================
  // INITIALIZE SPEECH RECOGNITION
  // =========================================================

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "bn-BD";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;

    // -------------------------------------------------------
    // START
    // -------------------------------------------------------

    recognition.onstart = () => {
      setIsListening(true);
      setErrorMessage("");
    };

    // -------------------------------------------------------
    // RESULT
    // -------------------------------------------------------

    recognition.onresult = (event) => {
      const text =
        event.results?.[0]?.[0]?.transcript?.trim() || "";

      if (!text) {
        setErrorMessage(
          "কোনো কথা শনাক্ত করা যায়নি। আবার চেষ্টা করুন।"
        );
        return;
      }

      console.log("Bangla Transcript:", text);

      setTranscript(text);
      setHasRecorded(true);

      const extractedData =
        extractIncidentData(text);

      setIncidentData(extractedData);

      // Always require confirmation before filling/publishing
      setShowConfirmation(true);
    };

    // -------------------------------------------------------
    // ERROR
    // -------------------------------------------------------

    recognition.onerror = (event) => {
      console.error(
        "Speech recognition error:",
        event.error
      );

      setIsListening(false);

      switch (event.error) {
        case "not-allowed":
        case "service-not-allowed":
          setErrorMessage(
            "মাইক্রোফোন ব্যবহারের অনুমতি দিন। Browser settings থেকে Microphone permission Allow করুন।"
          );
          break;

        case "no-speech":
          setErrorMessage(
            "কোনো কথা শনাক্ত করা যায়নি। পরিষ্কারভাবে বাংলায় আবার বলুন।"
          );
          break;

        case "network":
          setErrorMessage(
            "নেটওয়ার্ক সমস্যা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"
          );
          break;

        case "audio-capture":
          setErrorMessage(
            "মাইক্রোফোন পাওয়া যায়নি। আপনার microphone সংযুক্ত আছে কিনা পরীক্ষা করুন।"
          );
          break;

        case "aborted":
          break;

        default:
          setErrorMessage(
            "আপনার কথা শনাক্ত করা যায়নি। আবার চেষ্টা করুন।"
          );
      }
    };

    // -------------------------------------------------------
    // END
    // -------------------------------------------------------

    recognition.onend = () => {
      setIsListening(false);
    };

    return () => {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;

      try {
        recognition.stop();
      } catch (error) {
        // Recognition may already be stopped.
      }
    };
  }, [extractIncidentData]);

  // =========================================================
  // START / STOP VOICE
  // =========================================================

  const handleVoiceClick = () => {
    if (!supported) {
      setErrorMessage(
        "আপনার ব্রাউজারে Voice Recognition supported নয়। Google Chrome অথবা Microsoft Edge ব্যবহার করুন।"
      );
      return;
    }

    if (!recognitionRef.current) {
      setErrorMessage(
        "Voice recognition বর্তমানে unavailable।"
      );
      return;
    }

    // Stop current recording
    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error(error);
      }

      return;
    }

    // Location should be selected before creating a report
    if (!selectedLocation) {
      setErrorMessage(
        "প্রথমে ম্যাপ থেকে একটি location নির্বাচন করুন অথবা Search Location ব্যবহার করুন।"
      );
      return;
    }

    setTranscript("");
    setIncidentData(null);
    setShowConfirmation(false);
    setHasRecorded(false);
    setErrorMessage("");

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error("Voice start error:", error);

      setErrorMessage(
        "Voice recording শুরু করা যায়নি। আবার চেষ্টা করুন।"
      );
    }
  };

  // =========================================================
  // CONFIRM AND SEND TO REPORT FORM
  // =========================================================

  const handleConfirm = () => {
    if (!incidentData) return;

    if (!selectedLocation) {
      setErrorMessage(
        "Report করার আগে একটি location নির্বাচন করুন।"
      );
      return;
    }

    console.log(
      "Confirmed Voice Incident:",
      incidentData
    );

    if (onVoiceResult) {
      onVoiceResult(incidentData);
    }

    setShowConfirmation(false);
  };

  // =========================================================
  // RECORD AGAIN
  // =========================================================

  const handleRetry = () => {
    setTranscript("");
    setIncidentData(null);
    setShowConfirmation(false);
    setHasRecorded(false);
    setErrorMessage("");

    window.setTimeout(() => {
      if (
        recognitionRef.current &&
        !isListening
      ) {
        try {
          recognitionRef.current.start();
        } catch (error) {
          console.error(
            "Retry voice start error:",
            error
          );
        }
      }
    }, 150);
  };

  // =========================================================
  // CLEAR
  // =========================================================

  const handleClear = () => {
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error(error);
      }
    }

    setTranscript("");
    setIncidentData(null);
    setShowConfirmation(false);
    setHasRecorded(false);
    setErrorMessage("");
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="voice-report">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="voice-header">
        <div className="voice-title-row">
          <div className="voice-title-icon">
            🎤
          </div>

          <div>
            <h3>Bangla Voice Reporting</h3>

            <p>
              বাংলায় কথা বলে দ্রুত incident report তৈরি করুন
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================
          HOW IT WORKS
      ===================================================== */}

      <div className="voice-steps">

        <div className="voice-step">
          <span className="voice-step-number">1</span>
          <span>Location নির্বাচন</span>
        </div>

        <span className="voice-step-arrow">→</span>

        <div className="voice-step">
          <span className="voice-step-number">2</span>
          <span>বাংলায় বলুন</span>
        </div>

        <span className="voice-step-arrow">→</span>

        <div className="voice-step">
          <span className="voice-step-number">3</span>
          <span>তথ্য যাচাই</span>
        </div>

      </div>

      {/* =====================================================
          LOCATION
      ===================================================== */}

      {selectedLocation ? (
        <div className="voice-location-selected">

          <div className="voice-location-icon">
            📍
          </div>

          <div className="voice-location-content">
            <span className="voice-location-label">
              Selected Location
            </span>

            <strong>
              {selectedLocation.area ||
                selectedLocation.name ||
                "Selected location"}
            </strong>

            {selectedLocation.district && (
              <small>
                {selectedLocation.district}
              </small>
            )}
          </div>

          <span className="voice-location-check">
            ✓
          </span>

        </div>
      ) : (
        <div className="voice-location-warning">

          <div className="voice-warning-icon">
            📍
          </div>

          <div>
            <strong>
              Location নির্বাচন করুন
            </strong>

            <p>
              ম্যাপ থেকে একটি location নির্বাচন করুন
              অথবা Search Location ব্যবহার করুন।
            </p>
          </div>

        </div>
      )}

      {/* =====================================================
          BROWSER SUPPORT
      ===================================================== */}

      {!supported && (
        <div className="voice-error">

          <span className="voice-error-icon">
            ⚠️
          </span>

          <div>
            <strong>
              Voice Recognition supported নয়
            </strong>

            <p>
              Google Chrome অথবা Microsoft Edge ব্যবহার করুন।
            </p>
          </div>

        </div>
      )}

      {/* =====================================================
          MICROPHONE
      ===================================================== */}

      <button
        type="button"
        className={`voice-mic-button ${
          isListening
            ? "voice-listening"
            : ""
        }`}
        onClick={handleVoiceClick}
        disabled={!supported}
        aria-label={
          isListening
            ? "Stop Bangla voice recording"
            : "Start Bangla voice recording"
        }
      >

        <span className="voice-mic-icon">
          {isListening ? "🛑" : "🎤"}
        </span>

        <span className="voice-mic-text">

          <strong>
            {isListening
              ? "Stop Listening"
              : "Speak in Bangla"}
          </strong>

          <small>
            {isListening
              ? "রেকর্ডিং বন্ধ করতে চাপ দিন"
              : "বাংলায় আপনার incident বলুন"}
          </small>

        </span>

      </button>

      {/* =====================================================
          LISTENING STATUS
      ===================================================== */}

      {isListening && (
        <div className="voice-listening-area">

          <div className="voice-status">

            <span className="voice-pulse">
              <span></span>
            </span>

            <span>
              শুনছি... বাংলায় বলুন
            </span>

          </div>

          <div className="voice-instruction">

            <div className="instruction-icon">
              💡
            </div>

            <div>
              <strong>
                কীভাবে বলবেন?
              </strong>

              <p>
                ঘটনা, গুরুত্ব, আহত ব্যক্তি এবং
                রাস্তার অবস্থা সম্পর্কে বলুন।
              </p>

              <div className="voice-example">
                “আম্বরখানায় একটি দুর্ঘটনা হয়েছে।
                একজন আহত হয়েছে এবং রাস্তায় অনেক জ্যাম।”
              </div>
            </div>

          </div>

        </div>
      )}

      {/* =====================================================
          ERROR
      ===================================================== */}

      {errorMessage && (
        <div className="voice-error">

          <span className="voice-error-icon">
            ⚠️
          </span>

          <div>
            <strong>
              Voice Report Error
            </strong>

            <p>
              {errorMessage}
            </p>
          </div>

        </div>
      )}

      {/* =====================================================
          TRANSCRIPT
      ===================================================== */}

      {transcript && (
        <div className="voice-transcript">

          <div className="transcript-header">

            <div className="transcript-title">
              <span>📝</span>

              <strong>
                আপনার কথা
              </strong>

              <span className="transcript-badge">
                Bangla
              </span>
            </div>

            <button
              type="button"
              onClick={handleClear}
              className="voice-clear-button"
            >
              Clear
            </button>

          </div>

          <p>
            {transcript}
          </p>

          {hasRecorded && (
            <div className="transcript-success">
              ✓ Speech successfully converted to text
            </div>
          )}

        </div>
      )}

      {/* =====================================================
          CONFIRMATION
      ===================================================== */}

      {showConfirmation && incidentData && (
        <div className="voice-confirmation">

          <div className="confirmation-header">

            <div>
              <span className="confirmation-icon">
                📋
              </span>

              <div>
                <h4>
                  Review Report
                </h4>

                <p>
                  প্রকাশ করার আগে তথ্যগুলো যাচাই করুন
                </p>
              </div>
            </div>

            <span className="confirmation-badge">
              REVIEW
            </span>

          </div>

          <div className="confirmation-notice">
            ℹ️ Voice system আপনার কথাগুলো থেকে
            report information তৈরি করেছে।
            Confirm করার পর এগুলো report form-এ fill হবে।
          </div>

          {/* -------------------------------------------------
              INCIDENT DETAILS
          ------------------------------------------------- */}

          <div className="incident-details">

            {/* LOCATION */}

            <div className="incident-row">

              <span>
                📍 Area
              </span>

              <strong>
                {incidentData.area ||
                  "Not selected"}
              </strong>

            </div>

            <div className="incident-row">

              <span>
                🏙️ District
              </span>

              <strong>
                {incidentData.district ||
                  "Not selected"}
              </strong>

            </div>

            {/* INCIDENT */}

            <div className="incident-row">

              <span>
                🚧 Incident
              </span>

              <strong>
                {incidentData.incidentType}
              </strong>

            </div>

            {/* SEVERITY */}

            <div className="incident-row">

              <span>
                ⚠️ Severity
              </span>

              <strong
                className={`severity-${incidentData.severity.toLowerCase()}`}
              >
                {incidentData.severity}
              </strong>

            </div>

            {/* INJURED */}

            <div className="incident-row">

              <span>
                🚑 Injured
              </span>

              <strong
                className={
                  incidentData.injured === "Yes"
                    ? "value-danger"
                    : "value-safe"
                }
              >
                {incidentData.injured}
              </strong>

            </div>

            {/* ROAD STATUS */}

            <div className="incident-row">

              <span>
                🛣️ Road Status
              </span>

              <strong>
                {incidentData.roadStatus}
              </strong>

            </div>

            {/* TRAFFIC */}

            <div className="incident-row">

              <span>
                🚗 Traffic Impact
              </span>

              <strong>
                {incidentData.trafficImpact}
              </strong>

            </div>

            {/* DESCRIPTION */}

            <div className="incident-description">

              <span>
                📝 Description
              </span>

              <p>
                {incidentData.description}
              </p>

            </div>

          </div>

          {/* -------------------------------------------------
              ACTIONS
          ------------------------------------------------- */}

          <div className="voice-confirm-actions">

            <button
              type="button"
              className="voice-confirm-button"
              onClick={handleConfirm}
            >
              <span>✅</span>
              Confirm & Fill Form
            </button>

            <button
              type="button"
              className="voice-retry-button"
              onClick={handleRetry}
            >
              <span>🎤</span>
              Record Again
            </button>

          </div>

          <p className="voice-confirm-note">
            Your report will not be published automatically.
            Review and confirm the information first.
          </p>

        </div>
      )}

    </div>
  );
}

export default VoiceReport;

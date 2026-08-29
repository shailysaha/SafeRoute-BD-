import { useEffect, useRef, useState } from "react";
import "./VoiceReport.css";

function VoiceReport({ onVoiceResult, selectedLocation }) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [incidentData, setIncidentData] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const recognitionRef = useRef(null);

  // =========================================
  // INITIALIZE SPEECH RECOGNITION
  // =========================================
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

    // =========================================
    // START
    // =========================================
    recognition.onstart = () => {
      setIsListening(true);
      setErrorMessage("");
    };

    // =========================================
    // RESULT
    // =========================================
    recognition.onresult = (event) => {
      const text =
        event.results[0][0].transcript.trim();

      console.log("Bangla Transcript:", text);

      setTranscript(text);

      // Extract structured information
      const extractedData =
        extractIncidentData(text);

      setIncidentData(extractedData);

      // Show confirmation
      setShowConfirmation(true);
    };

    // =========================================
    // ERROR
    // =========================================
    recognition.onerror = (event) => {
      console.error(
        "Speech recognition error:",
        event.error
      );

      setIsListening(false);

      switch (event.error) {
        case "not-allowed":
          setErrorMessage(
            "মাইক্রোফোন ব্যবহারের অনুমতি দিন।"
          );
          break;

        case "no-speech":
          setErrorMessage(
            "কোনো কথা শনাক্ত করা যায়নি। আবার বলুন।"
          );
          break;

        case "network":
          setErrorMessage(
            "নেটওয়ার্ক সমস্যা হয়েছে। ইন্টারনেট সংযোগ পরীক্ষা করুন।"
          );
          break;

        case "audio-capture":
          setErrorMessage(
            "মাইক্রোফোন পাওয়া যায়নি।"
          );
          break;

        default:
          setErrorMessage(
            "আপনার কথা শনাক্ত করা যায়নি। আবার চেষ্টা করুন।"
          );
      }
    };

    // =========================================
    // END
    // =========================================
    recognition.onend = () => {
      setIsListening(false);
    };

    return () => {
      recognition.stop();
    };
  }, []);

  // =========================================
  // EXTRACT INCIDENT DATA
  // =========================================
  const extractIncidentData = (text) => {
    const normalizedText =
      text.toLowerCase().trim();

    let incidentType = "";
    let severity = "";
    let roadStatus = "";
    let trafficImpact = "";
    let injured = "No";

    // =========================================
    // INCIDENT TYPE
    // =========================================

    if (
      normalizedText.includes("দুর্ঘটনা") ||
      normalizedText.includes("এক্সিডেন্ট") ||
      normalizedText.includes("সংঘর্ষ") ||
      normalizedText.includes("গাড়ি ধাক্কা") ||
      normalizedText.includes("বাস দুর্ঘটনা") ||
      normalizedText.includes("রিকশা দুর্ঘটনা")
    ) {
      incidentType = "Accident";
    }

    else if (
      normalizedText.includes("জ্যাম") ||
      normalizedText.includes("যানজট") ||
      normalizedText.includes("ট্রাফিক")
    ) {
      incidentType = "Traffic Jam";
    }

    else if (
      normalizedText.includes("পানি") ||
      normalizedText.includes("জলাবদ্ধ") ||
      normalizedText.includes("বন্যা") ||
      normalizedText.includes("পানিতে ডুবে")
    ) {
      incidentType = "Flooded Road";
    }

    else if (
      normalizedText.includes("গর্ত") ||
      normalizedText.includes("রাস্তা ভাঙা") ||
      normalizedText.includes("ভাঙা রাস্তা")
    ) {
      incidentType = "Pothole";
    }

    else if (
      normalizedText.includes("রাস্তা বন্ধ") ||
      normalizedText.includes("রাস্তা অবরোধ") ||
      normalizedText.includes("অবরোধ")
    ) {
      incidentType = "Road Blockage";
    }

    else if (
      normalizedText.includes("নির্মাণ") ||
      normalizedText.includes("কাজ চলছে") ||
      normalizedText.includes("রাস্তার কাজ")
    ) {
      incidentType = "Road Construction";
    }

    else if (
      normalizedText.includes("গাছ পড়ে") ||
      normalizedText.includes("গাছ পড়ে")
    ) {
      incidentType = "Fallen Tree";
    }

    else if (
      normalizedText.includes("ট্রাফিক লাইট") ||
      normalizedText.includes("সিগন্যাল নষ্ট")
    ) {
      incidentType = "Broken Traffic Light";
    }

    else if (
      normalizedText.includes("আলো নেই") ||
      normalizedText.includes("অন্ধকার") ||
      normalizedText.includes("লাইট নেই")
    ) {
      incidentType = "Poor Lighting";
    }

    else if (
      normalizedText.includes("কুয়াশা") ||
      normalizedText.includes("কুয়াশা") ||
      normalizedText.includes("দেখা যাচ্ছে না") ||
      normalizedText.includes("দৃষ্টিসীমা")
    ) {
      incidentType = "Poor Visibility";
    }

    else if (
      normalizedText.includes("আগুন") ||
      normalizedText.includes("আগুন লেগেছে") ||
      normalizedText.includes("অগ্নিকাণ্ড")
    ) {
      incidentType = "Fire";
    }

    else {
      incidentType = "Other";
    }

    // =========================================
    // SEVERITY
    // =========================================

    if (
      normalizedText.includes("খুব বিপজ্জনক") ||
      normalizedText.includes("অত্যন্ত বিপজ্জনক") ||
      normalizedText.includes("গুরুতর") ||
      normalizedText.includes("মারাত্মক") ||
      normalizedText.includes("মৃত্যু") ||
      normalizedText.includes("মারা গেছে") ||
      normalizedText.includes("অনেক আহত") ||
      normalizedText.includes("জরুরি")
    ) {
      severity = "High";
    }

    else if (
      normalizedText.includes("সামান্য") ||
      normalizedText.includes("কম ঝুঁকি") ||
      normalizedText.includes("ছোট সমস্যা")
    ) {
      severity = "Low";
    }

    else {
      severity = "Medium";
    }

    // =========================================
    // INJURED PERSON
    // =========================================

    if (
      normalizedText.includes("আহত") ||
      normalizedText.includes("আঘাত") ||
      normalizedText.includes("হাসপাতাল") ||
      normalizedText.includes("রক্তাক্ত") ||
      normalizedText.includes("অসুস্থ")
    ) {
      injured = "Yes";
    }

    // =========================================
    // ROAD STATUS
    // =========================================

    if (
      normalizedText.includes("রাস্তা বন্ধ") ||
      normalizedText.includes("রাস্তা অবরোধ") ||
      normalizedText.includes("যাতায়াত বন্ধ") ||
      normalizedText.includes("যাতায়াত বন্ধ")
    ) {
      roadStatus = "Blocked";
    }

    else if (
      normalizedText.includes("রাস্তা খারাপ") ||
      normalizedText.includes("ভাঙা রাস্তা") ||
      normalizedText.includes("গর্ত")
    ) {
      roadStatus = "Damaged";
    }

    else if (
      normalizedText.includes("রাস্তা ভেজা") ||
      normalizedText.includes("পিচ্ছিল")
    ) {
      roadStatus = "Slippery";
    }

    else {
      roadStatus = "Normal";
    }

    // =========================================
    // TRAFFIC IMPACT
    // =========================================

    if (
      normalizedText.includes("অনেক জ্যাম") ||
      normalizedText.includes("তীব্র যানজট") ||
      normalizedText.includes("ভয়াবহ যানজট") ||
      normalizedText.includes("ভয়াবহ যানজট") ||
      normalizedText.includes("ট্রাফিক বেশি")
    ) {
      trafficImpact = "High";
    }

    else if (
      normalizedText.includes("সামান্য জ্যাম") ||
      normalizedText.includes("কম যানজট")
    ) {
      trafficImpact = "Low";
    }

    else {
      trafficImpact = "Medium";
    }

    // =========================================
    // RETURN STRUCTURED DATA
    // =========================================

    return {
      incidentType,
      severity,
      injured,
      roadStatus,
      trafficImpact,
      description: text,

      // Existing selected map/search location
      area: selectedLocation?.area || "",
      district: selectedLocation?.district || "",
      lat: selectedLocation?.lat || "",
      lng: selectedLocation?.lng || "",
    };
  };

  // =========================================
  // START / STOP
  // =========================================
  const handleVoiceClick = () => {
    if (!supported) {
      setErrorMessage(
        "আপনার ব্রাউজারে Voice Recognition supported নয়।"
      );
      return;
    }

    if (!recognitionRef.current) {
      setErrorMessage(
        "Voice recognition unavailable."
      );
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      return;
    }

    setTranscript("");
    setIncidentData(null);
    setShowConfirmation(false);
    setErrorMessage("");

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error(
        "Voice start error:",
        error
      );
    }
  };

  // =========================================
  // CONFIRM
  // =========================================
  const handleConfirm = () => {
    if (!incidentData) return;

    console.log(
      "Confirmed Voice Incident:",
      incidentData
    );

    if (onVoiceResult) {
      onVoiceResult(incidentData);
    }

    setShowConfirmation(false);
  };

  // =========================================
  // RECORD AGAIN
  // =========================================
  const handleRetry = () => {
    setTranscript("");
    setIncidentData(null);
    setShowConfirmation(false);
    setErrorMessage("");
  };

  // =========================================
  // CLEAR
  // =========================================
  const handleClear = () => {
    setTranscript("");
    setIncidentData(null);
    setShowConfirmation(false);
    setErrorMessage("");
  };

  return (
    <div className="voice-report">

      {/* HEADER */}
      <div className="voice-header">
        <h3>🎤 Bangla Voice Report</h3>
      </div>

      {/* LOCATION WARNING */}
      {!selectedLocation && (
        <div className="voice-location-warning">
          📍  ম্যাপ থেকে একটি location নির্বাচন করুন।
          <br />
          অথবা Search Location ব্যবহার করুন।
        </div>
      )}

      {/* BROWSER SUPPORT */}
      {!supported && (
        <div className="voice-error">
          ⚠️ আপনার ব্রাউজারে Voice Recognition
          supported নয়।
          <br />
          Google Chrome অথবা Microsoft Edge ব্যবহার করুন।
        </div>
      )}

      {/* MICROPHONE */}
      <button
        type="button"
        className={`voice-mic-button ${
          isListening
            ? "voice-listening"
            : ""
        }`}
        onClick={handleVoiceClick}
        disabled={!supported}
      >
        <span className="voice-mic-icon">
          {isListening ? "🛑" : "🎤"}
        </span>

        <span>
          {isListening
            ? "Stop Listening"
            : "Speak in Bangla"}
        </span>
      </button>

      {/* LISTENING STATUS */}
      {isListening && (
        <>
          <div className="voice-status">
            <span className="voice-dot"></span>

            <span>
              শুনছি... বাংলায় বলুন
            </span>
          </div>

          <div className="voice-instruction">
            <strong>
              উদাহরণ:
            </strong>

            <br />

            "আম্বরখানায় একটি দুর্ঘটনা হয়েছে।
            একজন আহত হয়েছে এবং রাস্তায় অনেক জ্যাম।"
          </div>
        </>
      )}

      {/* ERROR */}
      {errorMessage && (
        <div className="voice-error">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* TRANSCRIPT */}
      {transcript && (
        <div className="voice-transcript">

          <div className="transcript-header">
            <strong>
              📝 আপনার কথা
            </strong>

            <button
              type="button"
              onClick={handleClear}
              className="voice-clear-button"
            >
              Clear
            </button>
          </div>

          <p>{transcript}</p>

        </div>
      )}

      {/* =====================================
          CONFIRMATION
          ===================================== */}
      {showConfirmation && incidentData && (
        <div className="voice-confirmation">

          <h4>
            📋 Report Information
          </h4>

          <p className="confirm-question">
            প্রকাশ করার আগে তথ্যগুলো যাচাই করুন:
          </p>

          {/* LOCATION */}
          <div className="incident-details">

            <div className="incident-row">
              <span>📍 Area</span>

              <strong>
                {incidentData.area || "Not selected"}
              </strong>
            </div>

            <div className="incident-row">
              <span>District</span>

              <strong>
                {incidentData.district || "Not selected"}
              </strong>
            </div>

            {/* INCIDENT */}
            <div className="incident-row">
              <span>🚧 Incident</span>

              <strong>
                {incidentData.incidentType}
              </strong>
            </div>

            {/* SEVERITY */}
            <div className="incident-row">
              <span>⚠️ Severity</span>

              <strong>
                {incidentData.severity}
              </strong>
            </div>

            {/* INJURED */}
            <div className="incident-row">
              <span>🚑 Injured</span>

              <strong>
                {incidentData.injured}
              </strong>
            </div>

            {/* ROAD STATUS */}
            <div className="incident-row">
              <span>🛣️ Road Status</span>

              <strong>
                {incidentData.roadStatus}
              </strong>
            </div>

            {/* TRAFFIC */}
            <div className="incident-row">
              <span>🚗 Traffic Impact</span>

              <strong>
                {incidentData.trafficImpact}
              </strong>
            </div>

            {/* DESCRIPTION */}
            <div className="incident-description">
              <span>📝 Description</span>

              <p>
                {incidentData.description}
              </p>
            </div>

          </div>

          {/* ACTIONS */}
          <div className="voice-confirm-actions">

            <button
              type="button"
              className="voice-confirm-button"
              onClick={handleConfirm}
            >
              ✅ Confirm & Fill Form
            </button>

            <button
              type="button"
              className="voice-retry-button"
              onClick={handleRetry}
            >
              🎤 Record Again
            </button>

          </div>

        </div>
      )}

    </div>
  );
}

export default VoiceReport;

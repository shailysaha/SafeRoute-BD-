import {
  useState,
  useEffect,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

import {
  collection,
  addDoc,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  increment,
} from "firebase/firestore";

import {
  db,
  auth,
} from "../firebase/firebase";

import {
  uploadEvidenceFiles,
} from "../utils/uploadEvidence";

import DashboardLayout from "../layout/DashboardLayout";

import SOSButton from "../components/SOSButton";

import PoliceStations from "../components/PoliceStations";

import Hospitals from "../components/Hospitals";

import ReportSidebar from "../components/ReportSidebar";

import MyLocationButton from "../components/MyLocationButton";

import IncidentVerification from "../components/incidents/IncidentVerification";

import {
  redIcon,
  orangeIcon,
  greenIcon,
  blueIcon,
} from "../utils/markerIcons";

import {
  findDuplicateIncident,
} from "../utils/duplicateDetection";

import "./MapPage.css";

import "../components/SOSButton.css";


// =====================================================
// MAP CLICK HANDLER
// =====================================================

function ClickHandler({
  onMapClick,
}) {
  useMapEvents({
    async click(e) {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;

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
            "Reverse geocoding failed"
          );
        }

        const data = await response.json();

        const address = data.address || {};

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
          address.city ||
          address.state ||
          "";

        console.log(
          "📍 Map clicked:",
          {
            lat,
            lng,
            area,
            district,
          }
        );

        onMapClick({
          lat,
          lng,
          area,
          district,
          name:
            data.display_name ||
            "Clicked Location",
        });
      } catch (error) {
        console.error(
          "Reverse geocoding error:",
          error
        );

        onMapClick({
          lat,
          lng,
          area: "",
          district: "",
          name: "Clicked Location",
        });
      }
    },
  });

  return null;
}


// =====================================================
// MAP CONTROLLER
// =====================================================

function MapController({
  setMap,
}) {
  const map = useMap();

  useEffect(() => {
    if (map) {
      setMap(map);
    }
  }, [
    map,
    setMap,
  ]);

  return null;
}


// =====================================================
// FLY TO LOCATION
// =====================================================

function FlyToLocation({
  location,
}) {
  const map = useMap();

  useEffect(() => {
    if (!location) {
      return;
    }

    const lat = Number(location.lat);
    const lng = Number(location.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return;
    }

    map.flyTo(
      [lat, lng],
      16,
      {
        duration: 1.5,
      }
    );
  }, [
    location,
    map,
  ]);

  return null;
}


// =====================================================
// MAIN MAP PAGE
// =====================================================

export default function MapPage({
  hideSidebar = false,
}) {
  const navigate = useNavigate();

  // ===================================================
  // STATES
  // ===================================================

  const [
    selectedLocation,
    setSelectedLocation,
  ] = useState(null);

  const [
    currentLocation,
    setCurrentLocation,
  ] = useState(null);

  const [reports, setReports] = useState([]);
  const [myReports, setMyReports] = useState([]);
  const [communityReports, setCommunityReports] = useState([]);

  const [
    map,
    setMap,
  ] = useState(null);


  // ===================================================
  // LIVE FIRESTORE LISTENERS (INCIDENTS & OLD REPORTS)
  // ===================================================

  useEffect(() => {
    let incidentsData = [];
    let oldReportsData = [];

    const updateReports = () => {
      /*
       * ------------------------------------------------
       * 1. NORMALIZE NEW INCIDENTS
       * ------------------------------------------------
       */
      const normalizedIncidents = incidentsData.map((item) => ({
        ...item,

        id: item.id,

        source: "incident",

        status: item.status || "Unverified",

        incidentType:
          item.incidentType ||
          item.dangerType ||
          "Road Incident",

        area: item.area || "",
        district: item.district || "",

        lat: Number(item.lat),
        lng: Number(item.lng),

        severity: item.severity || "Medium",

        description: item.description || "",

        evidence:
          Array.isArray(item.evidence)
            ? item.evidence
            : [],

        userId:
          item.userId ||
          item.createdBy ||
          item.reportedBy ||
          "",

        userEmail:
          item.userEmail || "",
      }));

      /*
       * ------------------------------------------------
       * 2. NORMALIZE OLD REPORTS
       * ------------------------------------------------
       */
      const normalizedOldReports = oldReportsData.map((item) => ({
        ...item,

        id: item.id,

        source: "report",

        status: item.status || "Unverified",

        incidentType:
          item.incidentType ||
          item.dangerType ||
          "Road Incident",

        area: item.area || "",
        district: item.district || "",

        lat: Number(item.lat),
        lng: Number(item.lng),

        severity: item.severity || "Medium",

        description: item.description || "",

        evidence:
          Array.isArray(item.evidence)
            ? item.evidence
            : [],

        userId:
          item.userId ||
          item.createdBy ||
          item.reportedBy ||
          "",

        userEmail:
          item.userEmail || "",
      }));

      /*
       * ------------------------------------------------
       * 3. COMBINE BOTH
       * ------------------------------------------------
       */

      const combined = [
        ...normalizedIncidents,
        ...normalizedOldReports,
      ];

      /*
       * ------------------------------------------------
       * 4. REMOVE INVALID COORDINATES
       * ------------------------------------------------
       */

      const validReports = combined.filter(
        (report) =>
          Number.isFinite(report.lat) &&
          Number.isFinite(report.lng) &&
          report.lat >= -90 &&
          report.lat <= 90 &&
          report.lng >= -180 &&
          report.lng <= 180
      );

      /*
       * ------------------------------------------------
       * 5. REMOVE DUPLICATES
       * ------------------------------------------------
       */

      const uniqueReports = [];

      const seen = new Set();

      validReports.forEach((report) => {
        const key = `${report.source}-${report.id}`;

        if (!seen.has(key)) {
          seen.add(key);
          uniqueReports.push(report);
        }
      });

      /*
       * ------------------------------------------------
       * 6. SET ALL REPORTS
       * ------------------------------------------------
       */

      setReports(uniqueReports);

      /*
       * ------------------------------------------------
       * 7. CURRENT USER'S REPORTS
       * ------------------------------------------------
       */

      const currentUser = auth.currentUser;

      if (currentUser) {
        const mine = uniqueReports.filter(
          (report) =>
            report.userId === currentUser.uid
        );

        setMyReports(mine);

        /*
         * ------------------------------------------------
         * 8. COMMUNITY REPORTS
         * ------------------------------------------------
         */

        const community = uniqueReports.filter(
          (report) =>
            report.userId !== currentUser.uid
        );

        setCommunityReports(community);
      } else {
        setMyReports([]);
        setCommunityReports(uniqueReports);
      }
    };

    /*
     * ------------------------------------------------
     * 9. LISTEN TO NEW INCIDENTS
     * ------------------------------------------------
     */

    const unsubscribeIncidents = onSnapshot(
      collection(db, "incidents"),
      (snapshot) => {
        incidentsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        console.log(
          "🔥 Incidents loaded:",
          incidentsData
        );

        updateReports();
      },
      (error) => {
        console.error(
          "❌ Incidents listener error:",
          error
        );
      }
    );

    /*
     * ------------------------------------------------
     * 10. LISTEN TO OLD REPORTS
     * ------------------------------------------------
     */

    const unsubscribeReports = onSnapshot(
      collection(db, "reports"),
      (snapshot) => {
        oldReportsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        console.log(
          "📋 Old reports loaded:",
          oldReportsData
        );

        updateReports();
      },
      (error) => {
        console.error(
          "❌ Reports listener error:",
          error
        );
      }
    );

    /*
     * ------------------------------------------------
     * 11. CLEANUP
     * ------------------------------------------------
     */

    return () => {
      unsubscribeIncidents();
      unsubscribeReports();
    };
  }, []);


  // ===================================================
  // SUBMIT INCIDENT
  // ===================================================

  const submitIncident =
    async (incident) => {
      const currentUser =
        auth.currentUser;

      if (!currentUser) {
        alert(
          "Please login before submitting a report."
        );

        navigate(
          "/login",
          {
            state: {
              from: {
                pathname:
                  "/report-area",
              },
            },
            replace: true,
          }
        );

        return false;
      }

      const latitude =
        Number(
          incident?.lat ??
            selectedLocation?.lat
        );

      const longitude =
        Number(
          incident?.lng ??
            selectedLocation?.lng
        );

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        alert(
          "Invalid GPS coordinates."
        );

        return false;
      }

      const evidenceFiles =
        Array.isArray(
          incident?.evidenceFiles
        )
          ? incident.evidenceFiles
          : [];

      const {
        evidenceFiles:
          ignoredEvidenceFiles,
        ...incidentData
      } = incident || {};

      void ignoredEvidenceFiles;

      const locationName =
        incident?.locationName ||
        selectedLocation?.name ||
        `${incident?.area || selectedLocation?.area || ""}, ${
          incident?.district ||
          selectedLocation?.district ||
          ""
        }`
          .replace(
            /^,\s*|\s*,$/g,
            ""
          ) ||
        "Unknown Location";

      const newIncident = {
        ...incidentData,

        lat: latitude,

        lng: longitude,

        area:
          incident?.area ||
          selectedLocation?.area ||
          "",

        district:
          incident?.district ||
          selectedLocation?.district ||
          "",

        locationName,

        userId: currentUser.uid,

        reporterId:
          currentUser.uid,

        reporterEmail:
          currentUser.email || "",

        reporterName:
          currentUser.displayName ||
          currentUser.email?.split(
            "@"
          )[0] ||
          "Unknown User",

        status:
          "Unverified",

        reportCount: 1,

        confirmationCount: 0,

        rejectionCount: 0,

        confirmedBy: [],

        rejectedBy: [],

        evidence: [],

        evidenceCount:
          evidenceFiles.length,

        relatedReports: [],

        createdAt:
          new Date().toISOString(),

        updatedAt:
          new Date().toISOString(),

        resolvedAt: null,
      };

      try {
        const snapshot =
          await getDocs(
            collection(
              db,
              "incidents"
            )
          );

        const existingIncidents =
          snapshot.docs.map(
            (item) => ({
              id: item.id,
              ...item.data(),
            })
          );

        const duplicate =
          findDuplicateIncident(
            newIncident,
            existingIncidents
          );

        if (duplicate) {
          const duplicateId =
            duplicate.id;

          let uploadedEvidence =
            [];

          if (
            evidenceFiles.length >
            0
          ) {
            uploadedEvidence =
              await uploadEvidenceFiles(
                evidenceFiles,
                currentUser.uid,
                duplicateId
              );
          }

          const relatedReport = {
            reporterId:
              currentUser.uid,

            reporterEmail:
              currentUser.email ||
              "",

            lat: latitude,

            lng: longitude,

            area:
              newIncident.area,

            district:
              newIncident.district,

            incidentType:
              incident?.incidentType ||
              "",

            dangerType:
              incident?.dangerType ||
              "",

            severity:
              incident?.severity ||
              "",

            description:
              incident?.description ||
              "",

            evidence:
              uploadedEvidence,

            reportedAt:
              new Date().toISOString(),
          };

          const duplicateUpdate = {
            reportCount:
              increment(1),

            relatedReports:
              arrayUnion(
                relatedReport
              ),

            updatedAt:
              serverTimestamp(),
          };

          if (
            uploadedEvidence.length >
            0
          ) {
            duplicateUpdate.evidence =
              arrayUnion(
                ...uploadedEvidence
              );

            duplicateUpdate.evidenceCount =
              increment(
                uploadedEvidence.length
              );
          }

          await updateDoc(
            doc(
              db,
              "incidents",
              duplicateId
            ),
            duplicateUpdate
          );

          alert(
            "ℹ️ Duplicate report detected and merged.\n\n" +
              `Incident ID: ${duplicateId}\n` +
              `Evidence uploaded: ${uploadedEvidence.length}`
          );

          return true;
        }

        const docRef =
          await addDoc(
            collection(
              db,
              "incidents"
            ),
            newIncident
          );

        const incidentId =
          docRef.id;

        let uploadedEvidence =
          [];

        if (
          evidenceFiles.length >
          0
        ) {
          uploadedEvidence =
            await uploadEvidenceFiles(
              evidenceFiles,
              currentUser.uid,
              incidentId
            );

          await updateDoc(
            doc(
              db,
              "incidents",
              incidentId
            ),
            {
              evidence:
                uploadedEvidence,

              evidenceCount:
                uploadedEvidence.length,

              updatedAt:
                serverTimestamp(),
            }
          );
        }

        alert(
          "✅ Incident submitted successfully.\n\n" +
            `Incident ID: ${incidentId}\n` +
            `Status: Unverified\n` +
            `Evidence uploaded: ${uploadedEvidence.length}`
        );

        return true;

      } catch (error) {
        console.error(
          "❌ INCIDENT SUBMISSION ERROR:",
          error
        );

        alert(
          `❌ Failed to submit incident.\n\n${
            error?.message ||
            "Unknown error"
          }`
        );

        return false;
      }
    };


  // ===================================================
  // MARKER ICON
  // ===================================================

  const getMarkerIcon =
    (severity) => {
      switch (
        severity
      ) {
        case "High":
          return redIcon;

        case "Medium":
          return orangeIcon;

        case "Low":
          return greenIcon;

        default:
          return blueIcon;
      }
    };


  // ===================================================
  // CURRENT GPS LOCATION
  // ===================================================

  const handleMyLocation =
    (location) => {
      if (!location) {
        return;
      }

      const lat =
        Number(
          location.lat
        );

      const lng =
        Number(
          location.lng
        );

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        console.error(
          "Invalid GPS location:",
          location
        );

        return;
      }

      const locationData = {
        ...location,

        lat,

        lng,

        name:
          location.name ||
          "My Current Location",
      };

      setCurrentLocation(
        locationData
      );

      setSelectedLocation(
        locationData
      );

      if (map) {
        map.flyTo(
          [
            lat,
            lng,
          ],
          16,
          {
            duration: 1.2,
          }
        );
      }
    };


  // ===================================================
  // SOS
  // ===================================================

  const handleSOS =
    async () => {
      const currentUser =
        auth.currentUser;

      if (!currentUser) {
        alert(
          "Please login before sending an SOS alert."
        );

        navigate(
          "/login",
          {
            state: {
              from: {
                pathname:
                  "/report-area",
              },
            },
          }
        );

        return;
      }

      if (!selectedLocation) {
        alert(
          "Select your location first."
        );

        return;
      }

      const latitude =
        Number(
          selectedLocation.lat
        );

      const longitude =
        Number(
          selectedLocation.lng
        );

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        alert(
          "Invalid location."
        );

        return;
      }

      const emergency = {
        lat: latitude,

        lng: longitude,

        area:
          selectedLocation.area ||
          "",

        district:
          selectedLocation.district ||
          "",

        locationName:
          selectedLocation.name ||
          `${selectedLocation.area || ""}, ${
            selectedLocation.district || ""
          }`
            .replace(
              /^,\s*|\s*,$/g,
              ""
            ) ||
          "Unknown Location",

        userId:
          currentUser.uid,

        userEmail:
          currentUser.email ||
          "",

        userName:
          currentUser.displayName ||
          currentUser.email?.split(
            "@"
          )[0] ||
          "Unknown User",

        status:
          "ACTIVE",

        createdAt:
          serverTimestamp(),
      };

      try {
        const docRef =
          await addDoc(
            collection(
              db,
              "emergencyAlerts"
            ),
            emergency
          );

        console.log(
          "🚨 SOS Alert Created:",
          docRef.id
        );

        alert(
          "🚨 SOS Alert Sent Successfully!"
        );

      } catch (error) {
        console.error(
          "SOS Error:",
          error
        );

        alert(
          "Failed to send SOS."
        );
      }
    };


  // ===================================================
  // RENDER
  // ===================================================

  return (
    <DashboardLayout>

      <div
        className={`page-layout ${
          hideSidebar
            ? "map-only-layout"
            : "report-layout"
        }`}
      >

        {/* =================================================
            MAP
        ================================================= */}

        <div
          className={`map-section ${
            hideSidebar
              ? "map-full-width"
              : ""
          }`}
        >

          <MapContainer
            center={[
              23.8103,
              90.4125,
            ]}
            zoom={7}
            className="main-leaflet-map"
          >

            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FlyToLocation
              location={
                selectedLocation
              }
            />

            <MapController
              setMap={
                setMap
              }
            />

            <PoliceStations
              center={
                selectedLocation
              }
            />

            <Hospitals
              center={
                selectedLocation
              }
            />

            <ClickHandler
              onMapClick={
                setSelectedLocation
              }
            />

            {/* CURRENT GPS MARKER */}
            {currentLocation && (
              <Marker
                position={[
                  Number(
                    currentLocation.lat
                  ),
                  Number(
                    currentLocation.lng
                  ),
                ]}
                icon={
                  blueIcon
                }
              >

                <Popup>

                  <strong>
                    📍 My Current Location
                  </strong>

                  {currentLocation.area && (
                    <p>
                      Area:{" "}
                      {
                        currentLocation.area
                      }
                    </p>
                  )}

                  {currentLocation.district && (
                    <p>
                      District:{" "}
                      {
                        currentLocation.district
                      }
                    </p>
                  )}

                  <small>
                    {Number(
                      currentLocation.lat
                    ).toFixed(6)}
                    {" , "}
                    {Number(
                      currentLocation.lng
                    ).toFixed(6)}
                  </small>

                </Popup>

              </Marker>
            )}

            {/* COMBINED & NORMALIZED REPORT MARKERS */}
            {reports.map(
              (report) => (

                <Marker
                  key={`${report.source}-${report.id}`}
                  position={[
                    report.lat,
                    report.lng,
                  ]}
                  icon={
                    getMarkerIcon(
                      report.severity
                    )
                  }
                >

                  <Popup>

                    <div
                      className="report-popup"
                    >

                      <h3>
                        🚨{" "}
                        {
                          report.incidentType
                        }
                      </h3>

                      <p>
                        <strong>
                          Area:
                        </strong>{" "}
                        {
                          report.area ||
                          "-"
                        }
                      </p>

                      <p>
                        <strong>
                          District:
                        </strong>{" "}
                        {
                          report.district ||
                          "-"
                        }
                      </p>

                      <p>
                        <strong>
                          Location:
                        </strong>{" "}
                        {
                          report.locationName ||
                          "-"
                        }
                      </p>

                      <p>
                        <strong>
                          Severity:
                        </strong>{" "}
                        {
                          report.severity
                        }
                      </p>

                      <p>
                        <strong>
                          Status:
                        </strong>{" "}
                        {
                          report.status
                        }
                      </p>

                      <p>
                        <strong>
                          Reports:
                        </strong>{" "}
                        {
                          report.reportCount ||
                          1
                        }
                      </p>

                      <p>
                        <strong>
                          Confirmations:
                        </strong>{" "}
                        {
                          report.confirmationCount ||
                          0
                        }
                      </p>

                      <p>
                        <strong>
                          Not There:
                        </strong>{" "}
                        {
                          report.rejectionCount ||
                          0
                        }
                      </p>

                      <p>
                        <strong>
                          Description:
                        </strong>
                      </p>

                      <p>
                        {
                          report.description ||
                          "-"
                        }
                      </p>

                      {report.evidence.length > 0 && (

                        <div
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

                          <strong>
                            📎 Evidence:
                          </strong>{" "}

                          {
                            report.evidence.length
                          }{" "}
                          file(s)

                          <div
                            style={{
                              marginTop:
                                "8px",
                            }}
                          >

                            {report.evidence.map(
                              (
                                evidenceItem,
                                index
                              ) => {

                                const url =
                                  typeof evidenceItem ===
                                  "string"
                                    ? evidenceItem
                                    : evidenceItem?.url;

                                const type =
                                  typeof evidenceItem ===
                                  "object"
                                    ? evidenceItem?.type
                                    : "";

                                if (!url) {
                                  return null;
                                }

                                const isVideo =
                                  type?.startsWith(
                                    "video/"
                                  ) ||
                                  /\.(mp4|webm|mov|m4v)$/i.test(
                                    url
                                  );

                                return (
                                  <div
                                    key={`${report.id}-evidence-${index}`}
                                    style={{
                                      marginBottom:
                                        "8px",
                                    }}
                                  >

                                    {isVideo ? (
                                      <video
                                        src={url}
                                        controls
                                        style={{
                                          width:
                                            "100%",

                                          maxHeight:
                                            "180px",

                                          borderRadius:
                                            "8px",
                                        }}
                                      />
                                    ) : (
                                      <img
                                        src={url}
                                        alt={`Incident evidence ${
                                          index + 1
                                        }`}
                                        style={{
                                          width:
                                            "100%",

                                          maxHeight:
                                            "180px",

                                          objectFit:
                                            "cover",

                                          borderRadius:
                                            "8px",
                                        }}
                                      />
                                    )}

                                  </div>
                                );
                              }
                            )}

                          </div>

                        </div>
                      )}

                      {(report.reportCount || 1) > 1 && (

                        <div
                          style={{
                            padding:
                              "8px",

                            marginTop:
                              "8px",

                            marginBottom:
                              "8px",

                            borderRadius:
                              "7px",

                            background:
                              "#eef6ff",

                            border:
                              "1px solid #b8d8ff",
                          }}
                        >

                          🔗{" "}
                          <strong>
                            Multiple reports
                          </strong>

                          <br />

                          <small>
                            {
                              report.reportCount
                            }{" "}
                            users reported this
                            incident.
                          </small>

                        </div>
                      )}

                      <IncidentVerification
                        incident={
                          report
                        }
                        onUpdate={
                          () => {}
                        }
                      />

                      <hr />

                      <small>
                        Latitude:{" "}
                        {report.lat.toFixed(5)}
                      </small>

                      <br />

                      <small>
                        Longitude:{" "}
                        {report.lng.toFixed(5)}
                      </small>

                    </div>

                  </Popup>

                </Marker>

              )
            )}

            {/* SELECTED SEARCH / CLICK LOCATION */}
            {selectedLocation &&

              Number.isFinite(
                Number(
                  selectedLocation.lat
                )
              ) &&

              Number.isFinite(
                Number(
                  selectedLocation.lng
                )
              ) &&

              !(
                currentLocation &&

                Number(
                  selectedLocation.lat
                ) ===
                  Number(
                    currentLocation.lat
                  ) &&

                Number(
                  selectedLocation.lng
                ) ===
                  Number(
                    currentLocation.lng
                  )
              ) && (

                <Marker
                  position={[
                    Number(
                      selectedLocation.lat
                    ),
                    Number(
                      selectedLocation.lng
                    ),
                  ]}
                  icon={
                    blueIcon
                  }
                >

                  <Popup>

                    <div
                      className="selected-location-popup"
                    >

                      <strong>
                        📌 Selected Location
                      </strong>

                      <p>
                        {
                          selectedLocation.name ||
                          "Custom Point"
                        }
                      </p>

                      {selectedLocation.area && (
                        <>
                          <small>
                            Area:{" "}
                            {
                              selectedLocation.area
                            }
                          </small>

                          <br />
                        </>
                      )}

                      {selectedLocation.district && (
                        <small>
                          District:{" "}
                          {
                            selectedLocation.district
                          }
                        </small>
                      )}

                      <br />

                      <small>
                        {Number(
                          selectedLocation.lat
                        ).toFixed(6)}
                        {" , "}
                        {Number(
                          selectedLocation.lng
                        ).toFixed(6)}
                      </small>

                    </div>

                  </Popup>

                </Marker>

              )
            }

          </MapContainer>

          <div
            className="map-controls"
          >

            <MyLocationButton
              onLocationFound={
                handleMyLocation
              }
            />

            <SOSButton
              onSOS={
                handleSOS
              }
            />

          </div>

        </div>

        {!hideSidebar && (

          <div
            className="report-panel"
          >

            <ReportSidebar
              selectedLocation={
                selectedLocation
              }

              setSelectedLocation={
                setSelectedLocation
              }

              onSubmit={
                submitIncident
              }
            />

          </div>

        )}

      </div>

    </DashboardLayout>
  );
}
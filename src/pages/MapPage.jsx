import {
  useEffect,
  useState,
  useCallback,
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
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  increment,
  arrayUnion,
} from "firebase/firestore";

import {
  onAuthStateChanged,
} from "firebase/auth";

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

import ModerationReportButton from "../components/ModerationReportButton";
import { notify } from "../utils/notify";
import {
  redIcon,
  orangeIcon,
  greenIcon,
  blueIcon,
} from "../utils/markerIcons";

import "./MapPage.css";

import "../components/SOSButton.css";

import {
  findDuplicateIncident,
} from "../utils/duplicateDetection";


// =========================================================
// USER REPORT COUNTER
//
// Kept inside this file because your current
// moderationService.js does not export incrementTotalReports.
// =========================================================

async function incrementTotalReports(userId) {
  if (!userId) {
    return;
  }

  try {
    await updateDoc(
      doc(
        db,
        "users",
        userId
      ),
      {
        totalReports: increment(1),
        updatedAt: serverTimestamp(),
      }
    );

    console.log(
      "✅ Total reports updated:",
      userId
    );
  } catch (error) {
    console.error(
      "⚠️ Failed to update total reports:",
      error
    );

    throw error;
  }
}


// =========================================================
// MAP CLICK HANDLER
// =========================================================

function ClickHandler({
  onMapClick,
}) {
  useMapEvents({
    async click(event) {
      const lat =
        event.latlng.lat;

      const lng =
        event.latlng.lng;

      try {
        const response =
          await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            {
              headers: {
                Accept:
                  "application/json",
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
          address.city ||
          address.state ||
          "";

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
          name:
            "Clicked Location",
        });
      }
    },
  });

  return null;
}


// =========================================================
// MAP CONTROLLER
// =========================================================

function MapController({
  setMap,
}) {
  const map =
    useMap();

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


// =========================================================
// FLY TO LOCATION
// =========================================================

function FlyToLocation({
  location,
}) {
  const map =
    useMap();

  useEffect(() => {
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
      return;
    }

    map.flyTo(
      [
        lat,
        lng,
      ],
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


// =========================================================
// MAIN MAP PAGE
// =========================================================

export default function MapPage({
  hideSidebar = false,
}) {
  const navigate =
    useNavigate();


  // =======================================================
  // STATES
  // =======================================================

  const [
    selectedLocation,
    setSelectedLocation,
  ] = useState(null);

  const [
    currentLocation,
    setCurrentLocation,
  ] = useState(null);

  const [
    reports,
    setReports,
  ] = useState([]);

  const [
    myReports,
    setMyReports,
  ] = useState([]);

  const [
    communityReports,
    setCommunityReports,
  ] = useState([]);

  const [
    map,
    setMap,
  ] = useState(null);

  const [
    currentUser,
    setCurrentUser,
  ] = useState(
    auth.currentUser
  );


  // =======================================================
  // AUTH LISTENER
  // =======================================================

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (user) => {
          setCurrentUser(
            user
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, []);


  // =======================================================
  // LOAD FIRESTORE INCIDENTS + OLD REPORTS
  // =======================================================

  useEffect(() => {
    let incidentsData = [];

    let oldReportsData = [];


    const updateReports = () => {

      // ---------------------------------------------------
      // NORMALIZE INCIDENTS
      // ---------------------------------------------------

      const normalizedIncidents =
        incidentsData.map(
          (item) => ({
            ...item,

            id:
              item.id,

            source:
              "incident",

            status:
              item.status ||
              "Unverified",

            incidentType:
              item.incidentType ||
              item.dangerType ||
              "Road Incident",

            area:
              item.area ||
              "",

            district:
              item.district ||
              "",

            lat:
              Number(
                item.lat
              ),

            lng:
              Number(
                item.lng
              ),

            severity:
              item.severity ||
              "Medium",

            description:
              item.description ||
              "",

            locationName:
              item.locationName ||
              "",

            evidence:
              Array.isArray(
                item.evidence
              )
                ? item.evidence
                : [],

            userId:
              item.userId ||
              item.reporterId ||
              item.createdBy ||
              item.reportedBy ||
              "",

            reporterId:
              item.reporterId ||
              item.userId ||
              "",

            userEmail:
              item.reporterEmail ||
              item.userEmail ||
              "",

            reporterEmail:
              item.reporterEmail ||
              item.userEmail ||
              "",

            reportCount:
              Number(
                item.reportCount ||
                1
              ),

            confirmationCount:
              Number(
                item.confirmationCount ||
                0
              ),

            rejectionCount:
              Number(
                item.rejectionCount ||
                0
              ),

            confirmedBy:
              Array.isArray(
                item.confirmedBy
              )
                ? item.confirmedBy
                : [],

            rejectedBy:
              Array.isArray(
                item.rejectedBy
              )
                ? item.rejectedBy
                : [],

            verificationHistory:
              Array.isArray(
                item.verificationHistory
              )
                ? item.verificationHistory
                : [],

            relatedReports:
              Array.isArray(
                item.relatedReports
              )
                ? item.relatedReports
                : [],

            reputationProcessed:
              item.reputationProcessed === true,

            reputationResult:
              item.reputationResult ||
              null,
          })
        );


      // ---------------------------------------------------
      // NORMALIZE OLD REPORTS
      // ---------------------------------------------------

      const normalizedOldReports =
        oldReportsData.map(
          (item) => ({
            ...item,

            id:
              item.id,

            source:
              "report",

            status:
              item.status ||
              "Unverified",

            incidentType:
              item.incidentType ||
              item.dangerType ||
              "Road Incident",

            area:
              item.area ||
              "",

            district:
              item.district ||
              "",

            lat:
              Number(
                item.lat
              ),

            lng:
              Number(
                item.lng
              ),

            severity:
              item.severity ||
              "Medium",

            description:
              item.description ||
              "",

            locationName:
              item.locationName ||
              "",

            evidence:
              Array.isArray(
                item.evidence
              )
                ? item.evidence
                : [],

            userId:
              item.userId ||
              item.reporterId ||
              item.createdBy ||
              item.reportedBy ||
              "",

            reporterId:
              item.reporterId ||
              item.userId ||
              "",

            userEmail:
              item.reporterEmail ||
              item.userEmail ||
              "",

            reporterEmail:
              item.reporterEmail ||
              item.userEmail ||
              "",

            reportCount:
              Number(
                item.reportCount ||
                1
              ),

            confirmationCount:
              Number(
                item.confirmationCount ||
                0
              ),

            rejectionCount:
              Number(
                item.rejectionCount ||
                0
              ),

            confirmedBy:
              Array.isArray(
                item.confirmedBy
              )
                ? item.confirmedBy
                : [],

            rejectedBy:
              Array.isArray(
                item.rejectedBy
              )
                ? item.rejectedBy
                : [],
          })
        );


      // ---------------------------------------------------
      // COMBINE
      // ---------------------------------------------------

      const combined = [
        ...normalizedIncidents,
        ...normalizedOldReports,
      ];


      // ---------------------------------------------------
      // VALID COORDINATES
      // ---------------------------------------------------

      const validReports =
        combined.filter(
          (report) => (
            Number.isFinite(
              report.lat
            ) &&
            Number.isFinite(
              report.lng
            ) &&
            report.lat >= -90 &&
            report.lat <= 90 &&
            report.lng >= -180 &&
            report.lng <= 180
          )
        );


      // ---------------------------------------------------
      // UNIQUE BY SOURCE + ID
      // ---------------------------------------------------

      const uniqueReports = [];

      const seen =
        new Set();

      validReports.forEach(
        (report) => {
          const key =
            `${report.source}-${report.id}`;

          if (
            !seen.has(key)
          ) {
            seen.add(key);

            uniqueReports.push(
              report
            );
          }
        }
      );


      // ---------------------------------------------------
      // SET ALL REPORTS
      // ---------------------------------------------------

      setReports(
        uniqueReports
      );


      // ---------------------------------------------------
      // USER REPORTS
      // ---------------------------------------------------

      if (currentUser) {

        const mine =
          uniqueReports.filter(
            (report) =>
              report.userId ===
                currentUser.uid ||
              report.reporterId ===
                currentUser.uid
          );

        const community =
          uniqueReports.filter(
            (report) =>
              report.userId !==
                currentUser.uid &&
              report.reporterId !==
                currentUser.uid
          );

        setMyReports(
          mine
        );

        setCommunityReports(
          community
        );

      } else {

        setMyReports([]);

        setCommunityReports(
          uniqueReports
        );
      }
    };


    // =====================================================
    // INCIDENT LISTENER
    // =====================================================

    const unsubscribeIncidents =
      onSnapshot(
        collection(
          db,
          "incidents"
        ),

        (snapshot) => {
          incidentsData =
            snapshot.docs.map(
              (item) => ({
                id:
                  item.id,

                ...item.data(),
              })
            );

          updateReports();
        },

        (error) => {
          console.error(
            "Incidents listener error:",
            error
          );
        }
      );


    // =====================================================
    // OLD REPORT LISTENER
    // =====================================================

    const unsubscribeReports =
      onSnapshot(
        collection(
          db,
          "reports"
        ),

        (snapshot) => {
          oldReportsData =
            snapshot.docs.map(
              (item) => ({
                id:
                  item.id,

                ...item.data(),
              })
            );

          updateReports();
        },

        (error) => {
          console.error(
            "Reports listener error:",
            error
          );
        }
      );


    // =====================================================
    // CLEANUP
    // =====================================================

    return () => {
      unsubscribeIncidents();
      unsubscribeReports();
    };

  }, [
    currentUser,
  ]);


  // =======================================================
  // SUBMIT INCIDENT
  //
  // DUPLICATE DETECTION IS PERFORMED BEFORE addDoc().
  // =======================================================

  const submitIncident =
    useCallback(
      async (incident) => {

        const loggedUser =
          auth.currentUser;


        // -------------------------------------------------
        // LOGIN
        // -------------------------------------------------

        if (!loggedUser) {
          notify(
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


        // -------------------------------------------------
        // COORDINATES
        // -------------------------------------------------

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
          !Number.isFinite(
            latitude
          ) ||
          !Number.isFinite(
            longitude
          )
        ) {
          notify(
            "Invalid GPS coordinates."
          );

          return false;
        }


        // -------------------------------------------------
        // EVIDENCE FILES
        // -------------------------------------------------

        const evidenceFiles =
          Array.isArray(
            incident?.evidenceFiles
          )
            ? incident.evidenceFiles
            : [];


        if (
          evidenceFiles.length >
          5
        ) {
          notify(
            "Maximum 5 evidence files are allowed."
          );

          return false;
        }


        // -------------------------------------------------
        // REMOVE FILE OBJECTS
        // -------------------------------------------------

        const {
          evidenceFiles:
            ignoredEvidenceFiles,

          ...formData
        } =
          incident || {};

        void ignoredEvidenceFiles;


        // -------------------------------------------------
        // LOCATION NAME
        // -------------------------------------------------

        const locationName =
          incident?.locationName ||

          selectedLocation?.name ||

          `${incident?.area ||
            selectedLocation?.area ||
            ""}, ${
              incident?.district ||
              selectedLocation?.district ||
              ""
            }`
            .replace(
              /^,\s*|\s*,$/g,
              ""
            ) ||

          "Unknown Location";


        // -------------------------------------------------
        // INCIDENT TYPE
        // -------------------------------------------------

        const incidentType =
          incident?.incidentType ||
          incident?.dangerType ||
          "Road Incident";


        // -------------------------------------------------
        // NEW INCIDENT OBJECT
        // -------------------------------------------------

        const newIncident = {
          ...formData,

          incidentType,

          dangerType:
            incident?.dangerType ||
            incidentType,

          lat:
            latitude,

          lng:
            longitude,

          area:
            incident?.area ||
            selectedLocation?.area ||
            "",

          district:
            incident?.district ||
            selectedLocation?.district ||
            "",

          locationName,

          severity:
            incident?.severity ||
            "Medium",

          description:
            incident?.description ||
            "",


          // ---------------------------------------------
          // AUTHENTICATED USER
          // ---------------------------------------------

          userId:
            loggedUser.uid,

          reporterId:
            loggedUser.uid,

          reporterEmail:
            loggedUser.email ||
            "",

          reporterName:
            loggedUser.displayName ||
            loggedUser.email?.split(
              "@"
            )[0] ||
            "Unknown User",


          // ---------------------------------------------
          // STATUS
          // ---------------------------------------------

          status:
            "Unverified",

          verificationStatus:
            "pending",

          reputationProcessed:
            false,

          reputationResult:
            null,


          // ---------------------------------------------
          // COUNTERS
          // ---------------------------------------------

          reportCount:
            1,

          confirmationCount:
            0,

          rejectionCount:
            0,


          // ---------------------------------------------
          // VERIFICATION
          // ---------------------------------------------

          confirmedBy:
            [],

          rejectedBy:
            [],


          // ---------------------------------------------
          // EVIDENCE
          // ---------------------------------------------

          evidence:
            [],

          evidenceCount:
            evidenceFiles.length,


          // ---------------------------------------------
          // RELATIONSHIP
          // ---------------------------------------------

          relatedReports:
            [],

          verificationHistory:
            [],


          // ---------------------------------------------
          // TIMESTAMPS
          // ---------------------------------------------

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),

          communityConfirmedAt:
            null,

          verifiedAt:
            null,

          resolvedAt:
            null,
        };


        try {

          console.log(
            "🔎 Checking for duplicate incident..."
          );


          // =================================================
          // DUPLICATE DETECTION
          // =================================================

          const duplicate =
            findDuplicateIncident(
              newIncident,
              reports.filter(
                (report) =>
                  report.source ===
                  "incident"
              )
            );


          // =================================================
          // DUPLICATE FOUND
          // =================================================

          if (duplicate) {

            console.log(
              "⚠️ Duplicate incident detected:",
              duplicate.id
            );


            // ------------------------------------------------
            // PREVENT SAME USER DUPLICATE
            // ------------------------------------------------

            const alreadyReported =
              Array.isArray(
                duplicate.relatedReports
              ) &&
              duplicate.relatedReports.some(
                (item) =>
                  item?.userId ===
                  loggedUser.uid
              );


            if (
              duplicate.userId ===
                loggedUser.uid ||
              duplicate.reporterId ===
                loggedUser.uid ||
              alreadyReported
            ) {

              notify(
                "⚠️ You have already reported this incident.\n\n" +
                "Your report was not created again."
              );

              return false;
            }


            // ------------------------------------------------
            // RELATED REPORT
            // ------------------------------------------------

            const relatedReport = {
              userId:
                loggedUser.uid,

              reporterId:
                loggedUser.uid,

              reporterEmail:
                loggedUser.email ||
                "",

              reporterName:
                loggedUser.displayName ||
                loggedUser.email?.split(
                  "@"
                )[0] ||
                "Unknown User",

              description:
                newIncident.description ||
                "",

              lat:
                latitude,

              lng:
                longitude,

              reportedAt:
                new Date().toISOString(),
            };


            // ------------------------------------------------
            // UPDATE EXISTING INCIDENT
            // ------------------------------------------------

            await updateDoc(
              doc(
                db,
                "incidents",
                duplicate.id
              ),
              {
                reportCount:
                  increment(1),

                relatedReports:
                  arrayUnion(
                    relatedReport
                  ),

                updatedAt:
                  serverTimestamp(),
              }
            );


            // ------------------------------------------------
            // UPDATE REPUTATION
            // ------------------------------------------------

            try {

              await incrementTotalReports(
                loggedUser.uid
              );

            } catch (
              reputationError
            ) {

              console.error(
                "⚠️ Failed to update total reports for duplicate:",
                reputationError
              );
            }


            notify(
              "⚠️ Similar incident already exists.\n\n" +
              "Your report has been added to the existing incident instead of creating a duplicate.\n\n" +
              `Incident ID: ${duplicate.id}\n` +
              `Total reports: ${
                Number(
                  duplicate.reportCount ||
                  1
                ) + 1
              }`
            );


            return true;
          }


          // =================================================
          // NO DUPLICATE
          // =================================================

          console.log(
            "✅ No duplicate found."
          );

          console.log(
            "🚨 Creating NEW incident..."
          );


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


          console.log(
            "✅ Incident created:",
            incidentId
          );


          // =================================================
          // UPDATE TOTAL REPORTS
          // =================================================

          try {

            await incrementTotalReports(
              loggedUser.uid
            );

            console.log(
              "✅ Total reports updated for user:",
              loggedUser.uid
            );

          } catch (
            reputationError
          ) {

            console.error(
              "⚠️ Failed to update total reports:",
              reputationError
            );

            // Incident has already been created.
          }


          // =================================================
          // UPLOAD EVIDENCE
          // =================================================

          let uploadedEvidence =
            [];


          if (
            evidenceFiles.length >
            0
          ) {

            try {

              uploadedEvidence =
                await uploadEvidenceFiles(
                  evidenceFiles,
                  loggedUser.uid,
                  incidentId
                );


              if (
                uploadedEvidence.length >
                0
              ) {

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

            } catch (
              evidenceError
            ) {

              console.error(
                "Evidence upload error:",
                evidenceError
              );

              notify(
                "⚠️ Incident was created successfully, but evidence upload failed."
              );
            }
          }


          // =================================================
          // SUCCESS
          // =================================================

          notify(
            "✅ Incident submitted successfully!\n\n" +
            `Incident ID: ${incidentId}\n` +
            "Status: Unverified\n" +
            `Evidence uploaded: ${uploadedEvidence.length}`
          );


          return true;


        } catch (error) {

          console.error(
            "❌ INCIDENT SUBMISSION ERROR:",
            error
          );

          console.error(
            "Error code:",
            error?.code
          );

          console.error(
            "Error message:",
            error?.message
          );


          if (
            error?.code ===
            "permission-denied"
          ) {

            notify(
              "❌ Firestore permission denied.\n\n" +
              "Please make sure you are logged in and the latest Firestore rules have been published."
            );

          } else {

            notify(
              `❌ Failed to create incident.\n\n${
                error?.message ||
                "Unknown error"
              }`
            );
          }


          return false;
        }
      },

      [
        navigate,
        selectedLocation,
        reports,
      ]
    );


  // =======================================================
  // MARKER ICON
  // =======================================================

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


  // =======================================================
  // GPS
  // =======================================================

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


  // =======================================================
  // SOS
  // =======================================================

  const handleSOS =
    async () => {

      const loggedUser =
        auth.currentUser;


      if (!loggedUser) {

        notify(
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

        notify(
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
        !Number.isFinite(
          latitude
        ) ||
        !Number.isFinite(
          longitude
        )
      ) {

        notify(
          "Invalid location."
        );

        return;
      }


      const emergency = {

        lat:
          latitude,

        lng:
          longitude,

        area:
          selectedLocation.area ||
          "",

        district:
          selectedLocation.district ||
          "",

        locationName:
          selectedLocation.name ||
          "Unknown Location",

        userId:
          loggedUser.uid,

        userEmail:
          loggedUser.email ||
          "",

        userName:
          loggedUser.displayName ||
          loggedUser.email?.split(
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


        notify(
          "🚨 SOS Alert Sent Successfully!"
        );


      } catch (error) {

        console.error(
          "SOS Error:",
          error
        );

        notify(
          `Failed to send SOS.\n\n${
            error?.message ||
            "Unknown error"
          }`
        );
      }
    };


  // =======================================================
  // VERIFICATION UPDATE
  // =======================================================

  const handleVerificationUpdate =
    useCallback(
      (updatedIncident) => {

        if (
          !updatedIncident ||
          !updatedIncident.id
        ) {
          return;
        }


        setReports(
          (previousReports) =>
            previousReports.map(
              (report) => {

                if (
                  report.id ===
                    updatedIncident.id &&
                  report.source ===
                    "incident"
                ) {

                  return {
                    ...report,
                    ...updatedIncident,
                  };
                }

                return report;
              }
            )
        );


        setMyReports(
          (previousReports) =>
            previousReports.map(
              (report) => {

                if (
                  report.id ===
                    updatedIncident.id &&
                  report.source ===
                    "incident"
                ) {

                  return {
                    ...report,
                    ...updatedIncident,
                  };
                }

                return report;
              }
            )
        );


        setCommunityReports(
          (previousReports) =>
            previousReports.map(
              (report) => {

                if (
                  report.id ===
                    updatedIncident.id &&
                  report.source ===
                    "incident"
                ) {

                  return {
                    ...report,
                    ...updatedIncident,
                  };
                }

                return report;
              }
            )
        );
      },

      []
    );


  // =======================================================
  // RENDER
  // =======================================================

  return (
    <DashboardLayout>

      <div
        className={
          `page-layout ${
            hideSidebar
              ? "map-only-layout"
              : "report-layout"
          }`
        }
      >

        {/* =================================================
            MAP
        ================================================= */}

        <div
          className={
            `map-section ${
              hideSidebar
                ? "map-full-width"
                : ""
            }`
          }
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


            {/* =================================================
                CURRENT GPS MARKER
            ================================================= */}

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


            {/* =================================================
                INCIDENT MARKERS
            ================================================= */}

            {reports.map(
              (report) => (

                <Marker
                  key={
                    `${report.source}-${report.id}`
                  }

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

                  <Popup
                  className="incident-popup"
                  maxWidth={360}
                  minWidth={280}
                  autoPan={true}
                  autoPanPadding={[30, 30]}
                  >

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


                      {/* =================================================
                          EVIDENCE
                      ================================================= */}

                      {report.evidence?.length >
                        0 && (

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
                                    key={
                                      `${report.id}-evidence-${index}`
                                    }

                                    style={{
                                      marginBottom:
                                        "8px",
                                    }}
                                  >

                                    {isVideo ? (

                                      <video
                                        src={
                                          url
                                        }

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
                                        src={
                                          url
                                        }

                                        alt={
                                          `Incident evidence ${
                                            index + 1
                                          }`
                                        }

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


                      {/* =================================================
                          MULTIPLE REPORTS
                      ================================================= */}

                      {(report.reportCount || 1) >
                        1 && (

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


                      {/* =================================================
                          COMMUNITY VERIFICATION
                      ================================================= */}

                      {report.source ===
                        "incident" && (

                        <IncidentVerification
                          incident={
                            report
                          }

                          onUpdate={
                            handleVerificationUpdate
                          }
                        />

                      )}


                      {/* =================================================
                          MODERATION REPORT BUTTON
                          
                          Only actual incidents get this button.
                          Old "reports" documents do not.
                      ================================================= */}

                      {report.source ===
                        "incident" && (

                        <div
                          style={{
                            marginTop:
                              "12px",

                            paddingTop:
                              "10px",

                            borderTop:
                              "1px solid #eee",
                          }}
                        >

                          <ModerationReportButton
                            incidentId={
                              report.id
                            }
                          />

                        </div>

                      )}


                      <hr />


                      <small>
                        Latitude:{" "}
                        {report.lat.toFixed(
                          5
                        )}
                      </small>


                      <br />


                      <small>
                        Longitude:{" "}
                        {report.lng.toFixed(
                          5
                        )}
                      </small>

                    </div>

                  </Popup>

                </Marker>

              )
            )}


            {/* =================================================
                SELECTED LOCATION
            ================================================= */}

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


          {/* =================================================
              MAP CONTROLS
          ================================================= */}

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


        {/* =================================================
            REPORT SIDEBAR
        ================================================= */}

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


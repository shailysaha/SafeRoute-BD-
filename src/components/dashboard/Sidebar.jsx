import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import {
  FaHome,
  FaMapMarkedAlt,
  FaExclamationTriangle,
  FaUserShield,
  FaCog,
  FaShieldAlt,
  FaUser,
  FaFileAlt,
  FaTimes,
  FaRoute,
  FaBell,
  FaAmbulance,
  FaChartBar,
  FaUsers,
  FaRobot,
  FaBuilding,
  FaCar,
  FaUserTie,
  FaRoad,
  FaCarCrash,
  FaChartLine,
  FaCreditCard,
} from "react-icons/fa";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../../firebase/firebase";

import "./Sidebar.css";

function Sidebar({
  isOpen = false,
  onClose,
}) {
  const [userRole, setUserRole] = useState(null);
  const [accountType, setAccountType] = useState(null);
  const [checkingUser, setCheckingUser] = useState(true);

  // =========================================
  // LOAD CURRENT USER PROFILE
  // =========================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (!currentUser) {
          setUserRole(null);
          setAccountType(null);
          setCheckingUser(false);
          return;
        }

        try {
          const userRef = doc(
            db,
            "users",
            currentUser.uid
          );

          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const data = userSnap.data();

            setUserRole(data.role || "user");

            setAccountType(
              data.accountType || "user"
            );
          } else {
            setUserRole("user");
            setAccountType("user");
          }
        } catch (error) {
          console.error(
            "Sidebar user profile error:",
            error
          );

          setUserRole("user");
          setAccountType("user");
        } finally {
          setCheckingUser(false);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // =========================================
  // ACCESS TYPES
  // =========================================

  const isAdmin =
    userRole === "admin";

  const isCompanyAdmin =
    userRole === "company_admin" &&
    accountType === "company";

  const getLinkClass = ({
    isActive,
  }) => {
    return isActive ? "active" : "";
  };

  const closeSidebar = () => {
    if (typeof onClose === "function") {
      onClose();
    }
  };

  return (
    <>
      {/* =====================================
          MOBILE OVERLAY
      ====================================== */}

      <div
        className={`sidebar-overlay ${
          isOpen ? "show" : ""
        }`}
        onClick={closeSidebar}
      />

      {/* =====================================
          SIDEBAR
      ====================================== */}

      <aside
        className={`sidebar ${
          isOpen
            ? "sidebar-open"
            : ""
        }`}
      >
        {/* ===================================
            HEADER
        ==================================== */}

        <div className="sidebar-header">

          <div className="logo">
            <FaShieldAlt />

            <span>
              SafeRoute BD
            </span>
          </div>

          <button
            type="button"
            className="sidebar-close-btn"
            onClick={closeSidebar}
            aria-label="Close navigation"
          >
            <FaTimes />
          </button>

        </div>

        {/* ===================================
            NAVIGATION
        ==================================== */}

        <nav className="sidebar-nav">

          {/* HOME */}

          <NavLink
            to="/"
            end
            className={getLinkClass}
            onClick={closeSidebar}
          >
            <FaHome />
            <span>Home</span>
          </NavLink>

          {/* MAP */}

          <NavLink
            to="/map"
            className={getLinkClass}
            onClick={closeSidebar}
          >
            <FaMapMarkedAlt />
            <span>Map</span>
          </NavLink>

          {/* PLAN JOURNEY */}

          <NavLink
            to="/plan-journey"
            className={getLinkClass}
            onClick={closeSidebar}
          >
            <FaRoute />
            <span>Plan Journey</span>
          </NavLink>

          {/* AI ASSISTANT */}

          <NavLink
            to="/ai-assistant"
            className={getLinkClass}
            onClick={closeSidebar}
          >
            <FaRobot />
            <span>AI Assistant</span>
          </NavLink>

          {/* NOTIFICATIONS */}

          <NavLink
            to="/notifications"
            className={getLinkClass}
            onClick={closeSidebar}
          >
            <FaBell />
            <span>Notifications</span>
          </NavLink>

          {/* EMERGENCY */}

          <NavLink
            to="/emergency"
            className={getLinkClass}
            onClick={closeSidebar}
          >
            <FaAmbulance />
            <span>Emergency</span>
          </NavLink>

          {/* REPORT INCIDENT */}

          <NavLink
            to="/report-area"
            className={getLinkClass}
            onClick={closeSidebar}
          >
            <FaExclamationTriangle />
            <span>Report Incident</span>
          </NavLink>

          {/* COMMUNITY REPORTS */}

          <NavLink
            to="/community-reports"
            className={getLinkClass}
            onClick={closeSidebar}
          >
            <FaUsers />
            <span>Community Reports</span>
          </NavLink>

          {/* MY REPORTS */}

          <NavLink
            to="/my-reports"
            className={getLinkClass}
            onClick={closeSidebar}
          >
            <FaFileAlt />
            <span>My Reports</span>
          </NavLink>

          {/* PROFILE */}

          <NavLink
            to="/profile"
            className={getLinkClass}
            onClick={closeSidebar}
          >
            <FaUser />
            <span>My Profile</span>
          </NavLink>

          {/* FAMILY SAFETY */}

          <NavLink
            to="/family-safety"
            className={getLinkClass}
            onClick={closeSidebar}
          >
            <FaUsers />
            <span>Family Safety</span>
          </NavLink>

          {/* =================================
              COMPANY / FLEET SECTION
          ================================== */}

          {!checkingUser &&
            isCompanyAdmin && (
              <div className="sidebar-section">

                <div className="sidebar-section-title">
                  <FaBuilding />

                  <span>
                    Company
                  </span>
                </div>

                {/* DASHBOARD */}

                <NavLink
                  to="/fleet-dashboard"
                  className={getLinkClass}
                  onClick={closeSidebar}
                >
                  <FaBuilding />

                  <span>
                    Fleet Dashboard
                  </span>
                </NavLink>

                

                {/* SUBSCRIPTION */}

                <NavLink
                  to="/fleet-subscription"
                  className={getLinkClass}
                  onClick={closeSidebar}
                >
                  <FaCreditCard />

                  <span>
                    Subscription
                  </span>
                </NavLink>

              </div>
            )}

          {/* =================================
              ADMIN SECTION
          ================================== */}

          {!checkingUser &&
            isAdmin && (
              <div className="sidebar-section">

                <div className="sidebar-section-title">
                  <FaUserShield />

                  <span>
                    Administration
                  </span>
                </div>

                {/* ADMIN */}

                <NavLink
                  to="/admin"
                  className={getLinkClass}
                  onClick={closeSidebar}
                >
                  <FaUserShield />

                  <span>
                    Admin Dashboard
                  </span>
                </NavLink>

                {/* ANALYTICS */}

                <NavLink
                  to="/analytics"
                  className={getLinkClass}
                  onClick={closeSidebar}
                >
                  <FaChartBar />

                  <span>
                    Analytics
                  </span>
                </NavLink>

                {/* USERS */}

                <NavLink
                  to="/admin/users"
                  className={getLinkClass}
                  onClick={closeSidebar}
                >
                  <FaUsers />

                  <span>
                    User Management
                  </span>
                </NavLink>

              </div>
            )}

          {/* ABOUT */}

          <NavLink
            to="/about"
            className={getLinkClass}
            onClick={closeSidebar}
          >
            <FaCog />
            <span>About</span>
          </NavLink>

        </nav>
      </aside>
    </>
  );
}

export default Sidebar;

import { useState, useEffect } from "react";
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
  FaUsers as FaCommunity,
} from "react-icons/fa";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../../firebase/firebase";

import "./Sidebar.css";

function Sidebar({ isOpen = false, onClose }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setIsAdmin(false);
        return;
      }

      try {
        const userDocRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userDocRef);

        setIsAdmin(userSnap.exists() && userSnap.data()?.role === "admin");
      } catch (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const getLinkClass = ({ isActive }) => (isActive ? "active" : "");

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={`sidebar-overlay ${isOpen ? "show" : ""}`}
        onClick={onClose}
      />

      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        {/* Logo */}
        <div className="sidebar-header">
          <div className="logo">
            <FaShieldAlt />
            <span>SafeRoute BD</span>
          </div>

          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <FaTimes />
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {/* HOME */}
          <NavLink to="/" end className={getLinkClass} onClick={onClose}>
            <FaHome />
            <span>Home</span>
          </NavLink>

          {/* SAFETY MAP */}
          <NavLink to="/map" className={getLinkClass} onClick={onClose}>
            <FaMapMarkedAlt />
            <span>Map</span>
          </NavLink>

          {/* PLAN JOURNEY */}
          <NavLink
            to="/plan-journey"
            className={getLinkClass}
            onClick={onClose}
          >
            <FaRoute />
            <span>Plan Journey</span>
          </NavLink>

          {/* AI ASSISTANT */}
          <NavLink
            to="/ai-assistant"
            className={getLinkClass}
            onClick={onClose}
          >
            <FaRobot />
            <span>AI Assistant</span>
          </NavLink>

          {/* NOTIFICATIONS */}
          <NavLink
            to="/notifications"
            className={getLinkClass}
            onClick={onClose}
          >
            <FaBell />
            <span>Notifications</span>
          </NavLink>

          {/* EMERGENCY */}
          <NavLink to="/emergency" className={getLinkClass} onClick={onClose}>
            <FaAmbulance />
            <span>Emergency</span>
          </NavLink>

          {/* REPORT INCIDENT */}
          <NavLink
            to="/report-area"
            className={getLinkClass}
            onClick={onClose}
          >
            <FaExclamationTriangle />
            <span>Report Incident</span>
          </NavLink>

          {/* COMMUNITY REPORTS */}
          <NavLink
            to="/community-reports"
            className={getLinkClass}
            onClick={onClose}
          >
            <FaCommunity />
            <span>Community Reports</span>
          </NavLink>

          {/* MY REPORTS */}
          <NavLink to="/my-reports" className={getLinkClass} onClick={onClose}>
            <FaFileAlt />
            <span>My Reports</span>
          </NavLink>

          {/* PROFILE */}
          <NavLink to="/profile" className={getLinkClass} onClick={onClose}>
            <FaUser />
            <span>My Profile</span>
          </NavLink>

          {/* ADMIN & ANALYTICS */}
          {isAdmin && (
            <>
              <NavLink to="/admin" className={getLinkClass} onClick={onClose}>
                <FaUserShield />
                <span>Admin</span>
              </NavLink>

              <NavLink
                to="/analytics"
                className={getLinkClass}
                onClick={onClose}
              >
                <FaChartBar />
                <span>Analytics</span>
              </NavLink>

              <NavLink
                to="/admin/users"
                className={getLinkClass}
                onClick={onClose}
              >
                <FaUsers />
                <span>User Management</span>
              </NavLink>
            </>
          )}

          {/* ABOUT */}
          <NavLink to="/about" className={getLinkClass} onClick={onClose}>
            <FaCog />
            <span>About</span>
          </NavLink>
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;
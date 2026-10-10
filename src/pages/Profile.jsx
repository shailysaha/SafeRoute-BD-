import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../firebase/firebase";
import DashboardLayout from "../layout/DashboardLayout";
import { Link } from "react-router-dom";
import "./Profile.css";

function Profile() {
  const [profile, setProfile] = useState(null);
  const [companyData, setCompanyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (!currentUser) {
          setProfile(null);
          setCompanyData(null);
          setLoading(false);
          return;
        }

        try {
          // Fetch user document
          const userSnapshot = await getDoc(
            doc(db, "users", currentUser.uid)
          );

          const firestoreData = userSnapshot.exists()
            ? userSnapshot.data()
            : {};

          // ---------------------------------------------
          // REPUTATION DATA
          // ---------------------------------------------
          const reputation = firestoreData.reputation || {};

          // ---------------------------------------------
          // DETERMINE ROLE AND ACCOUNT TYPE
          // ---------------------------------------------
          const role = firestoreData.role || "user";
          const accountType = firestoreData.accountType || "individual";
          const isCompanyAdmin = role === "company_admin" && accountType === "company";
          const isSystemAdmin = role === "admin";

          // ---------------------------------------------
          // FETCH COMPANY DATA IF COMPANY ADMIN
          // ---------------------------------------------
          let companyInfo = null;
          if (isCompanyAdmin && firestoreData.companyId) {
            const companySnapshot = await getDoc(
              doc(db, "companies", firestoreData.companyId)
            );
            if (companySnapshot.exists()) {
              companyInfo = companySnapshot.data();
              setCompanyData(companyInfo);
            } else {
              console.warn("⚠️ Company document not found for ID:", firestoreData.companyId);
            }
          }

          // ---------------------------------------------
          // BUILD PROFILE
          // ---------------------------------------------
          setProfile({
            uid: currentUser.uid,
            name: firestoreData.name || currentUser.displayName || "SafeRoute User",
            fullName: firestoreData.fullName || firestoreData.name || "SafeRoute User",
            email: currentUser.email || "",
            role: role,
            accountType: accountType,
            isCompanyAdmin: isCompanyAdmin,
            isSystemAdmin: isSystemAdmin,
            companyId: firestoreData.companyId || null,
            emailVerified: currentUser.emailVerified,
            createdAt: firestoreData.createdAt || currentUser.metadata.creationTime || "",
            
            // Reputation
            reputation: {
              score: Number(reputation.score) || 50,
              totalReports: Number(reputation.totalReports) || 0,
              verifiedReports: Number(reputation.verifiedReports) || 0,
              falseReports: Number(reputation.falseReports) || 0,
              accuracyRate: Number(reputation.accuracyRate) || 0,
              level: reputation.level || "New Reporter",
            },
          });

        } catch (profileError) {
          console.error("Profile loading error:", profileError);
          setError("Unable to load your profile.");
        } finally {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // =====================================================
  // FORMAT DATE
  // =====================================================

  const formatDate = (dateValue) => {
    if (!dateValue) {
      return "Unavailable";
    }

    const date =
      typeof dateValue?.toDate === "function"
        ? dateValue.toDate()
        : new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "Unavailable";
    }

    return date.toLocaleString("en-BD", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // =====================================================
  // GET INITIALS
  // =====================================================

  const getInitials = (name) => {
    if (!name) {
      return "U";
    }

    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  };

  // =====================================================
  // SCORE COLOR / LABEL
  // =====================================================

  const getScoreClass = (score) => {
    if (score >= 80) return "reputation-score-high";
    if (score >= 60) return "reputation-score-medium";
    return "reputation-score-low";
  };

  // =====================================================
  // GET ROLE DISPLAY NAME
  // =====================================================

  const getRoleDisplay = (role, accountType) => {
    if (role === "admin") return "System Administrator";
    if (role === "company_admin" && accountType === "company") return "Company Administrator";
    if (role === "moderator") return "Community Moderator";
    return "Community User";
  };

  // =====================================================
  // GET ROLE CLASS
  // =====================================================

  const getRoleClass = (role, accountType) => {
    if (role === "admin") return "profile-role-admin";
    if (role === "company_admin" && accountType === "company") return "profile-role-company";
    if (role === "moderator") return "profile-role-moderator";
    return "profile-role-user";
  };

  // =====================================================
  // GET ACCOUNT TYPE DISPLAY
  // =====================================================

  const getAccountTypeDisplay = (accountType) => {
    if (accountType === "company") return "🏢 Company Account";
    return "👤 Individual Account";
  };

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <DashboardLayout>
        <div className="profile-message">Loading profile...</div>
      </DashboardLayout>
    );
  }

  // =====================================================
  // ERROR
  // =====================================================

  if (error) {
    return (
      <DashboardLayout>
        <div className="profile-message profile-error">{error}</div>
      </DashboardLayout>
    );
  }

  // =====================================================
  // NOT LOGGED IN
  // =====================================================

  if (!profile) {
    return (
      <DashboardLayout>
        <div className="profile-message">Please log in to view your profile.</div>
      </DashboardLayout>
    );
  }

  const {
    isCompanyAdmin,
    isSystemAdmin,
    role,
    accountType,
    companyId,
    reputation,
  } = profile;

  const score = reputation?.score || 0;

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <DashboardLayout>
      <main className="profile-page">

        {/* =================================================
            PROFILE HEADER
        ================================================= */}

        <section className="profile-header-card">

          <div className="profile-avatar">
            {getInitials(profile.name)}
          </div>

          <div className="profile-header-text">

            <span className="profile-label">
              {accountType === "company" ? "🏢 Company Account" : "👤 Individual Account"}
            </span>

            <h1>
              {profile.name}
            </h1>

            <p>
              {profile.email}
            </p>

            {isCompanyAdmin && companyData && (
              <p className="profile-company-name">
                <strong>Company:</strong> {companyData.companyName || companyData.name || "N/A"}
              </p>
            )}

          </div>

          <span
            className={`profile-role ${getRoleClass(role, accountType)}`}
          >
            {getRoleDisplay(role, accountType)}
          </span>

        </section>

        {/* =================================================
            COMPANY ADMIN - FLEET QUICK STATS
        ================================================= */}

        {isCompanyAdmin && companyData && (
          <section className="profile-company-card">

            <div className="profile-section-heading">

              <div>
                <h2>🏢 </h2>
                <p>Your company's fleet management summary</p>
              </div>

              <Link to="/fleet/dashboard" className="profile-fleet-link">
                Go to Fleet Dashboard →
              </Link>

            </div>

            <div className="company-stats-grid">

              <div className="company-stat">
                <span className="company-stat-icon">🏢</span>
                <div>
                  <small>Company Name</small>
                  <strong>{companyData.companyName || companyData.name || "N/A"}</strong>
                </div>
              </div>

              <div className="company-stat">
                <span className="company-stat-icon">📧</span>
                <div>
                  <small>Company Email</small>
                  <strong>{companyData.email || profile.email}</strong>
                </div>
              </div>

              {companyData.phone && (
                <div className="company-stat">
                  <span className="company-stat-icon">📞</span>
                  <div>
                    <small>Phone</small>
                    <strong>{companyData.phone}</strong>
                  </div>
                </div>
              )}

              {companyData.fleetSize !== undefined && (
                <div className="company-stat">
                  <span className="company-stat-icon">🚗</span>
                  <div>
                    <small>Fleet Size</small>
                    <strong>{companyData.fleetSize || 0} vehicles</strong>
                  </div>
                </div>
              )}

              <div className="company-stat">
                <span className="company-stat-icon">🆔</span>
                <div>
                  <small>Company ID</small>
                  <strong className="profile-uid">{companyId}</strong>
                </div>
              </div>

            </div>

            {/* Quick Actions */}
            <div className="company-quick-actions">
              <Link to="/fleet/vehicles" className="quick-action-btn">
                🚗 Manage Vehicles
              </Link>
              <Link to="/fleet/drivers" className="quick-action-btn">
                👤 Manage Drivers
              </Link>
              <Link to="/fleet/trips" className="quick-action-btn">
                📋 View Trips
              </Link>
              <Link to="/fleet/accidents" className="quick-action-btn">
                ⚠️ Incident Reports
              </Link>
            </div>

          </section>
        )}

        {/* =================================================
            REPUTATION / COMMUNITY SCORE
            Show for regular users only (not system admin or company admin)
        ================================================= */}

        {!isSystemAdmin && !isCompanyAdmin && (
          <section className="profile-reputation-card">

            <div className="profile-section-heading">

              <div>
                <h2>⭐ Reputation & Community Score</h2>
                <p>Your contribution and reliability within the SafeRoute BD community</p>
              </div>

              <span className={`reputation-level ${getScoreClass(score)}`}>
                {reputation.level}
              </span>

            </div>

            {/* SCORE */}
            <div className="reputation-score-container">

              <div className="reputation-score-circle">
                <strong>{score}</strong>
                <span>/ 100</span>
              </div>

              <div className="reputation-score-info">

                <h3>Community Trust Score</h3>

                <p>
                  Your score increases when your reports are verified and decreases
                  when reports are found to be false.
                </p>

                <div className="reputation-progress">
                  <div
                    className="reputation-progress-fill"
                    style={{
                      width: `${Math.min(100, Math.max(0, score))}%`,
                    }}
                  />
                </div>

              </div>

            </div>

            {/* STATISTICS */}
            <div className="reputation-stats-grid">

              <div className="reputation-stat">
                <span className="reputation-stat-icon">📊</span>
                <div>
                  <small>Total Reports</small>
                  <strong>{reputation.totalReports}</strong>
                </div>
              </div>

              <div className="reputation-stat">
                <span className="reputation-stat-icon">✅</span>
                <div>
                  <small>Verified Reports</small>
                  <strong>{reputation.verifiedReports}</strong>
                </div>
              </div>

              <div className="reputation-stat">
                <span className="reputation-stat-icon">❌</span>
                <div>
                  <small>False Reports</small>
                  <strong>{reputation.falseReports}</strong>
                </div>
              </div>

              <div className="reputation-stat">
                <span className="reputation-stat-icon">🎯</span>
                <div>
                  <small>Accuracy Rate</small>
                  <strong>{reputation.accuracyRate.toFixed(2)}%</strong>
                </div>
              </div>

            </div>

            {/* LEVEL INFORMATION */}
            <div className="reputation-level-info">
              <span>🏆</span>
              <div>
                <strong>Current Level: {reputation.level}</strong>
                <p>Keep submitting accurate reports to increase your community trust level.</p>
              </div>
            </div>

          </section>
        )}

        {/* =================================================
            PERSONAL INFORMATION
        ================================================= */}

        <section className="profile-details-card">

          <div className="profile-section-heading">

            <div>
              <h2>Personal Information</h2>
              <p>Your SafeRoute BD account information</p>
            </div>

          </div>

          <div className="profile-details-grid">

            {/* FULL NAME */}
            <div className="profile-detail">
              <span>👤</span>
              <div>
                <small>Full name</small>
                <strong>{profile.fullName || profile.name}</strong>
              </div>
            </div>

            {/* EMAIL */}
            <div className="profile-detail">
              <span>✉️</span>
              <div>
                <small>Email address</small>
                <strong>{profile.email}</strong>
              </div>
            </div>

            {/* ACCOUNT TYPE */}
            <div className="profile-detail">
              <span>{accountType === "company" ? "🏢" : "👤"}</span>
              <div>
                <small>Account type</small>
                <strong>{getAccountTypeDisplay(accountType)}</strong>
              </div>
            </div>

            {/* ROLE */}
            <div className="profile-detail">
              <span>🛡️</span>
              <div>
                <small>Account role</small>
                <strong>{getRoleDisplay(role, accountType)}</strong>
              </div>
            </div>

            {/* EMAIL STATUS */}
            <div className="profile-detail">
              <span>{profile.emailVerified ? "✅" : "⚠️"}</span>
              <div>
                <small>Email status</small>
                <strong>{profile.emailVerified ? "Verified" : "Not verified"}</strong>
              </div>
            </div>

            {/* ACCOUNT CREATED */}
            <div className="profile-detail">
              <span>📅</span>
              <div>
                <small>Account created</small>
                <strong>{formatDate(profile.createdAt)}</strong>
              </div>
            </div>

            {/* USER ID */}
            <div className="profile-detail">
              <span>🔑</span>
              <div>
                <small>User ID</small>
                <strong className="profile-uid">{profile.uid}</strong>
              </div>
            </div>

          </div>

        </section>

      </main>
    </DashboardLayout>
  );
}

export default Profile;
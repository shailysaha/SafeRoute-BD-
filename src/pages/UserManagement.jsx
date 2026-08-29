import { useEffect, useMemo, useState } from "react";

import {
  collection,
  onSnapshot,
} from "firebase/firestore";

import { db } from "../firebase/firebase";
import DashboardLayout from "../layout/DashboardLayout";

import "./UserManagement.css";

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [verifications, setVerifications] = useState([]);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortBy, setSortBy] = useState("reports");

  const [loading, setLoading] = useState(true);

  // ==========================================
  // LOAD USERS
  // ==========================================

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),

      (snapshot) => {
        const data = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        setUsers(data);
        setLoading(false);
      },

      (error) => {
        console.error("Users loading error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // ==========================================
  // LOAD INCIDENTS
  // ==========================================

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "incidents"),

      (snapshot) => {
        const data = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        setIncidents(data);
      },

      (error) => {
        console.error(
          "Incident loading error:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, []);

  // ==========================================
  // LOAD COMMUNITY VERIFICATIONS
  // ==========================================

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "incidentVerifications"),

      (snapshot) => {
        const data = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data(),
        }));

        setVerifications(data);
      },

      (error) => {
        console.error(
          "Verification loading error:",
          error
        );
      }
    );

    return () => unsubscribe();
  }, []);

  // ==========================================
  // USER ACTIVITY DATA
  // ==========================================

  const userActivity = useMemo(() => {
    return users.map((user) => {
      const reportCount = incidents.filter(
        (incident) =>
          incident.reporterId === user.id
      ).length;

      const verificationCount =
        verifications.filter(
          (verification) =>
            verification.userId === user.id
        ).length;

      const verifiedReports = incidents.filter(
        (incident) =>
          incident.reporterId === user.id &&
          incident.status === "Verified"
      ).length;

      const contributionScore =
        reportCount * 2 +
        verificationCount +
        verifiedReports * 2;

      return {
        ...user,
        reportCount,
        verificationCount,
        verifiedReports,
        contributionScore,
      };
    });
  }, [users, incidents, verifications]);

  // ==========================================
  // STATISTICS
  // ==========================================

  const totalUsers = users.length;

  const totalAdmins = users.filter(
    (user) => user.role === "admin"
  ).length;

  const totalRegularUsers = users.filter(
    (user) => user.role !== "admin"
  ).length;

  const activeContributors = userActivity.filter(
    (user) =>
      user.reportCount > 0 ||
      user.verificationCount > 0
  ).length;

  // ==========================================
  // SEARCH + FILTER + SORT
  // ==========================================

  const filteredUsers = useMemo(() => {
    let result = [...userActivity];

    const searchText = search
      .trim()
      .toLowerCase();

    if (searchText) {
      result = result.filter((user) => {
        const name =
          user.name ||
          user.displayName ||
          user.fullName ||
          "";

        const email = user.email || "";

        return (
          name
            .toLowerCase()
            .includes(searchText) ||
          email
            .toLowerCase()
            .includes(searchText)
        );
      });
    }

    if (roleFilter !== "all") {
      result = result.filter(
        (user) =>
          (user.role || "user") === roleFilter
      );
    }

    if (sortBy === "reports") {
      result.sort(
        (a, b) =>
          b.reportCount - a.reportCount
      );
    }

    if (sortBy === "verifications") {
      result.sort(
        (a, b) =>
          b.verificationCount -
          a.verificationCount
      );
    }

    if (sortBy === "contribution") {
      result.sort(
        (a, b) =>
          b.contributionScore -
          a.contributionScore
      );
    }

    if (sortBy === "name") {
      result.sort((a, b) => {
        const nameA =
          a.name ||
          a.displayName ||
          a.fullName ||
          a.email ||
          "";

        const nameB =
          b.name ||
          b.displayName ||
          b.fullName ||
          b.email ||
          "";

        return nameA.localeCompare(nameB);
      });
    }

    return result;
  }, [
    userActivity,
    search,
    roleFilter,
    sortBy,
  ]);

  // ==========================================
  // CONTRIBUTOR LEVEL
  // ==========================================

  const getContributorLevel = (score) => {
    if (score >= 20) {
      return {
        label: "Top Contributor",
        className: "top-contributor",
      };
    }

    if (score >= 10) {
      return {
        label: "Active",
        className: "active-contributor",
      };
    }

    if (score > 0) {
      return {
        label: "Contributor",
        className: "normal-contributor",
      };
    }

    return {
      label: "New User",
      className: "new-contributor",
    };
  };

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <DashboardLayout>
        <div className="user-management-loading">
          Loading SafeRoute BD users...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="user-management-page">

        {/* HEADER */}

        <div className="user-management-header">

          <div>
            <span className="user-management-label">
              ADMINISTRATION
            </span>

            <h1>👥 User Management</h1>

            <p>
              Monitor registered users and
              community participation across
              SafeRoute BD.
            </p>
          </div>

          <div className="users-live-badge">
            <span />
            Live Users
          </div>

        </div>

        {/* STATISTICS */}

        <div className="user-stat-grid">

          <div className="user-stat-card">
            <div className="user-stat-icon">
              👥
            </div>

            <div>
              <h2>{totalUsers}</h2>
              <p>Total Users</p>
            </div>
          </div>

          <div className="user-stat-card">
            <div className="user-stat-icon">
              👤
            </div>

            <div>
              <h2>{totalRegularUsers}</h2>
              <p>Regular Users</p>
            </div>
          </div>

          <div className="user-stat-card">
            <div className="user-stat-icon admin-icon">
              🛡
            </div>

            <div>
              <h2>{totalAdmins}</h2>
              <p>Administrators</p>
            </div>
          </div>

          <div className="user-stat-card">
            <div className="user-stat-icon active-icon">
              ⭐
            </div>

            <div>
              <h2>{activeContributors}</h2>
              <p>Active Contributors</p>
            </div>
          </div>

        </div>

        {/* FILTERS */}

        <div className="user-filter-panel">

          <div className="user-filter-heading">
            <div>
              <h2>Community Users</h2>

              <p>
                Search and analyze registered
                user activity.
              </p>
            </div>

            <span className="user-result-count">
              {filteredUsers.length} users
            </span>
          </div>

          <div className="user-toolbar">

            <input
              type="text"
              placeholder="🔍 Search name or email..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />

            <select
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(event.target.value)
              }
            >
              <option value="all">
                All Roles
              </option>

              <option value="user">
                Users
              </option>

              <option value="admin">
                Admins
              </option>
            </select>

            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(event.target.value)
              }
            >
              <option value="reports">
                Most Reports
              </option>

              <option value="verifications">
                Most Verifications
              </option>

              <option value="contribution">
                Contribution Score
              </option>

              <option value="name">
                Name
              </option>
            </select>

            <button
              type="button"
              className="user-clear-btn"
              onClick={() => {
                setSearch("");
                setRoleFilter("all");
                setSortBy("reports");
              }}
            >
              Clear
            </button>

          </div>

        </div>

        {/* USER TABLE */}

        <div className="user-table-wrapper">

          <table className="user-management-table">

            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Reports</th>
                <th>Verified Reports</th>
                <th>Verifications</th>
                <th>Score</th>
                <th>Community Status</th>
              </tr>
            </thead>

            <tbody>

              {filteredUsers.length > 0 ? (

                filteredUsers.map((user) => {
                  const contributor =
                    getContributorLevel(
                      user.contributionScore
                    );

                  const name =
                    user.name ||
                    user.displayName ||
                    user.fullName ||
                    "SafeRoute User";

                  return (
                    <tr key={user.id}>

                      <td>
                        <div className="user-profile-cell">

                          <div className="user-avatar">
                            {name
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>
                            <strong>
                              {name}
                            </strong>

                            <small>
                              {user.email ||
                                "No email"}
                            </small>
                          </div>

                        </div>
                      </td>

                      <td>
                        <span
                          className={`user-role ${
                            user.role === "admin"
                              ? "admin-role"
                              : "user-role"
                          }`}
                        >
                          {user.role === "admin"
                            ? "Admin"
                            : "User"}
                        </span>
                      </td>

                      <td>
                        {user.reportCount}
                      </td>

                      <td>
                        {user.verifiedReports}
                      </td>

                      <td>
                        {user.verificationCount}
                      </td>

                      <td>
                        <strong className="user-score">
                          {user.contributionScore}
                        </strong>
                      </td>

                      <td>
                        <span
                          className={`contributor-badge ${contributor.className}`}
                        >
                          {contributor.label}
                        </span>
                      </td>

                    </tr>
                  );
                })

              ) : (

                <tr>
                  <td
                    colSpan="7"
                    className="no-users"
                  >
                    <h3>No users found</h3>

                    <p>
                      Try changing your search
                      or filter.
                    </p>
                  </td>
                </tr>

              )}

            </tbody>

          </table>

        </div>

      </div>
    </DashboardLayout>
  );
}

export default UserManagement;
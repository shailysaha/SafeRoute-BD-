import "./Topbar.css";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  UserCircle,
  Menu,
} from "lucide-react";

function Topbar({ onMenuClick, unreadCount = 0 }) {
  const navigate = useNavigate();

  const handleNotifications = () => {
    navigate("/notifications");
  };

  const handleProfile = () => {
    navigate("/profile");
  };

  return (
    <header className="topbar">

      {/* =========================
          LEFT SIDE
      ========================== */}
      <div className="topbar-left">

        {/* Mobile Menu */}
        <button
          type="button"
          className="dashboard-menu-btn"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          title="Open menu"
        >
          <Menu size={23} strokeWidth={2.2} />
        </button>

      </div>

      {/* =========================
          RIGHT SIDE
      ========================== */}
      <div className="topbar-right">

        {/* =========================
            NOTIFICATION
        ========================== */}
        <button
          type="button"
          className="topbar-action"
          onClick={handleNotifications}
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell
            size={21}
            strokeWidth={2}
          />

          {/* Unread Badge */}
          {unreadCount > 0 && (
            <span className="notification-badge">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {/* =========================
            PROFILE
        ========================== */}
        <button
          type="button"
          className="topbar-profile"
          onClick={handleProfile}
          aria-label="Open profile"
          title="Profile"
        >
          <UserCircle
            size={29}
            strokeWidth={1.8}
          />
        </button>

      </div>

    </header>
  );
}

export default Topbar;

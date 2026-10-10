import { BrowserRouter, Routes, Route } from "react-router-dom";

// Context
import { NotificationProvider } from "./context/NotificationContext";

// Layout & Route Guards
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import SavedRouteMonitor from "./components/SavedRouteMonitor";
import FamilyChat from "./components/FamilyChat";

// Public Pages
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import About from "./pages/About";
import ExploreRoutes from "./pages/ExploreRoutes";
import MapPage from "./pages/MapPage";
import ReportIncident from "./pages/ReportIncident";
import AIAssistant from "./pages/AIAssistant";
import JourneyMonitor from "./pages/JourneyMonitor";
import AccidentAnalytics from "./pages/AccidentAnalytics";

// Protected Pages
import Reports from "./pages/Reports";
import MyReports from "./pages/MyReports";
import Profile from "./pages/Profile";
import PlanJourney from "./pages/PlanJourney";
import Notifications from "./pages/Notifications";
import Emergency from "./pages/Emergency";
import EmergencyTrack from "./pages/EmergencyTrack";
import MyJourneys from "./pages/MyJourneys";
import FamilySafety from "./pages/FamilySafety";

// ... existing imports ...

// Add these missing imports:
import OrganizationProfile from "./pages/OrganizationProfile"; // (Verify exact path)
import AdminOrganizations from "./pages/AdminOrganizations";   // (Verify exact path)


// Admin Pages
import Admin from "./pages/Admin";
import Analytics from "./pages/Analytics";
import UserManagement from "./pages/UserManagement";

function App() {
  return (
    <NotificationProvider>
      <BrowserRouter>
        <SavedRouteMonitor />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/about" element={<About />} />
          <Route path="/explore-routes" element={<ExploreRoutes />} />
          <Route path="/map" element={<MapPage hideSidebar={true} />} />
          <Route path="/report-incident" element={<ReportIncident />} />
          <Route path="/ai-assistant" element={<AIAssistant />} />
          <Route path="/journey-monitor" element={<JourneyMonitor />} />
          <Route path="/family-chat" element={<FamilyChat />} />
          <Route path="/accident-analytics" element={<AccidentAnalytics />} />

          {/* Protected Routes */}
          <Route
            path="/organization-profile"
            element={
              <ProtectedRoute>
               <OrganizationProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/report-area"
            element={
              <ProtectedRoute>
                <MapPage hideSidebar={false} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-reports"
            element={
              <ProtectedRoute>
                <MyReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/community-reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/plan-journey"
            element={
              <ProtectedRoute>
                <PlanJourney />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/emergency"
            element={
              <ProtectedRoute>
                <Emergency />
              </ProtectedRoute>
            }
          />
          <Route
            path="/emergency-track/:notificationId"
            element={
              <ProtectedRoute>
                <EmergencyTrack />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-journeys"
            element={
              <ProtectedRoute>
                <MyJourneys />
              </ProtectedRoute>
            }
          />
          <Route
            path="/family-safety"
            element={
              <ProtectedRoute>
                <FamilySafety />
              </ProtectedRoute>
            }
          />
         

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <AdminRoute>
                <Analytics />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/organizations"
            element={
             <AdminRoute>
               <AdminOrganizations />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <UserManagement />
              </AdminRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </NotificationProvider>
  );
}

export default App;
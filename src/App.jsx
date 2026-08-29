import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import MapPage from "./pages/MapPage";
import Reports from "./pages/Reports";
import About from "./pages/About";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Admin from "./pages/Admin";
import ExploreRoutes from "./pages/ExploreRoutes";
import Profile from "./pages/Profile";
import MyReports from "./pages/MyReports";
import ReportIncident from "./pages/ReportIncident";
import PlanJourney from "./pages/PlanJourney";
import Notifications from "./pages/Notifications";
import Emergency from "./pages/Emergency";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import EmergencyTrack from "./pages/EmergencyTrack";
import Analytics from "./pages/Analytics";
import MyJourneys from "./pages/MyJourneys";
import SavedRouteMonitor from "./components/SavedRouteMonitor";
import AIAssistant from "./pages/AIAssistant";
import UserManagement from "./pages/UserManagement";
function App() {
  return (
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
        {/* Protected Routes */}
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
          path="/admin/users"
          element={
            <AdminRoute>
              <UserManagement />
            </AdminRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
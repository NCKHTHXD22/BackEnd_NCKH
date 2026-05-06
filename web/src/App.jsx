import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', color: '#ef4444' }}>
          <h2>Lỗi hiển thị trang</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{String(this.state.error)}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}>
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import AdminLogin from "./page/admin/Login";
import AdminRegister from "./page/admin/Register";
import ForgotPassword from "./page/admin/ForgotPassword";
import AdminLayout from "./page/admin/Layout";
import Pending from "./page/admin/Pending";
import Approved from "./page/admin/Approved";
import Rejected from "./page/admin/Rejected";
import ManageUsers from "./page/admin/ManageUser";
import ManageAdmins from "./page/admin/ManageAdmin";
import ReportsPublic from "./page/Home/Reports";
import HomePage from "./page/Home/HomePage";
import SubmitReport from "./page/Home/SubmitReport";
import MyReports from "./page/Home/MyReport";
import AdminDashboard from "./page/admin/AdminDashboard";

function RequireAdmin({ children }) {
  const token = localStorage.getItem("adminToken");
  if (!token) return <Navigate to="/admin/login" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-gray-100">
        <div className="flex-1 flex flex-col">
          <Routes>
            {/* Admin auth pages (riêng, không dùng layout) */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/register" element={<AdminRegister />} />
            <Route path="/admin/forgot-password" element={<ForgotPassword />} />

            {/* Public routes — bản đồ tại root */}
            <Route path="/" element={<HomePage />} />
            <Route path="/reports" element={<ReportsPublic />} />
            <Route path="/submit" element={<SubmitReport />} />
            <Route path="/my-report" element={<MyReports />} />

            {/* Admin protected routes */}
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminLayout />
                </RequireAdmin>
              }
            >
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="pending" element={<Pending />} />
              <Route path="approved" element={<Approved />} />
              <Route path="rejected" element={<Rejected />} />
              <Route path="users" element={<ManageUsers />} />
              <Route path="admins" element={<ManageAdmins />} />
              {/* Mặc định vào pending */}
              <Route index element={<Navigate to="dashboard" replace />} />
            </Route>

            {/* 404 redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
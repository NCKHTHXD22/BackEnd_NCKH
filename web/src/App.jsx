import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import Footer from "./components/Admin/AdminPage/Footer"; // Thêm dòng này
import AdminDashboard from "./page/admin/AdminDashboard";

function RequireAdmin({ children }) {
  const token = localStorage.getItem("adminToken");
  if (!token) return <Navigate to="/admin/login" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-gray-100">
        <div className="flex-1 flex flex-col">
          <Routes>
            {/* Admin auth pages (riêng, không dùng layout) */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/register" element={<AdminRegister />} />
            <Route path="/admin/forgot-password" element={<ForgotPassword />} />

            {/* Public routes */}
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
    </BrowserRouter>
  );
}

export default App;
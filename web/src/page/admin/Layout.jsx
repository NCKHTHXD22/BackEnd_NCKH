import React, { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "../../components/Admin/AdminPage/Sidebar";
import Navbar from "../../components/Admin/AdminPage/Navbar";
import { removeAdminToken } from "../../services/auth";

export default function AdminLayout(){
  const nav = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const logout = () => { removeAdminToken(); nav("/admin/login"); };
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Flood Warning Admin" onLogout={logout} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "../../components/Admin/AdminPage/Sidebar";
import Navbar from "../../components/Admin/AdminPage/Navbar";
import { removeAdminToken } from "../../services/auth";

export default function AdminLayout(){
  const nav = useNavigate();
  const logout = () => { removeAdminToken(); nav("/admin/login"); };
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar title="Flood Warning Admin" onLogout={logout} />
        <main className="flex-1 p-6 overflow-y-auto bg-gray-100">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

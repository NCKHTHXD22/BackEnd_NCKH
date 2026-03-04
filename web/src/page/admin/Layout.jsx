import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "../../components/Admin/AdminPage/Sidebar";
import Navbar from "../../components/Admin/AdminPage/Navbar";
import { removeAdminToken } from "../../services/auth";

export default function AdminLayout(){
  const nav = useNavigate();
  const logout = () => { removeAdminToken(); nav("/admin/login"); };
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Navbar title="Flood Warning Admin" onLogout={logout} />
        <main className="p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import Footer from "./Footer";

export default function AdminLayout({ onLogout }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Navbar cố định */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <Navbar title="Flood Warning Admin" onLogout={onLogout} />
      </div>

      <div className="flex flex-1 min-h-0 pt-16"> 
        {/* 👆 chừa khoảng cho Navbar (cao 64px) */}
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <main className="flex-1 w-full p-6 overflow-auto bg-white">
            <Outlet />
          </main>
          <Footer />
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { NavLink } from "react-router-dom";
import {
  FaClock,
  FaCheckCircle,
  FaTimesCircle,
  FaUsers,
  FaUserShield,
  FaTachometerAlt
} from "react-icons/fa";

const link = (isActive) =>
  isActive
    ? "flex items-center gap-2 p-2 bg-gray-800 text-white rounded"
    : "flex items-center gap-2 p-2 text-gray-300 hover:bg-gray-700 rounded";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 border-r h-screen flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h3 className="font-bold text-xl text-gray-100">FloodWarning Admin</h3>
      </div>
        <nav className="flex flex-col gap-1 p-4 text-base font-normal normal-case flex-grow">
        <NavLink to="/admin/dashboard" end className={({ isActive }) => link(isActive)}>
          <FaTachometerAlt /> Trang chủ
        </NavLink>
        <NavLink to="/admin/pending" className={({ isActive }) => link(isActive)}>
          <FaClock /> Bài chờ
        </NavLink>
        <NavLink to="/admin/approved" className={({ isActive }) => link(isActive)}>
          <FaCheckCircle /> Đã duyệt
        </NavLink>
        <NavLink to="/admin/rejected" className={({ isActive }) => link(isActive)}>
          <FaTimesCircle /> Bị từ chối
        </NavLink>
        <NavLink to="/admin/users" className={({ isActive }) => link(isActive)}>
          <FaUsers /> Người dùng
        </NavLink>
        <NavLink to="/admin/admins" className={({ isActive }) => link(isActive)}>
          <FaUserShield /> Quản lý Admin
        </NavLink>
      </nav>
    </aside>
  );
}
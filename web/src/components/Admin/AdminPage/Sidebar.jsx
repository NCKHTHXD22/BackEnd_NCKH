import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  FaClock,
  FaCheckCircle,
  FaTimesCircle,
  FaUsers,
  FaUserShield,
  FaTachometerAlt,
  FaChevronDown,
  FaChevronRight,
  FaClipboardList,
  FaUsersCog
} from "react-icons/fa";

const link = (isActive) =>
  isActive
    ? "flex items-center gap-2 p-3 pl-8 bg-gray-800 text-white rounded-md transition-colors"
    : "flex items-center gap-2 p-3 pl-8 text-gray-300 hover:bg-gray-700 hover:text-white rounded-md transition-colors";

export default function Sidebar() {
  const [isReportsOpen, setIsReportsOpen] = useState(true);
  const [isAccountsOpen, setIsAccountsOpen] = useState(true);

  return (
    <aside className="w-64 bg-gray-900 border-r h-screen flex flex-col shadow-lg">
      <div className="p-4 border-b border-gray-800 flex items-center justify-center">
        <h3 className="font-bold text-xl text-gray-100 uppercase tracking-wider">FW Admin</h3>
      </div>
      <nav className="flex flex-col gap-2 p-4 text-sm font-medium flex-grow overflow-y-auto">

        {/* Dashboard / Home */}
        <NavLink to="/" end className="flex items-center gap-3 p-3 text-gray-300 hover:bg-gray-800 hover:text-white rounded-md transition-colors">
          <FaTachometerAlt className="text-lg" /> <span>Trang chủ</span>
        </NavLink>

        <NavLink to="/admin/dashboard" end className="flex items-center gap-3 p-3 text-gray-300 hover:bg-gray-800 hover:text-white rounded-md transition-colors mb-2">
          <FaTachometerAlt className="text-lg" /> <span>Thống kê Admin</span>
        </NavLink>

        {/* Group 1: Trạng thái người dùng (Báo cáo) */}
        <div className="flex flex-col">
          <button
            onClick={() => setIsReportsOpen(!isReportsOpen)}
            className="flex items-center justify-between p-3 text-gray-400 hover:text-gray-100 transition-colors uppercase text-xs tracking-wider"
          >
            <div className="flex items-center gap-2">
              <FaClipboardList />
              <span>Trạng thái người dùng</span>
            </div>
            {isReportsOpen ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
          </button>

          {isReportsOpen && (
            <div className="flex flex-col gap-1 mt-1">
              <NavLink to="/admin/pending" className={({ isActive }) => link(isActive)}>
                <FaClock /> Bài chờ
              </NavLink>
              <NavLink to="/admin/approved" className={({ isActive }) => link(isActive)}>
                <FaCheckCircle /> Đã duyệt
              </NavLink>
              <NavLink to="/admin/rejected" className={({ isActive }) => link(isActive)}>
                <FaTimesCircle /> Bị từ chối
              </NavLink>
            </div>
          )}
        </div>

        <div className="my-2 border-t border-gray-800"></div>

        {/* Group 2: Quản lý tài khoản */}
        <div className="flex flex-col">
          <button
            onClick={() => setIsAccountsOpen(!isAccountsOpen)}
            className="flex items-center justify-between p-3 text-gray-400 hover:text-gray-100 transition-colors uppercase text-xs tracking-wider"
          >
            <div className="flex items-center gap-2">
              <FaUsersCog />
              <span>Quản lý tài khoản</span>
            </div>
            {isAccountsOpen ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
          </button>

          {isAccountsOpen && (
            <div className="flex flex-col gap-1 mt-1">
              <NavLink to="/admin/users" className={({ isActive }) => link(isActive)}>
                <FaUsers /> Người dùng
              </NavLink>
              <NavLink to="/admin/admins" className={({ isActive }) => link(isActive)}>
                <FaUserShield /> Quản lý Admin
              </NavLink>
            </div>
          )}
        </div>

      </nav>
    </aside>
  );
}
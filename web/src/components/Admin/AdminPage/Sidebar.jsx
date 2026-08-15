import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  FaUsersCog,
} from "react-icons/fa";
import logoImg from "../../../assets/images/Logo_V1_transparent.png";

const link = (isActive) =>
  `flex items-center gap-3 rounded-xl p-3 pl-8 text-sm font-medium transition-all duration-200 ${
    isActive
      ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-900/30"
      : "text-slate-400 hover:bg-white/8 hover:text-white"
  }`;

const topLink = (isActive) =>
  `flex items-center gap-3 rounded-xl p-3 text-sm font-medium transition-all duration-200 group ${
    isActive
      ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-900/30"
      : "text-slate-400 hover:bg-white/8 hover:text-white"
  }`;

export default function Sidebar() {
  const [isReportsOpen, setIsReportsOpen] = useState(true);
  const [isAccountsOpen, setIsAccountsOpen] = useState(true);
  const { t } = useTranslation();

  return (
    <aside
      className="relative w-64 h-screen flex flex-col shrink-0 overflow-hidden bg-sidebar"
    >
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -top-12 -left-12 h-40 w-40 rounded-full bg-blue-600/10" />
      <div className="pointer-events-none absolute top-32 -right-8 h-24 w-24 rounded-full bg-cyan-500/5" />

      {/* Brand */}
      <div className="relative flex items-center gap-3 px-5 py-5 border-b border-white/8">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full overflow-hidden bg-white shadow-lg shadow-blue-900/40 ring-2 ring-white/15">
          <img src={logoImg} alt="Logo" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <h3 className="text-white text-sm font-bold leading-tight uppercase tracking-wider truncate">
            {t("sidebar.title")}
          </h3>
          <p className="text-blue-400/70 text-[11px] mt-0.5">Flood Warning System</p>
        </div>
      </div>

      <nav className="relative flex-1 flex flex-col gap-1 p-3 text-sm font-medium overflow-y-auto">
        <NavLink to="/" end className={({ isActive }) => topLink(isActive)}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 group-hover:bg-white/10">
            <FaTachometerAlt className="text-sm" />
          </span>
          <span>{t("sidebar.home")}</span>
        </NavLink>

        <NavLink to="/admin/dashboard" end className={({ isActive }) => topLink(isActive) + " mb-2"}>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 group-hover:bg-white/10">
            <FaTachometerAlt className="text-sm" />
          </span>
          <span>{t("sidebar.adminStats")}</span>
        </NavLink>

        <div className="flex flex-col">
          <button
            onClick={() => setIsReportsOpen(!isReportsOpen)}
            className="flex items-center justify-between rounded-xl p-3 text-white/40 hover:text-white/80 transition-colors uppercase text-[10px] font-bold tracking-widest"
          >
            <div className="flex items-center gap-2">
              <FaClipboardList />
              <span>{t("sidebar.userStatus")}</span>
            </div>
            {isReportsOpen ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
          </button>

          {isReportsOpen && (
            <div className="flex flex-col gap-1 mt-1">
              <NavLink to="/admin/pending" className={({ isActive }) => link(isActive)}>
                <FaClock /> {t("sidebar.pending")}
              </NavLink>
              <NavLink to="/admin/approved" className={({ isActive }) => link(isActive)}>
                <FaCheckCircle /> {t("sidebar.approved")}
              </NavLink>
              <NavLink to="/admin/rejected" className={({ isActive }) => link(isActive)}>
                <FaTimesCircle /> {t("sidebar.rejected")}
              </NavLink>
            </div>
          )}
        </div>

        <div className="my-3 mx-2 border-t border-white/8" />

        <div className="flex flex-col">
          <button
            onClick={() => setIsAccountsOpen(!isAccountsOpen)}
            className="flex items-center justify-between rounded-xl p-3 text-white/40 hover:text-white/80 transition-colors uppercase text-[10px] font-bold tracking-widest"
          >
            <div className="flex items-center gap-2">
              <FaUsersCog />
              <span>{t("sidebar.accountManagement")}</span>
            </div>
            {isAccountsOpen ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
          </button>

          {isAccountsOpen && (
            <div className="flex flex-col gap-1 mt-1">
              <NavLink to="/admin/users" className={({ isActive }) => link(isActive)}>
                <FaUsers /> {t("sidebar.users")}
              </NavLink>
              <NavLink to="/admin/admins" className={({ isActive }) => link(isActive)}>
                <FaUserShield /> {t("sidebar.admins")}
              </NavLink>
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}

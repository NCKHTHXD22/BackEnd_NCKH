import React, { useState } from 'react';
import { FaSearch, FaUserCircle, FaBars, FaTimes, FaCog, FaSignOutAlt } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { getAdminToken, removeAdminToken } from '../services/auth';
import logoImg from '../assets/images/logo.svg';

export default function NavbarPublic() {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const navigate = useNavigate();

    const isLoggedIn = !!getAdminToken();

    const handleLogout = () => {
        removeAdminToken();
        setIsDropdownOpen(false);
        navigate('/');
    };

    return (
        <div className="absolute top-0 left-0 w-full z-[1000] bg-[#2A4B7C] bg-opacity-95 text-white shadow-md flex items-center justify-between px-4 py-2">
            {/* Left: Logo & Title */}
            <div className="flex items-center gap-3">
                <img src={logoImg} alt="DSS Logo" className="w-10 h-10 object-contain" />
                <div className="hidden md:flex flex-col">
                    <h1 className="text-sm font-bold m-0 leading-tight">HỆ THỐNG HỖ TRỢ QUYẾT ĐỊNH</h1>
                    <p className="text-xs text-gray-300 m-0">DECISION SUPPORT SYSTEM (DSS)</p>
                </div>
            </div>

            {/* Center: Search Bar */}
            <div className="hidden md:flex flex-1 max-w-md mx-4">
                <div className="relative w-full">
                    <input
                        type="text"
                        placeholder="Tìm kiếm..."
                        className="w-full bg-[#1e3a63] text-white border border-gray-500 rounded-full py-1.5 px-4 pl-10 focus:outline-none focus:border-blue-400 text-sm h-8"
                    />
                    <FaSearch className="absolute left-3 top-2 text-gray-400 text-sm" />
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-4">
                {/* Mobile Menu Toggle */}
                <button
                    className="md:hidden text-gray-300 hover:text-white"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                >
                    {isMobileMenuOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
                </button>

                {isLoggedIn ? (
                    <div className="relative hidden md:block">
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="flex items-center gap-2.5 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 px-3 py-1.5 rounded-full transition-all duration-200 group"
                        >
                            {/* Avatar with initials */}
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-sm flex-shrink-0">
                                A
                            </div>
                            <span className="text-sm font-semibold text-white/90 group-hover:text-white truncate max-w-[100px]">
                                Admin
                            </span>
                            <svg
                                className={`w-3.5 h-3.5 text-white/60 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {/* Dropdown Menu */}
                        {isDropdownOpen && (
                            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-2xl py-2 text-gray-800 text-sm z-50 border border-gray-100 overflow-hidden">
                                {/* User info header */}
                                <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100 flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow">
                                        A
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-800 leading-tight">Admin User</p>
                                        <p className="text-[10px] text-gray-500">Quản trị viên hệ thống</p>
                                    </div>
                                </div>

                                <div className="py-1">
                                    <button
                                        onClick={() => navigate('/admin/dashboard')}
                                        className="flex items-center gap-2.5 w-full text-left px-4 py-2 hover:bg-blue-50 text-blue-700 font-semibold transition-colors"
                                    >
                                        <FaCog size={13} /> Quản trị hệ thống
                                    </button>
                                    <a href="#" className="flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 text-gray-700 transition-colors">
                                        <FaUserCircle size={13} /> Thông tin cá nhân
                                    </a>
                                </div>

                                <div className="border-t border-gray-100 mt-1 pt-1">
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center gap-2.5 w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 font-semibold transition-colors"
                                    >
                                        <FaSignOutAlt size={13} /> Đăng xuất
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => navigate('/admin/login')}
                        className="hidden md:flex items-center gap-2 bg-[#3A5B8C] hover:bg-[#4A6B9C] border border-gray-400 px-4 py-1.5 rounded-full text-sm transition-colors"
                    >
                        <FaUserCircle /> Đăng nhập
                    </button>
                )}
            </div>

            {/* Mobile Menu Dropdown */}
            {isMobileMenuOpen && (
                <div className="absolute top-full left-0 w-full bg-[#2A4B7C] border-t border-gray-600 md:hidden p-4 flex flex-col gap-4 shadow-xl">
                    <div className="relative w-full">
                        <input
                            type="text"
                            placeholder="Tìm kiếm..."
                            className="w-full bg-[#1e3a63] text-white border border-gray-500 rounded-full py-2 px-4 pl-10 focus:outline-none focus:border-blue-400 text-sm"
                        />
                        <FaSearch className="absolute left-3 top-3 text-gray-400" />
                    </div>

                    {isLoggedIn ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3 border-b border-gray-600 pb-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow">
                                    A
                                </div>
                                <div>
                                    <p className="font-bold">Admin User</p>
                                    <p className="text-xs text-gray-400">Quản trị viên</p>
                                </div>
                            </div>
                            <button onClick={() => navigate('/admin/dashboard')} className="py-2 text-left text-blue-300 font-semibold flex items-center gap-2"><FaCog size={13} /> Quản trị hệ thống</button>
                            <a href="#" className="py-2 hover:text-blue-300 flex items-center gap-2"><FaUserCircle size={13} /> Thông tin cá nhân</a>
                            <button onClick={handleLogout} className="py-2 text-left text-red-400 flex items-center gap-2 font-semibold"><FaSignOutAlt size={13} /> Đăng xuất</button>
                        </div>
                    ) : (
                        <button
                            onClick={() => navigate('/admin/login')}
                            className="flex items-center justify-center gap-2 bg-[#3A5B8C] py-2 rounded-md font-medium"
                        >
                            <FaUserCircle /> Đăng nhập
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

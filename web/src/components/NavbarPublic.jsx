import React, { useState } from 'react';
import { FaSearch, FaUserCircle, FaBars, FaTimes } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { getAdminToken, removeAdminToken } from '../services/auth';
import logoImg from '../assets/images/logo.svg';

export default function NavbarPublic() {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const navigate = useNavigate();

    // Check if user is logged in (using admin token for now based on current auth flow)
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
                    <div className="relative hidden md:flex">
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="flex items-center gap-2 text-sm hover:text-blue-300 transition-colors"
                        >
                            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden border border-gray-400">
                                <FaUserCircle className="text-gray-500 w-8 h-8" />
                            </div>
                            <span className="truncate max-w-[120px]">Admin_User</span>
                            <span className="text-[10px]">▼</span>
                        </button>

                        {/* Dropdown Menu */}
                        {isDropdownOpen && (
                            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-md shadow-lg py-1 text-gray-800 text-sm z-50 border border-gray-200">
                                <a href="#" className="block px-4 py-2 hover:bg-gray-100">Thông tin cá nhân</a>
                                <a href="#" className="block px-4 py-2 hover:bg-gray-100">Đổi mật khẩu</a>
                                <a href="#" className="block px-4 py-2 hover:bg-gray-100">Nhận bản tin cảnh báo</a>
                                <div className="border-t border-gray-200 my-1"></div>
                                <button
                                    onClick={() => navigate('/admin/dashboard')}
                                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-blue-600 font-medium"
                                >
                                    Quản trị
                                </button>
                                <a href="#" className="block px-4 py-2 hover:bg-gray-100">Dự báo hạn</a>
                                <div className="border-t border-gray-200 my-1"></div>
                                <button
                                    onClick={handleLogout}
                                    className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
                                >
                                    Đăng xuất
                                </button>
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
                            <div className="flex items-center gap-3 border-b border-gray-600 pb-2">
                                <FaUserCircle className="text-gray-300 w-8 h-8" />
                                <span className="font-medium">Admin_User</span>
                            </div>
                            <a href="#" className="py-2 hover:text-blue-300">Thông tin cá nhân</a>
                            <a href="#" className="py-2 hover:text-blue-300">Đổi mật khẩu</a>
                            <a href="#" className="py-2 hover:text-blue-300">Nhận bản tin cảnh báo</a>
                            <button onClick={() => navigate('/admin/dashboard')} className="py-2 text-left text-blue-300 font-medium font-bold">Quản trị</button>
                            <button onClick={handleLogout} className="py-2 text-left text-red-400">Đăng xuất</button>
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

import React, { useState } from 'react';
import { FaSearch, FaUserCircle, FaBars, FaTimes, FaCog, FaSignOutAlt } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAdminToken, removeAdminToken } from '../services/auth';
import logoImg from '../assets/images/Logo_V1_transparent.png';

function LangToggle() {
    const { i18n } = useTranslation();
    const current = i18n.language;
    const toggle = () => {
        const next = current === 'vi' ? 'en' : 'vi';
        i18n.changeLanguage(next);
        localStorage.setItem('lang', next);
    };
    return (
        <button
            onClick={toggle}
            className="hidden md:flex items-center gap-1 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-200"
            title="Switch language"
        >
            <span className={current === 'vi' ? 'text-white' : 'text-white/50'}>VI</span>
            <span className="text-white/30">|</span>
            <span className={current === 'en' ? 'text-white' : 'text-white/50'}>EN</span>
        </button>
    );
}

export default function NavbarPublic() {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const isLoggedIn = !!getAdminToken();

    const handleLogout = () => {
        removeAdminToken();
        setIsDropdownOpen(false);
        navigate('/');
    };

    const toggleLang = () => {
        const next = i18n.language === 'vi' ? 'en' : 'vi';
        i18n.changeLanguage(next);
        localStorage.setItem('lang', next);
    };

    return (
        <div className="relative top-0 left-0 w-full z-[1600] text-white shadow-lg flex items-center justify-between px-4 py-2 bg-header">
            {/* Decorative blobs (clipped to header only, doesn't affect dropdowns below) */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-white/5" />
                <div className="absolute bottom-0 right-24 h-16 w-16 rounded-full bg-cyan-400/10" />
            </div>

            {/* Left: Logo & Title */}
            <div className="relative flex items-center gap-3">
                <img src={logoImg} alt="DSS Logo" className="w-10 h-10 object-contain" />
                <div className="hidden md:flex flex-col">
                    <h1 className="text-sm font-bold m-0 leading-tight">{t('navbar.title')}</h1>
                    <p className="text-xs text-blue-100/70 m-0">{t('navbar.subtitle')}</p>
                </div>
            </div>

            {/* Center: Search Bar */}
            <div className="relative hidden md:flex flex-1 max-w-md mx-4">
                <div className="relative w-full">
                    <input
                        type="text"
                        placeholder={t('navbar.search')}
                        className="w-full bg-white text-slate-700 border border-white/60 rounded-full py-1.5 px-4 pl-10 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/60 text-sm h-9 shadow-sm transition-all"
                    />
                    <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                </div>
            </div>

            {/* Right: Actions */}
            <div className="relative flex items-center gap-3">
                {/* Language Toggle */}
                <LangToggle />

                {/* Mobile Menu Toggle */}
                <button
                    className="md:hidden text-white/80 hover:text-white"
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

                        {isDropdownOpen && (
                            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-2xl py-2 text-gray-800 text-sm z-50 border border-gray-100 overflow-hidden">
                                <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-100 flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow">
                                        A
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-800 leading-tight">Admin User</p>
                                        <p className="text-[10px] text-gray-500">{t('navbar.adminRole')}</p>
                                    </div>
                                </div>

                                <div className="py-1">
                                    <button
                                        onClick={() => navigate('/admin/dashboard')}
                                        className="flex items-center gap-2.5 w-full text-left px-4 py-2 hover:bg-blue-50 text-blue-700 font-semibold transition-colors"
                                    >
                                        <FaCog size={13} /> {t('navbar.manageSystem')}
                                    </button>
                                    <a href="#" className="flex items-center gap-2.5 px-4 py-2 hover:bg-gray-50 text-gray-700 transition-colors">
                                        <FaUserCircle size={13} /> {t('navbar.profile')}
                                    </a>
                                </div>

                                <div className="border-t border-gray-100 mt-1 pt-1">
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center gap-2.5 w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 font-semibold transition-colors"
                                    >
                                        <FaSignOutAlt size={13} /> {t('navbar.logout')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => navigate('/admin/login')}
                        className="hidden md:flex items-center gap-2 bg-white text-blue-700 hover:bg-blue-50 border border-white/60 px-4 py-1.5 rounded-full text-sm font-semibold shadow-sm transition-all"
                    >
                        <FaUserCircle /> {t('navbar.login')}
                    </button>
                )}
            </div>

            {/* Mobile Menu Dropdown */}
            {isMobileMenuOpen && (
                <div className="absolute top-full left-0 w-full border-t border-white/15 md:hidden p-4 flex flex-col gap-4 shadow-xl z-[1500] bg-header max-h-[calc(100vh-56px)] overflow-y-auto">
                    <div className="relative w-full">
                        <input
                            type="text"
                            placeholder={t('navbar.search')}
                            className="w-full bg-white text-slate-700 border border-white/60 rounded-full py-2 px-4 pl-10 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/60 text-sm shadow-sm"
                        />
                        <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>

                    {/* Mobile Lang Toggle */}
                    <button
                        onClick={toggleLang}
                        className="flex items-center gap-1 bg-white/10 border border-white/20 px-3 py-1.5 rounded-full text-xs font-bold w-fit"
                    >
                        <span className={i18n.language === 'vi' ? 'text-white' : 'text-white/50'}>VI</span>
                        <span className="text-white/30">|</span>
                        <span className={i18n.language === 'en' ? 'text-white' : 'text-white/50'}>EN</span>
                    </button>

                    {isLoggedIn ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-3 border-b border-white/15 pb-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow">
                                    A
                                </div>
                                <div>
                                    <p className="font-bold">Admin User</p>
                                    <p className="text-xs text-blue-100/70">{t('navbar.adminRole')}</p>
                                </div>
                            </div>
                            <button onClick={() => navigate('/admin/dashboard')} className="py-2 text-left text-white font-semibold flex items-center gap-2"><FaCog size={13} /> {t('navbar.manageSystem')}</button>
                            <a href="#" className="py-2 text-white/80 hover:text-white flex items-center gap-2"><FaUserCircle size={13} /> {t('navbar.profile')}</a>
                            <button onClick={handleLogout} className="py-2 text-left text-red-300 flex items-center gap-2 font-semibold"><FaSignOutAlt size={13} /> {t('navbar.logout')}</button>
                        </div>
                    ) : (
                        <button
                            onClick={() => navigate('/admin/login')}
                            className="flex items-center justify-center gap-2 bg-white text-blue-700 border border-white/60 py-2 rounded-full font-semibold shadow-sm"
                        >
                            <FaUserCircle /> {t('navbar.login')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

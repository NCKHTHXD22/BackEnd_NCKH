import { FaBell, FaSignOutAlt, FaSearch, FaBars } from "react-icons/fa";
import { useTranslation } from "react-i18next";

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
            className="flex items-center gap-1 bg-white/15 hover:bg-white/22 border border-white/20 px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-200"
            title="Switch language"
        >
            <span className={current === 'vi' ? 'text-white' : 'text-white/50'}>VI</span>
            <span className="text-white/30">|</span>
            <span className={current === 'en' ? 'text-white' : 'text-white/50'}>EN</span>
        </button>
    );
}

export default function Navbar({ title, onLogout, onMenuClick }) {
    const { t } = useTranslation();

    return (
        <header className="relative sticky top-0 z-20 shrink-0 overflow-hidden shadow-md bg-header">
            {/* Decorative blobs */}
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute bottom-0 right-32 h-20 w-20 rounded-full bg-cyan-400/10" />

            <div className="relative p-3 flex justify-between items-center gap-2">
                {/* Menu toggle (mobile) + Title */}
                <div className="flex items-center gap-2 px-1 sm:px-4 min-w-0">
                    <button
                        onClick={onMenuClick}
                        className="lg:hidden shrink-0 text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        title="Menu"
                    >
                        <FaBars size={18} />
                    </button>
                    <span className="text-sm sm:text-base font-semibold text-white truncate">{title || t('adminNavbar.title')}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 sm:gap-4 px-1 sm:px-4 shrink-0">
                    {/* Search bar */}
                    <div className="relative hidden sm:block">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 text-sm" />
                        <input
                            type="text"
                            placeholder={t('adminNavbar.search')}
                            className="pl-9 pr-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:bg-white/22 focus:border-white/40 text-sm w-48 sm:w-64 transition-all"
                        />
                    </div>

                    {/* Language Toggle */}
                    <LangToggle />

                    {/* Notifications */}
                    <button className="text-white/80 hover:text-white text-lg transition-colors" title="Thông báo">
                        <FaBell />
                    </button>

                    {/* Logout */}
                    <button
                        onClick={onLogout}
                        className="flex items-center gap-2 bg-white/15 hover:bg-white/22 border border-white/20 px-2.5 sm:px-3 py-1.5 rounded-full text-white text-sm font-semibold transition-all"
                        title={t('adminNavbar.logout')}
                    >
                        <FaSignOutAlt />
                        <span className="hidden sm:inline">{t('adminNavbar.logout')}</span>
                    </button>
                </div>
            </div>
        </header>
    );
}

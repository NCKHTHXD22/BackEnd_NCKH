import { FaBell, FaSignOutAlt, FaSearch } from "react-icons/fa";
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
      className="flex items-center gap-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-200"
      title="Switch language"
    >
      <span className={current === 'vi' ? 'text-white' : 'text-gray-500'}>VI</span>
      <span className="text-gray-600">|</span>
      <span className={current === 'en' ? 'text-white' : 'text-gray-500'}>EN</span>
    </button>
  );
}

export default function Navbar({ title, onLogout }) {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-20 bg-gray-900 dark:bg-gray-800 border-b border-gray-700 p-3 flex justify-between items-center shadow-sm shrink-0">
      {/* Logo / Title */}
      <div className="flex items-center gap-2 px-4">
        <span className="text-base text-gray-200">{title || t('adminNavbar.title')}</span>
        <span className="text-gray-400 text-xl ml-2">&#8801;</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 px-4">
        {/* Search bar */}
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" />
          <input
            type="text"
            placeholder={t('adminNavbar.search')}
            className="pl-9 pr-3 py-1.5 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-48 sm:w-64 transition"
          />
        </div>

        {/* Language Toggle */}
        <LangToggle />

        {/* Notifications */}
        <FaBell className="text-gray-300 dark:text-gray-400 text-lg cursor-pointer hover:text-yellow-400 transition" />

        {/* Logout */}
        <button
          onClick={onLogout}
          className="text-gray-300 dark:text-gray-400 hover:text-red-500 text-lg transition"
          title={t('adminNavbar.logout')}
        >
          <FaSignOutAlt />
        </button>
      </div>
    </header>
  );
}

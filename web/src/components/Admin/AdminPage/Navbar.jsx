import { FaBell, FaSignOutAlt, FaSearch } from "react-icons/fa";

export default function Navbar({ title = "Flood Warning Admin", onLogout }) {
  return (
    <header className="sticky top-0 z-20 bg-gray-900 dark:bg-gray-800 border-b border-gray-700 p-3 flex justify-between items-center shadow-sm shrink-0">
      {/* Logo / Title */}
      <div className="flex items-center gap-2 px-4">
        <span className="text-base text-gray-200">{title}</span>
        <span className="text-gray-400 text-xl ml-2">&#8801;</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 px-4">
        {/* Search bar */}
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" />
          <input
            type="text"
            placeholder="Tìm kiếm..."
            className="pl-9 pr-3 py-1.5 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-48 sm:w-64 transition"
          />
        </div>

        {/* Notifications */}
        <FaBell className="text-gray-300 dark:text-gray-400 text-lg cursor-pointer hover:text-yellow-400 transition" />

        {/* Logout */}
        <button
          onClick={onLogout}
          className="text-gray-300 dark:text-gray-400 hover:text-red-500 text-lg transition"
          title="Đăng xuất"
        >
          <FaSignOutAlt />
        </button>
      </div>
    </header>
  );
}

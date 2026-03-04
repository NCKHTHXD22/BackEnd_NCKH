import React, { useState, useMemo } from "react";

export default function DataTableUser({ data = [], onToggleRole, onToggleBan }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10; // số user mỗi trang

  // Lọc theo tên hoặc email
  const filteredData = useMemo(() => {
    return data.filter(
      (u) =>
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase())
    );
  }, [data, search]);

  // Tính tổng số trang
  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;

  // Lấy dữ liệu theo trang
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, page]);

  return (
    <div className="bg-white rounded-xl shadow-md w-full h-full p-4">
      {/* Search box */}
      <div className="flex justify-between items-center mb-4">
        <div className="relative w-1/3">
          <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">🔍</span>
          <input
            type="text"
            placeholder="Tìm theo tên hoặc email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1); // reset về trang 1 khi search
            }}
            className="bg-white border border-gray-300 pl-9 pr-3 py-2 rounded-md w-full focus:ring-2 focus:ring-blue-400 outline-none"
          />
        </div>
        <span className="text-sm text-gray-600">
          Tổng: <b>{filteredData.length}</b> người dùng
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto w-full">
        <table className="w-full border-collapse text-center text-sm">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="border px-3 py-2 w-[25%]">Tên</th>
              <th className="border px-3 py-2 w-[25%]">Email</th>
              <th className="border px-3 py-2 w-[15%]">Chức danh</th>
              <th className="border px-3 py-2 w-[15%]">Trạng thái</th>
              <th className="border px-3 py-2 w-[20%]">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((u) => (
                <tr key={u._id} className="hover:bg-gray-50 transition">
                  <td className="border px-3 py-2">{u.name || "-"}</td>
                  <td className="border px-3 py-2">{u.email || "-"}</td>
                  <td className="border px-3 py-2 capitalize">{u.role}</td>
                  <td className="border px-3 py-2">
                    <span className="flex items-center justify-center">
                      <span
                        className={`inline-block w-3 h-3 mr-2 rounded-full ${
                          u.status === "active" ? "bg-green-500" : "bg-red-500"
                        }`}
                      ></span>
                      {u.status}
                    </span>
                  </td>
                  <td className="border px-3 py-2 space-x-2">
                    <button
                      className="px-3 py-1 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition"
                      onClick={() => onToggleRole && onToggleRole(u._id, u.role)}
                    >
                      {u.role === "admin" ? "Giảm quyền" : "Nâng quyền"}
                    </button>
                    <button
                      className={`px-3 py-1 rounded-md text-white transition ${
                        u.status === "active"
                          ? "bg-red-500 hover:bg-red-600"
                          : "bg-green-500 hover:bg-green-600"
                      }`}
                      onClick={() => onToggleBan && onToggleBan(u._id, u.status)}
                    >
                      {u.status === "active" ? "Khóa" : "Mở"}
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="text-center py-4 text-gray-500">
                  Không có dữ liệu
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-center items-center mt-5 gap-2">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={`px-3 py-1 border transition ${
              p === page
                ? "bg-blue-500 text-white border-blue-500"
                : "bg-white hover:bg-blue-100"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

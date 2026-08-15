import React, { useState, useMemo } from "react";
import { Search, Users, Pencil, Trash2 } from "lucide-react";

export default function DataTableUser({ data = [], onToggleRole, onToggleBan, onEdit, onDelete }) {
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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 w-full h-full p-5">
      {/* Search box */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div className="relative w-full sm:w-1/3">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1); // reset về trang 1 khi search
            }}
            className="bg-slate-50 border border-slate-200 pl-9 pr-3 py-2 rounded-xl w-full focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 focus:bg-white outline-none transition-all text-sm"
          />
        </div>
        <span className="text-sm text-slate-500">
          Tổng: <b className="text-slate-700">{filteredData.length}</b> người dùng
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left font-bold rounded-l-lg">Tên</th>
              <th className="px-3 py-2.5 text-left font-bold">Email</th>
              <th className="px-3 py-2.5 text-left font-bold">Chức danh</th>
              <th className="px-3 py-2.5 text-left font-bold">Trạng thái</th>
              <th className="px-3 py-2.5 text-center font-bold rounded-r-lg">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {paginatedData.length > 0 ? (
              paginatedData.map((u) => (
                <tr key={u._id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-3 py-3 font-semibold text-slate-700">{u.name || "-"}</td>
                  <td className="px-3 py-3 text-slate-500">{u.email || "-"}</td>
                  <td className="px-3 py-3 capitalize text-slate-600">{u.role}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        u.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${u.status === "active" ? "bg-emerald-500" : "bg-red-500"}`} />
                      {u.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-stretch gap-1.5 min-w-[190px]">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          className="flex-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors text-xs font-bold"
                          onClick={() => onToggleRole && onToggleRole(u._id, u.role)}
                        >
                          {u.role === "admin" ? "Giảm quyền" : "Nâng quyền"}
                        </button>
                        <button
                          className={`flex-1 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold ${
                            u.status === "active"
                              ? "bg-red-50 hover:bg-red-100 text-red-600"
                              : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                          }`}
                          onClick={() => onToggleBan && onToggleBan(u._id, u.status)}
                        >
                          {u.status === "active" ? "Khóa" : "Mở"}
                        </button>
                      </div>
                      <div className="flex items-center justify-center gap-1.5">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(u)}
                            className="flex-1 flex items-center justify-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 py-1.5 rounded-lg transition-colors text-xs font-bold"
                          >
                            <Pencil size={12} /> Sửa
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(u)}
                            className="flex-1 flex items-center justify-center gap-1 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 px-2 py-1.5 rounded-lg transition-colors text-xs font-bold"
                          >
                            <Trash2 size={12} /> Xóa
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Users size={28} className="text-slate-300" />
                    <span className="text-sm font-medium">Không có dữ liệu</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center mt-5 gap-1.5">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                p === page
                  ? "text-white shadow-md shadow-blue-900/15 bg-header"
                  : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

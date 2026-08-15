import React, { useState, useMemo } from "react";
import { Search, Inbox, Check, X } from "lucide-react";

export default function DataTable({ data, onApprove, onReject }) {
  const [searchLocation, setSearchLocation] = useState("");
  const [searchAreaType, setSearchAreaType] = useState("");
  const [searchTime, setSearchTime] = useState("");
  const [searchUser, setSearchUser] = useState("");

  // Lọc dữ liệu
  const filteredData = useMemo(() => {
    return (data || []).filter((p) => {
      const locationStr = `${p.location?.province || ""} ${p.location?.district || ""}`.toLowerCase();
      const areaStr = (p.areaType || "").toLowerCase();
      const userStr = (p.user?.name || p.user?.email || "").toLowerCase();
      const timeStr = new Date(p.floodTime).toLocaleString().toLowerCase();

      return (
        locationStr.includes(searchLocation.toLowerCase()) &&
        areaStr.includes(searchAreaType.toLowerCase()) &&
        timeStr.includes(searchTime.toLowerCase()) &&
        userStr.includes(searchUser.toLowerCase())
      );
    });
  }, [data, searchLocation, searchAreaType, searchTime, searchUser]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 w-full h-full p-5">
      {/* Bộ lọc */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        {[
          { value: searchLocation, set: setSearchLocation, placeholder: "Tìm theo địa điểm..." },
          { value: searchAreaType, set: setSearchAreaType, placeholder: "Tìm theo loại khu vực..." },
          { value: searchTime, set: setSearchTime, placeholder: "Tìm theo thời gian..." },
          { value: searchUser, set: setSearchUser, placeholder: "Tìm theo người gửi..." },
        ].map((f, i) => (
          <div key={i} className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder={f.placeholder}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 pl-8 pr-3 py-2 rounded-xl text-sm focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 focus:bg-white outline-none transition-all"
            />
          </div>
        ))}
      </div>

      {/* Bảng */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left font-bold rounded-l-lg">Ảnh</th>
              <th className="px-3 py-2.5 text-left font-bold">Địa điểm</th>
              <th className="px-3 py-2.5 text-left font-bold">Mô tả</th>
              <th className="px-3 py-2.5 text-left font-bold">Mức lũ</th>
              <th className="px-3 py-2.5 text-left font-bold">Loại khu vực</th>
              <th className="px-3 py-2.5 text-left font-bold">Thời gian</th>
              <th className="px-3 py-2.5 text-left font-bold">Người gửi</th>
              <th className="px-3 py-2.5 text-center font-bold rounded-r-lg">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredData.length > 0 ? (
              filteredData.map((p) => (
                <tr key={p._id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-3 py-3">
                    {p.imageUrls?.[0] ? (
                      <img
                        src={p.imageUrls[0]}
                        alt=""
                        className="w-16 h-12 object-cover rounded-lg border border-slate-100"
                      />
                    ) : (
                      <div className="w-16 h-12 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-[10px] text-slate-400">
                        No image
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {p.location?.province} - {p.location?.district}
                  </td>
                  <td className="px-3 py-3 text-slate-600 max-w-[220px] truncate">{p.description || "-"}</td>
                  <td className="px-3 py-3">
                    <div className="font-bold text-slate-800">{p.floodLevel} cm</div>
                    {p.aiProcessed && (
                      <div className="text-[11px] mt-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-md px-1.5 py-0.5 inline-block font-medium">
                        🤖 AI đo: {p.aiFloodLevel !== null ? `${p.aiFloodLevel} cm` : "Không rõ"}
                        {p.aiScore && ` (${Math.round(p.aiScore * 100)}%)`}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{p.areaType}</td>
                  <td className="px-3 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {new Date(p.floodTime).toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {p.user?.name || p.user?.email}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-stretch gap-1.5 min-w-[92px]">
                      {onApprove && (
                        <button
                          onClick={() => onApprove(p._id)}
                          className="flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold"
                        >
                          <Check size={13} /> Duyệt
                        </button>
                      )}
                      {onReject && (
                        <button
                          onClick={() => onReject(p._id)}
                          className="flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold"
                        >
                          <X size={13} /> Từ chối
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <Inbox size={28} className="text-slate-300" />
                    <span className="text-sm font-medium">Không có dữ liệu</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

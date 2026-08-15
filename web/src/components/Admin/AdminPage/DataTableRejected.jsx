import React from "react";
import { Inbox } from "lucide-react";

export default function DataTableRejected({ data = [] }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 w-full h-full">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-3 py-3 text-left font-bold rounded-tl-2xl">Ảnh</th>
              <th className="px-3 py-3 text-left font-bold">Địa điểm</th>
              <th className="px-3 py-3 text-left font-bold">Mô tả</th>
              <th className="px-3 py-3 text-left font-bold">Mức lũ</th>
              <th className="px-3 py-3 text-left font-bold">Loại khu vực</th>
              <th className="px-3 py-3 text-left font-bold">Thời gian</th>
              <th className="px-3 py-3 text-left font-bold">Người gửi</th>
              <th className="px-3 py-3 text-left font-bold">Trạng thái</th>
              <th className="px-3 py-3 text-left font-bold rounded-tr-2xl">Lý do từ chối</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.length > 0 ? (
              data.map((p) => (
                <tr key={p._id || Math.random()} className="hover:bg-slate-50/70 transition-colors">
                  {/* Ảnh */}
                  <td className="px-3 py-3">
                    {p.imageUrls?.[0] ? (
                      <img
                        src={p.imageUrls[0]}
                        alt="Ảnh minh họa"
                        className="w-16 h-12 object-cover rounded-lg border border-slate-100"
                      />
                    ) : (
                      <div className="w-16 h-12 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-[10px] text-slate-400">
                        Không có ảnh
                      </div>
                    )}
                  </td>

                  {/* Địa điểm */}
                  <td className="px-3 py-3 text-slate-700">
                    {p.location?.province || "-"} - {p.location?.district || "-"}
                  </td>

                  {/* Mô tả */}
                  <td className="px-3 py-3 text-slate-600 max-w-[200px] truncate">{p.description || "-"}</td>

                  {/* Mức lũ */}
                  <td className="px-3 py-3 font-bold text-slate-800">
                    {p.floodLevel ? `${p.floodLevel} cm` : "-"}
                  </td>

                  {/* Loại khu vực */}
                  <td className="px-3 py-3 text-slate-600">{p.areaType || "-"}</td>

                  {/* Thời gian */}
                  <td className="px-3 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {p.floodTime
                      ? new Date(p.floodTime).toLocaleString()
                      : "-"}
                  </td>

                  {/* Người gửi */}
                  <td className="px-3 py-3 text-slate-600">
                    {p.user?.name || p.user?.email || "-"}
                  </td>

                  {/* Trạng thái */}
                  <td className="px-3 py-3">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                      Đã từ chối
                    </span>
                  </td>

                  {/* Lý do từ chối */}
                  <td className="px-3 py-3 text-slate-500 max-w-[180px] truncate">
                    {p.rejectReason || "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="text-center py-12">
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

import React from "react";
import { Inbox } from "lucide-react";

export default function DataTable({ data }) {
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
              <th className="px-3 py-3 text-center font-bold rounded-tr-2xl">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data && data.length > 0 ? (
              data.map((p) => (
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
                    <div className="flex flex-col items-center justify-center gap-1">
                      {p.status === "approved" ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">Đã duyệt</span>
                      ) : p.status === "rejected" ? (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">Đã từ chối</span>
                      ) : (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Chờ duyệt</span>
                      )}

                      {p.aiAutoApproved && (
                        <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap border border-purple-200">
                          🤖 AI Tự duyệt
                        </span>
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

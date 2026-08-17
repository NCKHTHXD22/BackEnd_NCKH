import React from "react";
import { Inbox, Pencil, Trash2 } from "lucide-react";
import { FLOOD_LEVEL_TYPES, RANGE_TYPES, getReportTypeLabel } from "../../../utils/reportTypes";

export default function DataTable({ data, onRowClick, onEdit, onDelete }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 w-full h-full">
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="px-3 py-3 text-left font-bold rounded-tl-2xl">Ảnh</th>
              <th className="px-3 py-3 text-left font-bold">Loại báo cáo</th>
              <th className="px-3 py-3 text-left font-bold">Địa điểm</th>
              <th className="px-3 py-3 text-left font-bold">Mô tả</th>
              <th className="px-3 py-3 text-left font-bold">Mức lũ</th>
              <th className="px-3 py-3 text-left font-bold">Loại khu vực</th>
              <th className="px-3 py-3 text-left font-bold">Thời gian</th>
              <th className="px-3 py-3 text-left font-bold">Người gửi</th>
              <th className="px-3 py-3 text-center font-bold">Trạng thái</th>
              <th className="px-3 py-3 text-center font-bold rounded-tr-2xl">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data && data.length > 0 ? (
              data.map((p) => {
                const reportType = p.reportType || "flood_point";
                const hasFloodLevel = FLOOD_LEVEL_TYPES.includes(reportType);
                const hasRange = RANGE_TYPES.includes(reportType);
                return (
                <tr
                  key={p._id}
                  onClick={() => onRowClick && onRowClick(p)}
                  className={`hover:bg-slate-50/70 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
                >
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
                  <td className="px-3 py-3">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 whitespace-nowrap">
                      {getReportTypeLabel(reportType)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {hasRange
                      ? `${p.fromAddress || "?"} → ${p.toAddress || "?"}`
                      : `${p.location?.province || ""} - ${p.location?.district || ""}`}
                  </td>
                  <td className="px-3 py-3 text-slate-600 max-w-[220px] truncate">{p.description || "-"}</td>
                  <td className="px-3 py-3">
                    {hasFloodLevel ? (
                      <>
                        <div className="font-bold text-slate-800">{p.floodLevel} cm</div>
                        {p.aiProcessed && (
                          <div className="text-[11px] mt-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-md px-1.5 py-0.5 inline-block font-medium">
                            🤖 AI đo: {p.aiFloodLevel !== null ? `${p.aiFloodLevel} cm` : "Không rõ"}
                            {p.aiScore && ` (${Math.round(p.aiScore * 100)}%)`}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{hasFloodLevel ? p.areaType : (p.landslideStatus || "—")}</td>
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
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      {onEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit(p); }}
                          className="flex items-center justify-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-600 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-bold"
                        >
                          <Pencil size={12} /> Sửa
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(p); }}
                          className="flex items-center justify-center gap-1 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-600 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-bold"
                        >
                          <Trash2 size={12} /> Xóa
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
              })
            ) : (
              <tr>
                <td colSpan={10} className="text-center py-12">
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

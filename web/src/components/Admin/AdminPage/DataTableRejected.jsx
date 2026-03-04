import React from "react";

export default function DataTableRejected({ data = [] }) {
  return (
    <div className="bg-white rounded shadow w-full h-full">
      <div className="overflow-x-auto w-full">
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-2 w-[8%]">Ảnh</th>
              <th className="border px-2 py-2 w-[18%]">Địa điểm</th>
              <th className="border px-2 py-2 w-[18%]">Mô tả</th>
              <th className="border px-2 py-2 w-[8%]">Mức lũ</th>
              <th className="border px-2 py-2 w-[12%]">Loại khu vực</th>
              <th className="border px-2 py-2 w-[15%]">Thời gian</th>
              <th className="border px-2 py-2 w-[12%]">Người gửi</th>
              <th className="border px-2 py-2 w-[9%]">Trạng thái</th>
              <th className="border px-2 py-2 w-[15%]">Lý do từ chối</th>
            </tr>
          </thead>
          <tbody>
            {data.length > 0 ? (
              data.map((p) => (
                <tr key={p._id || Math.random()} className="hover:bg-gray-50">
                  {/* Ảnh */}
                  <td className="border px-2 py-2">
                    {p.imageUrls?.[0] ? (
                      <img
                        src={p.imageUrls[0]}
                        alt="Ảnh minh họa"
                        className="w-16 h-12 object-cover rounded mx-auto"
                      />
                    ) : (
                      <span className="text-xs text-gray-500">Không có ảnh</span>
                    )}
                  </td>

                  {/* Địa điểm */}
                  <td className="border px-2 py-2">
                    {p.location?.province || "-"} - {p.location?.district || "-"}
                  </td>

                  {/* Mô tả */}
                  <td className="border px-2 py-2">{p.description || "-"}</td>

                  {/* Mức lũ */}
                  <td className="border px-2 py-2">
                    {p.floodLevel ? `${p.floodLevel} cm` : "-"}
                  </td>

                  {/* Loại khu vực */}
                  <td className="border px-2 py-2">{p.areaType || "-"}</td>

                  {/* Thời gian */}
                  <td className="border px-2 py-2">
                    {p.floodTime
                      ? new Date(p.floodTime).toLocaleString()
                      : "-"}
                  </td>

                  {/* Người gửi */}
                  <td className="border px-2 py-2">
                    {p.user?.name || p.user?.email || "-"}
                  </td>

                  {/* Trạng thái */}
                  <td className="border px-2 py-2 text-red-600 font-semibold">
                    Đã từ chối
                  </td>

                  {/* Lý do từ chối */}
                  <td className="border px-2 py-2">
                    {p.rejectReason || "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="text-center py-4 text-gray-500">
                  Không có dữ liệu
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

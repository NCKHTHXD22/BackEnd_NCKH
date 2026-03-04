import React from "react";

export default function DataTable({ data }) {
  return (
    <div className="bg-white rounded shadow w-full h-full">
      <div className="overflow-x-auto w-full">
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-2 w-[8%]">Ảnh</th>
              <th className="border px-2 py-2 w-[20%]">Địa điểm</th>
              <th className="border px-2 py-2 w-[20%]">Mô tả</th>
              <th className="border px-2 py-2 w-[8%]">Mức lũ</th>
              <th className="border px-2 py-2 w-[12%]">Loại khu vực</th>
              <th className="border px-2 py-2 w-[15%]">Thời gian</th>
              <th className="border px-2 py-2 w-[12%]">Người gửi</th>
              <th className="border px-2 py-2 w-[5%]">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {data && data.length > 0 ? (
              data.map((p) => (
                <tr key={p._id} className="hover:bg-gray-50">
                  <td className="border px-2 py-2">
                    {p.imageUrls?.[0] ? (
                      <img
                        src={p.imageUrls[0]}
                        alt=""
                        className="w-16 h-12 object-cover rounded mx-auto"
                      />
                    ) : (
                      <div className="text-xs text-gray-500">No image</div>
                    )}
                  </td>
                  <td className="border px-2 py-2">
                    {p.location?.province} - {p.location?.district}
                  </td>
                  <td className="border px-2 py-2">{p.description || "-"}</td>
                  <td className="border px-2 py-2">{p.floodLevel} cm</td>
                  <td className="border px-2 py-2">{p.areaType}</td>
                  <td className="border px-2 py-2">
                    {new Date(p.floodTime).toLocaleString()}
                  </td>
                  <td className="border px-2 py-2">
                    {p.user?.name || p.user?.email}
                  </td>
                  <td className="border px-2 py-2">
                    {p.status === "approved" ? (
                      <span className="text-green-600 font-semibold">Đã duyệt</span>
                    ) : p.status === "rejected" ? (
                      <span className="text-red-600 font-semibold">Đã từ chối</span>
                    ) : (
                      <span className="text-yellow-600 font-semibold">Chờ duyệt</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="text-center py-4">
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

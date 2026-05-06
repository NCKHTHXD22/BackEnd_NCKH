import React, { useState, useMemo } from "react";

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
    <div className="bg-white rounded shadow w-full h-full p-4">
      {/* Bộ lọc */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <input
          type="text"
          placeholder="Tìm theo địa điểm..."
          value={searchLocation}
          onChange={(e) => setSearchLocation(e.target.value)}
          className="bg-white border border-gray-300 px-3 py-2 rounded-md shadow-sm focus:ring-2 focus:ring-blue-400 outline-none"
        />
        <input
          type="text"
          placeholder="Tìm theo loại khu vực..."
          value={searchAreaType}
          onChange={(e) => setSearchAreaType(e.target.value)}
          className="bg-white border border-gray-300 px-3 py-2 rounded-md shadow-sm focus:ring-2 focus:ring-blue-400 outline-none"
        />
        <input
          type="text"
          placeholder="Tìm theo thời gian..."
          value={searchTime}
          onChange={(e) => setSearchTime(e.target.value)}
          className="bg-white border border-gray-300 px-3 py-2 rounded-md shadow-sm focus:ring-2 focus:ring-blue-400 outline-none"
        />
        <input
          type="text"
          placeholder="Tìm theo người gửi..."
          value={searchUser}
          onChange={(e) => setSearchUser(e.target.value)}
          className="bg-white border border-gray-300 px-3 py-2 rounded-md shadow-sm focus:ring-2 focus:ring-blue-400 outline-none"
        />
      </div>

      {/* Bảng */}
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
            {filteredData.length > 0 ? (
              filteredData.map((p) => (
                <tr key={p._id} className="hover:bg-gray-50 transition">
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
                  <td className="border px-2 py-2">
                    <div className="font-medium">{p.floodLevel} cm</div>
                    {p.aiProcessed && (
                      <div className="text-[11px] mt-1 bg-blue-50 text-blue-700 border border-blue-200 rounded px-1 py-0.5 inline-block">
                        🤖 AI đo: {p.aiFloodLevel !== null ? `${p.aiFloodLevel} cm` : "Không rõ"}
                        {p.aiScore && ` (${Math.round(p.aiScore * 100)}%)`}
                      </div>
                    )}
                  </td>
                  <td className="border px-2 py-2">{p.areaType}</td>
                  <td className="border px-2 py-2">
                    {new Date(p.floodTime).toLocaleString()}
                  </td>
                  <td className="border px-2 py-2">
                    {p.user?.name || p.user?.email}
                  </td>
                  <td className="border px-2 py-2 flex flex-col items-center gap-2">
                    {onApprove && (
                      <button
                        onClick={() => onApprove(p._id)}
                        className="bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 transition"
                      >
                        Duyệt
                      </button>
                    )}
                    {onReject && (
                      <button
                        onClick={() => onReject(p._id)}
                        className="bg-red-600 text-white px-3 py-1 rounded-md hover:bg-red-700 transition"
                      >
                        Từ chối
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="text-center py-4 text-gray-500">
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

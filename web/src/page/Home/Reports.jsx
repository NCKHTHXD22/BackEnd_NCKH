import React, { useEffect, useState } from "react";
import postsApi from "../../api/postsApi";
import { getReportTypeLabel, FLOOD_LEVEL_TYPES } from "../../utils/reportTypes";

export default function ReportsPublic() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await postsApi.getPublicPosts();
        setPosts(Array.isArray(r.data) ? r.data : []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Các phản ánh đã được duyệt</h2>

      {loading ? (
        <p className="text-slate-500 text-sm">Đang tải...</p>
      ) : posts.length === 0 ? (
        <p className="text-slate-500 text-sm">Chưa có phản ánh nào được duyệt.</p>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => {
            const reportType = p.reportType || "flood_point";
            const hasFloodLevel = FLOOD_LEVEL_TYPES.includes(reportType);
            return (
              <div key={p._id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex gap-4">
                {p.imageUrls?.[0] ? (
                  <img src={p.imageUrls[0]} alt="" className="w-24 h-20 object-cover rounded-xl shrink-0" />
                ) : (
                  <div className="w-24 h-20 rounded-xl bg-slate-50 border border-slate-100 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 mb-1">
                    {getReportTypeLabel(reportType)}
                  </span>
                  <p className="font-semibold text-slate-800 truncate">
                    {p.location?.address || p.fromAddress || p.location?.district || "Không rõ địa chỉ"}
                    {p.location?.district ? `, ${p.location.district}` : ""}
                  </p>
                  {hasFloodLevel && (
                    <p className="text-sm text-slate-600">Mức ngập: <strong>{p.floodLevel} cm</strong></p>
                  )}
                  {p.description && <p className="text-sm text-slate-500 truncate">{p.description}</p>}
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(p.floodTime || p.createdAt).toLocaleString("vi-VN")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

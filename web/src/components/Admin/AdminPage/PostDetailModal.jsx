import React, { useState, useEffect } from "react";
import { X, Pencil, Trash2, Save, XCircle, MapPin, Calendar } from "lucide-react";

const AREA_TYPES = ["Trong nhà", "Ngoài đường", "Khu vực khác"];

const STATUS_CFG = {
  approved: { label: "Đã duyệt", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Đã từ chối", cls: "bg-red-100 text-red-700" },
  pending: { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-700" },
};

export default function PostDetailModal({ post, onClose, onSave, onDelete, startEditing = false }) {
  const [editing, setEditing] = useState(startEditing);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (post) {
      setForm({
        description: post.description || "",
        floodLevel: post.floodLevel ?? 0,
        areaType: post.areaType || AREA_TYPES[0],
        floodTime: post.floodTime ? new Date(post.floodTime).toISOString().slice(0, 16) : "",
        location: {
          province: post.location?.province || "",
          district: post.location?.district || "",
          address: post.location?.address || "",
          latitude: post.location?.latitude,
          longitude: post.location?.longitude,
        },
      });
      setEditing(startEditing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post]);

  if (!post || !form) return null;

  const statusCfg = STATUS_CFG[post.status] || { label: post.status, cls: "bg-slate-100 text-slate-600" };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(post._id, {
        description: form.description,
        floodLevel: Number(form.floodLevel) || 0,
        areaType: form.areaType,
        floodTime: form.floodTime ? new Date(form.floodTime).toISOString() : post.floodTime,
        location: form.location,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Xóa bài viết này? Hành động không thể hoàn tác.")) return;
    setDeleting(true);
    try {
      await onDelete(post._id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative text-white p-5 flex items-start justify-between overflow-hidden bg-header shrink-0">
          <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/5" />
          <div className="relative min-w-0">
            <span className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full mb-2 ${statusCfg.cls}`}>
              {statusCfg.label}
            </span>
            <h2 className="text-lg font-black truncate">
              {post.location?.province} - {post.location?.district}
            </h2>
            <p className="text-blue-100/70 text-sm mt-0.5 truncate">
              {post.user?.name || post.user?.email || "Ẩn danh"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="relative shrink-0 bg-white/15 hover:bg-white/25 border border-white/20 text-white p-2 rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {post.imageUrls?.[0] && (
            <img src={post.imageUrls[0]} alt="" className="w-full h-56 object-cover rounded-xl border border-slate-100" />
          )}

          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Mô tả</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">Mức lũ (cm)</label>
                  <input
                    type="number"
                    value={form.floodLevel}
                    onChange={(e) => setForm((f) => ({ ...f, floodLevel: e.target.value }))}
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">Loại khu vực</label>
                  <select
                    value={form.areaType}
                    onChange={(e) => setForm((f) => ({ ...f, areaType: e.target.value }))}
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 outline-none"
                  >
                    {AREA_TYPES.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">Tỉnh/Thành</label>
                  <input
                    value={form.location.province}
                    onChange={(e) => setForm((f) => ({ ...f, location: { ...f.location, province: e.target.value } }))}
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase">Quận/Huyện</label>
                  <input
                    value={form.location.district}
                    onChange={(e) => setForm((f) => ({ ...f, location: { ...f.location, district: e.target.value } }))}
                    className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Địa chỉ</label>
                <input
                  value={form.location.address}
                  onChange={(e) => setForm((f) => ({ ...f, location: { ...f.location, address: e.target.value } }))}
                  className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">Thời gian</label>
                <input
                  type="datetime-local"
                  value={form.floodTime}
                  onChange={(e) => setForm((f) => ({ ...f, floodTime: e.target.value }))}
                  className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <MapPin size={15} className="text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-700">{post.location?.province} - {post.location?.district}</p>
                  {post.location?.address && <p className="text-slate-500 text-xs mt-0.5">{post.location.address}</p>}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar size={15} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-slate-600">{post.floodTime ? new Date(post.floodTime).toLocaleString("vi-VN") : "-"}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Mức lũ</p>
                  <p className="text-base font-black text-slate-800 mt-0.5">{post.floodLevel} cm</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Loại khu vực</p>
                  <p className="text-base font-black text-slate-800 mt-0.5">{post.areaType || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Mô tả</p>
                <p className="text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100">
                  {post.description || "(Không có mô tả)"}
                </p>
              </div>
              {post.status === "rejected" && post.rejectReason && (
                <div>
                  <p className="text-[11px] font-bold text-red-400 uppercase mb-1">Lý do từ chối</p>
                  <p className="text-red-600 bg-red-50 rounded-xl p-3 border border-red-100">{post.rejectReason}</p>
                </div>
              )}
              {post.aiProcessed && (
                <div className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 rounded-xl px-3 py-2">
                  🤖 AI đo: {post.aiFloodLevel != null ? `${post.aiFloodLevel} cm` : "Không rõ"} — Phân loại: {post.aiLabel || "-"}
                  {post.aiScore != null && ` (${Math.round(post.aiScore * 100)}%)`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-4 border-t border-slate-100 shrink-0">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 px-3.5 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} /> {deleting ? "Đang xóa..." : "Xóa"}
          </button>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  <XCircle size={14} /> Hủy
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md shadow-blue-900/15 transition-all disabled:opacity-50 bg-header"
                >
                  <Save size={14} /> {saving ? "Đang lưu..." : "Lưu"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 px-3.5 py-2 rounded-xl text-sm font-bold transition-colors"
              >
                <Pencil size={14} /> Sửa
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

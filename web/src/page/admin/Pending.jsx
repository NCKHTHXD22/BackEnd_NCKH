import React, { useEffect, useState } from "react";
import { FaHourglassHalf } from "react-icons/fa";
import adminApi from "../../api/adminApi";
import DataTable from "../../components/Admin/AdminPage/DataTablePostWait"; // Đổi tên PostCard thành DataTable nếu file là Postcard.jsx
import PostDetailModal from "../../components/Admin/AdminPage/PostDetailModal";

export default function Pending() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [startEditing, setStartEditing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getPendingPosts();
      setPosts(data || []);
    } catch (err) {
      console.error(err);
      alert("Tải bài chờ thất bại");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (id) => {
    if (!window.confirm("Duyệt bài này?")) return;
    try {
      await adminApi.approvePost(id);
      setPosts(posts.filter((p) => p._id !== id));
      alert("Duyệt thành công");
    } catch (err) {
      alert("Duyệt thất bại");
    }
  };

  const reject = async (id) => {
    const reason = window.prompt("Lý do từ chối (tùy chọn):");
    if (reason === null) return;
    try {
      await adminApi.rejectPost(id, reason);
      setPosts(posts.filter((p) => p._id !== id));
      alert("Từ chối thành công");
    } catch (err) {
      alert("Từ chối thất bại");
    }
  };

  const handleSave = async (id, body) => {
    try {
      const updated = await adminApi.updatePost(id, body);
      setPosts((prev) => prev.map((p) => (p._id === id ? { ...p, ...updated } : p)));
      setSelectedPost((prev) => (prev && prev._id === id ? { ...prev, ...updated } : prev));
    } catch (err) {
      alert("Cập nhật thất bại");
    }
  };

  const handleDelete = async (id) => {
    try {
      await adminApi.deletePost(id);
      setPosts((prev) => prev.filter((p) => p._id !== id));
    } catch (err) {
      alert("Xóa thất bại");
    }
  };

  return (
    <div className="w-full flex flex-col px-4 pt-6 pb-6 animate-fade-in">
      <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2.5 mb-5">
        <FaHourglassHalf className="text-amber-500" /> Bài chờ duyệt
        {!loading && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
            {posts.length}
          </span>
        )}
      </h2>
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm font-medium">Đang tải...</div>
      ) : (
        <DataTable
          data={posts}
          onApprove={approve}
          onReject={reject}
          onRowClick={(p) => { setSelectedPost(p); setStartEditing(false); }}
          onEdit={(p) => { setSelectedPost(p); setStartEditing(true); }}
          onDelete={(p) => {
            if (window.confirm("Xóa bài viết này? Hành động không thể hoàn tác.")) handleDelete(p._id);
          }}
        />
      )}

      <PostDetailModal
        post={selectedPost}
        startEditing={startEditing}
        onClose={() => setSelectedPost(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}

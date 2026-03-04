import React, { useEffect, useState } from "react";
import adminApi from "../../api/adminApi";
import DataTable from "../../components/Admin/AdminPage/DataTablePostWait"; // Đổi tên PostCard thành DataTable nếu file là Postcard.jsx

export default function Pending() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="w-full flex flex-col px-4 pt-20">
      <div className="flex flex-col items-start mb-4 gap-2"></div>
      <h2 className="text-xl font-semibold mb-4">Bài chờ duyệt</h2>
      {loading ? (
        <div>Đang tải...</div>
      ) : (
        <DataTable data={posts} onApprove={approve} onReject={reject} />
      )}
    </div>
  );
}
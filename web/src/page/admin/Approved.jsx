import React, { useEffect, useState } from "react";
import adminApi from "../../api/adminApi";
import DataTable from "../../components/Admin/AdminPage/DataTableApproved";

export default function Approved() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filteredPosts, setFilteredPosts] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      let data = await adminApi.getApprovedPosts();

      // Nếu API không có status thì ép thêm status = "approved"
      data = (data || []).map((p) => ({ ...p, status: "approved" }));

      setPosts(data);
      setFilteredPosts(data);
    } catch (err) {
      console.error(err);
      alert("Tải bài đã duyệt thất bại");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Xử lý tìm kiếm
  const handleSearch = (e) => {
    e.preventDefault();
    if (!search.trim()) {
      setFilteredPosts(posts);
      return;
    }
    const keyword = search.toLowerCase();
    setFilteredPosts(
      posts.filter(
        (p) =>
          (p.location?.province + " " + p.location?.district)
            .toLowerCase()
            .includes(keyword) ||
          (p.description || "").toLowerCase().includes(keyword) ||
          (p.user?.name || "").toLowerCase().includes(keyword) ||
          (p.user?.email || "").toLowerCase().includes(keyword)
      )
    );
  };

  return (
    <div className="w-full flex flex-col px-4 pt-20">
      <div className="flex flex-col items-start mb-4 gap-2">
        <h2 className="text-xl font-semibold">Bài đã duyệt</h2>
        <form className="flex items-center gap-2" onSubmit={handleSearch}>
  <div className="relative flex items-center">
    <input
      type="text"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Nhập từ khóa tìm kiếm..."
      className="pl-10 pr-3 py-2 rounded-l-md outline-none text-gray-800 text-sm border border-gray-300 focus:border-blue-400 bg-white shadow-sm"
      style={{ minWidth: 220 }}
    />
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
      <svg
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="16.65" y1="16.65" x2="21" y2="21" />
      </svg>
    </span>
  </div>
  <button
    type="submit"
    className="bg-blue-600 text-white px-4 py-2 rounded-r-md flex items-center hover:bg-blue-700 transition shadow-sm"
  >
    <svg
      className="mr-2"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="16.65" y1="16.65" x2="21" y2="21" />
    </svg>
    Tìm kiếm
  </button>
</form>

      </div>

      {loading ? <div>Đang tải...</div> : <DataTable data={filteredPosts} />}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { FaCheckCircle } from "react-icons/fa";
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
    <div className="w-full flex flex-col px-4 pt-6 pb-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2.5">
          <FaCheckCircle className="text-emerald-500" /> Bài đã duyệt
          {!loading && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
              {filteredPosts.length}
            </span>
          )}
        </h2>
        <form className="flex items-center gap-2" onSubmit={handleSearch}>
          <div className="relative flex items-center">
            <Search size={15} className="absolute left-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nhập từ khóa tìm kiếm..."
              className="pl-9 pr-3 py-2 rounded-full outline-none text-slate-800 text-sm border border-slate-200 bg-white shadow-sm focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 transition-all"
              style={{ minWidth: 240 }}
            />
          </div>
          <button
            type="submit"
            className="text-white px-4 py-2 rounded-full flex items-center gap-2 text-sm font-semibold shadow-md shadow-blue-900/15 transition-all active:scale-95 bg-header"
          >
            <Search size={15} /> Tìm kiếm
          </button>
        </form>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm font-medium">Đang tải...</div>
      ) : (
        <DataTable data={filteredPosts} />
      )}
    </div>
  );
}

  import React, { useEffect, useState } from "react";
  import { FaUsers } from "react-icons/fa";
  import adminApi from "../../api/adminApi";
  import DataTableUser from "../../components/Admin/AdminPage/DataTableUser";

  export default function ManageUsers() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const data = await adminApi.getUsers();
        setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to fetch users:", err);
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      fetchUsers();
    }, []);

    const toggleRole = async (id, role) => {
      const newRole = role === "admin" ? "user" : "admin";
      if (!confirm(`Đổi role thành ${newRole}?`)) return;
      await adminApi.changeUserRole(id, { role: newRole });
      setUsers((u) => u.map((x) => (x._id === id ? { ...x, role: newRole } : x)));
    };

    const toggleBan = async (id, status) => {
      try {
        if (status === "active") {
          await adminApi.banUser(id);
          setUsers((u) => u.map((x) => (x._id === id ? { ...x, status: "banned" } : x)));
        } else {
          await adminApi.unbanUser(id);
          setUsers((u) => u.map((x) => (x._id === id ? { ...x, status: "active" } : x)));
        }
      } catch (err) {
        alert("Thất bại");
      }
    };

    return (
      <div className="w-full flex flex-col px-4 pt-6 pb-6 animate-fade-in">
        <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2.5 mb-5">
          <FaUsers className="text-blue-600" /> Quản lý người dùng
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm font-medium">Đang tải danh sách người dùng...</div>
        ) : (
          <DataTableUser data={users} onToggleRole={toggleRole} onToggleBan={toggleBan} />
        )}
      </div>
    );
  }

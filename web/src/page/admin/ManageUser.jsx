  import React, { useEffect, useState } from "react";
  import { FaUsers } from "react-icons/fa";
  import adminApi from "../../api/adminApi";
  import DataTableUser from "../../components/Admin/AdminPage/DataTableUser";
  import UserEditModal from "../../components/Admin/AdminPage/UserEditModal";

  export default function ManageUsers() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

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

    const handleSaveUser = async (id, body) => {
      try {
        const updated = await adminApi.updateUser(id, body);
        setUsers((u) => u.map((x) => (x._id === id ? { ...x, ...updated } : x)));
      } catch (err) {
        alert("Cập nhật thất bại");
      }
    };

    const handleDeleteUser = async (user) => {
      if (!window.confirm(`Xóa tài khoản "${user.name || user.email}"? Hành động không thể hoàn tác.`)) return;
      try {
        await adminApi.deleteUser(user._id);
        setUsers((u) => u.filter((x) => x._id !== user._id));
      } catch (err) {
        alert("Xóa thất bại");
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
          <DataTableUser
            data={users}
            onToggleRole={toggleRole}
            onToggleBan={toggleBan}
            onEdit={(u) => setEditingUser(u)}
            onDelete={handleDeleteUser}
          />
        )}

        <UserEditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={handleSaveUser}
        />
      </div>
    );
  }

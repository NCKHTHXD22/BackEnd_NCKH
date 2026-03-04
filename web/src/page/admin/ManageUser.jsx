  import React, { useEffect, useState } from "react";
  import adminApi from "../../api/adminApi";
  import DataTableUser from "../../components/Admin/AdminPage/DataTableUser";

  export default function ManageUsers() {
    const [users, setUsers] = useState([]);

    useEffect(() => {
      adminApi.getUsers().then(setUsers).catch(console.error);
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
      <div className="w-full flex flex-col px-4 pt-20">
        <div className="flex flex-col items-start mb-4 gap-2">
        <h2 className="text-xl font-semibold mb-4">Quản lý người dùng</h2>
        <DataTableUser data={users} onToggleRole={toggleRole} onToggleBan={toggleBan} />
      </div>
      </div>
    );
  }

import React, { useEffect, useState } from "react";
import adminApi from "../../api/adminApi";

export default function ManageAdmins() {
  const [admins, setAdmins] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", email: "" });

  // Lấy danh sách Admin
  const load = async () => setAdmins((await adminApi.listAdmins()) || []);

  useEffect(() => {
    load();
  }, []);

  // Thêm mới Admin
  const create = async (e) => {
    e.preventDefault();
    await adminApi.createAdmin(form);
    setForm({ username: "", password: "", email: "" });
    load();
  };

  // Xóa Admin
  const del = async (id) => {
    if (!window.confirm("Xóa admin?")) return;
    await adminApi.deleteAdmin(id);
    load();
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-6">Quản lý Admin</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cột trái: Form thêm mới */}
        <form onSubmit={create} className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Thêm mới quản trị viên</h3>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Tên tài khoản
              </label>
              <input
                className="bg-white border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 p-2 w-full rounded-lg outline-none transition"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Mật khẩu</label>
              <input
                type="password"
                className="bg-white border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 p-2 w-full rounded-lg outline-none transition"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                className="bg-white border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 p-2 w-full rounded-lg outline-none transition"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition"
            >
              Thêm mới
            </button>
          </div>
        </form>

        {/* Cột phải: Danh sách Admin */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Danh sách quản trị viên</h3>
          <table className="w-full table-auto border-collapse text-sm text-center">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                <th className="border px-3 py-2">Tên tài khoản</th>
                <th className="border px-3 py-2">Email</th>
                <th className="border px-3 py-2">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a._id} className="hover:bg-gray-50">
                  <td className="border px-3 py-2">{a.username}</td>
                  <td className="border px-3 py-2">{a.email}</td>
                  <td className="border px-3 py-2">
                    <button
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg transition"
                      onClick={() => del(a._id)}
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
              {admins.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-gray-500 py-4">
                    Chưa có quản trị viên nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

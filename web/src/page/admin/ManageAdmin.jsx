import React, { useEffect, useState } from "react";
import { FaUserShield, FaTrash, FaUserPlus } from "react-icons/fa";
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
    <div className="w-full flex flex-col px-4 pt-6 pb-6 animate-fade-in">
      <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2.5 mb-6">
        <FaUserShield className="text-blue-600" /> Quản lý Admin
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cột trái: Form thêm mới */}
        <form onSubmit={create} className="card-hover bg-white shadow-sm border border-slate-100 rounded-2xl p-6">
          <h3 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
            <FaUserPlus className="text-blue-500" /> Thêm mới quản trị viên
          </h3>
          <div className="grid gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                Tên tài khoản
              </label>
              <input
                className="bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-400/20 p-2.5 w-full rounded-xl outline-none transition-all text-sm"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Mật khẩu</label>
              <input
                type="password"
                className="bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-400/20 p-2.5 w-full rounded-xl outline-none transition-all text-sm"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Email</label>
              <input
                type="email"
                className="bg-slate-50 border border-slate-200 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-400/20 p-2.5 w-full rounded-xl outline-none transition-all text-sm"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              className="text-white px-5 py-2.5 rounded-xl transition-all active:scale-95 text-sm font-semibold shadow-md shadow-blue-900/15 bg-header"
            >
              Thêm mới
            </button>
          </div>
        </form>

        {/* Cột phải: Danh sách Admin */}
        <div className="card-hover bg-white shadow-sm border border-slate-100 rounded-2xl p-6">
          <h3 className="text-base font-bold text-slate-800 mb-5">Danh sách quản trị viên</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <th className="px-3 py-2.5 text-left font-bold rounded-l-lg">Tên tài khoản</th>
                  <th className="px-3 py-2.5 text-left font-bold">Email</th>
                  <th className="px-3 py-2.5 text-center font-bold rounded-r-lg">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {admins.map((a) => (
                  <tr key={a._id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-3 font-semibold text-slate-700">{a.username}</td>
                    <td className="px-3 py-3 text-slate-500">{a.email}</td>
                    <td className="px-3 py-3 text-center">
                      <button
                        className="inline-flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold"
                        onClick={() => del(a._id)}
                      >
                        <FaTrash size={11} /> Xóa
                      </button>
                    </td>
                  </tr>
                ))}
                {admins.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-slate-400 py-8 text-sm">
                      Chưa có quản trị viên nào
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

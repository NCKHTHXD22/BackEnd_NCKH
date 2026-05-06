import axiosClient from "./axiosClient";
import axios from "axios";
import { API_URL } from "../lib/env"; // để gọi API ngoài hệ thống

const adminApi = {
  // Auth
  login: (data) => axiosClient.post("/admin/auth/login", data).then(res => res.data),

  // Posts
  getPendingPosts: () =>
    axiosClient.get("/admin/posts/pending").then((res) => res.data),

  approvePost: (id) =>
    axiosClient.patch(`/admin/posts/${id}/approve`).then((res) => res.data),

  rejectPost: (id, reason) =>
    axiosClient.patch(`/admin/posts/${id}/reject`, { reason }).then((res) => res.data),

  getApprovedPosts: () =>
    axiosClient.get("/admin/posts/approved").then((res) => res.data),  // ✅ sửa lại

  getRejectedPosts: () =>
    axiosClient.get("/admin/posts/rejected").then((res) => res.data),  // ✅ sửa lại

  // Users
  getUsers: () => axiosClient.get("/admin/users").then(res => res.data),
  getUserStats: () => axiosClient.get("/admin/users/stats").then(res => res.data),
  changeUserRole: (id, body) =>
    axiosClient.patch(`/admin/users/${id}/role`, body).then(res => res.data),
  banUser: (id) => axiosClient.patch(`/admin/users/${id}/ban`).then(res => res.data),
  unbanUser: (id) => axiosClient.patch(`/admin/users/${id}/unban`).then(res => res.data),

  // Admin management
  listAdmins: () => axiosClient.get("/admin/admins").then(res => res.data),
  createAdmin: (body) => axiosClient.post("/admin/admins", body).then(res => res.data),
  deleteAdmin: (id) => axiosClient.delete(`/admin/admins/${id}`).then(res => res.data),

  // Sensors (lấy từ API ngoài)
  getSensorsInfo: () =>
    axios
      .get(`${API_URL}/api/alerts`)
      .then(res => res.data),
};

export default adminApi;

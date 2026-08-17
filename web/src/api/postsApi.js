// src/api/postsApi.js
import axiosClient from "./axiosClient";

const postsApi = {
  getPublicPosts: () => axiosClient.get("/posts"), // backend returns approved only per server changes
  // Gửi ẩn danh — web không yêu cầu đăng nhập (backend chấp nhận POST /posts không kèm token).
  createPost: (formData) =>
    axiosClient.post("/posts", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  getPostById: (id) => axiosClient.get(`/posts/${id}`),
};

export default postsApi;

// src/api/postsApi.js
import axiosClient from "./axiosClient";

const postsApi = {
  getPublicPosts: () => axiosClient.get("/posts"), // backend returns approved only per server changes
  createPost: (formData, token) => {
    // if token provided (Clerk), attach using a custom axios instance
    const headers = token ? { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" } : { "Content-Type": "multipart/form-data" };
    return axiosClient.post("/posts", formData, { headers });
  },
  getPostById: (id) => axiosClient.get(`/posts/${id}`),
};

export default postsApi;

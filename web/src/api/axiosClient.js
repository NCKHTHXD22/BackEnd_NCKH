import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5001/api";

const axiosClient = axios.create({
  baseURL: API_BASE,
  timeout: 60000, // 60s để chờ Render wake up
});

axiosClient.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem("adminToken");
  const clerkToken = localStorage.getItem("clerkToken");

  // Không gắn token nếu là API login
  if (!config.url.includes("/auth/login")) {
    if (adminToken) {
      config.headers.Authorization = `Bearer ${adminToken}`;
    } else if (clerkToken) {
      config.headers.Authorization = `Bearer ${clerkToken}`;
    }
  }

  return config;
});


export default axiosClient;

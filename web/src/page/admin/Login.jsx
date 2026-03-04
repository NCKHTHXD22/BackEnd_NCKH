import React, { useState } from "react";
import adminApi from "../../api/adminApi";
import { setAdminToken } from "../../services/auth";
import { useNavigate } from "react-router-dom";
import "../../styles/LoginStyles.css"; // 👉 import CSS riêng

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await adminApi.login({ username, password });
      const token = data.token;
      setAdminToken(token);
      navigate("/admin/pending");
    } catch (err) {
      alert(err.response?.data?.error || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form className="login-box" onSubmit={submit}>
        <h2>Welcome Back</h2>
        <p>Sign in to your account</p>

        {/* Username */}
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          required
        />

        {/* Password */}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
        />

        <div className="options">
          <label>
            <input type="checkbox"/>Remember me
          </label>
          <a href="#">Forgot password?</a>
        </div>

        {/* Button */}
        <button type="submit" disabled={loading}>
          {loading ? "Processing..." : "Sign In"}
        </button>

      </form>
    </div>
  );
}

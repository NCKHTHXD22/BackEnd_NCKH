import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Lock, User, Mail, ShieldAlert, Waves, AlertTriangle, CheckCircle } from "lucide-react";
import axiosClient from "../../api/axiosClient";
import authBg from "../../assets/images/auth_bg.svg";

export default function AdminRegister() {
    const [form, setForm] = useState({ fullname: "", username: "", email: "", password: "", confirm: "" });
    const [showPw, setShowPw] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const navigate = useNavigate();

    const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

    const pwStrength = (pw) => {
        if (!pw) return 0;
        let s = 0;
        if (pw.length >= 8) s++;
        if (/[A-Z]/.test(pw)) s++;
        if (/[0-9]/.test(pw)) s++;
        if (/[^A-Za-z0-9]/.test(pw)) s++;
        return s;
    };
    const strength = pwStrength(form.password);
    const strengthLabel = ["", "Yếu", "Trung bình", "Khá tốt", "Mạnh"][strength];
    const strengthColor = ["", "bg-red-500", "bg-amber-500", "bg-blue-500", "bg-emerald-500"][strength];

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        if (form.password !== form.confirm) { setError("Mật khẩu xác nhận không khớp"); return; }
        if (form.password.length < 6) { setError("Mật khẩu phải ít nhất 6 ký tự"); return; }
        setLoading(true);
        try {
            await axiosClient.post("/admin/auth/register", {
                fullname: form.fullname,
                username: form.username,
                email: form.email,
                password: form.password,
            });
            setSuccess(true);
        } catch (err) {
            setError(err.response?.data?.error || "Đăng ký thất bại, vui lòng thử lại");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen w-screen flex items-center justify-center relative overflow-hidden"
                style={{ backgroundImage: `url(${authBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
                <div className="absolute inset-0 bg-black/40" />
                <div className="relative z-10 bg-slate-950/90 backdrop-blur-xl rounded-2xl p-10 max-w-sm w-full mx-4 text-center"
                    style={{ boxShadow: "0 0 60px rgba(16,185,129,0.3)" }}>
                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/40">
                        <CheckCircle size={32} className="text-emerald-400" />
                    </div>
                    <h2 className="text-xl font-black text-white mb-2">Đăng ký thành công!</h2>
                    <p className="text-slate-400 text-sm mb-6">
                        Tài khoản của bạn đang chờ phê duyệt từ quản trị viên. Bạn sẽ nhận thông báo qua email khi được kích hoạt.
                    </p>
                    <Link to="/admin/login"
                        className="block w-full py-3 rounded-xl font-bold text-sm text-white text-center transition-all"
                        style={{ background: "linear-gradient(135deg, #2563eb, #0ea5e9)", boxShadow: "0 4px 20px rgba(37,99,235,0.4)" }}>
                        Quay về Đăng nhập
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-screen flex items-center justify-center relative overflow-hidden py-8"
            style={{ backgroundImage: `url(${authBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
            <div className="absolute inset-0 bg-black/40" />

            <div className="relative z-10 w-full max-w-5xl mx-4 flex rounded-2xl overflow-hidden shadow-2xl"
                style={{ boxShadow: "0 0 80px rgba(30,64,175,0.4)" }}>

                {/* ── Left panel ── */}
                <div className="hidden md:flex flex-col justify-between w-[48%] bg-gradient-to-br from-slate-900/95 via-blue-950/95 to-slate-900/95 p-10 backdrop-blur-md border-r border-blue-800/30">
                    <div>
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                                <Waves size={22} className="text-white" />
                            </div>
                            <div>
                                <p className="text-blue-300 text-xs font-bold uppercase tracking-widest">NCKH System</p>
                                <p className="text-white text-sm font-black">Quản lý Hồ chứa</p>
                            </div>
                        </div>

                        <h1 className="text-2xl font-black text-white mb-3">
                            Tạo tài khoản<br />
                            <span className="text-blue-400">Quản trị viên</span>
                        </h1>
                        <p className="text-slate-400 text-sm leading-relaxed mb-8">
                            Đăng ký để truy cập hệ thống giám sát, quản lý dữ liệu thủy văn và vận hành hồ chứa miền Trung.
                        </p>

                        <div className="space-y-3">
                            {[
                                { icon: "🔒", title: "Bảo mật cao", desc: "JWT token + phân quyền theo role" },
                                { icon: "📊", title: "Dữ liệu thực", desc: "Kết nối trực tiếp API Đà Nẵng Gov" },
                                { icon: "🤖", title: "AI dự báo", desc: "Mô hình LSTM 16 hồ chứa" },
                            ].map(item => (
                                <div key={item.title} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
                                    <span className="text-xl">{item.icon}</span>
                                    <div>
                                        <p className="text-white text-sm font-bold">{item.title}</p>
                                        <p className="text-slate-400 text-xs">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <p className="text-slate-600 text-xs">© 2025 NCKH — Đại học Đà Nẵng</p>
                </div>

                {/* ── Right panel: form ── */}
                <div className="flex-1 bg-slate-950/90 backdrop-blur-xl p-10 flex flex-col justify-center">
                    <div className="mb-6">
                        <h2 className="text-2xl font-black text-white">Đăng ký</h2>
                        <p className="text-slate-400 text-sm mt-1">Tạo tài khoản quản trị mới</p>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 bg-red-500/15 border border-red-500/40 rounded-xl px-4 py-3 mb-4">
                            <AlertTriangle size={15} className="text-red-400 shrink-0" />
                            <p className="text-red-300 text-sm">{error}</p>
                        </div>
                    )}

                    <form onSubmit={submit} className="space-y-4">
                        {/* Full name */}
                        <div>
                            <label className="block text-slate-300 text-xs font-bold uppercase tracking-wide mb-1.5">Họ và tên</label>
                            <div className="relative">
                                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="text" value={form.fullname} onChange={set("fullname")} placeholder="Nguyễn Văn A" required
                                    className="w-full bg-slate-800/70 border border-slate-700 hover:border-slate-500 focus:border-blue-500 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-slate-500 outline-none transition-colors" />
                            </div>
                        </div>

                        {/* Username + Email row */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-slate-300 text-xs font-bold uppercase tracking-wide mb-1.5">Tên đăng nhập</label>
                                <div className="relative">
                                    <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input type="text" value={form.username} onChange={set("username")} placeholder="admin_01" required
                                        className="w-full bg-slate-800/70 border border-slate-700 hover:border-slate-500 focus:border-blue-500 rounded-xl pl-10 pr-3 py-2.5 text-white text-sm placeholder-slate-500 outline-none transition-colors" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-slate-300 text-xs font-bold uppercase tracking-wide mb-1.5">Email</label>
                                <div className="relative">
                                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input type="email" value={form.email} onChange={set("email")} placeholder="email@example.com" required
                                        className="w-full bg-slate-800/70 border border-slate-700 hover:border-slate-500 focus:border-blue-500 rounded-xl pl-10 pr-3 py-2.5 text-white text-sm placeholder-slate-500 outline-none transition-colors" />
                                </div>
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-slate-300 text-xs font-bold uppercase tracking-wide mb-1.5">Mật khẩu</label>
                            <div className="relative">
                                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type={showPw ? "text" : "password"} value={form.password} onChange={set("password")} placeholder="Ít nhất 6 ký tự" required
                                    className="w-full bg-slate-800/70 border border-slate-700 hover:border-slate-500 focus:border-blue-500 rounded-xl pl-10 pr-11 py-2.5 text-white text-sm placeholder-slate-500 outline-none transition-colors" />
                                <button type="button" onClick={() => setShowPw(v => !v)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors">
                                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                            {/* Strength bar */}
                            {form.password && (
                                <div className="mt-2 flex items-center gap-2">
                                    <div className="flex gap-1 flex-1">
                                        {[1, 2, 3, 4].map(i => (
                                            <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength ? strengthColor : "bg-slate-700"}`} />
                                        ))}
                                    </div>
                                    <span className="text-xs text-slate-400">{strengthLabel}</span>
                                </div>
                            )}
                        </div>

                        {/* Confirm password */}
                        <div>
                            <label className="block text-slate-300 text-xs font-bold uppercase tracking-wide mb-1.5">Xác nhận mật khẩu</label>
                            <div className="relative">
                                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type={showConfirm ? "text" : "password"} value={form.confirm} onChange={set("confirm")} placeholder="Nhập lại mật khẩu" required
                                    className={`w-full bg-slate-800/70 border rounded-xl pl-10 pr-11 py-2.5 text-white text-sm placeholder-slate-500 outline-none transition-colors ${
                                        form.confirm && form.confirm !== form.password
                                            ? "border-red-500 focus:border-red-400"
                                            : "border-slate-700 hover:border-slate-500 focus:border-blue-500"
                                    }`} />
                                <button type="button" onClick={() => setShowConfirm(v => !v)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors">
                                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                                {form.confirm && form.confirm === form.password && (
                                    <CheckCircle size={15} className="absolute right-10 top-1/2 -translate-y-1/2 text-emerald-400" />
                                )}
                            </div>
                        </div>

                        {/* Submit */}
                        <button type="submit" disabled={loading}
                            className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                            style={{
                                background: "linear-gradient(135deg, #2563eb, #0ea5e9)",
                                boxShadow: "0 4px 20px rgba(37,99,235,0.4)",
                            }}>
                            {loading ? (
                                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Đang xử lý...</>
                            ) : (
                                <><ShieldAlert size={16} /> Tạo tài khoản</>
                            )}
                        </button>
                    </form>

                    <p className="text-center text-slate-500 text-sm mt-5">
                        Đã có tài khoản?{" "}
                        <Link to="/admin/login" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                            Đăng nhập
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

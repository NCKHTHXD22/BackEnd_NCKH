import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ShieldAlert, Waves, AlertTriangle, CheckCircle, ArrowLeft, KeyRound } from "lucide-react";
import axiosClient from "../../api/axiosClient";
import authBg from "../../assets/images/auth_bg.svg";

export default function ForgotPassword() {
    const [step, setStep] = useState("email");   // "email" | "sent"
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await axiosClient.post("/admin/auth/forgot-password", { email });
            setStep("sent");
        } catch (err) {
            setError(err.response?.data?.error || "Email không tồn tại trong hệ thống");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-screen flex items-center justify-center relative overflow-hidden"
            style={{ backgroundImage: `url(${authBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
            <div className="absolute inset-0 bg-black/45" />

            <div className="relative z-10 w-full max-w-5xl mx-4 flex rounded-2xl overflow-hidden shadow-2xl"
                style={{ boxShadow: "0 0 80px rgba(30,64,175,0.4)" }}>

                {/* ── Left panel ── */}
                <div className="hidden md:flex flex-col justify-between w-[52%] bg-gradient-to-br from-slate-900/95 via-blue-950/95 to-slate-900/95 p-10 backdrop-blur-md border-r border-blue-800/30">
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

                        <div className="w-20 h-20 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-6">
                            <KeyRound size={36} className="text-blue-400" />
                        </div>

                        <h1 className="text-2xl font-black text-white mb-3">
                            Khôi phục<br />
                            <span className="text-blue-400">mật khẩu</span>
                        </h1>
                        <p className="text-slate-400 text-sm leading-relaxed mb-8">
                            Nhập địa chỉ email đã đăng ký. Chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu đến email của bạn trong vòng vài phút.
                        </p>

                        <div className="space-y-3">
                            {[
                                { step: "1", text: "Nhập email đã đăng ký tài khoản" },
                                { step: "2", text: "Kiểm tra hộp thư và nhấn link đặt lại mật khẩu" },
                                { step: "3", text: "Tạo mật khẩu mới và đăng nhập lại" },
                            ].map(({ step, text }) => (
                                <div key={step} className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="text-blue-400 text-xs font-black">{step}</span>
                                    </div>
                                    <p className="text-slate-400 text-sm leading-relaxed">{text}</p>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mt-8">
                            <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                            <p className="text-amber-300 text-xs">Link đặt lại mật khẩu có hiệu lực trong <strong>30 phút</strong>.</p>
                        </div>
                    </div>
                    <p className="text-slate-600 text-xs">© 2025 NCKH — Đại học Đà Nẵng</p>
                </div>

                {/* ── Right panel ── */}
                <div className="flex-1 bg-slate-950/90 backdrop-blur-xl p-10 flex flex-col justify-center">

                    {step === "email" ? (
                        <>
                            <Link to="/admin/login"
                                className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm transition-colors mb-8 w-fit">
                                <ArrowLeft size={15} /> Quay lại đăng nhập
                            </Link>

                            <div className="mb-8">
                                <h2 className="text-2xl font-black text-white">Quên mật khẩu?</h2>
                                <p className="text-slate-400 text-sm mt-1">Chúng tôi sẽ gửi email khôi phục cho bạn</p>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 bg-red-500/15 border border-red-500/40 rounded-xl px-4 py-3 mb-5">
                                    <AlertTriangle size={15} className="text-red-400 shrink-0" />
                                    <p className="text-red-300 text-sm">{error}</p>
                                </div>
                            )}

                            <form onSubmit={submit} className="space-y-5">
                                <div>
                                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wide mb-2">
                                        Địa chỉ Email
                                    </label>
                                    <div className="relative">
                                        <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="email" value={email} onChange={e => setEmail(e.target.value)}
                                            placeholder="email@example.com"
                                            required
                                            className="w-full bg-slate-800/70 border border-slate-700 hover:border-slate-500 focus:border-blue-500 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-slate-500 outline-none transition-colors"
                                        />
                                    </div>
                                </div>

                                <button type="submit" disabled={loading}
                                    className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    style={{
                                        background: "linear-gradient(135deg, #2563eb, #0ea5e9)",
                                        boxShadow: "0 4px 20px rgba(37,99,235,0.4)",
                                    }}>
                                    {loading ? (
                                        <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Đang gửi...</>
                                    ) : (
                                        <><ShieldAlert size={16} /> Gửi email khôi phục</>
                                    )}
                                </button>
                            </form>

                            <p className="text-center text-slate-500 text-sm mt-6">
                                Nhớ mật khẩu?{" "}
                                <Link to="/admin/login" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                                    Đăng nhập ngay
                                </Link>
                            </p>
                        </>
                    ) : (
                        /* Success state */
                        <div className="text-center">
                            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/40"
                                style={{ boxShadow: "0 0 40px rgba(16,185,129,0.2)" }}>
                                <CheckCircle size={36} className="text-emerald-400" />
                            </div>

                            <h2 className="text-2xl font-black text-white mb-2">Email đã được gửi!</h2>
                            <p className="text-slate-400 text-sm mb-2">
                                Chúng tôi đã gửi hướng dẫn đặt lại mật khẩu đến:
                            </p>
                            <p className="text-blue-400 font-bold text-sm mb-6 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2 inline-block">
                                {email}
                            </p>

                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6 text-left space-y-2">
                                <p className="text-slate-300 text-xs font-bold uppercase tracking-wide mb-2">Lưu ý:</p>
                                <p className="text-slate-400 text-xs flex items-start gap-2">
                                    <span className="text-blue-400 mt-0.5">•</span> Kiểm tra cả thư mục Spam / Junk nếu không thấy email
                                </p>
                                <p className="text-slate-400 text-xs flex items-start gap-2">
                                    <span className="text-amber-400 mt-0.5">•</span> Link có hiệu lực trong <strong className="text-amber-400">30 phút</strong>
                                </p>
                                <p className="text-slate-400 text-xs flex items-start gap-2">
                                    <span className="text-slate-400 mt-0.5">•</span> Mỗi yêu cầu chỉ tạo một link duy nhất
                                </p>
                            </div>

                            <div className="space-y-3">
                                <button onClick={() => { setStep("email"); setEmail(""); }}
                                    className="w-full py-2.5 rounded-xl font-bold text-sm text-slate-300 border border-slate-700 hover:bg-slate-800 transition-colors">
                                    Gửi lại email
                                </button>
                                <Link to="/admin/login"
                                    className="block w-full py-2.5 rounded-xl font-bold text-sm text-white text-center transition-all"
                                    style={{ background: "linear-gradient(135deg, #2563eb, #0ea5e9)", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}>
                                    Quay về Đăng nhập
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

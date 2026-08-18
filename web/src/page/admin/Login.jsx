import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Lock, User, ShieldAlert, Waves, AlertTriangle, Radio } from "lucide-react";
import adminApi from "../../api/adminApi";
import { setAdminToken } from "../../services/auth";
import authBg from "../../assets/images/auth_bg.svg";

export default function AdminLogin() {
    const { t } = useTranslation();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [remember, setRemember] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const data = await adminApi.login({ username, password });
            setAdminToken(data.token);
            navigate("/admin/pending");
        } catch (err) {
            setError(err.response?.data?.error || t('adminLogin.defaultError'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-screen flex items-center justify-center relative overflow-hidden"
            style={{ backgroundImage: `url(${authBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>

            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/40" />

            <div className="relative z-10 w-full max-w-5xl mx-4 flex rounded-2xl overflow-hidden shadow-2xl"
                style={{ boxShadow: "0 0 80px rgba(30,64,175,0.4)" }}>

                {/* ── Left panel: branding ── */}
                <div className="hidden md:flex flex-col justify-between w-[52%] bg-gradient-to-br from-slate-900/95 via-blue-950/95 to-slate-900/95 p-10 backdrop-blur-md border-r border-blue-800/30">
                    {/* Logo + title */}
                    <div>
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                                <Waves size={22} className="text-white" />
                            </div>
                            <div>
                                <p className="text-blue-300 text-xs font-bold uppercase tracking-widest">NCKH System</p>
                                <p className="text-white text-sm font-black leading-tight">{t('adminLogin.brandTagline')}</p>
                            </div>
                        </div>

                        <h1 className="text-3xl font-black text-white leading-tight mb-3">
                            {t('adminLogin.heroTitle1')}<br />
                            <span className="text-blue-400">{t('adminLogin.heroTitle2')}</span>
                        </h1>
                        <p className="text-slate-400 text-sm leading-relaxed mb-8">
                            {t('adminLogin.heroDesc')}
                        </p>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-3 mb-8">
                            {[
                                { icon: <Radio size={16} />, val: "16", label: t('adminLogin.statReservoirs'), color: "text-cyan-400" },
                                { icon: <Waves size={16} />, val: "28", label: t('adminLogin.statRainStations'), color: "text-blue-400" },
                                { icon: <AlertTriangle size={16} />, val: "24/7", label: t('adminLogin.statMonitoring'), color: "text-amber-400" },
                                { icon: <ShieldAlert size={16} />, val: "LSTM", label: t('adminLogin.statAiModel'), color: "text-emerald-400" },
                            ].map(({ icon, val, label, color }) => (
                                <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3 backdrop-blur-sm">
                                    <span className={color}>{icon}</span>
                                    <div>
                                        <p className={`text-sm font-black ${color}`}>{val}</p>
                                        <p className="text-slate-400 text-xs">{label}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Warning badge */}
                        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                            <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                            <p className="text-amber-300 text-xs font-semibold leading-relaxed">
                                {t('adminLogin.seasonNotice')}
                            </p>
                        </div>
                    </div>

                    {/* Footer */}
                    <p className="text-slate-600 text-xs">{t('adminLogin.footer')}</p>
                </div>

                {/* ── Right panel: form ── */}
                <div className="flex-1 bg-slate-950/90 backdrop-blur-xl p-10 flex flex-col justify-center">
                    <div className="mb-8">
                        {/* Mobile logo */}
                        <div className="md:hidden flex items-center gap-2 mb-6">
                            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                                <Waves size={18} className="text-white" />
                            </div>
                            <p className="text-white font-black text-sm">{t('adminLogin.mobileBrand')}</p>
                        </div>
                        <h2 className="text-2xl font-black text-white">{t('adminLogin.signInTitle')}</h2>
                        <p className="text-slate-400 text-sm mt-1">{t('adminLogin.signInSubtitle')}</p>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 bg-red-500/15 border border-red-500/40 rounded-xl px-4 py-3 mb-5">
                            <AlertTriangle size={15} className="text-red-400 shrink-0" />
                            <p className="text-red-300 text-sm">{error}</p>
                        </div>
                    )}

                    <form onSubmit={submit} className="space-y-5">
                        {/* Username */}
                        <div>
                            <label className="block text-slate-300 text-xs font-bold uppercase tracking-wide mb-2">
                                {t('adminLogin.usernameLabel')}
                            </label>
                            <div className="relative">
                                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text" value={username} onChange={e => setUsername(e.target.value)}
                                    placeholder={t('adminLogin.usernamePlaceholder')}
                                    required
                                    className="w-full bg-slate-800/70 border border-slate-700 hover:border-slate-500 focus:border-blue-500 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder-slate-500 outline-none transition-colors"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-slate-300 text-xs font-bold uppercase tracking-wide mb-2">
                                {t('adminLogin.passwordLabel')}
                            </label>
                            <div className="relative">
                                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type={showPw ? "text" : "password"} value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder={t('adminLogin.passwordPlaceholder')}
                                    required
                                    className="w-full bg-slate-800/70 border border-slate-700 hover:border-slate-500 focus:border-blue-500 rounded-xl pl-10 pr-11 py-3 text-white text-sm placeholder-slate-500 outline-none transition-colors"
                                />
                                <button type="button" onClick={() => setShowPw(v => !v)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors">
                                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Options row */}
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 accent-blue-500" />
                                <span className="text-slate-400 text-sm">{t('adminLogin.rememberMe')}</span>
                            </label>
                            <Link to="/admin/forgot-password"
                                className="text-blue-400 hover:text-blue-300 text-sm font-semibold transition-colors">
                                {t('adminLogin.forgotPassword')}
                            </Link>
                        </div>

                        {/* Submit */}
                        <button type="submit" disabled={loading}
                            className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            style={{
                                background: loading ? "#1d4ed8" : "linear-gradient(135deg, #2563eb, #0ea5e9)",
                                boxShadow: loading ? "none" : "0 4px 20px rgba(37,99,235,0.45)",
                                color: "white",
                            }}>
                            {loading ? (
                                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('adminLogin.processing')}</>
                            ) : (
                                <><ShieldAlert size={16} /> {t('adminLogin.signIn')}</>
                            )}
                        </button>
                    </form>

                    {/* Register link */}
                    <p className="text-center text-slate-500 text-sm mt-6">
                        {t('adminLogin.noAccount')}{" "}
                        <Link to="/admin/register" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                            {t('adminLogin.registerNow')}
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

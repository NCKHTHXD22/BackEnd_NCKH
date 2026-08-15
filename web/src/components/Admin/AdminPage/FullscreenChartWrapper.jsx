import React, { useState, useRef, useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

/**
 * Wraps a chart in a fullscreen toggle. On enter, best-effort locks the
 * screen to landscape via the Orientation Lock API — only Android Chrome
 * (and similar) support this; iOS Safari and most other browsers silently
 * ignore it, so users there still need to rotate their phone manually.
 */
export default function FullscreenChartWrapper({ children, className = "", label = "Toàn màn hình" }) {
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => {
      const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
      setIsFullscreen(active);
      if (!active && screen.orientation?.unlock) {
        try { screen.orientation.unlock(); } catch { /* ignore */ }
      }
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  const enterFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      if (screen.orientation?.lock) {
        await screen.orientation.lock("landscape").catch(() => {});
      }
    } catch {
      // Fullscreen unavailable/denied — no-op, user can still rotate manually
    }
  };

  const exitFullscreen = () => {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  };

  return (
    <div
      ref={containerRef}
      className={`${className} relative ${isFullscreen ? "!h-screen !w-screen bg-white p-3 flex flex-col" : ""}`}
    >
      <button
        onClick={isFullscreen ? exitFullscreen : enterFullscreen}
        className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-white/95 hover:bg-white border border-slate-200 shadow-sm text-slate-600 hover:text-blue-600 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
        title={isFullscreen ? "Thu nhỏ" : label}
      >
        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        <span className="hidden sm:inline">{isFullscreen ? "Thu nhỏ" : label}</span>
      </button>
      <div className={isFullscreen ? "flex-1 min-h-0" : "h-full"}>
        {children}
      </div>
    </div>
  );
}

// Lớp Tailwind dùng chung cho các panel bản đồ 3D – chép đúng mẫu của HomePage (panel nền bản đồ,
// nút nổi) để trang 3D cùng một giao diện với phần còn lại của web.

export const PANEL =
  'bg-white rounded-2xl shadow-2xl shadow-blue-900/20 overflow-hidden text-sm border border-blue-100';
export const PANEL_HEAD =
  'bg-gradient-to-r from-blue-50 to-sky-50 px-3 py-2.5 border-b border-blue-100 font-semibold flex justify-between items-center gap-2 text-slate-700';
export const ICON_BTN =
  'w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/10 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200';
export const ICON_BTN_IDLE = 'bg-white text-slate-600 hover:text-blue-600 hover:bg-blue-50';
export const ICON_BTN_ON = 'bg-blue-600 text-white';
export const PILL_BTN =
  'inline-flex items-center gap-2 px-3 h-9 rounded-xl text-sm font-semibold transition-all duration-200 whitespace-nowrap';
export const PILL_IDLE = 'bg-white text-slate-700 border border-slate-200 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50';
export const PILL_ON = 'bg-blue-600 text-white border border-blue-600';
export const PILL_PRIMARY = 'bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-md shadow-blue-600/20 hover:shadow-lg';

/** Nút vuông có chú thích khi rê chuột – giống SidebarIcon của HomePage. */
export function IconButton({ icon, label, active, onClick, side = 'right', className = '' }) {
  return (
    <div className="relative group">
      <button onClick={onClick} title={label} aria-label={label}
        className={`${ICON_BTN} ${active ? ICON_BTN_ON : ICON_BTN_IDLE} ${className}`}>
        {icon}
      </button>
      <div className={`absolute top-1/2 -translate-y-1/2 hidden group-hover:block bg-slate-800 text-white text-xs px-2 py-1 rounded-md whitespace-nowrap shadow-md z-50 ${side === 'right' ? 'left-full ml-2' : 'right-full mr-2'}`}>
        {label}
      </div>
    </div>
  );
}

export function CloseButton({ onClick, label }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className="w-7 h-7 shrink-0 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/70 flex items-center justify-center text-lg leading-none">
      ×
    </button>
  );
}

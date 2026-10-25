import { useTranslation } from 'react-i18next';
import { FaLayerGroup } from 'react-icons/fa';
import { pick } from '../data/fields.js';
import { PANEL, PANEL_HEAD, CloseButton } from './ui.jsx';

/** Bảng lớp bản đồ: bật/tắt, độ trong suốt, chú giải. Danh mục lấy từ /data/dt/layers.json. */
export default function LayerPanel({ catalog, state, onToggle, onOpacity, onClose, footer, className = '' }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (!catalog) return null;
  return (
    <div className={`${PANEL} flex flex-col ${className}`}>
      <div className={PANEL_HEAD}>
        <span className="flex items-center gap-2"><FaLayerGroup className="text-blue-600" /> {t('digitalTwin.layers.title')}</span>
        {onClose && <CloseButton onClick={onClose} label={t('digitalTwin.layers.collapse')} />}
      </div>
      <div className="p-3 overflow-y-auto">
        {catalog.groups.map((g, gi) => {
          const items = catalog.layers.filter(l => l.group === g);
          if (!items.length) return null;
          return (
            <section key={g} className="mb-2 last:mb-0">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1 mb-1.5">
                {(lang === 'en' && catalog.groups_en?.[gi]) || g}
              </h3>
              {items.map(l => {
                const s = state[l.id] ?? {};
                const name = pick(l, 'name', lang);
                if (l.type === 'pending') {
                  return (
                    <div key={l.id} className="py-1.5 border-b border-slate-100 last:border-0 opacity-60" title={pick(l, 'pending', lang)}>
                      <label className="flex items-center gap-2 text-slate-500"><input type="checkbox" disabled className="accent-blue-600" /> {name}</label>
                      <p className="ml-6 text-[11px] text-slate-400 leading-snug">{pick(l, 'pending', lang)}</p>
                    </div>
                  );
                }
                const enabled = ['ready', 'idle'].includes(s.status);
                return (
                  <div key={l.id} className="py-1.5 border-b border-slate-100 last:border-0">
                    <label className={`flex items-center gap-2 font-medium ${enabled ? 'text-slate-700 cursor-pointer' : 'text-slate-400'}`}>
                      <input type="checkbox" className="accent-blue-600" checked={Boolean(s.visible)} disabled={!enabled}
                        onChange={e => onToggle(l.id, e.target.checked)} />
                      <span className="flex-1">{name}</span>
                      {l.purpose === 'illustrative' && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1"
                          title={pick(l, 'accuracy', lang)}>{t('digitalTwin.layers.illustrative')}</span>
                      )}
                      {s.status === 'loading' && <span className="text-[11px] text-blue-500 animate-pulse-soft">{t('digitalTwin.layers.loading')}</span>}
                      {s.status === 'idle' && <span className="text-[11px] text-slate-400">{t('digitalTwin.layers.idle')}</span>}
                      {s.status === 'error' && <span className="text-[11px] text-red-500">{t('digitalTwin.layers.error')}</span>}
                    </label>
                    {s.visible && s.status === 'ready' && (
                      <div className="ml-6 mt-1">
                        <input type="range" min="0" max="1" step="0.05" value={s.opacity ?? 1}
                          onChange={e => onOpacity(l.id, Number(e.target.value))}
                          aria-label={`${t('digitalTwin.layers.opacity')} – ${name}`} className="w-full accent-blue-600" />
                        <ul className="mt-0.5 space-y-0.5">
                          {l.legend?.map(x => (
                            <li key={x.label} className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
                              <i className="inline-block w-3 h-3 rounded-sm border border-slate-300" style={{ background: x.color }} />
                              {pick(x, 'label', lang)}
                            </li>
                          ))}
                        </ul>
                        {l.accuracy && <p className="mt-1 text-[11px] leading-snug text-slate-400">{pick(l, 'accuracy', lang)}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      {footer && <div className="px-3 py-2 border-t border-slate-100 text-[11px] text-slate-400 bg-slate-50/60">{footer}</div>}
    </div>
  );
}

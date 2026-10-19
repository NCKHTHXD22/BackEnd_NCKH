import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FaInfoCircle } from 'react-icons/fa';
import { FIELDS, fmt, pick } from '../data/fields.js';
import { PANEL, PANEL_HEAD, CloseButton } from './ui.jsx';

// Bảng thông tin khi bấm vào một đối tượng. Thẻ "Hiện trạng" và "Dự báo" nối API ở giai đoạn 2.
export default function InfoPanel({ info, related, onClose, onGoto, onOpenLake, className = '' }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [tab, setTab] = useState('info');
  useEffect(() => setTab('info'), [info?.props?.code]);
  if (!info) return null;
  const { layer, props } = info;
  const fields = (FIELDS[layer.id] ?? []).filter(([k]) => props[k] != null && props[k] !== '');
  const TABS = [['info', 'tabInfo'], ['live', 'tabLive'], ['fc', 'tabForecast']];

  return (
    <div className={`${PANEL} flex flex-col animate-fade-in ${className}`}>
      <div className={PANEL_HEAD}>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5"><FaInfoCircle className="text-blue-600" /> {pick(layer, 'name', lang)}</p>
          <h2 className="text-base font-bold text-slate-800 leading-snug break-words">{props.name ?? props.code}</h2>
          <code className="text-[11px] text-slate-400">{props.code}</code>
        </div>
        <CloseButton onClick={onClose} label={t('digitalTwin.info.close')} />
      </div>
      <div className="flex gap-1 px-3 pt-3">
        {TABS.map(([k, key]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tab === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700'}`}>
            {t(`digitalTwin.info.${key}`)}
          </button>
        ))}
      </div>
      <div className="p-3 overflow-y-auto">
        {tab === 'info' && (
          <>
            {fields.length ? (
              <table className="w-full text-[13px]">
                <tbody>
                  {fields.map(([k, unit]) => (
                    <tr key={k} className="border-b border-slate-100 last:border-0">
                      <th className="text-left font-normal text-slate-500 py-1.5 pr-2 align-top w-[52%]">{t(`digitalTwin.field.${k}`)}</th>
                      <td className="py-1.5 font-medium text-slate-800">
                        {fmt(props[k], lang)}{unit ? ` ${t(`digitalTwin.unit.${unit}`)}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-xs text-slate-400">{t('digitalTwin.info.noProps')}</p>}
            {layer.id === 'reservoirs' && props.has_spec === false && (
              <p className="mt-2 text-xs bg-amber-50 border-l-4 border-amber-400 text-amber-800 rounded px-2.5 py-2">{t('digitalTwin.info.noSpec')}</p>
            )}
            {(related.length > 0 || (layer.id === 'reservoirs' && onOpenLake)) && (
              <>
                <h4 className="mt-3 mb-1.5 text-xs font-bold text-slate-600">{t('digitalTwin.info.related')}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {layer.id === 'reservoirs' && onOpenLake && (
                    <button onClick={() => onOpenLake(props.lake_id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-sm hover:shadow">
                      {t('digitalTwin.info.openLake')}
                    </button>
                  )}
                  {related.map(r => (
                    <button key={r.code} onClick={() => onGoto(r.layerId, r.code)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-blue-200 text-blue-700 hover:bg-blue-50">
                      {t(r.labelKey)}
                    </button>
                  ))}
                </div>
              </>
            )}
            {layer.source && <p className="mt-3 text-[11px] text-slate-400">{t('digitalTwin.info.source', { src: pick(layer, 'source', lang) })}</p>}
          </>
        )}
        {tab !== 'info' && (
          <p className="text-xs bg-blue-50 border-l-4 border-blue-400 text-slate-700 rounded px-2.5 py-2">
            {t(tab === 'live' ? 'digitalTwin.info.liveSoon' : 'digitalTwin.info.forecastSoon')}
          </p>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { FIELDS, fmt } from '../data/fields.js';

// Bảng thông tin khi bấm vào một đối tượng. Thẻ "Hiện trạng" và "Dự báo" sẽ nối API backend
// ở giai đoạn tích hợp (xem README – mục Tích hợp).
export default function InfoPanel({ info, related, onClose, onGoto, shifted }) {
  const [tab, setTab] = useState('info');
  useEffect(() => setTab('info'), [info?.props?.code]);
  if (!info) return null;
  const { layer, props } = info;
  const fields = (FIELDS[layer.id] ?? []).filter(([k]) => props[k] != null && props[k] !== '');

  return (
    <aside className={`panel info-panel ${shifted ? 'shifted' : ''}`}>
      <header>
        <div>
          <small>{layer.name}</small>
          <h2>{props.name ?? props.code}</h2>
          <code>{props.code}</code>
        </div>
        <button className="icon" onClick={onClose} title="Đóng">×</button>
      </header>
      <nav className="tabs">
        {[['info', 'Thông tin'], ['live', 'Hiện trạng'], ['fc', 'Dự báo']].map(([k, t]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>
        ))}
      </nav>
      {tab === 'info' && (
        <div className="body">
          {fields.length ? (
            <table><tbody>
              {fields.map(([k, label, unit]) => (
                <tr key={k}><th>{label}</th><td>{fmt(props[k])}{unit ? ` ${unit}` : ''}</td></tr>
              ))}
            </tbody></table>
          ) : <p className="muted">Chưa có thuộc tính.</p>}
          {layer.id === 'reservoirs' && props.has_spec === false && (
            <p className="note">Chưa có thông số kỹ thuật của hồ này trong dữ liệu backend.</p>
          )}
          {related.length > 0 && (
            <>
              <h4>Liên quan</h4>
              <ul className="related">
                {related.map(r => <li key={r.code}><button onClick={() => onGoto(r.layerId, r.code)}>{r.label}</button></li>)}
              </ul>
            </>
          )}
          {layer.source && <p className="muted src">Nguồn: {layer.source}</p>}
        </div>
      )}
      {tab !== 'info' && (
        <div className="body">
          <p className="note">
            {tab === 'live'
              ? 'Số liệu thực đo (mực nước, lưu lượng đến/xả, mưa) sẽ hiển thị ở đây khi kết nối API backend.'
              : 'Dự báo lưu lượng 12 giờ (LSTM/XGBoost, dải p10–p90) sẽ hiển thị ở đây khi kết nối API backend.'}
          </p>
        </div>
      )}
    </aside>
  );
}

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts';
import mapApi from '../../api/mapApi';

// Khoảng xem nhanh: 3 ngày gần nhất và hai trận lũ thử 2025 (số liệu giờ VNDMS đã nạp vào CSDL)
const RANGES = [
    { key: 'recent', days: 3 },
    { key: 'flood1', from: '2025-10-26T00:00:00+07:00', to: '2025-11-03T00:00:00+07:00' },
    { key: 'flood2', from: '2025-11-15T00:00:00+07:00', to: '2025-11-23T00:00:00+07:00' },
];
const ALARM_COLORS = ['#eab308', '#f97316', '#dc2626'];

/** Biểu đồ mực nước giờ của một trạm (popup bản đồ trang chủ), kèm vạch báo động I/II/III. */
export default function StationLevelChart({ station }) {
    const { t, i18n } = useTranslation();
    const locale = i18n.language === 'en' ? 'en-GB' : 'vi-VN';
    const [range, setRange] = useState('recent');
    const [state, setState] = useState({ loading: true, data: [], error: false });

    useEffect(() => {
        let alive = true;
        const r = RANGES.find(x => x.key === range);
        const to = r.to ? new Date(r.to) : new Date();
        const from = r.from ? new Date(r.from) : new Date(to.getTime() - r.days * 86400e3);
        setState(s => ({ ...s, loading: true, error: false }));
        mapApi.getWaterLevelObservations(station.code, from.toISOString(), to.toISOString())
            .then(res => alive && setState({ loading: false, error: false, data: (res.data ?? []).map(d => ({ t: new Date(d.t_obs).getTime(), h: d.level })) }))
            .catch(() => alive && setState({ loading: false, error: true, data: [] }));
        return () => { alive = false; };
    }, [range, station.code]);

    const th = station.thresholds ?? {};
    const alarms = [th.level1, th.level2, th.level3].map((v, i) => [v, i]).filter(([v]) => v != null);
    const fmtTime = v => new Date(v).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const ys = [...state.data.map(d => d.h), ...alarms.map(([v]) => v)];
    const domain = ys.length ? [Math.floor(Math.min(...ys) - 0.5), Math.ceil(Math.max(...ys) + 0.5)] : ['auto', 'auto'];

    return (
        <div style={{ width: 300 }}>
            <div style={{ display: 'flex', gap: 4, margin: '6px 0' }}>
                {RANGES.map(r => (
                    <button key={r.key} onClick={() => setRange(r.key)}
                        style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1',
                                 background: range === r.key ? '#2563eb' : '#fff', color: range === r.key ? '#fff' : '#334155' }}>
                        {t(`map.levelChart.${r.key}`)}
                    </button>
                ))}
            </div>
            <div style={{ height: 150 }}>
                {state.loading ? <p style={{ fontSize: 12, color: '#64748b' }}>{t('map.levelChart.loading')}</p>
                    : state.error ? <p style={{ fontSize: 12, color: '#b91c1c' }}>{t('map.levelChart.error')}</p>
                    : !state.data.length ? <p style={{ fontSize: 12, color: '#64748b' }}>{t('map.levelChart.empty')}</p>
                    : (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={state.data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={v => new Date(v).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} tick={{ fontSize: 10 }} />
                                <YAxis domain={domain} tick={{ fontSize: 10 }} />
                                <Tooltip labelFormatter={fmtTime} formatter={v => [`${v} m`, t('map.waterLevel')]} />
                                {alarms.map(([v, i]) => <ReferenceLine key={i} y={v} stroke={ALARM_COLORS[i]} strokeDasharray="4 2" />)}
                                <Line dataKey="h" stroke="#2563eb" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
            </div>
            {alarms.length > 0 && (
                <p style={{ fontSize: 10.5, color: '#64748b', margin: '4px 0 0' }}>{t('map.levelChart.legend')}</p>
            )}
        </div>
    );
}

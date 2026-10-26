import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import StationLevelChart from '../../../components/Map/StationLevelChart';
import mapApi from '../../../api/mapApi';

const NOTE = 'mt-2 text-xs rounded px-2.5 py-2 border-l-4';

/** Thẻ "Hiện trạng" của trạm quan trắc trên bản đồ 3D: biểu đồ mực nước (trạm thủy văn) hoặc mưa 24 giờ (trạm mưa). */
export default function StationLive({ layerId, props }) {
  const { t } = useTranslation();
  if (layerId === 'wl_stations') {
    return (
      <>
        {props.no_hourly && <p className={`${NOTE} bg-amber-50 border-amber-400 text-amber-800`}>{t('digitalTwin.station.noHourly')}</p>}
        {!props.no_hourly && props.stale && <p className={`${NOTE} bg-slate-50 border-slate-300 text-slate-600`}>{t('digitalTwin.station.stale')}</p>}
        <div className="mt-2 -ml-1"><StationLevelChart station={{ code: props.code, thresholds: props.thresholds }} /></div>
      </>
    );
  }
  return <RainChart uuid={props.uuid} stale={props.stale} />;
}

function RainChart({ uuid, stale }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'vi-VN';
  const [state, setState] = useState({ loading: true, data: [] });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, data: [] });
    mapApi.getRainHistory24h(uuid)
      .then(rows => alive && setState({
        loading: false,
        data: (Array.isArray(rows) ? rows : []).map(r => ({ t: new Date(r.timestamp).getTime(), mm: Number(r.sumDepth) || 0 })).sort((a, b) => a.t - b.t),
      }))
      .catch(() => alive && setState({ loading: false, data: [], error: true }));
    return () => { alive = false; };
  }, [uuid]);
  const hour = v => new Date(v).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return (
    <>
      {stale && <p className={`${NOTE} bg-slate-50 border-slate-300 text-slate-600`}>{t('digitalTwin.station.stale')}</p>}
      <h4 className="mt-2 mb-1 text-xs font-bold text-slate-600">{t('digitalTwin.station.rainTitle')}</h4>
      <div style={{ height: 150 }}>
        {state.loading ? <p className="text-xs text-slate-500 animate-pulse-soft">{t('map.levelChart.loading')}</p>
          : !state.data.length ? <p className="text-xs text-slate-500">{t(state.error ? 'map.levelChart.error' : 'digitalTwin.station.rainEmpty')}</p>
          : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={state.data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={hour} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip labelFormatter={hour} formatter={v => [`${v} mm`, t('digitalTwin.field.rain_mm')]} />
                <Area type="stepAfter" dataKey="mm" stroke="#0284c7" fill="#7dd3fc" fillOpacity={0.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
      </div>
    </>
  );
}

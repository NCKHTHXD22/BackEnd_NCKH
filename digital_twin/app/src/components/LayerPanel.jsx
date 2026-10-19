import { useState } from 'react';

export default function LayerPanel({ catalog, state, onToggle, onOpacity }) {
  const [open, setOpen] = useState(true);
  if (!catalog) return null;
  return (
    <aside className={`panel layer-panel ${open ? '' : 'collapsed'}`}>
      <header>
        <h2>Lớp bản đồ</h2>
        <button className="icon" onClick={() => setOpen(!open)} title={open ? 'Thu gọn' : 'Mở rộng'}>{open ? '‹' : '›'}</button>
      </header>
      {open && catalog.groups.map(g => {
        const items = catalog.layers.filter(l => l.group === g);
        if (!items.length) return null;
        return (
          <section key={g}>
            <h3>{g}</h3>
            {items.map(l => {
              const s = state[l.id] ?? {};
              if (l.type === 'pending') {
                return (
                  <div key={l.id} className="layer pending" title={l.pending}>
                    <label><input type="checkbox" disabled /> {l.name}</label>
                    <small>{l.pending}</small>
                  </div>
                );
              }
              return (
                <div key={l.id} className="layer">
                  <label>
                    <input type="checkbox" checked={Boolean(s.visible)} disabled={!['ready', 'idle'].includes(s.status)}
                      onChange={e => onToggle(l.id, e.target.checked)} />
                    {l.name}
                    {s.status === 'idle' && <em> · bật để tải</em>}
                    {s.status === 'loading' && <em> · đang tải…</em>}
                    {s.status === 'error' && <em className="err"> · chưa có dữ liệu</em>}
                  </label>
                  {s.visible && s.status === 'ready' && (
                    <>
                      <input type="range" min="0" max="1" step="0.05" value={s.opacity ?? 1}
                        onChange={e => onOpacity(l.id, Number(e.target.value))} aria-label={`Độ trong suốt ${l.name}`} />
                      <ul className="legend">
                        {l.legend?.map(x => <li key={x.label}><i style={{ background: x.color }} />{x.label}</li>)}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </aside>
  );
}

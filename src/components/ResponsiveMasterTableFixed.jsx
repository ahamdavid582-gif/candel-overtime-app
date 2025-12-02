import React from 'react';

export default function ResponsiveMasterTableFixed({
  staff = [], entries = [], currentDate = new Date(), startDay = 1, endDay = null,
  calculateEarnings, holidays = [], onHolidayChange = () => {}, onExportXLSX = null, onToggleSafeRenderers = null, safeRenderers = false, onPrint = null, compact = false, onRequestToggleHoliday = null
}) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = endDay || new Date(year, month + 1, 0).getDate();

  const [holidaySet, setHolidaySet] = React.useState(() => new Set((holidays || []).map(h => String(h))));
  React.useEffect(() => setHolidaySet(new Set((holidays || []).map(h => String(h)))), [holidays]);

  const [compactState, setCompactState] = React.useState(() => compact);
  const [fullTable, setFullTable] = React.useState(true);
  const wrapperRef = React.useRef(null);
  const tableRef = React.useRef(null);

  const columns = React.useMemo(() => {
    const cols = ['No','Staff Name','Role'];
    for (let d = startDay; d <= daysInMonth; d++) cols.push(String(d));
    cols.push('Weekday Earnings','Saturday Earnings','Sunday/Holiday Earnings','Total Earnings');
    return cols;
  }, [startDay, daysInMonth]);

  const rows = React.useMemo(() => {
    return (staff || []).map((s, idx) => {
      const row = { no: idx+1, name: s.name||'', role: s.role||'' };
      for (let d = startDay; d <= daysInMonth; d++) {
        const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const entry = (entries||[]).find(e => e.staffId===s.id && e.date===dateKey);
        row[`d${d}`] = (entry && entry.status !== 'disapproved') ? entry.hours : '';
      }
      if (calculateEarnings) {
        try {
          const en = (calculateEarnings.length >= 2) ? calculateEarnings(s.id, Array.from(holidaySet)) : calculateEarnings(s.id);
          if (typeof en === 'number') row.totalEarnings = en;
          else { row.weekdayEarnings = en?.weekday ?? 0; row.saturdayEarnings = en?.saturday ?? 0; row.sundayEarnings = en?.sun ?? en?.sunday ?? 0; row.totalEarnings = en?.total ?? 0; }
        } catch { row.weekdayEarnings = row.saturdayEarnings = row.sundayEarnings = row.totalEarnings = 0; }
      }
      return row;
    });
  }, [staff, entries, startDay, daysInMonth, calculateEarnings, year, month, holidaySet]);

  const getDayBg = React.useCallback((d) => {
    const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (holidaySet.has(dateKey)) return '#fef9c3';
    const weekday = new Date(year, month, d).getDay();
    if (weekday === 6) return '#dbeafe';
    if (weekday === 0) return '#bbf7d0';
    return 'transparent';
  }, [holidaySet, year, month]);

  const toggleHolidayInternal = React.useCallback((d) => {
    const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    setHolidaySet(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey); else next.add(dateKey);
      try { onHolidayChange(Array.from(next)); } catch (e) {}
      return next;
    });
  }, [year, month, onHolidayChange]);

  const onDayHeaderClick = (d) => {
    try {
      if (typeof onRequestToggleHoliday === 'function') {
        const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        onRequestToggleHoliday(dateKey);
        return;
      }
    } catch (e) {}
    const pretty = new Date(year, month, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const ok = window.confirm(`Do you want to Declare ${pretty} a public holiday?`);
    if (!ok) return;
    toggleHolidayInternal(d);
  };

  // Handlers for legacy toolbar are passed in as props from parent (AgSpreadsheet)
  // supported prop names: onBulkApprove, onBulkDelete, onExportXLSX, onScrollLeft, onScrollRight, onToggleSafeRenderers

  React.useEffect(() => {
    const w = wrapperRef.current; const t = tableRef.current; if (!w || !t) return;
    const check = () => { try { if (w && t) { /* no-op */ } } catch (e) {} };
    const ro = new (window.ResizeObserver || class { observe() {} })(check); try { ro.observe(w); ro.observe(t); } catch (e) {}
    window.addEventListener('resize', check); return () => { try { ro.disconnect(); } catch (e) {} window.removeEventListener('resize', check); };
  }, [wrapperRef, tableRef, columns.length]);

  const minWidth = Math.max(1000, columns.length * 110);
  const tableStyle = { borderCollapse: 'collapse', display: 'table', background: '#fff', color: '#000', fontSize: compactState ? 12 : 14 };
  if (fullTable) { tableStyle.width = 'max-content'; tableStyle.minWidth = `${minWidth}px`; } else { tableStyle.width = '100%'; tableStyle.tableLayout = 'fixed'; }

  const weekdayShort = ['Sun.', 'Mon.', 'Tues.', 'Wed.', 'Thurs.', 'Fri.', 'Sat.'];
  const ordinal = (n) => { const v = n % 100; if (v >= 11 && v <= 13) return 'th'; if (n % 10 === 1) return 'st'; if (n % 10 === 2) return 'nd'; if (n % 10 === 3) return 'rd'; return 'th'; };
  const formatDayHeader = (d) => { const dd = new Date(year, month, d); const wd = weekdayShort[dd.getDay()] || ''; return `${wd}, ${d}${ordinal(d)}`; };

  const [hasOverflow, setHasOverflow] = React.useState(false);
  React.useEffect(() => {
    const w = wrapperRef.current; const t = tableRef.current; if (!w || !t) return;
    const check = () => { try { setHasOverflow(w.scrollWidth > w.clientWidth + 1); } catch (e) {} };
    check();
    const ro = new (window.ResizeObserver || class { observe() {} })(check); try { ro.observe(w); ro.observe(t); } catch (e) {}
    window.addEventListener('resize', check); return () => { try { ro.disconnect(); } catch (e) {} window.removeEventListener('resize', check); };
  }, [wrapperRef, tableRef, columns.length, minWidth]);

  return (
    <div ref={wrapperRef} className="responsive-master-wrapper" style={{ WebkitOverflowScrolling: 'touch', background: 'transparent', overflowX: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        {/* Left fixed area: primary actions placed under header (Staff text removed per request) */}
        <div style={{ position: 'sticky', top: 72, left: 16, display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'flex-start', zIndex: 30 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {typeof onExportXLSX === 'function' ? (<button className="btn" onClick={onExportXLSX} style={{ background:'#06b6d4' }}>Export XLSX</button>) : null}
            {typeof onToggleSafeRenderers === 'function' ? (<button className="btn" onClick={onToggleSafeRenderers} style={{ background: safeRenderers ? '#06b6d4' : undefined }}>{safeRenderers ? 'Safe Renderers' : 'Toggle Safe Renderers'}</button>) : null}
          </div>
        </div>
        {/* right-side legend hidden to keep controls left-aligned under Staff */}
        <div style={{ display: 'none' }} />
      </div>

      <div className="responsive-master-inner" style={{ display: 'block', minWidth: fullTable ? `${minWidth}px` : undefined }}>
        <table ref={tableRef} className="responsive-master-table" style={tableStyle}>
          <thead>
            <tr>
              {columns.map((c,i) => {
                        if (i >= 3 && i < 3 + (daysInMonth - startDay + 1)) {
                          const day = startDay + (i - 3); const bg = getDayBg(day) || '#f3f4f6';
                          return (<th key={i} className="day-header" onClick={() => onDayHeaderClick(day)} style={{ cursor: 'pointer', textAlign: 'center', padding: compactState ? '6px 8px' : '8px 10px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: bg, fontWeight: 700 }}>{formatDayHeader(day)}</th>);
                        }
                        if (i === 0) return (<th key={i} className="sticky-col meta-col col-header" style={{ left: 0, width: 60, textAlign: 'left', padding: compactState ? '6px 8px' : '8px 10px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#f3f4f6', fontWeight: 700 }}>{c}</th>);
                        if (i === 1) return (<th key={i} className="sticky-col meta-col col-header" style={{ left: 60, width: 220, textAlign: 'left', padding: compactState ? '6px 8px' : '8px 10px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#f3f4f6', fontWeight: 700 }}>{c}</th>);
                        if (i === 2) return (<th key={i} className="sticky-col meta-col col-header" style={{ left: 280, width: 140, textAlign: 'left', padding: compactState ? '6px 8px' : '8px 10px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#f3f4f6', fontWeight: 700 }}>{c}</th>);
                const earningsStart = columns.length - 4; if (i >= earningsStart) return (<th key={i} className="earnings-col col-header" style={{ textAlign: 'left', padding: compactState ? '6px 8px' : '8px 10px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#f3f4f6', fontWeight: 700 }}>{c}</th>);
                return (<th key={i} className="col-header" style={{ textAlign: 'left', padding: compactState ? '6px 8px' : '8px 10px', borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#fff', fontWeight: 700 }}>{c}</th>);
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid rgba(0,0,0,0.03)' }}>
                <td className="sticky-col meta-col" style={{ left: 0, width: 60, padding: compactState ? '6px 8px' : '8px 10px', background: '#f3f4f6' }}>{r.no}</td>
                <td className="sticky-col meta-col" style={{ left: 60, width: 220, padding: compactState ? '6px 8px' : '8px 10px', background: '#f3f4f6' }}>{r.name}</td>
                <td className="sticky-col meta-col" style={{ left: 280, width: 140, padding: compactState ? '6px 8px' : '8px 10px', background: '#f3f4f6' }}>{r.role}</td>
                {Array.from({ length: daysInMonth - startDay + 1 }).map((_, i) => { const day = startDay + i; const bg = getDayBg(day); return (<td key={i} style={{ padding: compactState ? '6px 8px' : '8px 10px', textAlign: 'center', background: bg }}>{r[`d${day}`]}</td>); })}
                <td className="earnings-col" style={{ padding: compactState ? '6px 8px' : '8px 10px', textAlign: 'right', background: '#f3f4f6' }}>{typeof r.weekdayEarnings !== 'undefined' ? Number(r.weekdayEarnings).toFixed(2) : ''}</td>
                <td className="earnings-col" style={{ padding: compactState ? '6px 8px' : '8px 10px', textAlign: 'right', background: '#f3f4f6' }}>{typeof r.saturdayEarnings !== 'undefined' ? Number(r.saturdayEarnings).toFixed(2) : ''}</td>
                <td className="earnings-col" style={{ padding: compactState ? '6px 8px' : '8px 10px', textAlign: 'right', background: '#f3f4f6' }}>{typeof r.sundayEarnings !== 'undefined' ? Number(r.sundayEarnings).toFixed(2) : ''}</td>
                <td className="earnings-col" style={{ padding: compactState ? '6px 8px' : '8px 10px', textAlign: 'right', background: '#f3f4f6' }}>{typeof r.totalEarnings !== 'undefined' ? Number(r.totalEarnings).toFixed(2) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`overflow-indicator ${hasOverflow ? 'visible' : ''}`} aria-hidden="true" />
    </div>
  );
}

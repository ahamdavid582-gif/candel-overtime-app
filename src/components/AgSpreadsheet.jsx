import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ResponsiveMasterTable from './ResponsiveMasterTableFixed';
import * as XLSX from 'xlsx';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
// Remove legacy ag-grid.css to use the modern Theming API (v33+)
import 'ag-grid-community/styles/ag-theme-alpine.css';

// Register AG Grid community modules (required for ag-grid v34+ modular build)
ModuleRegistry.registerModules([ AllCommunityModule ]);

// Helper to format earnings
const fmt = (v) => Number(v || 0).toFixed(2);

export default function AgSpreadsheet({
  staff = [],
  entries = [],
  currentDate = new Date(),
  onUpdateEntry,
  onDeleteEntry,
  onApproveEntry,
  onToggleHoliday,
  isAdmin = false,
  holidays = [],
  tasks = [],
  calculateEarnings
}) {
  
  const [compactMode, setCompactMode] = useState(false);
  const containerRef = useRef(null);
  const [panelPos, setPanelPos] = useState({ left: 16, top: 120 });

  useEffect(() => {
    const updatePos = () => {
      try {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        // position the panel just inside the left edge of this container
        const left = Math.max(16, Math.round(rect.left + 16));
        // vertical offset below the header area inside the container
        const top = Math.max(72, Math.round(rect.top + 80));
        setPanelPos({ left, top });
      } catch (e) { /* ignore */ }
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => { window.removeEventListener('resize', updatePos); window.removeEventListener('scroll', updatePos, true); };
  }, [containerRef, staff?.length, entries?.length]);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString(undefined, { month: 'long' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const [startDay, setStartDay] = useState(1);
  const [endDay, setEndDay] = useState(daysInMonth);
  const [gridApi, setGridApi] = useState(null);
  const [optimistic, setOptimistic] = useState({});
  const [safeRenderers, setSafeRenderers] = useState(() => {
    try { return !!(import.meta && import.meta.env && import.meta.env.DEV); } catch { return false; }
  }); // when true, use plain cell rendering (no custom renderers)
  // Local holiday tracking so header clicks can immediately toggle UI
  const [localHolidays, setLocalHolidays] = useState(() => new Set(holidays || []));

  useEffect(() => {
    setLocalHolidays(new Set(holidays || []));
  }, [holidays]);

  useEffect(() => {
    if (endDay > daysInMonth) setEndDay(daysInMonth);
    if (startDay > daysInMonth) setStartDay(1);
    if (startDay > endDay) setStartDay(1);
  }, [daysInMonth]);

  

  // Cell & Header renderers (React components) used in AG Grid
  const DayCellRenderer = useCallback((props) => {
    if (!props) return (<div/>);
    const { data, colDef } = props;
    const dayField = colDef.field;
    const day = Number(String(dayField || '').replace(/^d/, ''));
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = entries.find(e => e.staffId === data.id && e.date === dateKey);
    const task = tasks.find(t => t.id === entry?.taskId);
    const borderColor = task?.color || '#e5e7eb';

    // optimistic
    const key = `${data.id}_${dateKey}`;
    const opt = optimistic[key];
    if (opt && opt.action === 'deleted') return (<div style={{color:'#9ca3af'}}>-</div>);
    const status = opt && opt.action === 'approved' ? 'approved' : entry?.status;
    const isApproved = status === 'approved';
    const isPending = !isApproved && !!status; // pending or other non-approved status

    const borderStyle = isPending ? `3px dashed #ef4444` : `3px solid ${borderColor}`;
    const style = { border: borderStyle, padding: 6, borderRadius:6, width:'100%', height:'100%', boxSizing:'border-box', cursor: isAdmin ? 'pointer' : 'default', display:'flex', alignItems:'center', justifyContent:'center', userSelect: 'none' };

    const onClick = (e) => {
      e.stopPropagation();
      if (!isAdmin) return;
      if (!entry) return;
      if (isApproved) return;
      setOptimistic(prev => ({ ...prev, [key]: { action: 'approved' } }));
      if (onApproveEntry) onApproveEntry(data.id, dateKey);
    };
    const onDoubleClick = (e) => {
      e.stopPropagation();
      try {
        const rowIndex = (props.rowIndex !== undefined) ? props.rowIndex : (props.node && props.node.rowIndex);
        const colKey = props.colDef && (props.colDef.colId || props.colDef.field);
        if (props.api && typeof props.api.startEditingCell === 'function') {
          props.api.startEditingCell({ rowIndex, colKey });
        } else if (gridApi && typeof gridApi.startEditingCell === 'function') {
          gridApi.startEditingCell({ rowIndex, colKey });
        }
      } catch { /* ignore */ }
    };

    return (
      <div style={style} onClick={onClick} onDoubleClick={onDoubleClick} title={entry ? (isApproved ? 'Approved' : 'Pending — click to approve; double-click to edit') : 'No entry — double-click to add'}>
        <div>{entry ? (entry.hours || '-') : '-'}</div>
      </div>
    );
  }, [entries, tasks, optimistic, localHolidays, isAdmin, gridApi, onApproveEntry, year, month, safeRenderers]);

  const DayHeaderRenderer = useCallback((props) => {
    if (!props || !props.colDef) return (<div/>);
    const { colDef } = props;
    const colId = (colDef && (colDef.colId || colDef.field || colDef.headerName)) || '';
    const day = Number(String(colId).replace(/^d/, '')) || Number(colDef.headerName) || 0;
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekday = new Date(year, month, day).getDay();
    const isHoliday = localHolidays && localHolidays.has && localHolidays.has(dateKey);

    let bg = 'transparent';
    if (isHoliday) bg = '#fef9c3';
    else if (weekday === 6) bg = '#dbeafe';
    else if (weekday === 0) bg = '#bbf7d0';

    const onClick = (e) => {
      e.stopPropagation?.();
      // Do not toggle local state here — delegate to parent/App so the
      // authoritative `holidays` prop controls the UI. Parent will confirm
      // and persist before updating the `holidays` prop; local state will
      // update via the effect that observes `holidays`.
      try {
        if (onToggleHoliday) onToggleHoliday(dateKey);
      } catch (err) { /* ignore */ }
    };

    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={onClick} title={isHoliday ? 'This day is a holiday — click to toggle' : 'Click to toggle public holiday'}
          style={{ padding: '6px 10px', borderRadius: 8, background: bg, border: 'none', cursor: 'pointer', width: '100%' }}>
          <strong style={{ pointerEvents: 'none' }}>{colDef.headerName}</strong>
        </button>
      </div>
    );
  }, [localHolidays, onToggleHoliday, year, month]);

  // Provide a stable mapping for AG Grid React framework components
  // Not passing frameworkComponents to AgGridReact (invalid gridOptions property for v34+)

  // Provide an explicit `components` mapping so any code or older bundles
  // that reference named renderers (e.g. "dayCellRenderer") won't throw
  // `ReferenceError: components is not defined` when the grid tries to
  // resolve renderer names. This uses stable React callbacks above.
  const components = useMemo(() => ({
    dayCellRenderer: DayCellRenderer,
    dayHeaderRenderer: DayHeaderRenderer
  }), [DayCellRenderer, DayHeaderRenderer]);

  // Expose `components` on the global object as a compatibility shim for
  // any code paths (or older bundles) that refer to a global `components`
  // identifier. This prevents runtime `ReferenceError: components is not defined`.
  // We attach it in an effect and remove it on cleanup to avoid leaking state.
  useEffect(() => {
    try {
      if (typeof globalThis !== 'undefined') globalThis.components = components;
    } catch (e) { /* ignore */ }
    return () => {
      try {
        if (typeof globalThis !== 'undefined' && globalThis.components === components) delete globalThis.components;
      } catch (e) { /* ignore */ }
    };
  }, [components]);

  // Build columns: selection, S/N (pinned), name pinned, role pinned, days, earnings
  const dayCols = useMemo(() => {
    const cols = [];
    for (let d = startDay; d <= endDay; d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      // Provide React renderer components via `components` (ag-grid v34+)
      

  // (frameworkComponents mapping moved below and references stable React functions)

      // push day column for current day
      cols.push({
        field: `d${d}`,
        colId: `d${d}`,
        headerName: String(d),
        headerTooltip: dateKey,
        width: 80,
        editable: true,
        resizable: true,
        // Use named renderer keys so AG Grid can resolve them via `components`
        // (this avoids runtime ReferenceErrors if a `components` mapping is
        // expected by the grid or older bundles).
        cellRenderer: 'dayCellRenderer',
        headerComponent: 'dayHeaderRenderer'
      });

    }
    return cols;
  }, [startDay, endDay, entries, tasks, gridApi, optimistic, localHolidays, safeRenderers, isAdmin, year, month]);

  // Base/pinned columns on the left
  const defaultCols = useMemo(() => ([
    { colId: 'select', headerName: '', width: 50, pinned: 'left', checkboxSelection: true, headerCheckboxSelection: true },
    { field: 'no', headerName: 'No', pinned: 'left', width: 60 },
    { field: 'name', headerName: 'Staff Name', pinned: 'left', width: 220 },
    { field: 'role', headerName: 'Role', pinned: 'left', width: 140 }
  ]), []);

  // Earnings summary columns on the right
  const earningsCols = useMemo(() => ([
    { field: 'weekdayEarnings', headerName: 'Weekday Earnings', width: 140, valueFormatter: params => fmt(params.value) },
    { field: 'saturdayEarnings', headerName: 'Saturday Earnings', width: 140, valueFormatter: params => fmt(params.value) },
    { field: 'sundayEarnings', headerName: 'Sunday/Holiday Earnings', width: 200, valueFormatter: params => fmt(params.value) },
    { field: 'totalEarnings', headerName: 'Total Earnings', width: 140, valueFormatter: params => fmt(params.value) }
  ]), []);

  const columnDefs = useMemo(() => ([...defaultCols, ...dayCols, ...earningsCols]), [defaultCols, dayCols, earningsCols]);

  // rows: build from staff
  const rowData = useMemo(() => {
    return staff.map((s, idx) => {
      const base = { id: s.id, no: String(idx + 1), name: s.name || '', role: s.role || '' };
      for (let d = startDay; d <= endDay; d++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const entry = entries.find(e => e.staffId === s.id && e.date === dateKey);
        base[`d${d}`] = (entry && entry.status !== 'disapproved') ? entry.hours : '';
      }
      // earnings
      if (calculateEarnings) {
        try {
          const en = calculateEarnings(s.id);
          if (typeof en === 'number') {
            base.weekdayEarnings = 0; base.saturdayEarnings = 0; base.sundayEarnings = 0; base.totalEarnings = en;
          } else {
            base.weekdayEarnings = en?.weekday ?? 0;
            base.saturdayEarnings = en?.saturday ?? 0;
            base.sundayEarnings = en?.sun ?? en?.sunday ?? 0;
            base.totalEarnings = en?.total ?? 0;
          }
        } catch { base.weekdayEarnings = base.saturdayEarnings = base.sundayEarnings = base.totalEarnings = 0; }
      }
      return base;
    });
  }, [staff, entries, startDay, endDay, calculateEarnings, year, month]);

  const onGridReady = params => {
    setGridApi(params.api);
    try {
      if (import.meta && import.meta.env && import.meta.env.DEV) {
        setTimeout(() => {
          try {
            const cnt = params.api?.getModel?.()?.getRowCount?.() || 'unknown';
            const colCount = params.columnApi ? (params.columnApi.getAllDisplayedColumns ? params.columnApi.getAllDisplayedColumns().length : 'unknown') : 'unknown';
            console.debug('AG grid ready: rowCount=', cnt, 'colCount=', colCount);
          } catch(e) { console.debug('AG grid ready debug failed', e); }
        }, 50);
      }
    } catch { /* ignore */ }
  };

  const onFirstDataRendered = (params) => {
    try {
      if (params?.api) {
        params.api.sizeColumnsToFit();
        params.api.redrawRows();
        params.api.refreshCells({ force: true });
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    // When gridApi and data become available, refresh and auto-size columns
    if (!gridApi) return;
    try {
      gridApi.sizeColumnsToFit();
      gridApi.redrawRows();
      gridApi.refreshCells({ force: true });
    } catch { /* ignore */ }
  }, [gridApi, rowData, columnDefs]);

  // cell edit handling: when a user edits a day cell
  const onCellValueChanged = useCallback(async (params) => {
    const { colDef, data, newValue } = params;
    const key = colDef.field;
    if (!key || !key.startsWith('d')) return;
    const day = Number(key.replace('d',''));
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const staffId = data.id;
    const val = (newValue || '').toString().trim();
    if (val === '' || val === '0') {
      // delete
      setOptimistic(prev => ({ ...prev, [`${staffId}_${dateKey}`]: { action: 'deleted' } }));
      if (onDeleteEntry) await onDeleteEntry(staffId, dateKey);
    } else {
      const hours = Number(val);
      if (!isNaN(hours) && hours > 0) {
        // save as pending (staff-submitted)
        setOptimistic(prev => ({ ...prev, [`${staffId}_${dateKey}`]: { action: 'pending' } }));
        if (onUpdateEntry) await onUpdateEntry(staffId, dateKey, hours);
      }
    }
  }, [onUpdateEntry, onDeleteEntry, year, month]);

  const bulkApprove = async () => {
    if (!gridApi) return;
    const selected = gridApi.getSelectedRows();
    const toApprove = [];
    selected.forEach(r => {
      for (let d = startDay; d <= endDay; d++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const e = entries.find(x => x.staffId === r.id && x.date === dateKey);
        if (e && e.status !== 'approved') toApprove.push({ staffId: r.id, dateKey });
      }
    });
    // optimistic
    const newOpt = { ...optimistic };
    toApprove.forEach(t => newOpt[`${t.staffId}_${t.dateKey}`] = { action: 'approved' });
    setOptimistic(newOpt);
    for (const t of toApprove) {
      try { if (onApproveEntry) await onApproveEntry(t.staffId, t.dateKey); } catch { /* ignore */ }
    }
  };

  const bulkDelete = async () => {
    if (!gridApi) return;
    const selected = gridApi.getSelectedRows();
    const toDelete = [];
    selected.forEach(r => {
      for (let d = startDay; d <= endDay; d++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const e = entries.find(x => x.staffId === r.id && x.date === dateKey);
        if (e) toDelete.push({ staffId: r.id, dateKey });
      }
    });
    const newOpt = { ...optimistic };
    toDelete.forEach(t => newOpt[`${t.staffId}_${t.dateKey}`] = { action: 'deleted' });
    setOptimistic(newOpt);
    for (const t of toDelete) {
      try { if (onDeleteEntry) await onDeleteEntry(t.staffId, t.dateKey); } catch { /* ignore */ }
    }
  };

  // header template with legend and bulk buttons
  // refs for scrolling and grid api
  const agContainerRef = useRef(null);

  const scrollBy = (delta) => {
    try {
      const c = agContainerRef.current;
      if (c) c.scrollBy({ left: delta, behavior: 'smooth' });
    } catch { /* ignore */ }
  };

  const exportXLSX = () => {
    try {
      // Build header array from columnDefs (use headerName)
      const headers = columnDefs.map(c => c.headerName || c.field || c.colId || '');
      // Build data rows mapping each rowData to header order
      const data = rowData.map(r => {
        const obj = {};
        columnDefs.forEach(col => {
          const key = col.field || col.colId || col.headerName;
          obj[col.headerName || key] = r[key] !== undefined ? r[key] : '';
        });
        return obj;
      });
      const ws = XLSX.utils.json_to_sheet(data, { header: headers });

      // Set column widths: first 4 columns wider, day columns narrower, earnings wider
      ws['!cols'] = headers.map((h, idx) => {
        if (idx < 4) return { wch: 16 };
        if (idx >= 4 && idx < 4 + dayCols.length) return { wch: 8 };
        return { wch: 14 };
      });

      // Header styling
      for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (!ws[addr]) ws[addr] = { t: 's', v: headers[c] };
        ws[addr].s = { font: { bold: true }, alignment: { horizontal: 'center' } };
      }

      // Day column coloring based on holidays/weekends
      for (let d = startDay; d <= endDay; d++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isHoliday = (localHolidays && localHolidays.has && localHolidays.has(dateKey));
        const weekday = new Date(year, month, d).getDay();
        let fillColor = null;
        if (isHoliday) fillColor = 'FFFEF9C3';
        else if (weekday === 6) fillColor = 'FFDBEAFE';
        else if (weekday === 0) fillColor = 'FFFEE2E2';
        if (!fillColor) continue;
        const colIndex = 4 + (d - startDay); // offset: 4 fixed cols before day columns
        // Style header
        const headerAddr = XLSX.utils.encode_cell({ r: 0, c: colIndex });
        if (!ws[headerAddr]) ws[headerAddr] = { t: 's', v: headers[colIndex] };
        ws[headerAddr].s = { ...(ws[headerAddr].s || {}), fill: { patternType: 'solid', fgColor: { rgb: fillColor } } };
        // Style each cell in column
        for (let r = 0; r < data.length; r++) {
          const cellAddr = XLSX.utils.encode_cell({ r: r + 1, c: colIndex });
          if (!ws[cellAddr]) ws[cellAddr] = { t: typeof data[r][headers[colIndex]] === 'number' ? 'n' : 's', v: data[r][headers[colIndex]] };
          ws[cellAddr].s = { ...(ws[cellAddr].s || {}), fill: { patternType: 'solid', fgColor: { rgb: fillColor } } };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Overtime');
      const fileName = `overtime-${monthName}-${year}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (e) { console.error('XLSX export failed', e); }
  };

  const header = (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
      <div>
        <div style={{ color: '#6b7280' }}>Overtime Master Sheet</div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>THE CANDEL FZE — Staff Overtime for {monthName} {year}</div>
        <div style={{ color: '#6b7280', fontSize: 13, marginTop: 6 }}>Staff: {staff?.length ?? 0} · Entries: {entries?.length ?? 0}</div>
      </div>
      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ width:12, height:12, background:'#dbeafe', borderRadius:2 }} /> <small>Sat</small>
          <div style={{ width:12, height:12, background:'#bbf7d0', borderRadius:2 }} /> <small>Sun/Hol</small>
          <div style={{ width:12, height:12, background:'#fef9c3', borderRadius:2 }} /> <small>Holiday</small>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button className="btn" onClick={bulkApprove}>Bulk Approve</button>
          <button className="btn" onClick={bulkDelete} style={{ background:'#ef4444' }}>Bulk Delete</button>
          <button className="btn" onClick={() => scrollBy(-250)} style={{ background:'#111827' }}>◀</button>
          <button className="btn" onClick={() => scrollBy(250)} style={{ background:'#111827' }}>▶</button>
        </div>
        {/* Admin-only Start/End date controls (view range) */}
        {isAdmin ? (
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <div>Start</div>
            <input
              type="date"
              value={`${year}-${String(month+1).padStart(2,'0')}-${String(startDay).padStart(2,'0')}`}
              min={`${year}-${String(month+1).padStart(2,'0')}-01`}
              max={`${year}-${String(month+1).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`}
              onChange={e => {
                const v = e.target.value;
                const d = Number(v.split('-').pop());
                if (!isNaN(d)) setStartDay(Math.max(1, Math.min(d, daysInMonth)));
              }}
            />
            <div>End</div>
            <input
              type="date"
              value={`${year}-${String(month+1).padStart(2,'0')}-${String(endDay).padStart(2,'0')}`}
              min={`${year}-${String(month+1).padStart(2,'0')}-01`}
              max={`${year}-${String(month+1).padStart(2,'0')}-${String(daysInMonth).padStart(2,'0')}`}
              onChange={e => {
                const v = e.target.value;
                const d = Number(v.split('-').pop());
                if (!isNaN(d)) setEndDay(Math.max(1, Math.min(d, daysInMonth)));
              }}
            />
          </div>
        ) : (
          <div style={{ display:'none' }} />
        )}
      </div>
    </div>
  );

  // DEV: removed duplicate columns (defaultCols/earningsCols/columnDefs already defined above)

  // DEV: log counts after columnDefs is available to help diagnose empty-grid cases
  try {
    if (import.meta && import.meta.env && import.meta.env.DEV) {
      // schedule on next tick so React state settled
      setTimeout(() => console.debug('AgSpreadsheet counts', { staff: (staff||[]).length, entries: (entries||[]).length, cols: (columnDefs||[]).length }), 0);
    }
  } catch { /* ignore */ }

  // DEV: create a small visible debug panel for column headers/first row (renders on top of grid)
  const columnDebug = (() => {
    try {
      if (!(import.meta && import.meta.env && import.meta.env.DEV)) return null;
      const headers = (columnDefs || []).slice(0, 8).map(c => c && (c.headerName || c.field || c.colId));
      return (
        <div style={{ color: '#cbd5e1', fontSize: 12, margin: '8px 0', background: 'rgba(255,255,255,0.02)', padding: 8, borderRadius: 6 }}>
          <div><strong>Dev Grid Debug:</strong> cols={columnDefs?.length ?? 0} headers: {headers.join(', ')}</div>
          <div>rows={rowData?.length ?? 0} sample: {rowData && rowData.length ? `${rowData[0].name} (${rowData[0].id})` : '—'}</div>
        </div>
      );
    } catch { return null; }
  })();
  // Compute a reasonable minWidth for the grid so that on small screens the
  // grid will be horizontally scrollable instead of squeezing columns.
  const totalColumnWidth = useMemo(() => {
    const defs = columnDefs || [];
    let total = 0;
    for (const c of defs) {
      if (c && typeof c.width === 'number') total += c.width;
      else total += 100; // fallback default width
    }
    // add a bit of padding
    return total + 40;
  }, [columnDefs]);

  return (
    <div ref={containerRef} style={{ position: 'relative', padding:16, background:'transparent', borderRadius:12, border: '1px solid rgba(255,255,255,0.03)' }}>
      {header}
      {/* Left panel reserved for counts (buttons moved to App.jsx) */}
      <div style={{ position: 'absolute', left: 16, top: 96, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
        <div style={{ color: '#9ca3af', fontSize: 13 }}>Staff: {staff?.length ?? 0} · Entries: {entries?.length ?? 0}</div>
      </div>
      {columnDebug}
      {/* Responsive fallback for narrow viewports (mobile) */}
      {typeof window !== 'undefined' && window.innerWidth < 900 ? (
        <ResponsiveMasterTable
          staff={staff}
          entries={entries}
          currentDate={currentDate}
          startDay={startDay}
          endDay={endDay}
          calculateEarnings={calculateEarnings}
          onBulkApprove={bulkApprove}
          onBulkDelete={bulkDelete}
          onExportXLSX={exportXLSX}
          onScrollLeft={() => scrollBy(-250)}
          onScrollRight={() => scrollBy(250)}
          onToggleSafeRenderers={() => setSafeRenderers(s => !s)}
          safeRenderers={safeRenderers}
          isAdmin={isAdmin}
          onPrint={() => window.print()}
          onRequestToggleHoliday={(dateKey) => { try { if (onToggleHoliday) onToggleHoliday(dateKey); } catch(e){} }}
        />
      ) : null}
      
      {/* DEV: quick test / smoke-check grid to validate AG Grid mounts correctly in the DOM */}
      <div style={{ marginBottom: 8 }}>
        <div className="ag-theme-alpine" style={{ height: 160, width: '100%', border: '1px dashed rgba(255,255,255,0.06)' }}>
          <AgGridReact
            // Small test grid to validate AG Grid rendering separate from the Master Sheet
            rowData={[{ a: 'Test A', b: 1 }, { a: 'Test B', b: 2 }]}
            columnDefs={[{ field: 'a', headerName: 'A' }, { field: 'b', headerName: 'B' }]}
            defaultColDef={{ resizable: true }}
            onGridReady={() => { try { console.debug('SMOKE: test ag-grid mounted'); } catch(e){} }}
            components={components}
            modules={[AllCommunityModule]}
            domLayout="normal"
          />
        </div>
      </div>
      <div ref={agContainerRef} className="ag-theme-alpine" style={{ height: '65vh', width: '100%', overflow: 'auto', background: 'transparent' }}>
        <div style={{ minWidth: totalColumnWidth }}>
            {typeof window !== 'undefined' && window.innerWidth >= 900 ? (
              <AgGridReact
                rowData={rowData}
                columnDefs={columnDefs}
                components={components}
                // components={}, // legacy (JS) components not required – using `frameworkComponents` (React) instead
                // frameworkComponents removed due to AG Grid v34+ gridOptions changes
                onGridReady={onGridReady}
                onFirstDataRendered={onFirstDataRendered}
                defaultColDef={{ resizable: true, minWidth: 60 }}
                headerHeight={44}
                rowHeight={40}
                // Recommended rowSelection format (AG v34+)
                // Use the string form 'multiRow' and configure checkboxes on the
                // column definition (above). Passing an object was causing the
                // runtime warning about an invalid selection mode.
                rowSelection={'multiRow'}
                animateRows={true}
                onCellValueChanged={onCellValueChanged}
                domLayout={'normal'}
              />
            ) : null}
        </div>
      </div>
    </div>
  );
}

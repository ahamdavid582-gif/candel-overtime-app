import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DataGrid } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';

const EarningsFormatter = ({ row, column }) => (
  <div style={{ textAlign: 'right', paddingRight: 8, fontWeight: 600 }}>
    {Number(row[column.key] || 0).toFixed(2)}
  </div>
);

export default function SpreadsheetGrid({
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
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString(undefined, { month: 'long' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const [startDay, setStartDay] = useState(1);
  const [endDay, setEndDay] = useState(daysInMonth);
  const [selectedRows, setSelectedRows] = useState(() => new Set());
  const [optimistic, setOptimistic] = useState({}); // key -> { action: 'approved'|'deleted' }
  useEffect(() => {
    if (endDay > daysInMonth) setEndDay(daysInMonth);
    if (startDay > daysInMonth) setStartDay(1);
    if (startDay > endDay) setStartDay(1);
  }, [daysInMonth, startDay, endDay]);

  // build columns
  const baseColumns = [
    { key: 'select', name: '', width: 44, frozen: true, headerRenderer: () => (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
          <input type="checkbox" onChange={(e)=>{
            if(e.target.checked){
              // select all visible rows
              const allIds = staff.map(s=>s.id);
              setSelectedRows(new Set(allIds));
            } else setSelectedRows(new Set());
          }} />
        </div>
      ) , formatter: ({ row }) => (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
          <input type="checkbox" checked={selectedRows.has(row.id)} onChange={(e)=>{
            const next = new Set(selectedRows);
            if(e.target.checked) next.add(row.id); else next.delete(row.id);
            setSelectedRows(next);
          }} />
        </div>
      )},
    { key: 'no', name: 'No', width: 60, frozen: true },
    { key: 'name', name: 'Staff Name', width: 220, frozen: true },
    { key: 'role', name: 'Role', width: 160, frozen: true }
  ];

  const dayColumns = [];
  for (let d = startDay; d <= endDay; d++) {
    const key = `d${d}`;
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const weekday = new Date(year, month, d).getDay();
    const isHoliday = (holidays || []).includes(dateKey);

    let bg = '#ffffff';
    if (isHoliday) bg = '#fef9c3';
    else if (weekday === 0) bg = '#bbf7d0';
    else if (weekday === 6) bg = '#dbeafe';

    dayColumns.push({
      key,
      name: String(d),
      editable: true,
      width: 80,
      headerRenderer: ({ column }) => (
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', background: bg }}>
          <button
            onClick={(e) => { e.stopPropagation(); if (onToggleHoliday) onToggleHoliday(dateKey); }}
            style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', cursor: 'pointer' }}
            title={`Toggle holiday ${dateKey}`}
          >
            <div style={{ fontWeight: 700 }}>{column.name}</div>
            <div style={{ fontSize: 10, opacity: 0.8 }}>{new Date(year, month, d).toLocaleDateString(undefined, { weekday: 'short' })}</div>
          </button>
        </div>
      )
    });
  }

  const earningsColumns = [
    { key: 'weekdayEarnings', name: 'Weekday Earnings', width: 140, formatter: EarningsFormatter },
    { key: 'saturdayEarnings', name: 'Saturday Earnings', width: 140, formatter: EarningsFormatter, headerRenderer: () => (<div style={{ background: '#dbeafe', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><strong style={{ color: '#0b3d91' }}>Saturday</strong></div>) },
    { key: 'sundayEarnings', name: 'Sunday/Public Holiday Earnings', width: 220, formatter: EarningsFormatter, headerRenderer: () => (<div style={{ background: '#bbf7d0', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><strong style={{ color: '#065f46' }}>Sunday/Holiday</strong></div>) },
    { key: 'totalEarnings', name: 'Total Earnings', width: 140, formatter: EarningsFormatter }
  ];

  const columns = [...baseColumns, ...dayColumns, ...earningsColumns];

  // build rows
  const rows = staff.map((s, idx) => {
    const r = { id: s.id, no: String(idx + 1), name: s.name || '', role: s.role || '' };
    for (let d = startDay; d <= endDay; d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const e = entries.find(x => x.staffId === s.id && x.date === dateKey);
      r[`d${d}`] = e?.hours ?? '';
    }

    // earnings summary via calculateEarnings (assumes includes approved only)
    if (calculateEarnings) {
      try {
        const ent = calculateEarnings(s.id);
        if (typeof ent === 'number') {
          r.weekdayEarnings = 0; r.saturdayEarnings = 0; r.sundayEarnings = 0; r.totalEarnings = ent;
        } else {
          r.weekdayEarnings = ent?.weekday ?? 0;
          r.saturdayEarnings = ent?.saturday ?? 0;
          r.sundayEarnings = ent?.sunday ?? 0;
          r.totalEarnings = ent?.total ?? 0;
        }
      } catch (err) {
        r.weekdayEarnings = r.saturdayEarnings = r.sundayEarnings = r.totalEarnings = 0;
      }
    } else {
      r.weekdayEarnings = r.saturdayEarnings = r.sundayEarnings = r.totalEarnings = 0;
    }

    return r;
  });

  // custom day cell renderer to show border color and pending state
  const DayFormatter = ({ row, column }) => {
    const key = column.key;
    const val = row[key];
    const day = parseInt(key.replace(/^d/, ''), 10);
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // base entry from props
    const entry = entries.find(e => e.staffId === row.id && e.date === dateKey);
    // check optimistic overrides
    const optKey = `${row.id}_${dateKey}`;
    const opt = optimistic[optKey];
    const effectiveEntry = (opt && opt.action === 'deleted') ? null : (entry ? { ...entry, status: opt && opt.action === 'approved' ? 'approved' : entry.status } : entry);
    const task = tasks.find(t => t.id === entry?.taskId);
    const borderColor = task?.color || '#e5e7eb';
    const isPending = effectiveEntry && effectiveEntry.status && effectiveEntry.status !== 'approved';
    const style = { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `${isPending ? 2 : 3}px ${isPending ? 'dashed' : 'solid'} ${borderColor}`, boxSizing: 'border-box', padding: 4, borderRadius: 6, cursor: isAdmin && entry ? 'pointer' : 'default' };

    const onClick = (e) => {
      if (!isAdmin || !entry) return;
      e.stopPropagation();
      // optimistic update
      const key = `${row.id}_${dateKey}`;
      setOptimistic(prev => ({ ...prev, [key]: { action: 'approved' } }));
      if (onApproveEntry) onApproveEntry(row.id, dateKey);
    };

    // if optimistic deleted, render empty
    if (opt && opt.action === 'deleted') {
      return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>-</div>;
    }

    return (
      <div style={style} onClick={onClick} title={effectiveEntry ? (effectiveEntry.status === 'approved' ? 'Approved' : 'Pending — click to approve') : 'No entry'}>
        <div style={{ fontSize: 14 }}>{effectiveEntry ? (val === '' ? '-' : val) : '-'} </div>
      </div>
    );
  };

  const colsWithFormatter = columns.map(c => (String(c.key).startsWith('d') ? { ...c, formatter: DayFormatter } : c));

  const handleRowsChange = (newRows, { indexes }) => {
    // Not used here since we manage editing via onCellEdit
  };

  const onCellCommit = (args) => {
    // react-data-grid v8 emits onRowsChange; if using onCellCommit support, adapt.
  };

  // handle cell edits via grid's onRowsChange alternative: use row update callback
  const gridRef = useRef(null);

  // react-data-grid supports onRowsChange; but our rows are derived from staff and entries — handle edits by catching cell edits using custom editor is more work.
  // Simpler: catch onRowsChange when grid changes and call onUpdateEntry for any changed date columns.

  const onRowsChange = (newRows, change) => {
    if (!change || !change.indexes) return;
    change.indexes.forEach(i => {
      const prev = rows[i] || {};
      const updated = newRows[i] || {};
      for (const key of Object.keys(updated)) {
        if (!key.startsWith('d')) continue;
        const prevVal = prev[key];
        const newVal = updated[key];
        if (String(prevVal) !== String(newVal)) {
          const day = parseInt(key.slice(1), 10);
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const staffId = updated.id;
          const trimmed = (newVal || '').toString().trim();
          if (trimmed === '' || trimmed === '0') {
            if (onDeleteEntry) onDeleteEntry(staffId, dateKey);
          } else {
            const hours = Number(trimmed);
            if (!isNaN(hours) && hours > 0) {
              // when staff edits/creates entry, mark pending
              if (onUpdateEntry) onUpdateEntry(staffId, dateKey, hours);
            }
          }
        }
      }
    });
  };

  // Bulk approve selected rows for visible date range
  const bulkApproveSelected = async () => {
    const toApprove = [];
    for (const staffId of selectedRows) {
      for (let d = startDay; d <= endDay; d++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const e = entries.find(x => x.staffId === staffId && x.date === dateKey);
        if (e && e.status !== 'approved') {
          toApprove.push({ staffId, dateKey });
        }
      }
    }
    // optimistic mark
    const newOpt = { ...optimistic };
    toApprove.forEach(t => { newOpt[`${t.staffId}_${t.dateKey}`] = { action: 'approved' }; });
    setOptimistic(newOpt);
    // call handler
    for (const t of toApprove) {
      try { if (onApproveEntry) await onApproveEntry(t.staffId, t.dateKey); } catch (e) { /* ignore */ }
    }
  };

  const bulkDeleteSelected = async () => {
    const toDelete = [];
    for (const staffId of selectedRows) {
      for (let d = startDay; d <= endDay; d++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const e = entries.find(x => x.staffId === staffId && x.date === dateKey);
        if (e) toDelete.push({ staffId, dateKey });
      }
    }
    const newOpt = { ...optimistic };
    toDelete.forEach(t => { newOpt[`${t.staffId}_${t.dateKey}`] = { action: 'deleted' }; });
    setOptimistic(newOpt);
    for (const t of toDelete) {
      try { if (onDeleteEntry) await onDeleteEntry(t.staffId, t.dateKey); } catch (e) { /* ignore */ }
    }
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow-md master-grid-light" style={{ boxSizing: 'border-box' }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div style={{ color: '#6b7280' }}>Overtime Master Sheet</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>THE CANDEL FZE — Staff Overtime for {monthName} {year}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div>View Range:</div>
          <select value={startDay} onChange={e => setStartDay(Number(e.target.value))}>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={endDay} onChange={e => setEndDay(Number(e.target.value))}>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          
          {/* Legend and bulk actions */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginLeft: 12 }}>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <div style={{ width:12, height:12, background:'#dbeafe', borderRadius:2 }} /> <small>Sat</small>
              <div style={{ width:12, height:12, background:'#bbf7d0', borderRadius:2, marginLeft:6 }} /> <small>Sun/Hol</small>
              <div style={{ width:12, height:12, background:'#fef9c3', borderRadius:2, marginLeft:6 }} /> <small>Holiday</small>
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center', marginLeft: 8 }}>
              <div style={{ padding:'3px 6px', background:'#fef3c7', borderRadius:6, fontSize:12 }}>Pending</div>
              <div style={{ padding:'3px 6px', background:'#ecfccb', borderRadius:6, fontSize:12 }}>Approved</div>
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center', marginLeft: 12 }}>
              <button className="btn" onClick={bulkApproveSelected}>Bulk Approve</button>
              <button className="btn" onClick={bulkDeleteSelected} style={{ background:'#ef4444' }}>Bulk Delete</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxHeight: '65vh', overflow: 'auto' }}>
        <DataGrid
          columns={colsWithFormatter}
          rows={rows}
          onRowsChange={onRowsChange}
          rowKeyGetter={r => r.id}
          className="rdg-master-grid"
          ref={gridRef}
        />
      </div>
    </div>
  );
}

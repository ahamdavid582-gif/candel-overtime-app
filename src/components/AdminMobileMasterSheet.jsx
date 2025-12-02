import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';

// Mobile-friendly master sheet for admin: vertical list per day for selected staff/month
export default function AdminMobileMasterSheet({ staff = [], entries = [], tasks = [], rates = {}, config = {}, year = 2025, onUpdateEntry, onToggleHoliday, onDeleteEntry, calculateEarnings, isAdmin = false }) {
  const monthNames = useMemo(() => ['January','February','March','April','May','June','July','August','September','October','November','December'], []);

  // default to no staff selected so user must pick explicitly
  const [selectedStaff, setSelectedStaff] = useState('');

  // Build monthRange from one year before to one year after current month
  const now = useMemo(() => new Date(), []);
  const monthRange = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setMonth(start.getMonth() - 12);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    end.setMonth(end.getMonth() + 12);
    const arr = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      arr.push({ year: cur.getFullYear(), month: cur.getMonth(), label: `${monthNames[cur.getMonth()]} ${cur.getFullYear()}` });
      cur.setMonth(cur.getMonth() + 1);
    }
    return arr;
  }, [now, monthNames]);

  const defaultMonthIndex = monthRange.findIndex(m => m.year === now.getFullYear() && m.month === now.getMonth());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(defaultMonthIndex >= 0 ? defaultMonthIndex : 0);
  const [localEntries, setLocalEntries] = useState({}); // map date -> entry
  const [editedHours, setEditedHours] = useState({}); // local edited hours to show immediately
  const timersRef = useRef({}); // debounce timers per dateKey

  useEffect(() => {
    // build local map for quick lookup
    const map = {};
    entries.forEach(e => { map[e.date] = e; });
    setLocalEntries(map);
  }, [entries]);

  const selectedMonthObj = monthRange[selectedMonthIndex] || { year, month: 0, label: monthNames[0] };
  const daysInSelectedMonth = useMemo(() => {
    return new Date(selectedMonthObj.year, selectedMonthObj.month + 1, 0).getDate();
  }, [selectedMonthObj]);

  const daysArray = useMemo(() => Array.from({ length: daysInSelectedMonth }, (_, i) => i + 1), [daysInSelectedMonth]);

  const getDateKey = (d) => `${selectedMonthObj.year}-${String(selectedMonthObj.month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const getDayLabel = (d) => {
    const date = new Date(selectedMonthObj.year, selectedMonthObj.month, d);
    const dayName = date.toLocaleDateString(undefined, { weekday: 'short' });
    const dayNum = date.getDate();
    return `${dayName}, ${dayNum}${getOrdinal(dayNum)} ${selectedMonthObj.label}`;
  };
  function getOrdinal(n){ if (n>3 && n<21) return 'th'; switch (n%10){ case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }}

  const getDayType = (dateStr) => {
    if ((config.holidays || []).includes(dateStr)) return 'Holiday';
    const day = new Date(dateStr).getDay(); if (day === 0) return 'Sunday'; if (day === 6) return 'Saturday'; return 'Weekday';
  };

  const calculateAmount = (hours, dateStr) => {
    const type = getDayType(dateStr);
    const h = Number(hours) || 0;
    const val = rates.mode === 'daily' ? (h > 0 ? 1 : 0) : h;
    const rate = type === 'Weekday' ? Number(rates.weekday) || 0 : type === 'Saturday' ? Number(rates.saturday) || 0 : Number(rates.sunday) || 0;
    return val * rate;
  };

  // Debounced update: update UI immediately, send write after delay
  const handleHoursChange = (day, value) => {
    const dateKey = getDateKey(day);
    const raw = value;
    // Allow empty string to represent no entry (useful after disapprove)
    const isEmpty = raw === '' || raw === null || raw === undefined;
    const newHours = isEmpty ? null : Number(raw);
    // Update local edited value for instant feedback
    setEditedHours(prev => ({ ...prev, [dateKey]: isEmpty ? '' : newHours }));

    // Clear existing timer
    if (timersRef.current[dateKey]) clearTimeout(timersRef.current[dateKey]);

    // Schedule debounced write (600ms)
    timersRef.current[dateKey] = setTimeout(async () => {
      try {
        if (!selectedStaff) return;
        if (isEmpty) {
          // If user cleared input, delete the entry so staff can resubmit
          if (onDeleteEntry) await onDeleteEntry(selectedStaff, dateKey);
          else if (onUpdateEntry) await onUpdateEntry(selectedStaff, dateKey, 0);
        } else {
          if (onUpdateEntry) await onUpdateEntry(selectedStaff, dateKey, newHours);
        }
      } catch (e) {
        console.warn('Debounced update failed', e);
      } finally {
        delete timersRef.current[dateKey];
      }
    }, 600);
  };

  const totals = useMemo(() => {
    let wd = 0, sat = 0, sun = 0;
    daysArray.forEach(d => {
      const dateKey = getDateKey(d);
      const entry = entries.find(e => e.staffId === selectedStaff && e.date === dateKey) || null;
      const hoursForCalc = (entry && entry.status === 'disapproved') ? 0 : (entry ? (entry.hours || 0) : 0);
      const amt = calculateAmount(hoursForCalc, dateKey);
      const t = getDayType(dateKey);
      if (t === 'Weekday') wd += amt;
      else if (t === 'Saturday') sat += amt;
      else sun += amt;
    });
    return { weekday: wd, saturday: sat, sunday: sun, total: wd + sat + sun };
  }, [entries, selectedStaff, selectedMonthIndex, daysArray]);

  return (
    <div className="p-4 w-full max-w-full mx-auto text-white">
      <h3 className="text-lg font-bold mb-3">Admin - Mobile Overtime Editor</h3>
      <div className="flex gap-2 mb-3">
        <button onClick={() => {
          try {
            // Build export similar to UI rows with simple formatting
            const headers = ['Date', 'Day', 'Hours', 'Task', 'Amount'];
            const data = daysArray.map(d => {
              const dateKey = getDateKey(d);
              const entry = entries.find(e => e.staffId === selectedStaff && e.date === dateKey) || null;
              const task = entry ? (tasks.find(t => t.id === entry.taskId) || null) : null;
              const hours = entry ? (entry.hours || 0) : 0;
              return [dateKey, getDayLabel(d), hours, task ? task.name : '', calculateAmount(hours, dateKey)];
            });
            const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

            // Column widths
            ws['!cols'] = [ { wch: 14 }, { wch: 18 }, { wch: 8 }, { wch: 20 }, { wch: 12 } ];

            // Header style bold
            for (let c = 0; c < headers.length; c++) {
              const addr = XLSX.utils.encode_cell({ r: 0, c });
              if (!ws[addr]) ws[addr] = { t: 's', v: headers[c] };
              ws[addr].s = { font: { bold: true }, alignment: { horizontal: 'center' }, fill: { patternType: 'solid', fgColor: { rgb: 'FFEEEEEE' } } };
            }

            // Day-type row coloring on the Date column
            for (let i = 0; i < daysArray.length; i++) {
              const d = daysArray[i];
              const dateKey = getDateKey(d);
              const dayType = getDayType(dateKey);
              let fill = null;
              if (config.holidays?.includes(dateKey) || dayType === 'Holiday') fill = 'FFFEF9C3';
              else if (dayType === 'Saturday') fill = 'FFDBEAFE';
              else if (dayType === 'Sunday') fill = 'FFFEE2E2';
              if (fill) {
                const addr = XLSX.utils.encode_cell({ r: i + 1, c: 0 });
                if (!ws[addr]) ws[addr] = { t: 's', v: dateKey };
                ws[addr].s = { fill: { patternType: 'solid', fgColor: { rgb: fill } } };
              }
            }

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, `${(staff.find(s=>s.id===selectedStaff)||{}).name || 'staff'}`);
            const fileName = `overtime_${selectedStaff}_${selectedMonthObj.label}.xlsx`;
            XLSX.writeFile(wb, fileName);
          } catch (e) { console.error('Mobile export failed', e); }
        }} className="bg-blue-600 px-3 py-2 rounded text-white">Export XLSX</button>
      </div>
      <div className="space-y-3 mb-4">
        <label className="block text-sm text-gray-300">Staff</label>
        <select value={selectedStaff} onChange={e => setSelectedStaff(e.target.value)} className="w-full p-3 rounded-lg bg-[#1e1e1e] border border-gray-700">
          <option value="">-Select Staff-</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
        </select>

        <label className="block text-sm text-gray-300">Month</label>
        <input
          type="month"
          value={`${selectedMonthObj.year}-${String(selectedMonthObj.month + 1).padStart(2,'0')}`}
          min={`${monthRange[0].year}-${String(monthRange[0].month + 1).padStart(2,'0')}`}
          max={`${monthRange[monthRange.length - 1].year}-${String(monthRange[monthRange.length - 1].month + 1).padStart(2,'0')}`}
          onChange={e => {
            const [y, m] = e.target.value.split('-').map(Number);
            const idx = monthRange.findIndex(rr => rr.year === y && rr.month === (m - 1));
            if (idx >= 0) setSelectedMonthIndex(idx);
          }}
          className="w-full p-3 rounded-lg bg-[#1e1e1e] border border-gray-700"
        />
      </div>

      <div className="space-y-3">
        {daysArray.map(d => {
          const dateKey = getDateKey(d);
          const entry = entries.find(e => e.staffId === selectedStaff && e.date === dateKey) || null;
          const isDisapproved = entry?.status === 'disapproved';
          const hoursVal = (editedHours[dateKey] !== undefined) ? editedHours[dateKey] : (entry ? (isDisapproved ? '' : (entry.hours || '')) : '');
          const task = entry ? tasks.find(t => t.id === entry.taskId) : null;
          const amount = calculateAmount(hoursVal, dateKey);

          const isHoliday = (config.holidays || []).includes(dateKey);

          return (
            <div key={dateKey} className={`p-3 rounded-lg border border-gray-700 flex items-center justify-between flex-wrap ${isHoliday ? 'bg-yellow-50/20' : 'bg-[#111827]'}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{getDayLabel(d)}</div>
                <div className="text-xs text-gray-400 truncate">{task ? task.name : 'No task assigned'}</div>
              </div>

              <div className="flex items-center gap-3 ml-3 mt-3 sm:mt-0 flex-shrink-0">
                {/* Holiday toggle */}
                <button
                  onClick={async () => {
                    const msg = isHoliday ? `Remove public holiday status for ${getDayLabel(d)}?` : `Declare ${getDayLabel(d)} as a public holiday?`;
                    if (!window.confirm(msg)) return;
                    try {
                      if (onToggleHoliday) await onToggleHoliday(dateKey);
                    } catch (e) { console.warn('Failed to toggle holiday', e); }
                  }}
                  title={isHoliday ? 'Remove Public Holiday' : 'Declare Public Holiday'}
                  className={`p-2 rounded-md text-xs font-semibold ${isHoliday ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-white'}`}>
                  {isHoliday ? 'PH' : 'PH'}
                </button>

                {/* Disapprove button (admin only) */}
                {isAdmin ? (
                  <button
                    onClick={async () => {
                      if (!entry) return;
                      const ok = window.confirm(`Do you want to disapprove overtime by ${entry.staffName || selectedStaff} on ${getDayLabel(d)}?`);
                      if (!ok) return;
                      try {
                        if (onDeleteEntry) {
                          await onDeleteEntry(selectedStaff, dateKey);
                        } else if (onUpdateEntry) {
                          // fallback: remove by updating to 0
                          await onUpdateEntry(selectedStaff, dateKey, 0);
                        }
                        // optimistic UI: clear editedHours and localEntries for immediate empty cell
                        setEditedHours(prev => { const next = { ...prev }; delete next[dateKey]; return next; });
                        setLocalEntries(prev => { const next = { ...prev }; delete next[dateKey]; return next; });
                      } catch (err) { console.warn('Failed to disapprove', err); }
                    }}
                    title="Disapprove Entry"
                    className="p-2 rounded-md text-xs font-semibold bg-red-600 text-white">
                    Disapprove
                  </button>
                ) : null}

                <input type="number" min="0" max="24" value={hoursVal} onChange={e => handleHoursChange(d, e.target.value)} className="w-20 p-2 rounded bg-[#0b1220] text-center" />
                <div className="w-6 h-6 rounded-full" title={task ? task.name : 'No task'} style={{ backgroundColor: task ? task.color : '#64748b' }} />
                <div className="text-sm font-bold">{amount.toFixed(2)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-4 rounded-lg bg-[#0b1220] border border-gray-700">
        <div className="flex justify-between text-sm text-gray-300"><div>Total Weekday Earnings</div><div>{totals.weekday.toFixed(2)}</div></div>
        <div className="flex justify-between text-sm text-gray-300 mt-2"><div>Total Saturday Earnings</div><div>{totals.saturday.toFixed(2)}</div></div>
        <div className="flex justify-between text-sm text-gray-300 mt-2"><div>Total Sunday/PH Earnings</div><div>{totals.sunday.toFixed(2)}</div></div>
        <div className="flex justify-between text-sm font-bold text-white mt-3 border-t pt-3"><div>Total Overtime Earning for {selectedMonthObj.label}</div><div>{totals.total.toFixed(2)}</div></div>
      </div>
    </div>
  );
}

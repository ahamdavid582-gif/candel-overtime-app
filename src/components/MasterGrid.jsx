import React, { useEffect, useState, useRef } from 'react';
import { DataGrid } from 'react-data-grid';
// Import basic styles for react-data-grid so the table is visible in the app
import 'react-data-grid/lib/styles.css';

// Helper component for fixed-width number formatting
const EarningsFormatter = ({ row, column }) => (
  <div className="text-right font-semibold text-gray-800 pr-2">
    {/* Format as currency/decimal */}
    {Number(row[column.key] || 0).toFixed(2)}
  </div>
);

export default function MasterGrid({
  staff = [],
  entries = [],
  currentDate = new Date(),
  onUpdateEntry,
  onDeleteEntry,
  onToggleHoliday,
  holidays = [],
  tasks = [],
  calculateEarnings // function(staffId) -> {weekday, saturday, sunday, total}
}) {
  const [localError, setLocalError] = useState(null);
  const [rows, setRows] = useState([]);
  const prevRowsRef = useRef([]);
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString(undefined, { month: 'long' });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Initialize startDay/endDay with persistent state
  const [startDay, setStartDay] = useState(1);
  const [endDay, setEndDay] = useState(daysInMonth);

  // Ensure endDay is within bounds if month changes or daysInMonth is less than current endDay
  useEffect(() => {
    if (endDay > daysInMonth) {
      setEndDay(daysInMonth);
    }
    if (startDay > daysInMonth) {
        setStartDay(1); // Reset start day if it goes out of bounds
    }
    // Also adjust startDay if it exceeds endDay after endDay adjustment (e.g. month transition)
    if (startDay > endDay) {
        setStartDay(1);
    }
  }, [daysInMonth, endDay, startDay]);

  // Build base columns (frozen S/N and staff columns)
  const baseColumns = [
    { key: 'no', name: 'No', width: 60, frozen: true }, // S/N fixed/frozen
    { key: 'name', name: 'Staff Name', width: 220, frozen: true },
    { key: 'role', name: 'Role', width: 160, frozen: true }
  ];

  // dayColumns will be generated for the visible day range
  const dayColumns = [];
  for (let d = startDay; d <= endDay; d++) {
    const idx = d;
    const key = `d${idx}`;
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(idx).padStart(2, '0')}`;
    const isHoliday = (holidays || []).includes(dateKey);
    const dayName = new Date(year, month, idx).toLocaleDateString(undefined, { weekday: 'short' });

    dayColumns.push({
      key,
      name: String(d),
      editable: true,
      width: 80,
      headerRenderer: ({ column }) => {
        const weekday = new Date(year, month, idx).getDay(); // 0 (Sun) to 6 (Sat)
        
        // Use modern, distinct colors for day types:
        let bgColor = '#ffffff'; // Default white
        if (isHoliday) bgColor = '#fef9c3'; // Public Holiday (Yellow-ish)
        else if (weekday === 0) bgColor = '#bbf7d0'; // Sunday (Green-ish)
        else if (weekday === 6) bgColor = '#dbeafe'; // Saturday (Blue-ish)

        return (
          // Outer div: This is where the color is applied. 
          // Adding a hover effect here is better than on the button, as the button must be transparent.
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'stretch', 
              justifyContent: 'center', 
              height: '100%', 
              background: bgColor,
            }}
            // Fix: Added hover effect on the container to indicate interactivity
            className="transition duration-150 hover:brightness-95" 
          >
            <button
              onClick={(e) => { e.stopPropagation(); if (onToggleHoliday) onToggleHoliday(dateKey); }}
              title={`Toggle holiday ${dateKey}. Current: ${isHoliday ? 'Public Holiday' : dayName}`}
              // Ensure button takes full space and remains transparent
              style={{ 
                border: 'none', 
                background: 'transparent', 
                cursor: 'pointer', 
                padding: '4px', 
                width: '100%', 
                height: '100%',
                outline: 'none'
              }}
              // Fix: Removed the hover class that was adding a white/gray background
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{column.name}</div>
              <div style={{ fontSize: 10, opacity: 0.8 }}>{dayName}</div>
            </button>
          </div>
        );
      }
    });
  }

  // Earnings summary columns
  const earningsColumns = [
    { key: 'weekdayEarnings', name: 'Weekday Earnings', width: 140, formatter: EarningsFormatter },
    { key: 'saturdayEarnings', name: 'Saturday Earnings', width: 140, formatter: EarningsFormatter },
    { key: 'sundayEarnings', name: 'Sunday/Public Holiday Earnings', width: 210, formatter: EarningsFormatter },
    { key: 'totalEarnings', name: 'Total Earnings', width: 140, formatter: EarningsFormatter }
  ];

  const columns = [...baseColumns, ...dayColumns, ...earningsColumns];

  // --- Row Data Generation Effect ---
  useEffect(() => {
    const r = staff.map((s, idx) => {
      let base = { id: s.id, no: String(idx + 1), name: s.name || '', role: s.role || '' };
      
      try {
          // days in selected range
          for (let d = startDay; d <= endDay; d++) {
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const entry = entries.find(e => e.staffId === s.id && e.date === dateKey);
              base[`d${d}`] = entry?.hours ?? '';
          }

          // earnings summary - defer to calculateEarnings if provided
          if (calculateEarnings) {
              try {
                  const earnings = calculateEarnings(s.id);
                  if (typeof earnings === 'number') {
                      base.weekdayEarnings = 0;
                      base.saturdayEarnings = 0;
                      base.sundayEarnings = 0;
                      base.totalEarnings = earnings;
                  } else {
                      base.weekdayEarnings = earnings?.weekday ?? 0;
                      base.saturdayEarnings = earnings?.saturday ?? 0;
                      base.sundayEarnings = earnings?.sunday ?? 0;
                      base.totalEarnings = earnings?.total ?? 0;
                  }
              } catch (err) {
                  // Catch error from calculateEarnings function
                  base.weekdayEarnings = base.saturdayEarnings = base.sundayEarnings = base.totalEarnings = 0;
              }
          } else {
              base.weekdayEarnings = base.saturdayEarnings = base.sundayEarnings = base.totalEarnings = 0;
          }
      } catch (err) {
          console.error('MasterGrid row build error', err);
          setLocalError(err?.message || String(err));
          base = { id: s.id, no: String(idx + 1), name: s.name || 'Error Staff', role: 'Error Role', weekdayEarnings: 0, saturdayEarnings: 0, sundayEarnings: 0, totalEarnings: 0 };
          for (let d = startDay; d <= endDay; d++) base[`d${d}`] = '';
      }

      return base;
    });
    setRows(r);
    prevRowsRef.current = r;
  }, [staff, entries, currentDate, startDay, endDay, calculateEarnings, year, month]);

  // --- Handle Cell Edit ---
  const handleRowsChange = (newRows, { indexes }) => {
    setRows(newRows);
    if (!indexes || indexes.length === 0) return;
    
    indexes.forEach(i => {
      const prev = prevRowsRef.current[i] || {};
      const updated = newRows[i] || {};
      
      for (const key of Object.keys(updated)) {
        // Only process date columns that have changed
        if (!key.startsWith('d')) continue;
        
        const prevVal = prev[key];
        const newVal = updated[key];
        
        if (String(prevVal) !== String(newVal)) {
          const day = parseInt(key.slice(1), 10);
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const staffId = updated.id;
          const trimmed = (newVal || '').toString().trim();
          
          if (trimmed === '' || trimmed === '0') {
            // Delete entry if value is empty or 0
            if (onDeleteEntry) onDeleteEntry(staffId, dateKey);
          } else {
            // Update/create entry
            const hours = Number(trimmed);
            if (!isNaN(hours) && hours > 0) {
              if (onUpdateEntry) onUpdateEntry(staffId, dateKey, hours);
            }
          }
        }
      }
    });
    prevRowsRef.current = newRows.map(r => ({ ...r }));
  };
  
  // --- Error/Fallback UI ---
  if (!DataGrid) {
    return (
      <div className="p-4 bg-red-100 border border-red-300 rounded-lg shadow-md">
        <strong className="text-red-700">Spreadsheet failed to load.</strong>
        <div className="text-sm text-gray-600 mt-2">Check console for import/runtime errors (react-data-grid).</div>
      </div>
    );
  }

  if (localError) {
    return (
      <div className="p-4 bg-yellow-100 border border-yellow-300 rounded-lg shadow-md">
        <strong className="text-yellow-800">Spreadsheet runtime error:</strong>
        <div className="text-sm text-gray-600 mt-2">{localError}</div>
      </div>
    );
  }

  // Custom formatter for day cells to apply task-border coloring
  const DayFormatter = ({ row, column }) => {
    const key = column.key;
    const val = row[key];
    
    // derive date from key
    const day = parseInt(key.replace(/^d/, ''), 10);
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = entries.find(e => e.staffId === row.id && e.date === dateKey);
    const task = tasks.find(t => t.id === entry?.taskId);
    // Use task color or a default light gray border
    const borderColor = task?.color || '#e5e7eb'; 

    const style = { 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        border: `3px solid ${borderColor}`, // Thicker border for better visibility
        boxSizing: 'border-box',
        padding: '2px', 
    };
    // Display '-' for empty cells for better visual clarity
    return <div style={style} className="text-sm">{val === '' ? '-' : val}</div>; 
  };

  // attach formatter for day columns
  const colsWithFormatters = columns.map(c => {
    if (c.key && String(c.key).startsWith('d')) {
        return { ...c, formatter: DayFormatter };
    }
    // Earnings columns already have formatter attached
    return c;
  });

  return (
    // FIX: Added 'master-grid-light' class to ensure CSS overrides for coloring apply correctly
    <div className="p-6 bg-white shadow-xl rounded-xl master-grid-light">
      <div className="mb-6 pb-4 border-b border-gray-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Modernized Header */}
        <div className="text-xl md:text-2xl font-extrabold text-gray-800">
          THE CANDEL FZE — Staff Overtime for {monthName}
        </div>
        
        {/* Day Range Selectors */}
        <div className="flex items-center gap-4 text-sm font-medium text-gray-700">
          <label>View Range:</label>
          <div className="flex items-center gap-2">
            <label>From</label>
            <select 
              value={startDay} 
              onChange={e => setStartDay(Number(e.target.value))} 
              className="border border-gray-300 rounded-md px-3 py-1 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500 transition"
            >
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => <option key={d} value={d} disabled={d > endDay}>{d}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <label>To</label>
            <select 
              value={endDay} 
              onChange={e => setEndDay(Number(e.target.value))} 
              className="border border-gray-300 rounded-md px-3 py-1 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500 transition"
            >
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => <option key={d} value={d} disabled={d < startDay}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* DataGrid Container */}
      <div style={{ height: '70vh' }} className="rounded-lg overflow-hidden border border-gray-200">
        <DataGrid 
          columns={colsWithFormatters} 
          rows={rows} 
          onRowsChange={handleRowsChange} 
          rowKeyGetter={r => r.id} 
          className="rdg-master-grid"
        />
      </div>
    </div>
  );
}
// This file contains the MasterGrid component for managing staff overtime.
// It utilizes the react-data-grid library for displaying data in a grid format.
// Ensure to import necessary styles for proper rendering.
import React, { useEffect, useState, useRef } from 'react';
import { DataGrid } from 'react-data-grid';
// Import basic styles for react-data-grid so the table is visible in the app
import 'react-data-grid/lib/styles.css';
}
  <div className="text-right font-semibold text-gray-800 pr-2">
    {/* Format as currency/decimal */}
    {Number(row[column.key] || 0).toFixed(2)}
  </div>
);

export default function MasterGrid({
  staff = [],
  entries = [],
  currentDate = new Date(),
  onUpdateEntry,
  onDeleteEntry,
  onToggleHoliday,
  holidays = [],
  tasks = [],
  calculateEarnings // function(staffId) -> {weekday, saturday, sunday, total}
}) {
  const [localError, setLocalError] = useState(null);
  const [rows, setRows] = useState([]);
  const prevRowsRef = useRef([]);
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString(undefined, { month: 'long' });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Initialize startDay/endDay with persistent state
  const [startDay, setStartDay] = useState(1);
  const [endDay, setEndDay] = useState(daysInMonth);

  // Ensure endDay is within bounds if month changes or daysInMonth is less than current endDay
  useEffect(() => {
    if (endDay > daysInMonth) {
      setEndDay(daysInMonth);
    }
    if (startDay > daysInMonth) {
        setStartDay(1); // Reset start day if it goes out of bounds
    }
    // Also adjust startDay if it exceeds endDay after endDay adjustment (e.g. month transition)
    if (startDay > endDay) {
        setStartDay(1);
    }
  }, [daysInMonth, endDay, startDay]);

  // Build base columns (frozen S/N and staff columns)
  const baseColumns = [
    { key: 'no', name: 'No', width: 60, frozen: true }, // S/N fixed/frozen
    { key: 'name', name: 'Staff Name', width: 220, frozen: true },
    { key: 'role', name: 'Role', width: 160, frozen: true }
  ];

  // dayColumns will be generated for the visible day range
  const dayColumns = [];
  for (let d = startDay; d <= endDay; d++) {
    const idx = d;
    const key = `d${idx}`;
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(idx).padStart(2, '0')}`;
    const isHoliday = (holidays || []).includes(dateKey);
    const dayName = new Date(year, month, idx).toLocaleDateString(undefined, { weekday: 'short' });

    dayColumns.push({
      key,
      name: String(d),
      editable: true,
      width: 80,
      headerRenderer: ({ column }) => {
        const weekday = new Date(year, month, idx).getDay(); // 0 (Sun) to 6 (Sat)
        
        // Use modern, distinct colors for day types:
        let bgColor = '#ffffff'; // Default white
        if (isHoliday) bgColor = '#fef9c3'; // Public Holiday (Yellow-ish)
        else if (weekday === 0) bgColor = '#bbf7d0'; // Sunday (Green-ish)
        else if (weekday === 6) bgColor = '#dbeafe'; // Saturday (Blue-ish)

        return (
          // Outer div: This is where the color is applied. 
          // Adding a hover effect here is better than on the button, as the button must be transparent.
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'stretch', 
              justifyContent: 'center', 
              height: '100%', 
              background: bgColor,
            }}
            // Fix: Added hover effect on the container to indicate interactivity
            className="transition duration-150 hover:brightness-95" 
          >
            <button
              onClick={(e) => { e.stopPropagation(); if (onToggleHoliday) onToggleHoliday(dateKey); }}
              title={`Toggle holiday ${dateKey}. Current: ${isHoliday ? 'Public Holiday' : dayName}`}
              // Ensure button takes full space and remains transparent
              style={{ 
                border: 'none', 
                background: 'transparent', 
                cursor: 'pointer', 
                padding: '4px', 
                width: '100%', 
                height: '100%',
                outline: 'none'
              }}
              // Fix: Removed the hover class that was adding a white/gray background
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>{column.name}</div>
              <div style={{ fontSize: 10, opacity: 0.8 }}>{dayName}</div>
            </button>
          </div>
        );
      }
    });
  }

  // Earnings summary columns
  const earningsColumns = [
    { key: 'weekdayEarnings', name: 'Weekday Earnings', width: 140, formatter: EarningsFormatter },
    { key: 'saturdayEarnings', name: 'Saturday Earnings', width: 140, formatter: EarningsFormatter },
    { key: 'sundayEarnings', name: 'Sunday/Public Holiday Earnings', width: 210, formatter: EarningsFormatter },
    { key: 'totalEarnings', name: 'Total Earnings', width: 140, formatter: EarningsFormatter }
  ];

  const columns = [...baseColumns, ...dayColumns, ...earningsColumns];

  // --- Row Data Generation Effect ---
  useEffect(() => {
    const r = staff.map((s, idx) => {
      let base = { id: s.id, no: String(idx + 1), name: s.name || '', role: s.role || '' };
      
      try {
          // days in selected range
          for (let d = startDay; d <= endDay; d++) {
              const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const entry = entries.find(e => e.staffId === s.id && e.date === dateKey);
              base[`d${d}`] = entry?.hours ?? '';
          }

          // earnings summary - defer to calculateEarnings if provided
          if (calculateEarnings) {
              try {
                  const earnings = calculateEarnings(s.id);
                  if (typeof earnings === 'number') {
                      base.weekdayEarnings = 0;
                      base.saturdayEarnings = 0;
                      base.sundayEarnings = 0;
                      base.totalEarnings = earnings;
                  } else {
                      base.weekdayEarnings = earnings?.weekday ?? 0;
                      base.saturdayEarnings = earnings?.saturday ?? 0;
                      base.sundayEarnings = earnings?.sunday ?? 0;
                      base.totalEarnings = earnings?.total ?? 0;
                  }
              } catch (err) {
                  // Catch error from calculateEarnings function
                  base.weekdayEarnings = base.saturdayEarnings = base.sundayEarnings = base.totalEarnings = 0;
              }
          } else {
              base.weekdayEarnings = base.saturdayEarnings = base.sundayEarnings = base.totalEarnings = 0;
          }
      } catch (err) {
          console.error('MasterGrid row build error', err);
          setLocalError(err?.message || String(err));
          base = { id: s.id, no: String(idx + 1), name: s.name || 'Error Staff', role: 'Error Role', weekdayEarnings: 0, saturdayEarnings: 0, sundayEarnings: 0, totalEarnings: 0 };
          for (let d = startDay; d <= endDay; d++) base[`d${d}`] = '';
      }

      return base;
    });
    setRows(r);
    prevRowsRef.current = r;
  }, [staff, entries, currentDate, startDay, endDay, calculateEarnings, year, month]);

  // --- Handle Cell Edit ---
  const handleRowsChange = (newRows, { indexes }) => {
    setRows(newRows);
    if (!indexes || indexes.length === 0) return;
    
    indexes.forEach(i => {
      const prev = prevRowsRef.current[i] || {};
      const updated = newRows[i] || {};
      
      for (const key of Object.keys(updated)) {
        // Only process date columns that have changed
        if (!key.startsWith('d')) continue;
        
        const prevVal = prev[key];
        const newVal = updated[key];
        
        if (String(prevVal) !== String(newVal)) {
          const day = parseInt(key.slice(1), 10);
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const staffId = updated.id;
          const trimmed = (newVal || '').toString().trim();
          
          if (trimmed === '' || trimmed === '0') {
            // Delete entry if value is empty or 0
            if (onDeleteEntry) onDeleteEntry(staffId, dateKey);
          } else {
            // Update/create entry
            const hours = Number(trimmed);
            if (!isNaN(hours) && hours > 0) {
              if (onUpdateEntry) onUpdateEntry(staffId, dateKey, hours);
            }
          }
        }
      }
    });
    prevRowsRef.current = newRows.map(r => ({ ...r }));
  };
  
  // --- Error/Fallback UI ---
  if (!DataGrid) {
    return (
      <div className="p-4 bg-red-100 border border-red-300 rounded-lg shadow-md">
        <strong className="text-red-700">Spreadsheet failed to load.</strong>
        <div className="text-sm text-gray-600 mt-2">Check console for import/runtime errors (react-data-grid).</div>
      </div>
    );
  }

  if (localError) {
    return (
      <div className="p-4 bg-yellow-100 border border-yellow-300 rounded-lg shadow-md">
        <strong className="text-yellow-800">Spreadsheet runtime error:</strong>
        <div className="text-sm text-gray-600 mt-2">{localError}</div>
      </div>
    );
  }

  // Custom formatter for day cells to apply task-border coloring
  const DayFormatter = ({ row, column }) => {
    const key = column.key;
    const val = row[key];
    
    // derive date from key
    const day = parseInt(key.replace(/^d/, ''), 10);
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = entries.find(e => e.staffId === row.id && e.date === dateKey);
    const task = tasks.find(t => t.id === entry?.taskId);
    // Use task color or a default light gray border
    const borderColor = task?.color || '#e5e7eb'; 

    const style = { 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        border: `3px solid ${borderColor}`, // Thicker border for better visibility
        boxSizing: 'border-box',
        padding: '2px', 
    };
    // Display '-' for empty cells for better visual clarity
    return <div style={style} className="text-sm">{val === '' ? '-' : val}</div>; 
  };

  // attach formatter for day columns
  const colsWithFormatters = columns.map(c => {
    if (c.key && String(c.key).startsWith('d')) {
        return { ...c, formatter: DayFormatter };
    }
    // Earnings columns already have formatter attached
    return c;
  });

  return (
    // FIX: Added 'master-grid-light' class to ensure CSS overrides for coloring apply correctly
    <div className="p-6 bg-white shadow-xl rounded-xl master-grid-light">
      <div className="mb-6 pb-4 border-b border-gray-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Modernized Header */}
        <div className="text-xl md:text-2xl font-extrabold text-gray-800">
          THE CANDEL FZE — Staff Overtime for {monthName}
        </div>
        
        {/* Day Range Selectors */}
        <div className="flex items-center gap-4 text-sm font-medium text-gray-700">
          <label>View Range:</label>
          <div className="flex items-center gap-2">
            <label>From</label>
            <select 
              value={startDay} 
              onChange={e => setStartDay(Number(e.target.value))} 
              className="border border-gray-300 rounded-md px-3 py-1 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500 transition"
            >
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => <option key={d} value={d} disabled={d > endDay}>{d}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <label>To</label>
            <select 
              value={endDay} 
              onChange={e => setEndDay(Number(e.target.value))} 
              className="border border-gray-300 rounded-md px-3 py-1 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500 transition"
            >
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => <option key={d} value={d} disabled={d < startDay}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* DataGrid Container */}
      <div style={{ height: '70vh' }} className="rounded-lg overflow-hidden border border-gray-200">
        <DataGrid 
          columns={colsWithFormatters} 
          rows={rows} 
          onRowsChange={handleRowsChange} 
          rowKeyGetter={r => r.id} 
          className="rdg-master-grid"
        />
      </div>
    </div>
  );
}

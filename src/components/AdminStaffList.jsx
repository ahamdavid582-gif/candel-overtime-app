import React, { useState, useEffect } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';

export default function AdminStaffList({ staff = [], onAdd, onDelete }) {
  const [staffId, setStaffId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [password, setPassword] = useState('');
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState({ id: '', name: '' });

  const clearForm = () => {
    setStaffId(''); setName(''); setRole(''); setPassword('');
    setErrors({ id: '', name: '' });
  };

  // Validate duplicates client-side: ID and name (case-insensitive)
  useEffect(() => {
    const idVal = (staffId || '').trim().toLowerCase();
    const nameVal = (name || '').trim().toLowerCase();
    let idErr = '';
    let nameErr = '';
    if (idVal) {
      const exists = staff.some(s => String(s.id || '').toLowerCase() === idVal);
      if (exists) idErr = 'A staff member with this ID already exists.';
    }
    if (nameVal) {
      const existsName = staff.some(s => String(s.name || '').toLowerCase() === nameVal);
      if (existsName) nameErr = 'A staff member with this name already exists.';
    }
    setErrors(prev => ({ ...prev, id: idErr, name: nameErr }));
  }, [staffId, name, staff]);

  const handleSubmit = async (e) => {
    e && e.preventDefault();
    if (!staffId || !name || !role || !password) return;
    if (errors.id || errors.name) return; // block submit when duplicates present
    const newStaff = { id: staffId.trim(), name: name.trim(), role: role.trim(), password: password.trim(), joinedAt: new Date().toISOString() };
    try {
      setAdding(true);
      await onAdd(newStaff);
      clearForm();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-20 p-6 space-y-6">
      <div className="bg-[#1a1a1a] p-4 rounded-2xl shadow-lg border border-gray-800">
        <h3 className="font-bold text-xl mb-4 flex items-center gap-2 text-[#00cba9]"><Plus size={18}/> Add New Staff</h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <input value={staffId} onChange={e => setStaffId(e.target.value)} placeholder="Staff ID (e.g., CFZE-001)" className={`p-3 rounded-xl bg-[#2a2a2a] text-white w-full border ${errors.id ? 'border-red-500' : 'border-gray-700'}`} required />
            {errors.id && <div className="text-red-400 text-xs mt-1">{errors.id}</div>}
          </div>

          <div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" className={`p-3 rounded-xl bg-[#2a2a2a] text-white w-full border ${errors.name ? 'border-red-500' : 'border-gray-700'}`} required />
            {errors.name && <div className="text-red-400 text-xs mt-1">{errors.name}</div>}
          </div>

          <input value={role} onChange={e => setRole(e.target.value)} placeholder="Job Role" className="p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white w-full" required />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="p-3 border border-gray-700 rounded-xl bg-[#2a2a2a] text-white w-full" required />
          <button type="submit" disabled={adding || errors.id || errors.name} className={`col-span-1 sm:col-span-4 mt-2 ${adding || errors.id || errors.name ? 'bg-gray-700 text-gray-300' : 'bg-blue-600 text-white hover:bg-blue-700'} py-3 rounded-xl font-bold transition`}>
            <Plus size={16} className="inline mr-2"/>{adding ? 'Adding...' : 'Add Staff'}
          </button>
        </form>
      </div>

      <div className="bg-[#1a1a1a] p-4 rounded-2xl shadow-lg border border-gray-800">
        <h3 className="font-bold text-xl mb-4 flex items-center gap-2 text-gray-300"><FileText size={18}/> Staff List ({staff.length})</h3>

        {/* Mobile: card list */}
        <div className="space-y-3 sm:hidden">
          {staff.map(s => (
            <div key={s.id} className="p-4 rounded-lg bg-[#0f1724] border border-gray-800 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">{s.name}</div>
                <div className="text-sm text-gray-400">{s.role} • <span className="font-mono text-xs text-gray-500">{s.id}</span></div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => onDelete(s.id)} className="text-red-400 hover:text-red-600 p-2 rounded bg-transparent"><Trash2 size={16}/></button>
              </div>
            </div>
          ))}
          {staff.length === 0 && <div className="text-gray-500 text-center p-4">No staff members yet.</div>}
        </div>

        {/* Desktop/table view */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-[#121212] text-gray-400 border-b border-gray-700">
              <tr>
                <th className="p-4 text-left">ID</th>
                <th className="p-4 text-left">Name</th>
                <th className="p-4 text-left">Role</th>
                <th className="p-4 text-left">Password</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id} className="border-b border-gray-800 hover:bg-[#2a2a2a] transition">
                  <td className="p-4 font-mono text-gray-500">{s.id}</td>
                  <td className="p-4 font-medium text-white">{s.name}</td>
                  <td className="p-4 text-gray-400">{s.role}</td>
                  <td className="p-4 font-mono text-yellow-400">{s.password}</td>
                  <td className="p-4 text-right">
                    <button onClick={() => onDelete(s.id)} className="text-red-500 hover:text-red-700 p-2"><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

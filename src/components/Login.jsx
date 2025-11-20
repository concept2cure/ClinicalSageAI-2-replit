import React, { useState } from 'react';
import api from '../services/api';

export default function Login({ onAuth }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');

  const submit = async () => {
    try {
      const { data } = await api.post('/api/auth/login', { username: u, password: p });
      localStorage.setItem('jwt', data.token);
      onAuth(true);
    } catch {
      alert('Login failed');
    }
  };

  return (
    <div className="p-6 max-w-sm mx-auto space-y-2">
      <h2 className="text-xl font-bold">Login</h2>
      <input
        className="border p-1 w-full"
        placeholder="User"
        value={u}
        onChange={e => setU(e.target.value)}
      />
      <input
        className="border p-1 w-full"
        type="password"
        placeholder="Pass"
        value={p}
        onChange={e => setP(e.target.value)}
      />
      <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={submit}>
        Login
      </button>
    </div>
  );
}

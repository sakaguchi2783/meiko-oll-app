// src/components/ScheduleForm.jsx
import React, { useState } from 'react';

export default function ScheduleForm() {
  const [schedules, setSchedules] = useState([
    // 例: { date: '4/1', task: '入稿', done: false } ...
  ]);

  // 追加用
  const [tempDate, setTempDate] = useState('');
  const [tempTask, setTempTask] = useState('');

  function handleAdd() {
    if (!tempDate || !tempTask) return;
    setSchedules([...schedules, { date: tempDate, task: tempTask, done: false }]);
    setTempDate('');
    setTempTask('');
  }

  function toggleDone(idx) {
    setSchedules(schedules.map((s, i) => i === idx ? { ...s, done: !s.done } : s));
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h3>スケジュール作成サンプル</h3>

      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          placeholder="日付(例:4/1)"
          value={tempDate}
          onChange={(e) => setTempDate(e.target.value)}
        />
        <input
          placeholder="作業内容(例:入稿)"
          value={tempTask}
          onChange={(e) => setTempTask(e.target.value)}
        />
        <button onClick={handleAdd}>追加</button>
      </div>

      <ul style={{ marginTop: '1rem' }}>
        {schedules.map((s, idx) => (
          <li key={idx}>
            <input
              type="checkbox"
              checked={s.done}
              onChange={() => toggleDone(idx)}
            />
            <strong>{s.date}</strong> {s.task} {s.done ? '(完了)' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

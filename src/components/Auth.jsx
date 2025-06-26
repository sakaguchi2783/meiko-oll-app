// src/components/Auth.jsx
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // 新規登録
  const handleSignUp = async () => {
    setAuthError('');
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) {
      setAuthError(error.message);
    } else {
      // メール承認不要にしてある場合は、そのままログイン状態になる
      alert('サインアップが完了しました。ログイン状態になっているはずです。');
    }
  };

  // ログイン
  const handleLogin = async () => {
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setAuthError(error.message);
    } else {
      alert('ログインしました。');
    }
  };

  return (
    <div style={{ margin: '2rem' }}>
      <h2>ログイン / 新規登録</h2>
      <div>
        <label>メールアドレス: </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your-email@example.com"
        />
      </div>
      <div>
        <label>パスワード: </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード"
        />
      </div>
      {authError && <p style={{ color: 'red' }}>エラー: {authError}</p>}
      <div style={{ marginTop: '1rem' }}>
        <button onClick={handleLogin}>ログイン</button>
        <button onClick={handleSignUp}>新規登録</button>
      </div>
    </div>
  );
}

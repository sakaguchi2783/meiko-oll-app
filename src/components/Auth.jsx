import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Auth() {
  /* -------------------- ① 入力用 state -------------------- */
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  /* -------------------- ② 新規登録 -------------------- */
  const handleSignUp = async () => {
    setAuthError('');

    /* signUp を実行 ───────────────────────
       ・Dashboard で “Email confirmations = OFF” にしている前提
       ・OFF にしていれば `session` が即返って来るので
         追加の処理なしでログイン完了
       ・ON の場合はここで `session` が null になり
         メール承認が必要になる
    ---------------------------------------------------- */
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    // Email confirmations が OFF の場合：即ログイン済み
    if (data.session) {
      alert('サインアップ完了 & ログインしました！');
      return;
    }

    /* Email confirmations が ON の場合（参考） */
    alert('サインアップは完了しました。確認メールを開いてリンクをクリックしてください。');
  };

  /* -------------------- ③ ログイン -------------------- */
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

  /* -------------------- ④ UI -------------------- */
  return (
    <div style={{ margin: '2rem' }}>
      <h2>ログイン / 新規登録</h2>

      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{ display: 'inline-block', width: 100 }}>メール</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your-email@example.com"
          style={{ width: 260 }}
        />
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label style={{ display: 'inline-block', width: 100 }}>パスワード</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード"
          style={{ width: 260 }}
        />
      </div>

      {authError && (
        <p style={{ color: 'red', marginTop: 4 }}>エラー: {authError}</p>
      )}

      <div style={{ marginTop: '1rem' }}>
        <button onClick={handleLogin} style={{ marginRight: 8 }}>
          ログイン
        </button>
        <button onClick={handleSignUp}>新規登録</button>
      </div>
    </div>
  );
}

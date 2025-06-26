// src/components/Navigation.jsx
import React from 'react';
import { supabase } from '../supabaseClient';
// アイコン例として react-icons (インストール要: `npm i react-icons`)
import { FaBuilding, FaFileInvoiceDollar, FaSignOutAlt } from 'react-icons/fa';
import { MdNoteAdd } from 'react-icons/md';

export default function Navigation({ setMenu }) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <nav style={{ display: 'flex', gap: '1rem', padding: '1rem', background: '#eee' }}>
      {/* 取引先一覧 */}
      <button onClick={() => setMenu('clients')}>
        <FaBuilding /> 取引先一覧
      </button>

      {/* 見積り作成 */}
      <button onClick={() => setMenu('estimates')}>
        <FaFileInvoiceDollar /> 見積作成・自動計算
      </button>

      {/* 伝票作成（手順表・工程表・売上伝票・得意先元帳） */}
      <button onClick={() => setMenu('dempyo')}>
        <MdNoteAdd /> 伝票作成
      </button>

      {/* スケジュール */}
      <button onClick={() => setMenu('schedule')}>
        スケジュール
      </button>

      {/* ログアウト */}
      <button onClick={handleLogout} style={{ marginLeft: 'auto' }}>
        <FaSignOutAlt /> ログアウト
      </button>
    </nav>
  );
}

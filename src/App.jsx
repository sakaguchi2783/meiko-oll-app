// src/App.jsx
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';
import Navigation from './components/Navigation';
import Clients from './components/Clients';
import Estimates from './components/Estimates';

// ★ 伝票作成フォーム
import DempyoForm from './components/DempyoForm';
// ★ スケジュール
import ScheduleForm from './components/ScheduleForm';

function App() {
  const [session, setSession] = useState(null);
  // 初期は "clients" を表示していたが、あとで適宜変えてもOK
  const [menu, setMenu] = useState('clients');

  // ログイン状態の監視
  useEffect(() => {
    // 現在のセッションを取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // 変更をリアルタイムで監視
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // 未ログインの場合
  if (!session) {
    return (
      <div>
        <Auth />
      </div>
    );
  }

  // ログイン済の場合
  return (
    <div>
      {/* ナビゲーションバー */}
      <Navigation setMenu={setMenu} />

      {/* メインコンテンツ：menuの値に応じて切り替え */}
      {menu === 'clients'   && <Clients />}
      {menu === 'estimates' && <Estimates />}

      {/* ★ 追加：menu === 'dempyo' のとき DempyoForm を表示 */}
      {menu === 'dempyo'    && <DempyoForm />}

      {/* ★ 追加：menu === 'schedule' のとき ScheduleForm を表示 */}
      {menu === 'schedule'  && <ScheduleForm />}
    </div>
  );
}

export default App;

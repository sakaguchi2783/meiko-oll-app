// src/components/Clients.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useDropzone } from 'react-dropzone';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [newClientName, setNewClientName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  // ★ 検索用ステート
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedClient, setSelectedClient] = useState(null);
  const [files, setFiles] = useState([]);
  // ★ ファイル名検索用ステート (ファイルが多い場合など)
  const [fileSearchTerm, setFileSearchTerm] = useState('');

  useEffect(() => {
    fetchClients();
  }, []);

  // -- 1) 取引先一覧を取得
  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setClients(data || []);
  };

  // -- 2) 取引先新規追加
  const addClient = async () => {
    if (!newClientName) return;
    const { error } = await supabase
      .from('clients')
      .insert({ name: newClientName });
    if (error) {
      console.error(error);
      return;
    }
    setNewClientName('');
    fetchClients();
  };

  // -- 3) 取引先編集
  const startEdit = (client) => {
    setEditId(client.id);
    setEditName(client.name);
  };

  const saveEdit = async (id) => {
    if (!editName) return;
    const { error } = await supabase
      .from('clients')
      .update({ name: editName })
      .eq('id', id);
    if (error) {
      console.error(error);
      return;
    }
    setEditId(null);
    setEditName('');
    fetchClients();
  };

  // -- 4) 取引先削除
  const deleteClient = async (id) => {
    if (!window.confirm('本当に削除しますか？')) return;
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);
    if (error) {
      console.error(error);
    }
    fetchClients();
    if (selectedClient && selectedClient.id === id) {
      setSelectedClient(null);
      setFiles([]);
    }
  };

  // -- 5) 取引先を選択 → client_files からファイル一覧を取得
  const selectClient = async (client) => {
    setSelectedClient(client);
    const { data, error } = await supabase
      .from('client_files')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setFiles(data || []);
  };

  // =============== ドラッグ&ドロップでファイルをアップロード ===============
  const onDrop = useCallback(async (acceptedFiles) => {
    if (!selectedClient) {
      alert('クライアントを選択してください');
      return;
    }

    for (let file of acceptedFiles) {
      const originalName = file.name; // 日本語含むファイル名
      const safeName = encodeURIComponent(originalName);

      const filePath = `${selectedClient.id}/${safeName}`;
      // 1) Storage へのアップロード
      const { data, error } = await supabase.storage
        .from('client-files')
        .upload(filePath, file, {
          upsert: true,
        });
      if (error) {
        console.error(error);
        alert(`アップロード失敗: ${originalName}`);
        continue;
      }
      // 2) 公開URLを取得
      const { data: urlData } = supabase.storage
        .from('client-files')
        .getPublicUrl(filePath);

      // 3) メタテーブルに挿入
      const { error: insertError } = await supabase
        .from('client_files')
        .insert({
          client_id: selectedClient.id,
          file_name: originalName, // DBにはオリジナルを保存
          file_url: urlData.publicUrl,
        });
      if (insertError) {
        console.error(insertError);
        alert('メタ情報登録エラー');
      }
    }
    // 最後にリスト更新
    selectClient(selectedClient);
  }, [selectedClient]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  // =============== ファイル削除 ===============
  const deleteFile = async (fileItem) => {
    if (!window.confirm(`ファイルを削除しますか？\n${fileItem.file_name}`)) return;
    // 1) Storageから削除
    const safeName = encodeURIComponent(fileItem.file_name); // エンコードして同じパス
    const filePath = `${fileItem.client_id}/${safeName}`;
    const { error: storageError } = await supabase.storage
      .from('client-files')
      .remove([filePath]);
    if (storageError) {
      console.error(storageError);
      alert('Storage削除エラー');
      return;
    }
    // 2) メタ情報を削除
    const { error: dbError } = await supabase
      .from('client_files')
      .delete()
      .eq('id', fileItem.id);
    if (dbError) {
      console.error(dbError);
      alert('DBメタ情報削除エラー');
      return;
    }
    // 更新
    selectClient(selectedClient);
  };

  // ★ クライアント側検索 (フロントで絞り込み)
  const filteredClients = clients.filter(cli =>
    cli.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ★ ファイル側検索
  const filteredFiles = files.filter(f =>
    f.file_name.toLowerCase().includes(fileSearchTerm.toLowerCase())
  );

  return (
    <div style={{ margin: '1rem' }}>
      <h2>取引先一覧</h2>

      {/* ▼ 検索バー（取引先名） */}
      <input
        type="text"
        placeholder="取引先検索"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div style={{ margin: '1rem 0' }}>
        <input
          type="text"
          value={newClientName}
          onChange={(e) => setNewClientName(e.target.value)}
          placeholder="新しい取引先名"
        />
        <button onClick={addClient}>追加</button>
      </div>

      <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>取引先名</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {filteredClients.map((cli) => (
            <tr key={cli.id}>
              <td>{cli.id}</td>
              <td>
                {editId === cli.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                ) : (
                  cli.name
                )}
              </td>
              <td>
                {editId === cli.id ? (
                  <>
                    <button onClick={() => saveEdit(cli.id)}>保存</button>
                    <button onClick={() => setEditId(null)}>キャンセル</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(cli)}>編集</button>
                    <button onClick={() => deleteClient(cli.id)}>削除</button>
                    <button onClick={() => selectClient(cli)}>選択</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* クライアント選択後にファイル一覧を表示 */}
      {selectedClient && (
        <div style={{ marginTop: '2rem', border: '1px solid #ccc', padding: '1rem' }}>
          <h3>「{selectedClient.name}」フォルダ内のファイル</h3>

          {/* ▼ ファイル検索バー */}
          <input
            type="text"
            placeholder="ファイル名検索"
            value={fileSearchTerm}
            onChange={(e) => setFileSearchTerm(e.target.value)}
          />

          <div
            {...getRootProps()}
            style={{
              border: '2px dashed #aaa',
              padding: '1rem',
              textAlign: 'center',
              cursor: 'pointer',
              marginTop: '1rem'
            }}
          >
            <input {...getInputProps()} />
            {isDragActive ? (
              <p>ここにドロップしてください</p>
            ) : (
              <p>ここにファイルをドラッグ&ドロップ、またはクリックして選択 【アルファベットのファイル名しか保管できません】</p>
            )}
          </div>

          <table
            border="1"
            cellPadding="8"
            style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}
          >
            <thead>
              <tr style={{ background: '#eee' }}>
                <th>ファイル名</th>
                <th>URL</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.map((f) => (
                <tr key={f.id}>
                  <td>{f.file_name}</td>
                  <td>
                    <a href={f.file_url} target="_blank" rel="noreferrer">
                      {f.file_url}
                    </a>
                  </td>
                  <td>
                    <button onClick={() => deleteFile(f)}>削除</button>
                  </td>
                </tr>
              ))}
              {filteredFiles.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: 'center' }}>
                    ファイルがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

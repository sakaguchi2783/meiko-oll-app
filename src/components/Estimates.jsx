// src/components/Estimates.jsx
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import EstimateForm from './EstimateForm';
import EstimatePDF from './EstimatePDF';

import { useReactToPrint } from 'react-to-print';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function Estimates() {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [estimates, setEstimates] = useState([]);
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [selectedEstimateDetails, setSelectedEstimateDetails] = useState([]);

  // react-to-print 用
  const pdfRef = useRef(null);
  const handlePrint = useReactToPrint({
    content: () => pdfRef.current,
  });

  // html2canvas + jsPDF 用
  const handleDownloadPdf = async () => {
    if (!pdfRef.current) {
      alert('PDF参照がありません');
      return;
    }
    try {
      const canvas = await html2canvas(pdfRef.current, { scale: 1 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'pt', 'a4');

      // 例: A4幅 595pt に合わせて画像を貼り付ける
      // 高さを0指定するとアスペクト比を維持して自動拡縮
      pdf.addImage(imgData, 'PNG', 0, 0, 595, 0);

      // 見積書タイトルをファイル名に
      const fileName = (selectedEstimate?.title || '見積書') + '.pdf';
      pdf.save(fileName);
    } catch (err) {
      console.error('PDF作成エラー:', err);
    }
  };

  // ============ 初期処理で 取引先一覧を取得 ============
  useEffect(() => {
    fetchClients();
  }, []);

  // ============ 取引先を選択したら、それ専用の見積を取得 ============
  useEffect(() => {
    if (!selectedClientId) {
      // 未選択ならリセット
      setEstimates([]);
      setSelectedEstimate(null);
      setSelectedEstimateDetails([]);
    } else {
      fetchEstimatesByClient(selectedClientId);
    }
  }, [selectedClientId]);

  // 取引先一覧を取得
  async function fetchClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setClients(data || []);
  }

  // 選択した取引先だけの見積を取得
  async function fetchEstimatesByClient(clientId) {
    const { data, error } = await supabase
      .from('estimates')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setEstimates(data || []);
    // 新しい取引先に切り替えると、選択中の見積はリセット
    setSelectedEstimate(null);
    setSelectedEstimateDetails([]);
  }

  // ====== 新規見積の追加 ======
  async function addEstimate() {
    if (!selectedClientId || !newTitle) {
      alert('取引先と品名（タイトル）を入力してください');
      return;
    }
    // ログイン中ユーザを取得
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error(userError);
      return;
    }
    const user = userData?.user;
    const created_by = user?.id || null;

    // 見積(ヘッダ)を insert
    const { data, error } = await supabase
      .from('estimates')
      .insert({
        client_id: selectedClientId,
        title: newTitle,
        created_by,
      })
      .single();
    if (error) {
      console.error(error);
      return;
    }
    // 入力枠をクリア
    setNewTitle('');
    // 改めて再取得
    fetchEstimatesByClient(selectedClientId);
  }

  // ====== 見積を削除 ======
  async function deleteEstimate(estimateId) {
    if (!window.confirm('この見積を削除します。よろしいですか？')) return;
    const { error } = await supabase
      .from('estimates')
      .delete()
      .eq('id', estimateId);
    if (error) {
      console.error(error);
    }
    // 再取得
    fetchEstimatesByClient(selectedClientId);
  }

  return (
    <div style={{ margin: '1rem' }}>
      <h2>見積作成</h2>

      {/* 取引先選択 + 新規見積(品名)入力 */}
      <div style={{ marginBottom: '1rem' }}>
        <select
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
        >
          <option value="">取引先を選択</option>
          {clients.map((cli) => (
            <option key={cli.id} value={cli.id}>
              {cli.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="品名（例: A4チラシ）"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          style={{ marginLeft: '8px' }}
        />
        <button onClick={addEstimate} style={{ marginLeft: '8px' }}>
          追加
        </button>
      </div>

      {/* 見積一覧(この取引先のみ) */}
      <table border="1" cellPadding="8" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>取引先ID</th>
            <th>取引先名</th>
            <th>品名</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {estimates.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center' }}>
                この取引先の見積はありません
              </td>
            </tr>
          ) : (
            estimates.map((est) => {
              // 取引先名を表示 (clients配列から探す)
              const cli = clients.find((c) => c.id === est.client_id);
              const clientName = cli ? cli.name : '(不明)';

              return (
                <tr key={est.id}>
                  <td>{est.id}</td>
                  <td>{est.client_id}</td>
                  <td>{clientName}</td>
                  <td>{est.title}</td>
                  <td>
                    <button onClick={() => setSelectedEstimate(est)}>
                      見積書を作成・確認
                    </button>
                    <button onClick={() => deleteEstimate(est.id)}>
                      削除
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* 選択中の見積があれば、EstimateForm & PDF表示 */}
      {selectedEstimate && (
        <div
          style={{
            margin: '1rem 0',
            border: '1px solid #ccc',
            padding: '1rem',
          }}
        >
          <h3>見積書: {selectedEstimate.title}</h3>
          <p style={{ color: '#666' }}>
            取引先: {clients.find((c) => c.id === selectedEstimate.client_id)?.name || '(不明)'}
          </p>

          {/* 見積明細フォーム */}
          <EstimateForm
            estimateId={selectedEstimate.id}
            onDetailsLoaded={(details) => setSelectedEstimateDetails(details)}
          />

          {/* PDF出力ボタン (react-to-print) */}
          <button onClick={handlePrint} style={{ margin: '0.5rem' }}>
            PDF出力(印刷プレビュー)
          </button>

          {/* PDFダウンロードボタン (html2canvas + jsPDF) */}
          <button onClick={handleDownloadPdf} style={{ margin: '0.5rem' }}>
            PDFをダウンロード
          </button>

          {/* 印刷対象: 画面外に配置しておく */}
          <div style={{ position: 'absolute', top: '-2000px', left: 0 }}>
            <EstimatePDF
              ref={pdfRef}
              estimate={selectedEstimate}
              details={selectedEstimateDetails}
            />
          </div>

          <button onClick={() => setSelectedEstimate(null)}>閉じる</button>
        </div>
      )}
    </div>
  );
}

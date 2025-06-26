// src/components/DempyoForm.jsx
import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useReactToPrint } from 'react-to-print';

// ▼ PDF レイアウト・コンポーネント
import DempyoPDFSetOne from './DempyoPDFSetOne';     // 手順票 + 工程表
import DempyoPDFSetTwo from './DempyoPDFSetTwo';     // 売上伝票 + 得意先元帳

export default function DempyoForm() {
  /* ──────────────────────────────
     1. データ取得用ステート
  ────────────────────────────── */
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');

  const [estimateList, setEstimateList] = useState([]);
  const [selectedEstimate, setSelectedEstimate] = useState(null);

  const [detailList, setDetailList] = useState([]);

  /* ──────────────────────────────
     2. 売上伝票用 集計コスト
  ────────────────────────────── */
  const [aggregated, setAggregated] = useState({
    design: 0,
    paper: 0,
    plate: 0,
    print: 0,
    binding: 0,
    shipping: 0,
    total: 0,
  });

  /* ──────────────────────────────
     3. 手入力欄（赤字部分など）
  ────────────────────────────── */
  const [manual, setManual] = useState({
    dueDate: '',
    size: '',
    quantity: '',
    pages: '',
    colorCount: '',
    detailType: '',

    isNew: true,
    isAdditional: false,

    designMemo: '',
    outsideMemo: '',

    schedule: [
      { date: '', text: '' },
      { date: '', text: '' },
      { date: '', text: '' },
      { date: '', text: '' },
      { date: '', text: '' },
    ],
  });

  /* ──────────────────────────────
     4. 取引先／見積／明細 取得
  ────────────────────────────── */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('clients').select('*').order('created_at');
      if (error) console.error(error);
      setClients(data || []);
    })();
  }, []);

  // 取引先を選択したら見積を取得
  useEffect(() => {
    if (!selectedClientId) {
      setEstimateList([]);
      setSelectedEstimate(null);
      setDetailList([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('estimates')
        .select('*')
        .eq('client_id', selectedClientId)
        .order('created_at', { ascending: false });
      if (error) console.error(error);
      setEstimateList(data || []);
    })();
  }, [selectedClientId]);

  // 見積を選択したら明細を取得
  useEffect(() => {
    if (!selectedEstimate) {
      setDetailList([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('estimate_details')
        .select('*')
        .eq('estimate_id', selectedEstimate.id)
        .order('created_at');
      if (error) console.error(error);
      setDetailList(data || []);
    })();
  }, [selectedEstimate]);

  /* ──────────────────────────────
     5. 明細の合計を算出（売上伝票用）
  ────────────────────────────── */
  useEffect(() => {
    let design = 0,
      paper = 0,
      plate = 0,
      print = 0,
      binding = 0,
      shipping = 0;

    detailList.forEach((d) => {
      design += d.total_design_cost || 0;
      paper += d.paper_cost || 0;
      plate += d.plate_cost || 0;
      print += d.actual_print_cost || 0;
      binding += d.binding_cost || 0;
      shipping += d.shipping_cost || 0;
    });
    setAggregated({
      design,
      paper,
      plate,
      print,
      binding,
      shipping,
      total: design + paper + plate + print + binding + shipping,
    });
  }, [detailList]);

  /* ──────────────────────────────
     6. 手入力欄変更ハンドラ
  ────────────────────────────── */
  const handleManualChange = (e) => {
    const { name, type, value, checked } = e.target;
    setManual((p) => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  /* ──────────────────────────────
     7. PDF 出力ハンドラ
  ────────────────────────────── */
  const pdfOneRef = useRef();
  const pdfTwoRef = useRef();
  const handlePrintSetOne = useReactToPrint({ content: () => pdfOneRef.current });
  const handlePrintSetTwo = useReactToPrint({ content: () => pdfTwoRef.current });

  /* ──────────────────────────────
     8. ユーティリティ
  ────────────────────────────── */
  const clientName =
    clients.find((c) => c.id === selectedClientId)?.name || '(取引先未選択)';

  /* ──────────────────────────────
     9. UI
  ────────────────────────────── */
  return (
    <div style={{ padding: '1rem' }}>
      <h2>伝票作成</h2>

      {/* ▼ 取引先・品名選択 */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label>取引先</label>&nbsp;
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
          >
            <option value="">選択してください</option>
            {clients.map((cli) => (
              <option key={cli.id} value={cli.id}>
                {cli.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>品名</label>&nbsp;
          <select
            value={selectedEstimate?.id || ''}
            onChange={(e) => {
              const est = estimateList.find((x) => x.id === e.target.value);
              setSelectedEstimate(est || null);
            }}
          >
            <option value="">選択してください</option>
            {estimateList.map((est) => (
              <option key={est.id} value={est.id}>
                {est.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ▼ 見積明細プレビュー */}
      {selectedEstimate && (
        <div style={{ marginBottom: '1rem', border: '1px solid #ccc', padding: '8px' }}>
          <h4>
            品名: {selectedEstimate.title} &nbsp;|&nbsp; 見積 ID : {selectedEstimate.id}
          </h4>
          {detailList.length === 0 ? (
            <p style={{ color: 'gray' }}>明細がありません</p>
          ) : (
            <table
              border={1}
              cellPadding={4}
              style={{ borderCollapse: 'collapse', width: '100%' }}
            >
              <thead>
                <tr style={{ background: '#eee' }}>
                  <th>ID</th>
                  <th>詳細</th>
                  <th>サイズ</th>
                  <th>数量</th>
                  <th>ページ</th>
                  <th>色数</th>
                  <th>用紙</th>
                  <th>印刷機</th>
                  <th>小計</th>
                </tr>
              </thead>
              <tbody>
                {detailList.map((d) => (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>{d.detail_type}</td>
                    <td>{d.size}</td>
                    <td>{d.quantity}</td>
                    <td>{d.pages}</td>
                    <td>
                      {d.colors}
                      {d.is_double_sided ? 'C/両面' : 'C/片面'}
                    </td>
                    <td>
                      {d.paper_type}({d.paper_thickness}K)
                    </td>
                    <td>{d.machine}</td>
                    <td>{d.total_estimated ? Math.round(d.total_estimated) + '円' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ──────────────────────────
           メインレイアウト  (３カラム)
      ────────────────────────── */}
      <div style={{ display: 'flex', gap: '1rem' }}>
        {/* ① 手順票 / 工程表 */}
        <div style={{ width: 540, border: '1px solid #999', padding: 4 }}>
          <h3 style={{ textAlign: 'center' }}>
            伝票番号&nbsp;:&nbsp;{selectedEstimate?.id || '---'}
          </h3>

          <table style={{ width: '100%', borderCollapse: 'collapse' }} border={1}>
            <tbody>
              <tr>
                <td>取引先</td>
                <td colSpan={3}>{clientName}</td>
              </tr>
              <tr>
                <td>品名</td>
                <td colSpan={3}>{selectedEstimate?.title || '(未選択)'}</td>
              </tr>
              <tr>
                <td>納期</td>
                <td>
                  <input
                    name="dueDate"
                    value={manual.dueDate}
                    onChange={handleManualChange}
                    style={{ width: '100%', border: 'none', color: 'red' }}
                  />
                </td>
                <td>新規</td>
                <td>
                  <input
                    type="checkbox"
                    name="isNew"
                    checked={manual.isNew}
                    onChange={handleManualChange}
                  />
                </td>
              </tr>
              <tr>
                <td>サイズ</td>
                <td>
                  <input
                    name="size"
                    value={manual.size}
                    onChange={handleManualChange}
                    style={{ width: '100%', border: 'none', color: 'red' }}
                  />
                </td>
                <td>数量</td>
                <td>
                  <input
                    name="quantity"
                    value={manual.quantity}
                    onChange={handleManualChange}
                    style={{ width: '100%', border: 'none', color: 'red' }}
                  />
                </td>
              </tr>
              <tr>
                <td>頁数</td>
                <td>
                  <input
                    name="pages"
                    value={manual.pages}
                    onChange={handleManualChange}
                    style={{ width: '100%', border: 'none', color: 'red' }}
                  />
                </td>
                <td>色数</td>
                <td>
                  <input
                    name="colorCount"
                    value={manual.colorCount}
                    onChange={handleManualChange}
                    style={{ width: '100%', border: 'none', color: 'red' }}
                  />
                </td>
              </tr>
              <tr>
                <td>詳細</td>
                <td colSpan={3}>
                  <input
                    name="detailType"
                    value={manual.detailType}
                    onChange={handleManualChange}
                    placeholder="表紙/本文 など"
                    style={{ width: '100%', border: 'none', color: 'red' }}
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* 制作／印刷／外注メモ などは省略なしで必要に応じ追加 */}
          <p style={{ marginTop: 6, fontSize: 12 }}>
            制作メモ：
            <textarea
              name="designMemo"
              value={manual.designMemo}
              onChange={handleManualChange}
              rows={2}
              style={{ width: '100%', border: '1px solid #ccc', color: 'red' }}
            />
          </p>
        </div>

        {/* ② スケジュール欄 */}
        <div style={{ width: 200, border: '1px solid #999' }}>
          <h4 style={{ textAlign: 'center' }}>スケジュール</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} border={1}>
            <tbody>
              {manual.schedule.map((s, i) => (
                <tr key={i}>
                  <td style={{ width: 60 }}>
                    <input
                      name={`scheduleDate${i}`}
                      value={s.date}
                      onChange={(e) => {
                        const v = e.target.value;
                        setManual((p) => {
                          const arr = [...p.schedule];
                          arr[i] = { ...arr[i], date: v };
                          return { ...p, schedule: arr };
                        });
                      }}
                      style={{ width: '100%', border: 'none', color: 'red' }}
                    />
                  </td>
                  <td>
                    <input
                      name={`scheduleText${i}`}
                      value={s.text}
                      onChange={(e) => {
                        const v = e.target.value;
                        setManual((p) => {
                          const arr = [...p.schedule];
                          arr[i] = { ...arr[i], text: v };
                          return { ...p, schedule: arr };
                        });
                      }}
                      style={{ width: '100%', border: 'none', color: 'red' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ③ 売上伝票（集計） */}
        <div style={{ width: 260, border: '1px solid #999', padding: 4 }}>
          <h4 style={{ textAlign: 'center' }}>売上伝票</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} border={1}>
            <tbody>
              <tr>
                <td>デザイン費</td>
                <td style={{ textAlign: 'right' }}>
                  {aggregated.design.toLocaleString()} 円
                </td>
              </tr>
              <tr>
                <td>用紙代</td>
                <td style={{ textAlign: 'right' }}>
                  {aggregated.paper.toLocaleString()} 円
                </td>
              </tr>
              <tr>
                <td>製版代</td>
                <td style={{ textAlign: 'right' }}>
                  {aggregated.plate.toLocaleString()} 円
                </td>
              </tr>
              <tr>
                <td>印刷代</td>
                <td style={{ textAlign: 'right' }}>
                  {aggregated.print.toLocaleString()} 円
                </td>
              </tr>
              <tr>
                <td>製本代</td>
                <td style={{ textAlign: 'right' }}>
                  {aggregated.binding.toLocaleString()} 円
                </td>
              </tr>
              <tr>
                <td>送料</td>
                <td style={{ textAlign: 'right' }}>
                  {aggregated.shipping.toLocaleString()} 円
                </td>
              </tr>
              <tr style={{ background: '#ffd' }}>
                <td>合計</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                  {aggregated.total.toLocaleString()} 円
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ▼ 操作ボタン */}
      <div style={{ marginTop: '1rem' }}>
        <button onClick={handlePrintSetOne}>手順票+工程表 PDF</button>
        <button onClick={handlePrintSetTwo} style={{ marginLeft: 8 }}>
          売上伝票+得意先元帳 PDF
        </button>
      </div>

      {/* ▼ 印刷用 Hidden DOM */}
      <div style={{ display: 'none' }}>
        <div ref={pdfOneRef}>
          <DempyoPDFSetOne
            clientName={clientName}
            estimate={selectedEstimate}
            manual={manual}
            detailList={detailList}
          />
        </div>
        <div ref={pdfTwoRef}>
          <DempyoPDFSetTwo
            clientName={clientName}
            estimate={selectedEstimate}
            aggregated={aggregated}
          />
        </div>
      </div>
    </div>
  );
}

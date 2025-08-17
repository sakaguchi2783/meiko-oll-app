// src/components/ScheduleForm.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/** ========== A4 定数（PDF化対象に適用） ========== */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_PADDING_MM = 0; // 余白が必要なら 10 などに変更

/** ========== 日付ユーティリティ ========== */
const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`; // YYYY-MM-DD
const jpMD = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const w = '日月火水木金土'[dt.getDay()];
  return `${m}/${d}（${w}）`;
};
const jpYM = (y, m) => `${y}年${m}月`;

/** 月のメタ情報 */
function buildMonthMatrix(year, month /* 1-12 */) {
  const first = new Date(year, month - 1, 1);
  const firstDow = first.getDay();                // 0:日〜6:土
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonthDays = new Date(year, month - 1, 0).getDate();

  // 6週×7列のセル（Googleカレンダーなどと同じ最大42セル）
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dayIndex = i - firstDow + 1;           // 1..daysInMonth が当月
    let inMonth = dayIndex >= 1 && dayIndex <= daysInMonth;
    let y = year, m = month, d;

    if (inMonth) {
      d = dayIndex;
    } else if (i < firstDow) {
      // 前月
      m = month === 1 ? 12 : month - 1;
      y = month === 1 ? year - 1 : year;
      d = prevMonthDays - (firstDow - 1 - i);
    } else {
      // 翌月
      m = month === 12 ? 1 : month + 1;
      y = month === 12 ? year + 1 : year;
      d = i - (firstDow + daysInMonth) + 1;
    }
    cells.push({ iso: isoOf(y, m, d), y, m, d, inMonth });
  }
  return cells;
}

/** ========== カレンダー（クリックで日付選択） ========== */
function CalendarMonth({
  year,
  month,
  selectedIso,
  onSelect,
  countsMap,    // { 'YYYY-MM-DD': 件数 }
  readOnly = false,
}) {
  const cells = useMemo(() => buildMonthMatrix(year, month), [year, month]);
  const todayIso = useMemo(() => {
    const t = new Date();
    return isoOf(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }, []);

  const headerStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 2,
    fontWeight: 600,
    marginBottom: 4,
    textAlign: 'center',
  };
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 2,
  };

  const dow = ['日', '月', '火', '水', '木', '金', '土'];

  return (
    <div>
      <div style={headerStyle}>
        {dow.map((w, i) => (
          <div key={i} style={{ padding: '6px 0' }}>{w}</div>
        ))}
      </div>
      <div style={gridStyle}>
        {cells.map((c, i) => {
          const isSelected = c.iso === selectedIso;
          const count = countsMap[c.iso] || 0;

          return (
            <div
              key={i}
              onClick={readOnly ? undefined : () => onSelect && onSelect(c)}
              style={{
                height: 72,
                border: '1px solid #ddd',
                background: c.inMonth ? '#fff' : '#fafafa',
                position: 'relative',
                cursor: readOnly ? 'default' : (c.inMonth ? 'pointer' : 'default'),
                outline: isSelected ? '2px solid #1677ff' : 'none',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 6,
                  fontSize: 12,
                  color: c.iso === todayIso ? '#d00' : '#333',
                  fontWeight: c.iso === todayIso ? 700 : 500,
                }}
              >
                {c.d}
              </div>
              {count > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: 6,
                    bottom: 6,
                    fontSize: 12,
                    padding: '2px 6px',
                    borderRadius: 12,
                    border: '1px solid #ddd',
                  }}
                >
                  {count} 件
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** ========== 本体 ========== */
export default function ScheduleForm() {
  /* 1) 取引先・品名の選択（Supabase から取得） */
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [estimateList, setEstimateList] = useState([]);
  const [selectedEstimate, setSelectedEstimate] = useState(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('clients').select('*').order('created_at');
      if (error) console.error(error);
      setClients(data || []);
    })();
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setEstimateList([]);
      setSelectedEstimate(null);
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

  /* 2) スケジュール（見積IDごとに保持。DB保存はせずローカル管理） */
  const [scheduleMap, setScheduleMap] = useState({}); // { [estimateId]: [{date, task, done}] }
  const currentEstimateId = selectedEstimate?.id || '';
  const schedules = useMemo(
    () => scheduleMap[currentEstimateId] || [],
    [scheduleMap, currentEstimateId]
  );

  /* 3) カレンダー状態 */
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
  const [selectedIso, setSelectedIso] = useState(isoOf(today.getFullYear(), today.getMonth() + 1, today.getDate()));

  const goPrev = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const goNext = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const onPickDay = (cell) => {
    if (!cell.inMonth) return;            // 当月以外は無効
    setSelectedIso(cell.iso);
  };

  /* 4) 追加フォーム */
  const [taskText, setTaskText] = useState('');

  const handleAdd = () => {
    if (!currentEstimateId || !selectedIso || !taskText.trim()) return;
    setScheduleMap((prev) => {
      const arr = prev[currentEstimateId] ? [...prev[currentEstimateId]] : [];
      arr.push({ date: selectedIso, task: taskText.trim(), done: false });
      // ソート（日時→内容）
      arr.sort((a, b) => (a.date === b.date ? a.task.localeCompare(b.task, 'ja') : a.date.localeCompare(b.date)));
      return { ...prev, [currentEstimateId]: arr };
    });
    setTaskText('');
  };

  const toggleDone = (idx) => {
    setScheduleMap((prev) => {
      const arr = prev[currentEstimateId] ? [...prev[currentEstimateId]] : [];
      if (!arr[idx]) return prev;
      arr[idx] = { ...arr[idx], done: !arr[idx].done };
      return { ...prev, [currentEstimateId]: arr };
    });
  };

  const removeRow = (idx) => {
    setScheduleMap((prev) => {
      const arr = prev[currentEstimateId] ? [...prev[currentEstimateId]] : [];
      arr.splice(idx, 1);
      return { ...prev, [currentEstimateId]: arr };
    });
  };

  /* 5) 日付ごとの件数（カレンダーのバッジ表示用） */
  const countsMap = useMemo(() => {
    const map = {};
    schedules.forEach((s) => { map[s.date] = (map[s.date] || 0) + 1; });
    return map;
  }, [schedules]);

  /* 6) PDF ダウンロード（A4 幅ぴったり） */
  const pdfRef = useRef(null);

  const handleDownloadPdf = useCallback(async () => {
    const el = pdfRef.current;
    if (!el) return;

    // フォーカスのキャレットが写り込まないように
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      windowWidth: el.clientWidth,
      windowHeight: el.scrollHeight,
      scrollY: 0,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfW = pdf.internal.pageSize.getWidth();   // 210
    const pdfH = pdf.internal.pageSize.getHeight();  // 297

    const imgW = pdfW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let heightLeft = imgH;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
    heightLeft -= pdfH;

    while (heightLeft > 0) {
      position -= pdfH;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
      heightLeft -= pdfH;
    }

    const clientName = clients.find(c => c.id === selectedClientId)?.name || '未選択';
    const safeTitle = (selectedEstimate?.title || 'スケジュール').replace(/[\\/:*?"<>|]/g, '');
    const fileName = `${selectedEstimate?.id || ''}_${safeTitle}_${jpYM(year, month)}_${clientName.replace(/[\\/:*?"<>|]/g,'')}_${new Date().toISOString().slice(0,10)}.pdf`;

    pdf.save(fileName);
  }, [clients, selectedClientId, selectedEstimate?.id, selectedEstimate?.title, year, month]);

  /* 7) 便利値 */
  const clientName  = clients.find(c => c.id === selectedClientId)?.name || '';
  const estimateId  = selectedEstimate?.id || '';
  const productName = selectedEstimate?.title || '';

  /* ========== UI ========== */
  return (
    <div style={{ padding: '1rem' }}>
      <h2>工程スケジュール</h2>

      {/* 取引先・品名 選択 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div>
          <label>取引先：</label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
          >
            <option value="">選択してください</option>
            {clients.map(cli => (
              <option key={cli.id} value={cli.id}>{cli.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label>品名：</label>
          <select
            value={selectedEstimate?.id || ''}
            onChange={(e) => {
              const est = estimateList.find(x => x.id === e.target.value);
              setSelectedEstimate(est || null);
            }}
          >
            <option value="">選択してください</option>
            {estimateList.map(est => (
              <option key={est.id} value={est.id}>{est.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 未選択時の案内 */}
      {!selectedEstimate && (
        <p style={{ color: '#666' }}>取引先と品名を選択すると、カレンダーとスケジュール入力が表示されます。</p>
      )}

      {/* 選択済みのときに本体を表示 */}
      {selectedEstimate && (
        <>
          {/* 月移動 & 月指定 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <button onClick={goPrev}>◀ 前月</button>
            <strong style={{ fontSize: 18 }}>{jpYM(year, month)}</strong>
            <button onClick={goNext}>次月 ▶</button>
            <input
              type="month"
              value={`${year}-${pad2(month)}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number);
                setYear(y); setMonth(m);
              }}
              style={{ marginLeft: 12 }}
            />
          </div>

          {/* カレンダー（クリックして日付選択） */}
          <CalendarMonth
            year={year}
            month={month}
            selectedIso={selectedIso}
            onSelect={onPickDay}
            countsMap={countsMap}
          />

          {/* 追加フォーム */}
          <div style={{
            marginTop: 16,
            padding: 12,
            border: '1px solid #eee',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div><strong>選択日：</strong>{jpMD(selectedIso)}</div>
            <input
              style={{ flex: 1 }}
              placeholder="作業内容を入力（例：入稿／校了／刷版発注 など）"
              value={taskText}
              onChange={(e) => setTaskText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button onClick={handleAdd} disabled={!taskText.trim()}>追加</button>
          </div>

          {/* 一覧 */}
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: '0 0 8px' }}>スケジュール一覧</h3>
            {schedules.length === 0 ? (
              <p style={{ color: '#888' }}>まだ予定がありません。</p>
            ) : (
              <table
                border={1}
                cellPadding={6}
                style={{ borderCollapse: 'collapse', width: '100%' }}
              >
                <thead style={{ background: '#f7f7f7' }}>
                  <tr>
                    <th style={{ width: 140 }}>日付</th>
                    <th>内容</th>
                    <th style={{ width: 80 }}>完了</th>
                    <th style={{ width: 80 }}>削除</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s, idx) => (
                    <tr key={`${s.date}-${s.task}-${idx}`}>
                      <td>{jpMD(s.date)}<div style={{ color: '#888', fontSize: 12 }}>{s.date}</div></td>
                      <td>{s.task}</td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={s.done} onChange={() => toggleDone(idx)} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button onClick={() => removeRow(idx)}>削除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ---- PDF ダウンロード（「ボタンだけ」） ---- */}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleDownloadPdf}>PDFをダウンロード</button>
          </div>

          {/* ---- PDF化対象（A4 幅固定）。画面にもそのまま表示します。---- */}
          <div
            ref={pdfRef}
            style={{
              width: `${A4_WIDTH_MM}mm`,
              minHeight: `${A4_HEIGHT_MM}mm`,
              margin: '16px auto 0',
              background: '#fff',
              color: '#000',
              padding: `${PAGE_PADDING_MM}mm`,
              boxSizing: 'border-box',
              border: '1px solid #eee',
            }}
          >
            <h2 style={{ textAlign: 'center', margin: '0 0 8px' }}>工程スケジュール</h2>
            <p style={{ margin: '4px 0' }}>
              取引先：{clientName} ／ 品名：{productName} ／ 見積ID：{estimateId}
            </p>
            <p style={{ margin: '4px 0 8px' }}><strong>{jpYM(year, month)}</strong></p>
            <hr />

            {/* 印字用カレンダー（クリック無効） */}
            <CalendarMonth
              year={year}
              month={month}
              selectedIso={selectedIso}
              onSelect={undefined}
              countsMap={countsMap}
              readOnly
            />

            {/* 印字用一覧（完了フラグは丸/空白で表現） */}
            <h3 style={{ margin: '12px 0 6px' }}>スケジュール一覧</h3>
            {schedules.length === 0 ? (
              <p style={{ color: '#888' }}>（予定なし）</p>
            ) : (
              <table
                border={1}
                cellPadding={4}
                style={{ borderCollapse: 'collapse', width: '100%' }}
              >
                <thead style={{ background: '#f7f7f7' }}>
                  <tr>
                    <th style={{ width: 120 }}>日付</th>
                    <th>内容</th>
                    <th style={{ width: 60 }}>完了</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s, idx) => (
                    <tr key={`print-${s.date}-${s.task}-${idx}`}>
                      <td>{jpMD(s.date)}</td>
                      <td>{s.task}</td>
                      <td style={{ textAlign: 'center' }}>{s.done ? '●' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

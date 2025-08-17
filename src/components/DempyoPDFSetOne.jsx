// src/components/DempyoPDFSetOne.jsx
import React, { useCallback, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/** A4 サイズ（mm）と余白（mm） */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_PADDING_MM = 0; // 余白を入れたい場合は 10 などに

export default function DempyoPDFSetOne({ clientName, estimate, manual, detailList }) {
  const pdfRef = useRef(null);

  const handleDownload = useCallback(async () => {
    const el = pdfRef.current;
    if (!el) return;

    // 入力フォーカスのキャレットを消してからキャプチャ
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    // 高解像度でキャプチャ（要素の実サイズを使う）
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      windowWidth: el.clientWidth,
      windowHeight: el.scrollHeight,
      scrollY: 0,
    });

    const imgData = canvas.toDataURL('image/png');

    // A4縦(mm)
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfW = pdf.internal.pageSize.getWidth();   // 210
    const pdfH = pdf.internal.pageSize.getHeight();  // 297

    // 画像を用紙幅いっぱいに合わせる
    const imgW = pdfW;
    const imgH = (canvas.height * imgW) / canvas.width;

    // 複数ページ対応：画像のY位置をずらしながら同じ画像を貼る
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

    const safeTitle = (estimate?.title || '手順票工程表').replace(/[\\/:*?"<>|]/g, '');
    const fileName = `${estimate?.id || ''}_${safeTitle}_set1_${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;

    pdf.save(fileName);
  }, [estimate?.id, estimate?.title]);

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      {/* ボタン（キャプチャ対象外） */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={handleDownload}>PDFをダウンロード</button>
      </div>

      {/* ここから下がPDF化対象 */}
      <div
        ref={pdfRef}
        style={{
          width: `${A4_WIDTH_MM}mm`,        // ← A4 幅に固定（最重要）
          minHeight: `${A4_HEIGHT_MM}mm`,   // ← 1ページ以上の高さを確保
          margin: '0 auto',
          background: '#fff',
          color: '#000',
          padding: `${PAGE_PADDING_MM}mm`,  // ← 余白が必要なら mm で指定
          boxSizing: 'border-box',
          fontSize: 12,
        }}
      >
        <h2 style={{ textAlign: 'center', margin: '0 0 8px' }}>手順票・工程表</h2>

        <p style={{ margin: '4px 0' }}>
          取引先 : {clientName} / 品名 : {estimate?.title}
        </p>
        <p style={{ margin: '4px 0' }}>見積 ID : {estimate?.id}</p>
        <hr />

        {/* 手順票 (左) と 工程表 (右) を二列で並べる */}
        <div style={{ display: 'flex', gap: 8 }}>
          {/* 手順票 */}
          <div
            style={{
              width: '50%',
              border: '1px solid #000',
              padding: 4,
              boxSizing: 'border-box',
            }}
          >
            <h3 style={{ textAlign: 'center', margin: '4px 0 8px' }}>手順票</h3>
            <p style={{ margin: '4px 0' }}>納期 : {manual?.dueDate}</p>
            <p style={{ margin: '4px 0' }}>
              サイズ : {manual?.size}／数量 : {manual?.quantity}／頁 : {manual?.pages}／色 : {manual?.colorCount}
            </p>
            <p style={{ margin: '4px 0' }}>詳細 : {manual?.detailType}</p>
            {/* 必要に応じて自由記入欄などを追加 */}
          </div>

          {/* 工程表 */}
          <div
            style={{
              width: '50%',
              border: '1px solid #000',
              padding: 4,
              boxSizing: 'border-box',
            }}
          >
            <h3 style={{ textAlign: 'center', margin: '4px 0 8px' }}>工程表</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} border={1}>
              <tbody>
                {(manual?.schedule || []).map((s, i) => (
                  <tr key={i}>
                    <td style={{ width: '60px' }}>{s.date}</td>
                    <td>{s.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 明細サマリ */}
        <h4 style={{ marginTop: 8, marginBottom: 4 }}>明細一覧</h4>
        <table
          border={1}
          cellPadding={2}
          style={{ borderCollapse: 'collapse', width: '100%' }}
        >
          <thead style={{ background: '#eee' }}>
            <tr>
              <th>ID</th>
              <th>詳細</th>
              <th>サイズ</th>
              <th>数量</th>
              <th>P</th>
              <th>色</th>
              <th>合計</th>
            </tr>
          </thead>
          <tbody>
            {(detailList || []).map((d) => (
              <tr key={d.id}>
                <td>{d.id}</td>
                <td>{d.detail_type}</td>
                <td>{d.size}</td>
                <td>{d.quantity}</td>
                <td>{d.pages}</td>
                <td>{d.colors}</td>
                <td>{Math.round(Number(d.total_estimated) || 0).toLocaleString()} 円</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* PDF対象ここまで */}
    </div>
  );
}

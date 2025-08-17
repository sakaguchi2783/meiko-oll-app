// src/components/DempyoPDFSetTwo.jsx
import React, { useCallback, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/** A4 サイズ（mm）と余白（mm） */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_PADDING_MM = 0; // 余白を入れたい場合は 10 などに

export default function DempyoPDFSetTwo({ clientName, estimate, aggregated }) {
  const pdfRef = useRef(null);

  const handleDownload = useCallback(async () => {
    const el = pdfRef.current;
    if (!el) return;

    // 入力フォーカスのキャレットを消してからキャプチャ
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
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();

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

    const safeTitle = (estimate?.title || '売上得意先元帳').replace(/[\\/:*?"<>|]/g, '');
    const fileName = `${estimate?.id || ''}_${safeTitle}_set2_${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;

    pdf.save(fileName);
  }, [estimate?.id, estimate?.title]);

  const val = (n) => (Math.round(Number(n) || 0)).toLocaleString();

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      {/* ボタン（キャプチャ対象外） */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={handleDownload}>PDFをダウンロード</button>
      </div>

      {/* ここからPDF化対象 */}
      <div
        ref={pdfRef}
        style={{
          width: `${A4_WIDTH_MM}mm`,        // ← A4 幅に固定
          minHeight: `${A4_HEIGHT_MM}mm`,   // ← 1ページ以上の高さを確保
          margin: '0 auto',
          background: '#fff',
          color: '#000',
          padding: `${PAGE_PADDING_MM}mm`,  // ← 余白が必要なら mm で指定
          boxSizing: 'border-box',
          fontSize: 12,
        }}
      >
        <h2 style={{ textAlign: 'center', margin: '0 0 8px' }}>売上伝票・得意先元帳</h2>
        <p style={{ margin: '4px 0' }}>
          取引先 : {clientName} ／ 品名 : {estimate?.title} ／ 見積 ID : {estimate?.id}
        </p>
        <hr />

        <div style={{ display: 'flex', gap: 8 }}>
          {/* 売上伝票 */}
          <div
            style={{
              width: '50%',
              border: '1px solid #000',
              padding: 4,
              boxSizing: 'border-box',
            }}
          >
            <h3 style={{ textAlign: 'center', margin: '4px 0 8px' }}>売上伝票</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} border={1}>
              <tbody>
                <tr>
                  <td>デザイン費</td>
                  <td style={{ textAlign: 'right' }}>{val(aggregated?.design)} 円</td>
                </tr>
                <tr>
                  <td>用紙代</td>
                  <td style={{ textAlign: 'right' }}>{val(aggregated?.paper)} 円</td>
                </tr>
                <tr>
                  <td>製版代</td>
                  <td style={{ textAlign: 'right' }}>{val(aggregated?.plate)} 円</td>
                </tr>
                <tr>
                  <td>印刷代</td>
                  <td style={{ textAlign: 'right' }}>{val(aggregated?.print)} 円</td>
                </tr>
                <tr>
                  <td>製本代</td>
                  <td style={{ textAlign: 'right' }}>{val(aggregated?.binding)} 円</td>
                </tr>
                <tr>
                  <td>送料</td>
                  <td style={{ textAlign: 'right' }}>{val(aggregated?.shipping)} 円</td>
                </tr>
                <tr style={{ background: '#ffd' }}>
                  <td>合計</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {val(aggregated?.total)} 円
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 得意先元帳（複写イメージ） */}
          <div
            style={{
              width: '50%',
              border: '1px solid #000',
              padding: 4,
              boxSizing: 'border-box',
            }}
          >
            <h3 style={{ textAlign: 'center', margin: '4px 0 8px' }}>得意先元帳</h3>
            <p style={{ margin: '4px 0' }}>
              ※売上伝票と同内容を複写しています。（日付・入金欄など必要に応じて追加してください）
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }} border={1}>
              <tbody>
                <tr>
                  <td>合計金額</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {val(aggregated?.total)} 円
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* PDF対象ここまで */}
    </div>
  );
}

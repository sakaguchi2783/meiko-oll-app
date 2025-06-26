// src/components/EstimatePDF.jsx

import React from 'react';
import meikoLogo from '../assets/meiko-logo.png';
import meikoHanko from '../assets/meiko-hanko.png';

// react-to-print で印刷する際に ref.forwardRef が必要
// props: { estimate, details }
//   - estimate: 見積ヘッダ (id, title, client_id など)
//   - details: 見積明細 (estimate_details) の配列
const EstimatePDF = React.forwardRef(({ estimate, details }, ref) => {
  const detailList = details || [];

  // 合計計算
  let totalDesign = 0;
  let totalPrint = 0;
  detailList.forEach((d) => {
    totalDesign += d.total_design_cost || 0;
    totalPrint += d.total_print_cost || 0;
  });
  const grandTotal = totalDesign + totalPrint;

  return (
    <div ref={ref} style={{ width: '700px', padding: '16px', fontFamily: 'sans-serif' }}>
      {/* ヘッダ部分 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <img
          src={meikoLogo}
          alt="Meiko Logo"
          crossOrigin="anonymous"
          style={{ width: '120px' }}
        />
        <img
          src={meikoHanko}
          alt="Meiko Hanko"
          crossOrigin="anonymous"
          style={{ width: '80px' }}
        />
      </div>

      <h1 style={{ textAlign: 'center', margin: '20px 0' }}>御 見 積 書</h1>
      <p>見積番号: {estimate?.id}</p>
      <p>品名: {estimate?.title}</p>
      <p>取引先ID: {estimate?.client_id}</p>

      <hr style={{ margin: '20px 0' }} />

      {/* 見積明細テーブル */}
      <table
        width="100%"
        border="1"
        cellPadding="6"
        style={{ borderCollapse: 'collapse' }}
      >
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            {/* ① 「詳細」欄を追加して detail_type を表示する */}
            <th>詳細</th>
            <th>サイズ</th>
            <th>数量</th>
            <th>ページ</th>
            <th>刷り色</th>
            <th>デザイン費</th>
            <th>印刷費</th>
            <th>小計(税別)</th>
          </tr>
        </thead>
        <tbody>
          {detailList.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center' }}>
                明細がありません
              </td>
            </tr>
          ) : (
            detailList.map((item) => (
              <tr key={item.id}>
                {/* ② detail_type（表紙/本文/表紙＋本文）を表示 */}
                <td>{item.detail_type}</td>

                {/* サイズ列に製本方法をまとめる例 */}
                <td>
                  {item.size}
                  {item.binding_method && <> / 製本: {item.binding_method}</>}
                </td>

                <td>{item.quantity}</td>
                <td>{item.pages}P</td>

                <td>
                  {item.colors}
                  {item.is_double_sided ? '色(両面)' : '色(片面)'}
                </td>

                <td>
                  {item.total_design_cost
                    ? `${Math.round(item.total_design_cost)} 円`
                    : '-'}
                </td>
                <td>
                  {item.total_print_cost
                    ? `${Math.round(item.total_print_cost)} 円`
                    : '-'}
                </td>
                <td>
                  {item.total_estimated
                    ? `${Math.round(item.total_estimated)} 円`
                    : '-'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* 合計表示 */}
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <p>デザイン費合計: {Math.round(totalDesign)} 円</p>
        <p>印刷費合計: {Math.round(totalPrint)} 円</p>
        <h3>合計（税別）: {Math.round(grandTotal)} 円</h3>
      </div>

      <p style={{ marginTop: '20px' }}>有効期限: 発行日より1ヶ月</p>
      <p>（備考）</p>

      {/* 会社情報 */}
      <p style={{ textAlign: 'right' }}>
        明光印刷株式会社
        <br />
        〒674-0093 兵庫県明石市二見町南二見17-14
        <br />
        TEL 078-944-0086 / FAX 078-942-3099
      </p>
    </div>
  );
});

export default EstimatePDF;

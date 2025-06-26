// src/components/DempyoPDFSetTwo.jsx
import React from 'react';

export default function DempyoPDFSetTwo({ clientName, estimate, aggregated }) {
  return (
    <div style={{ width: 750, fontFamily: 'sans-serif', fontSize: 12 }}>
      <h2 style={{ textAlign: 'center' }}>売上伝票・得意先元帳</h2>
      <p>
        取引先 : {clientName} ／ 品名 : {estimate?.title} ／ 見積 ID : {estimate?.id}
      </p>
      <hr />

      <div style={{ display: 'flex', gap: 8 }}>
        {/* 売上伝票 */}
        <div style={{ width: '50%', border: '1px solid #000', padding: 4 }}>
          <h3 style={{ textAlign: 'center' }}>売上伝票</h3>
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

        {/* 得意先元帳 - ここでは売上伝票の複写イメージ */}
        <div style={{ width: '50%', border: '1px solid #000', padding: 4 }}>
          <h3 style={{ textAlign: 'center' }}>得意先元帳</h3>
          <p>
            ※売上伝票と同内容を複写しています。（日付・入金欄など必要に応じ追加してください）
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} border={1}>
            <tbody>
              <tr>
                <td>合計金額</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                  {aggregated.total.toLocaleString()} 円
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

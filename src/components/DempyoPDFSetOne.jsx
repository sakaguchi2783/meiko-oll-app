// src/components/DempyoPDFSetOne.jsx
import React from 'react';

export default function DempyoPDFSetOne({ clientName, estimate, manual, detailList }) {
  return (
    <div style={{ width: 750, fontFamily: 'sans-serif', fontSize: 12 }}>
      <h2 style={{ textAlign: 'center' }}>手順票・工程表</h2>

      <p>
        取引先 : {clientName} / 品名 : {estimate?.title}
      </p>
      <p>見積 ID : {estimate?.id}</p>
      <hr />

      {/* 手順票 (左) と 工程表 (右) を単純に二列で並べる例 */}
      <div style={{ display: 'flex', gap: 8 }}>
        {/* 手順票 */}
        <div style={{ width: '50%', border: '1px solid #000', padding: 4 }}>
          <h3 style={{ textAlign: 'center' }}>手順票</h3>
          <p>納期 : {manual.dueDate}</p>
          <p>
            サイズ : {manual.size}／数量 : {manual.quantity}／頁 : {manual.pages}／色 :
            {manual.colorCount}
          </p>
          <p>詳細 : {manual.detailType}</p>
          {/* 他、自由記入欄など… */}
        </div>

        {/* 工程表 */}
        <div style={{ width: '50%', border: '1px solid #000', padding: 4 }}>
          <h3 style={{ textAlign: 'center' }}>工程表</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} border={1}>
            <tbody>
              {manual.schedule.map((s, i) => (
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
      <h4 style={{ marginTop: 8 }}>明細一覧</h4>
      <table border={1} cellPadding={2} style={{ borderCollapse: 'collapse', width: '100%' }}>
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
          {detailList.map((d) => (
            <tr key={d.id}>
              <td>{d.id}</td>
              <td>{d.detail_type}</td>
              <td>{d.size}</td>
              <td>{d.quantity}</td>
              <td>{d.pages}</td>
              <td>{d.colors}</td>
              <td>{Math.round(d.total_estimated).toLocaleString()} 円</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

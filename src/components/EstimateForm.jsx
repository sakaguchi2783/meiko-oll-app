// src/components/EstimateForm.jsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// ---------- ヘルパー関数群 ----------

// 面付数を求める (A6=64を追加)
function getImpositionSize(size) {
  switch (size) {
    case 'A3':
      return 8;
    case 'A4':
      return 16;
    case 'A5':
    case 'B5':
      return 32;
    case 'A6': // ★ 追加
      return 64;
    case 'B4':
      return 16;
    default:
      return 16; // その他サイズは仮で16
  }
}

// 0.5刻みで繰り上げ
function roundUpToHalf(num) {
  return Math.ceil(num * 2) / 2;
}

// 用紙必要数の計算（VP/GTO/オンデマンド）
function calcNeededPaper(detail) {
  console.log('[calcNeededPaper] detail=', detail);
  const { quantity, pages, colors, is_double_sided, machine, size } = detail;
  const imposition = getImpositionSize(size);
  const doubleSideFactor = is_double_sided ? 2 : 1;

  if (machine === 'VP') {
    // ページ数が面付以下なら1台扱い
    const pageDiv = Math.max(1, Math.ceil(pages / imposition));

    // ベース部
    const base = Math.ceil((quantity * pages) / imposition);
    // 予備部: 70枚 × 色数 ×(両面 or 片面) ×pageDiv
    const extra = colors * 70 * doubleSideFactor * pageDiv;

    const sum = base + extra;
    console.log('[calcNeededPaper:VP]', { base, extra, pageDiv, sum });

    // ★ 「計算結果が本数より小さいときは quantity を返す」ルールを削除し単純化:
    // return sum < quantity ? quantity : sum;
    return sum;
  } else if (machine === 'GTO') {
    const base = Math.ceil((quantity * pages) / imposition);
    const extra = colors * 30 * doubleSideFactor;
    return base + extra;
  } else {
    // オンデマンド or その他
    return Math.ceil((quantity * pages) / imposition);
  }
}

// 用紙代計算
function calcPaperCost({ needed_paper, paper_thickness, paper_unit_price }) {
  const reams = roundUpToHalf(needed_paper / 1000);
  // 用紙代 = 連数 × 厚み × 単価 ×1.2
  const cost = reams * Number(paper_thickness) * Number(paper_unit_price) * 1.2;
  return cost;
}

// 製版代 (VP, GTOのみ)
function calcPlateCost({ machine, colors, is_double_sided, plate_unit_cost, pages, size }) {
  if (machine === 'オンデマンド') return 0;
  const doubleSideFactor = is_double_sided ? 2 : 1;
  const imposition = getImpositionSize(size);
  const base = Math.ceil(pages / imposition);

  return colors * doubleSideFactor * Number(plate_unit_cost) * base;
}

/**
 * 印刷代 (要件定義の新式に準拠)
 */
function calcPrintCost({
  machine,
  colors,
  is_double_sided,
  print_unit_cost,
  quantity,
  pages,
  size,
}) {
  const doubleSideFactor = is_double_sided ? 2 : 1;
  const imposition = getImpositionSize(size);
  // 台数(ページが面付以下なら1)
  const pageDiv = Math.max(1, Math.ceil(pages / imposition));

  if (machine === 'オンデマンド') {
    const baseCount = Math.ceil((quantity * pages) / imposition);
    return Number(print_unit_cost) * baseCount * 4;
  }

  if (machine === 'VP') {
    const base = colors * doubleSideFactor * Number(print_unit_cost);
    let leftoverRaw = (quantity * pages) / imposition - 1000;
    if (leftoverRaw < 0) leftoverRaw = 0;
    const leftover = leftoverRaw * 0.8 * pageDiv;
    return base + leftover;
  }

  if (machine === 'GTO') {
    const base = colors * doubleSideFactor * Number(print_unit_cost);
    let leftoverRaw = ((quantity * pages) / imposition) * 4 - 1000;
    if (leftoverRaw < 0) leftoverRaw = 0;
    const leftover = leftoverRaw * 4 * 0.8 * pageDiv;
    return base + leftover;
  }

  // それ以外
  return 0;
}

// -----------------------------------------------
export default function EstimateForm({ estimateId, onDetailsLoaded }) {
  const [detailList, setDetailList] = useState([]);

  // ★ DB側に detail_type (text) カラムを追加してある前提
  const [newDetail, setNewDetail] = useState({
    detail_type: '表紙',
    size: 'A4',
    quantity: 1000,
    pages: 2,
    colors: 4,
    is_double_sided: true,
    binding_method: '',
    design_type: 'inhouse',
    design_outsource_cost: 0,
    design_profit_rate: 1.1,
    design_inhouse_unit_cost: 0,
    design_inhouse_calculated_cost: 0,
    print_type: 'inhouse',
    print_outsource_cost: 0,
    print_profit_rate: 1.1,
    machine: 'VP',
    paper_type: 'コート',
    paper_thickness: 57.5,
    paper_unit_price: 200,
    plate_unit_cost: 3000,
    print_unit_cost: 3000,
    binding_cost: 0,
    shipping_cost: 0,
    total_design_cost: 0,
    total_print_cost: 0,
    total_estimated: 0,
  });

  // ---------------------------
  // 明細一覧を取得
  useEffect(() => {
    if (estimateId) {
      fetchDetails();
    }
  }, [estimateId]);

  async function fetchDetails() {
    const { data, error } = await supabase
      .from('estimate_details')
      .select('*')
      .eq('estimate_id', estimateId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      return;
    }
    setDetailList(data || []);
    if (onDetailsLoaded) onDetailsLoaded(data || []);
  }

    // ---- (2) 削除用の関数を追加 ----
    async function deleteDetail(detailId) {
      if (!window.confirm('本当に削除しますか？')) return;
  
      const { error } = await supabase
        .from('estimate_details')
        .delete()
        .eq('id', detailId);
  
      if (error) {
        console.error(error);
        alert('削除時にエラーが発生しました');
        return;
      }
      // 削除成功したら再取得
      fetchDetails();
    }

  // 入力フォーム変更
  function handleChange(e) {
    const { name, type, checked, value } = e.target;
    setNewDetail((prev) => ({
      ...prev,
      [name]: type === 'checkbox'
        ? checked
        : (type === 'number' ? Number(value) : value),
    }));
  }

  // デザイン費
  function calcDesignCost(detail) {
    if (detail.design_type === 'outsourced') {
      return Number(detail.design_outsource_cost) * Number(detail.design_profit_rate);
    } else {
      return Number(detail.design_inhouse_unit_cost) * Number(detail.pages);
    }
  }

  // 社内印刷の詳細計算
  function calcInhousePrint(detail) {
    const needed_paper = calcNeededPaper(detail);
    const paper_cost = calcPaperCost({
      needed_paper,
      paper_thickness: detail.paper_thickness,
      paper_unit_price: detail.paper_unit_price,
    });
    const plate_cost = calcPlateCost({
      machine: detail.machine,
      colors: detail.colors,
      is_double_sided: detail.is_double_sided,
      plate_unit_cost: detail.plate_unit_cost,
      pages: detail.pages,
      size: detail.size,
    });
    const print_cost = calcPrintCost({
      machine: detail.machine,
      colors: detail.colors,
      is_double_sided: detail.is_double_sided,
      print_unit_cost: detail.print_unit_cost,
      quantity: detail.quantity,
      pages: detail.pages,
      size: detail.size,
    });
    const bind = Number(detail.binding_cost);
    const ship = Number(detail.shipping_cost);
    const total = paper_cost + plate_cost + print_cost + bind + ship;

    return {
      needed_paper,
      paper_cost,
      plate_cost,
      print_cost,
      inhouse_total: total,
    };
  }

  // 印刷費トータル
  function calcPrintCostTotal(detail) {
    if (detail.print_type === 'outsourced') {
      return {
        needed_paper: 0,
        paper_cost: 0,
        plate_cost: 0,
        print_cost: Number(detail.print_outsource_cost) * Number(detail.print_profit_rate),
        inhouse_total: 0,
      };
    } else {
      return calcInhousePrint(detail);
    }
  }

  // 新規明細をINSERT
  async function saveDetail() {
    if (!estimateId) {
      alert('見積IDがありません');
      return;
    }

    // デザイン費
    const designCost = calcDesignCost(newDetail);
    // 印刷費(内訳)
    const printResult = calcPrintCostTotal(newDetail);
    const printCost = (newDetail.print_type === 'outsourced')
      ? printResult.print_cost
      : printResult.inhouse_total;

    const totalEst = designCost + printCost;

    const newCalculated = {
      ...newDetail,
      design_inhouse_calculated_cost:
        newDetail.design_type === 'outsourced' ? 0 : designCost,
      total_design_cost: designCost,
      total_print_cost: printCost,
      total_estimated: totalEst,

      needed_paper: printResult.needed_paper || 0,
      paper_cost: printResult.paper_cost || 0,
      plate_cost: printResult.plate_cost || 0,
      actual_print_cost: printResult.print_cost || 0,
    };

    console.log('[saveDetail] final object to insert:', newCalculated);

    // DBにINSERT (detail_typeカラムも含まれる想定)
    const { error } = await supabase
      .from('estimate_details')
      .insert({
        estimate_id: estimateId,
        ...newCalculated,
      });

    if (error) {
      console.error(error);
      alert('明細追加時にエラーが発生しました');
      return;
    }

    // 成功したらフォームを一部リセット
    setNewDetail((prev) => ({
      ...prev,
      quantity: 1000,
      total_estimated: 0,
      total_design_cost: 0,
      total_print_cost: 0,
    }));

    // 一覧再取得
    fetchDetails();
  }

  return (
    <div>
      <h4>見積書詳細</h4>

      {/* 明細一覧 */}
      <table border="1" cellPadding="6" style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            <th>ID</th>
            {/* detail_type を出すならここに <th>詳細</th> とか追加 */}
            <th>サイズ</th>
            <th>数量</th>
            <th>ページ</th>
            <th>刷り色</th>
            <th>必要用紙数</th>
            <th>用紙代</th>
            <th>製版代</th>
            <th>印刷代</th>
            <th>合計(税別)</th>
          </tr>
        </thead>
        <tbody>
          {detailList.length === 0 ? (
            <tr>
              <td colSpan={10} style={{ textAlign: 'center' }}>
                明細がありません
              </td>
            </tr>
          ) : detailList.map((d) => (
            <tr key={d.id}>
              <td>{d.id}</td>
              <td>{d.size}</td>
              <td>{d.quantity}</td>
              <td>{d.pages}</td>
              <td>
                {d.colors}
                {d.is_double_sided ? ' (両面)' : ' (片面)'}
              </td>
              <td>{d.needed_paper || '-'}</td>
              <td>{d.paper_cost ? Math.round(d.paper_cost) + '円' : '-'}</td>
              <td>{d.plate_cost ? Math.round(d.plate_cost) + '円' : '-'}</td>
              <td>{d.actual_print_cost ? Math.round(d.actual_print_cost) + '円' : '-'}</td>
              <td>{d.total_estimated ? Math.round(d.total_estimated) + '円' : '-'}</td>
                            {/* ---- (5) 削除ボタンを配置 ---- */}
                            <td>
                  <button onClick={() => deleteDetail(d.id)}>削除</button>
                </td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr />
      <h4>見積書を作成・自動計算</h4>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '150px 1fr',
        gap: '8px',
        marginBottom: '1rem',
      }}>

        {/* detail_type (表紙／本文／etc) */}
        <label>詳細</label>
        <select
          name="detail_type"
          value={newDetail.detail_type}
          onChange={handleChange}
        >
          <option value="表紙">指定無し</option>
          <option value="表紙">表紙</option>
          <option value="本文">本文</option>
          <option value="表紙＋本文">表紙＋本文（同じ用紙）</option>
        </select>

        {/* サイズ */}
        <label>サイズ</label>
        <select
          name="size"
          value={newDetail.size}
          onChange={handleChange}
        >
          <option value="A3">A3</option>
          <option value="A4">A4</option>
          <option value="A5">A5</option>
          <option value="A6">A6</option>
          <option value="B4">B4</option>
          <option value="B5">B5</option>
        </select>

        <label>数量</label>
        <input
          type="number"
          name="quantity"
          value={newDetail.quantity}
          onChange={handleChange}
        />

<label>ページ数 ※12P等の場合は16Pで算出するか用紙価格で調整</label>
<input
  type="number"
  name="pages"
  value={newDetail.pages}
  onChange={handleChange}
  // あるいは placeholder を使う方法もあり
  placeholder="※12P等の場合は16Pで算出するか用紙価格で調整"
/>

        <label>刷り色</label>
        <input
          type="number"
          name="colors"
          min="1"
          max="4"
          value={newDetail.colors}
          onChange={handleChange}
        />

        <label>両面の場合は→✅</label>
        <input
          type="checkbox"
          name="is_double_sided"
          checked={newDetail.is_double_sided}
          onChange={handleChange}
        />

        <label>製本</label>
        <input
          type="text"
          name="binding_method"
          value={newDetail.binding_method}
          onChange={handleChange}
        />

        {/* デザイン区分 */}
        <label>デザイン区分</label>
        <select
          name="design_type"
          value={newDetail.design_type}
          onChange={handleChange}
        >
          <option value="inhouse">社内</option>
          <option value="outsourced">外注</option>
        </select>

        {/* 外注か社内かで入力UIを分ける */}
        {newDetail.design_type === 'outsourced' ? (
          <>
            <label>外注費</label>
            <input
              type="number"
              name="design_outsource_cost"
              value={newDetail.design_outsource_cost}
              onChange={handleChange}
            />

            <label>利益率</label>
            <input
              type="number"
              step="0.1"
              name="design_profit_rate"
              value={newDetail.design_profit_rate}
              onChange={handleChange}
            />
          </>
        ) : (
          <>
            <label>社内単価(円/ページ)</label>
            <input
              type="number"
              name="design_inhouse_unit_cost"
              value={newDetail.design_inhouse_unit_cost}
              onChange={handleChange}
            />
            <div />
          </>
        )}

        {/* 印刷区分 */}
        <label>印刷区分</label>
        <select
          name="print_type"
          value={newDetail.print_type}
          onChange={handleChange}
        >
          <option value="inhouse">社内</option>
          <option value="outsourced">外注</option>
        </select>

        {newDetail.print_type === 'outsourced' ? (
          <>
            <label>外注印刷仕入</label>
            <input
              type="number"
              name="print_outsource_cost"
              value={newDetail.print_outsource_cost}
              onChange={handleChange}
            />

            <label>利益率</label>
            <input
              type="number"
              step="0.1"
              name="print_profit_rate"
              value={newDetail.print_profit_rate}
              onChange={handleChange}
            />
          </>
        ) : (
          <>
            <label>印刷機</label>
            <select
              name="machine"
              value={newDetail.machine}
              onChange={handleChange}
            >
              <option value="VP">VP</option>
              <option value="GTO">GTO</option>
              <option value="オンデマンド">オンデマンド</option>
            </select>
            <div />

            {/* 用紙関係 */}
            <label>用紙種類</label>
            <input
              type="text"
              name="paper_type"
              value={newDetail.paper_type}
              onChange={handleChange}
            />

            <label>用紙厚み(K)</label>
            <input
              type="number"
              name="paper_thickness"
              value={newDetail.paper_thickness}
              onChange={handleChange}
            />

            <label>用紙単価</label>
            <input
              type="number"
              name="paper_unit_price"
              value={newDetail.paper_unit_price}
              onChange={handleChange}
            />

            <label>製版単価(円)</label>
            <input
              type="number"
              name="plate_unit_cost"
              value={newDetail.plate_unit_cost}
              onChange={handleChange}
            />

            <label>印刷単価(円)</label>
            <input
              type="number"
              name="print_unit_cost"
              value={newDetail.print_unit_cost}
              onChange={handleChange}
              placeholder="VP=3000~6000, GTO=2000~4000"
            />

            <label>製本代</label>
            <input
              type="number"
              name="binding_cost"
              value={newDetail.binding_cost}
              onChange={handleChange}
            />

            <label>発送費</label>
            <input
              type="number"
              name="shipping_cost"
              value={newDetail.shipping_cost}
              onChange={handleChange}
            />
          </>
        )}
      </div>

      <button onClick={saveDetail}>価格を算出</button>
    </div>
  );
}

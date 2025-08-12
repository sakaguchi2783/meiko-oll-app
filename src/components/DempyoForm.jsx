// src/components/DempyoForm.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useReactToPrint } from 'react-to-print';

/** =========================
 *  テンプレ画像（public/forms 配下）
 *  ========================= */
const IMG_TEJUN    = process.env.PUBLIC_URL + '/forms/tezyun.jpg';
const IMG_KOUTEI   = process.env.PUBLIC_URL + '/forms/koutei.jpg';
const IMG_URIAGE   = process.env.PUBLIC_URL + '/forms/uriage.jpg';
const IMG_TOKUSAKI = process.env.PUBLIC_URL + '/forms/tokusaki.jpg';

/** 下絵の基準サイズ（この基準で座標を置く） */
const BASE_W = 768;
const BASE_H_FORM = 1114;  // 手順票・工程表
const BASE_H_SLIP = 1181;  // 売上・得意先元帳

/** =========================================================
 *  小さなオーバーレイ部品
 *  ========================================================= */
function OverlayImage({ src, width = BASE_W, height, children, style }) {
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        backgroundImage: `url(${src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'top left',
        backgroundRepeat: 'no-repeat',
        border: '1px solid #ddd',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** テキスト入力（座標指定, 赤字デフォルト） */
function OVInput({
  x, y, w = 140, h = 22,
  name, value, onChange,
  readOnly = false, align = 'left',
  fontSize = 14, color = 'red',
}) {
  return (
    <input
      name={name}
      value={value ?? ''}
      onChange={onChange}
      readOnly={readOnly}
      style={{
        position: 'absolute',
        left: x, top: y, width: w, height: h,
        border: 'none', outline: 'none',
        background: 'transparent',
        color, fontSize, textAlign: align,
      }}
    />
  );
}

/** 表示専用テキスト */
function OVText({
  x, y, w = 140, h = 22,
  text, align = 'left',
  fontSize = 14, color = '#333', bold = false,
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x, top: y, width: w, height: h,
        lineHeight: `${h}px`,
        color, fontSize, fontWeight: bold ? 600 : 400,
        textAlign: align, pointerEvents: 'none',
      }}
    >
      {text ?? ''}
    </div>
  );
}

/** チェック（☐/☑ 切替） */
function OVCheck({ x, y, value, onToggle, fontSize = 18, color = 'red', title }) {
  return (
    <div
      onClick={onToggle}
      title={title || 'クリックで切替'}
      style={{
        position: 'absolute', left: x, top: y,
        cursor: 'pointer', userSelect: 'none',
        color, fontSize, lineHeight: `${fontSize}px`,
      }}
    >
      {value ? '☑' : '☐'}
    </div>
  );
}

/** 通貨整形 */
const yen = (n) => (typeof n === 'number' ? n.toLocaleString('ja-JP') + '円' : '');

/** =========================================================
 *  計算ヘルパー：面付/台数/版数/印刷表示
 *  ========================================================= */

// 面付（EstimateForm と同じルール）
function getImpositionSize(size) {
  switch (size) {
    case 'A3': return 8;
    case 'A4': return 16;
    case 'A5':
    case 'B5': return 32;
    case 'A6': return 64;
    case 'B4': return 16;
    default:   return 16;
  }
}
// 台数（ページが面付を超えたら ceil(p/面付)）
function getPageDiv(pages, size) {
  const imp = getImpositionSize(size);
  const p = Number(pages || 0);
  return Math.max(1, Math.ceil(p / imp));
}
// 片面/両面の色表示 例: 4/4, 1/0
function getColorSlash(detail) {
  const c = Number(detail.colors || 0) || 0;
  return detail.is_double_sided ? `${c}/${c}` : `${c}/0`;
}
// 版表示 例: VP => A1×8×2, GTO => A3×8
function getPlateString(detail) {
  const format = detail.machine === 'VP' ? 'A1' : 'A3';
  const colors = Number(detail.colors || 0) || 0;
  const sides = detail.is_double_sided ? 2 : 1;
  const pagesDiv = getPageDiv(detail.pages, detail.size);
  const plates = colors * sides;
  return `${format}×${plates}${pagesDiv > 1 ? `×${pagesDiv}` : ''}`;
}
// 印刷表示
// pageDiv==1 -> baseCount×色/色
// pageDiv>1  -> (部数)×色/色×台数
function getPrintString(detail) {
  const imp = getImpositionSize(detail.size);
  const pageDiv = getPageDiv(detail.pages, detail.size);
  const qty = Number(detail.quantity || 0) || 0;
  const pages = Number(detail.pages || 0) || 0;
  const baseCount = Math.ceil((qty * pages) / imp);
  const col = getColorSlash(detail);
  return pageDiv === 1 ? `${baseCount}×${col}` : `${qty}×${col}×${pageDiv}`;
}

/** =========================================================
 *  本体
 *  ========================================================= */
export default function DempyoForm() {
  /* ───────── 1) セレクタ用データ ───────── */
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [estimateList, setEstimateList] = useState([]);
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [detailList, setDetailList] = useState([]);

  /* ───────── 2) オーバーレイ入力状態 ───────── */
  const [manual, setManual] = useState({
    // 基本仕様
    dueDate: '', size: '', quantity: '', pages: '', colorCount: '', detailType: '',
    isSingle: false, isDouble: true, isNew: true, isReprint: false,

    // 用紙欄（指定無し/表紙＋本文, 表紙, 本文）
    paper_general_type: '', paper_general_thickness: '', paper_general_needed: '',
    paper_cover_type:   '', paper_cover_thickness:   '', paper_cover_needed:   '',
    paper_body_type:    '', paper_body_thickness:    '', paper_body_needed:    '',

    // 進行関連
    schedule: Array.from({ length: 10 }, () => ({ date: '', text: '' })),
    designMemo: '', outsideMemo: '', bookMemo: '',

    // 組織／機種のチェック状態
    designInhouse: false, designOutsource: false,
    printInhouse: false,  printOutsource: false,
    bindInhouse: true,    bindOutsource: false,
    mVP: false, mGTO: false, mOD: false,
  });

  /* ───────── 3) 初期データ取得 ───────── */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('clients').select('*').order('created_at');
      if (error) console.error(error);
      setClients(data || []);
    })();
  }, []);

  // 取引先 => 見積
  useEffect(() => {
    if (!selectedClientId) {
      setEstimateList([]); setSelectedEstimate(null); setDetailList([]); return;
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

  // 見積 => 明細
  useEffect(() => {
    if (!selectedEstimate) { setDetailList([]); return; }
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

  /* ───────── 4) 明細からオーバーレイ初期値の自動補完 ───────── */
  useEffect(() => {
    if (!detailList.length) return;

    // 代表明細（最初の1件）から基本仕様を補完
    const d0 = detailList[0];
    const cover  = detailList.find(d => d.detail_type === '表紙') || null;
    const body   = detailList.find(d => d.detail_type === '本文') || null;
    const general= detailList.find(d => d.detail_type === '指定無し' || d.detail_type === '表紙＋本文') || null;

    const anyDesignIn = detailList.some(d => d.design_type === 'inhouse');
    const anyDesignOut= detailList.some(d => d.design_type === 'outsourced');
    const anyPrintIn  = detailList.some(d => d.print_type === 'inhouse');
    const anyPrintOut = detailList.some(d => d.print_type === 'outsourced');
    const hasVP  = detailList.some(d => d.machine === 'VP');
    const hasGTO = detailList.some(d => d.machine === 'GTO');
    const hasOD  = detailList.some(d => d.machine === 'オンデマンド');

    setManual(p => ({
      ...p,
      size:       p.size       || d0.size || '',
      quantity:   p.quantity   || (d0.quantity != null ? String(d0.quantity) : ''),
      pages:      p.pages      || (d0.pages    != null ? String(d0.pages)    : ''),
      colorCount: p.colorCount || (d0.colors   != null ? String(d0.colors)   : ''),
      detailType: p.detailType || (d0.detail_type || ''),

      // 用紙（指定無し/表紙＋本文）
      paper_general_type:      p.paper_general_type      || (general?.paper_type       ?? ''),
      paper_general_thickness: p.paper_general_thickness || (general?.paper_thickness  ?? ''),
      paper_general_needed:    p.paper_general_needed    || (general?.needed_paper     ?? ''),

      // 表紙
      paper_cover_type:        p.paper_cover_type        || (cover?.paper_type        ?? ''),
      paper_cover_thickness:   p.paper_cover_thickness   || (cover?.paper_thickness   ?? ''),
      paper_cover_needed:      p.paper_cover_needed      || (cover?.needed_paper      ?? ''),

      // 本文
      paper_body_type:         p.paper_body_type         || (body?.paper_type         ?? ''),
      paper_body_thickness:    p.paper_body_thickness    || (body?.paper_thickness    ?? ''),
      paper_body_needed:       p.paper_body_needed       || (body?.needed_paper       ?? ''),

      // 進行
      bookMemo:  p.bookMemo || (d0.binding_method || ''),
      designInhouse:  p.designInhouse  || anyDesignIn,
      designOutsource:p.designOutsource|| anyDesignOut,
      printInhouse:   p.printInhouse   || anyPrintIn,
      printOutsource: p.printOutsource || anyPrintOut,
      mVP:  p.mVP  || hasVP,
      mGTO: p.mGTO || hasGTO,
      mOD:  p.mOD  || hasOD,
    }));
  }, [detailList]);

  /* ───────── 5) 金額の集計（表紙/本文/一般に分ける） ───────── */
  const sums = useMemo(() => {
    const sum = (arr, key) => arr.reduce((a, d) => a + (Number(d[key]) || 0), 0);

    const cover   = detailList.filter(d => d.detail_type === '表紙');
    const body    = detailList.filter(d => d.detail_type === '本文');
    const general = detailList.filter(d => d.detail_type === '指定無し' || d.detail_type === '表紙＋本文');

    return {
      // 用紙
      paper_general: sum(general, 'paper_cost'),
      paper_cover:   sum(cover,   'paper_cost'),
      paper_body:    sum(body,    'paper_cost'),

      // 製版
      plate_cover:   sum(cover,   'plate_cost'),
      plate_body:    sum(body,    'plate_cost'),
      plate_general: sum(general, 'plate_cost'),

      // 印刷（actual_print_cost を採用）
      print_cover:   sum(cover,   'actual_print_cost'),
      print_body:    sum(body,    'actual_print_cost'),
      print_general: sum(general, 'actual_print_cost'),

      // 製本・発送
      bind_cover:    sum(cover,   'binding_cost'),
      bind_body:     sum(body,    'binding_cost'),
      bind_general:  sum(general, 'binding_cost'),

      ship_cover:    sum(cover,   'shipping_cost'),
      ship_body:     sum(body,    'shipping_cost'),
      ship_general:  sum(general, 'shipping_cost'),

      // デザイン費は全体合計で
      design_total:  sum(detailList, 'total_design_cost'),
    };
  }, [detailList]);

  // 右カラムの表示用：2段が必要な項目は「1段目=一般+表紙」「2段目=本文」
  const rightCol = useMemo(() => {
    return {
      // 用紙は3段：一般/表紙/本文（画像に合わせて3か所へ表示）
      paper_general: sums.paper_general,
      paper_cover:   sums.paper_cover,
      paper_body:    sums.paper_body,

      // 製版・印刷・製本・発送は「上段=一般+表紙」「下段=本文」
      plate1: sums.plate_general + sums.plate_cover,
      plate2: sums.plate_body,

      print1: sums.print_general + sums.print_cover,
      print2: sums.print_body,

      bind1: sums.bind_general + sums.bind_cover,
      bind2: sums.bind_body,

      ship1: sums.ship_general + sums.ship_cover,
      ship2: sums.ship_body,
    };
  }, [sums]);

  // 売上合計など
  const grand = useMemo(() => {
    const total =
      sums.design_total +
      sums.paper_general + sums.paper_cover + sums.paper_body +
      (rightCol.plate1 + rightCol.plate2) +
      (rightCol.print1 + rightCol.print2) +
      (rightCol.bind1 + rightCol.bind2) +
      (rightCol.ship1 + rightCol.ship2);

    const qty = Number(manual.quantity || 0) || 0;
    const unit = qty > 0 ? Math.round(total / qty) : 0;

    return { total, unit, tax: Math.floor(total * 0.1) };
  }, [sums, rightCol, manual.quantity]);

  /* ───────── 6) 製版/印刷の表示用文字列 ───────── */
  const plateStrings = useMemo(() => {
    const vp  = detailList.filter(d => d.machine === 'VP').map(getPlateString);
    const gto = detailList.filter(d => d.machine === 'GTO').map(getPlateString);
    return { vp, gto };
  }, [detailList]);

  const printStrings = useMemo(() => {
    const vp  = detailList.filter(d => d.machine === 'VP').map(getPrintString);
    const gto = detailList.filter(d => d.machine === 'GTO').map(getPrintString);
    const od  = detailList.filter(d => d.machine === 'オンデマンド').map(getPrintString);
    return { vp, gto, od };
  }, [detailList]);

  /* ───────── 7) 入力ハンドラ ───────── */
  const onManualChange = (e) => {
    const { name, value } = e.target;
    setManual(p => ({ ...p, [name]: value }));
  };
  const toggle = (key) => setManual(p => ({ ...p, [key]: !p[key] }));

  /* ───────── 8) 印刷（ReactToPrint） ───────── */
  const setOneRef = useRef(null); // 手順票 + 工程表
  const setTwoRef = useRef(null); // 売上伝票 + 得意先元帳
  const printSetOne = useReactToPrint({ content: () => setOneRef.current });
  const printSetTwo = useReactToPrint({ content: () => setTwoRef.current });

  /* ───────── 9) 便利値 ───────── */
  const clientName  = clients.find(c => c.id === selectedClientId)?.name || '';
  const estimateId  = selectedEstimate?.id    || '';
  const productName = selectedEstimate?.title || '';

  /* ───────── 10) スケジュール描画（10行） ───────── */
  const renderScheduleFor = (startY = 150, step = 95, xDate = 612, xText = 660) =>
    manual.schedule.map((row, i) => {
      const y = startY + i * step;
      return (
        <React.Fragment key={i}>
          <OVInput
            x={xDate} y={y} w={40}
            name={`schedule_date_${i}`}
            value={row.date}
            onChange={(e) => {
              const v = e.target.value;
              setManual(p => {
                const arr = [...p.schedule];
                arr[i] = { ...arr[i], date: v };
                return { ...p, schedule: arr };
              });
            }}
          />
          <OVInput
            x={xText} y={y} w={90}
            name={`schedule_text_${i}`}
            value={row.text}
            onChange={(e) => {
              const v = e.target.value;
              setManual(p => {
                const arr = [...p.schedule];
                arr[i] = { ...arr[i], text: v };
                return { ...p, schedule: arr };
              });
            }}
          />
        </React.Fragment>
      );
    });

  /* =========================================================
   *  UI
   * ========================================================= */
  return (
    <div style={{ padding: '1rem' }}>
      <h2>伝票作成</h2>

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

      {/* 2列×2段：手順票/工程表 & 売上伝票/得意先元帳 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* ================= 手順票 + 工程表 ================= */}
        <div ref={setOneRef}>
          {/* 手順票 */}
          <OverlayImage src={IMG_TEJUN} width={BASE_W} height={BASE_H_FORM} style={{ marginBottom: 16 }}>
            {/* 見積番号・取引先・品名（ヘッダ） */}
            <OVInput x={45}  y={31} w={150} name="estimateId"  value={estimateId}  readOnly fontSize={10} />
            <OVInput x={340} y={15} w={260} name="clientName"   value={clientName} readOnly fontSize={17} />
            <OVInput x={340} y={65} w={260} name="productName"  value={productName} readOnly fontSize={16} />

            {/* 左：基本仕様 */}
            <OVInput x={80}  y={118} w={140} name="dueDate"    value={manual.dueDate}    onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={169} w={160} name="size"       value={manual.size}       onChange={onManualChange} fontSize={24}/>
            <OVInput x={100} y={220} w={160} name="quantity"   value={manual.quantity}   onChange={onManualChange} fontSize={20}/>
            <OVInput x={120} y={272} w={160} name="pages"      value={manual.pages}      onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={328} w={160} name="colorCount" value={manual.colorCount} onChange={onManualChange} fontSize={24}/>

            {/* 片面/両面・新規/増刷 */}
            <OVCheck x={79} y={372}   value={manual.isSingle}  onToggle={() => toggle('isSingle')}  />
            <OVCheck x={79} y={395}   value={manual.isDouble}  onToggle={() => toggle('isDouble')}  />
            <OVCheck x={79} y={426.5} value={manual.isNew}     onToggle={() => toggle('isNew')}     />
            <OVCheck x={79} y={449.5} value={manual.isReprint} onToggle={() => toggle('isReprint')} />

            {/* 中央：用紙欄（指定無し/表紙＋本文, 表紙, 本文） */}
            {/* 用紙（最上段） */}
            <OVInput x={295} y={142} w={90} name="paper_general_type"      value={manual.paper_general_type}      onChange={onManualChange} />
            <OVInput x={390} y={142} w={60} name="paper_general_thickness" value={manual.paper_general_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={466} y={142} w={80} name="paper_general_needed"    value={manual.paper_general_needed}    onChange={onManualChange} align="right"/>

            {/* 表紙（2段目） */}
            <OVInput x={295} y={196} w={90} name="paper_cover_type"      value={manual.paper_cover_type}      onChange={onManualChange} />
            <OVInput x={390} y={196} w={60} name="paper_cover_thickness" value={manual.paper_cover_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={466} y={196} w={80} name="paper_cover_needed"    value={manual.paper_cover_needed}    onChange={onManualChange} align="right"/>

            {/* 本文（3段目） */}
            <OVInput x={295} y={250} w={90} name="paper_body_type"      value={manual.paper_body_type}      onChange={onManualChange} />
            <OVInput x={390} y={250} w={60} name="paper_body_thickness" value={manual.paper_body_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={466} y={250} w={80} name="paper_body_needed"    value={manual.paper_body_needed}    onChange={onManualChange} align="right"/>

            {/* 制作（社内/外注）＋自由記入（〈内容〉） */}
            <OVCheck x={95}  y={526} value={manual.designInhouse}  onToggle={() => toggle('designInhouse')}  />
            <OVCheck x={95}  y={547} value={manual.designOutsource}onToggle={() => toggle('designOutsource')} />
            <OVInput x={245} y={520} w={460} h={60} name="designMemo" value={manual.designMemo} onChange={onManualChange} />

            {/* 印刷（社内/外注 & VP/GTO/OD チェック連動） */}
            <OVCheck x={95}  y={606} value={manual.printInhouse} onToggle={() => toggle('printInhouse')} />
            <OVCheck x={95}  y={628} value={manual.printOutsource} onToggle={() => toggle('printOutsource')} />
            <OVCheck x={325} y={610} value={manual.mVP}  onToggle={() => toggle('mVP')}  />
            <OVCheck x={390} y={610} value={manual.mGTO} onToggle={() => toggle('mGTO')} />
            <OVCheck x={505} y={610} value={manual.mOD}  onToggle={() => toggle('mOD')}  />

            {/* 〈外注先〉フリーテキスト */}
            <OVInput x={250} y={672} w={450} h={48} name="outsideMemo" value={manual.outsideMemo} onChange={onManualChange} />

            {/* 製版（VP/GTOの版数表示） */}
            <OVText  x={275} y={708} w={420} text={`VP・・・・・・${plateStrings.vp.join('、')}`}  color="red" />
            <OVText  x={275} y={740} w={420} text={`GTO・・・・・${plateStrings.gto.join('、')}`} color="red" />

            {/* 印刷（通し枚数表示） */}
            <OVText  x={275} y={786} w={420} text={`VP・・・・・・${printStrings.vp.join('、')}`}  color="red" />
            <OVText  x={275} y={811} w={420} text={`GTO・・・・・${printStrings.gto.join('、')}`} color="red" />
            <OVText  x={275} y={836} w={420} text={`オンデマンド・・${printStrings.od.join('、')}`} color="red" />

            {/* 製本（社内/外注, 〈製本内容〉） */}
            <OVCheck x={95}  y={915} value={manual.bindInhouse}  onToggle={() => toggle('bindInhouse')}  />
            <OVCheck x={95}  y={937} value={manual.bindOutsource}onToggle={() => toggle('bindOutsource')} />
            <OVInput x={250} y={960} w={450} h={60} name="bookMemo" value={manual.bookMemo} onChange={onManualChange} />

            {/* スケジュール（右端） */}
            {renderScheduleFor(152, 105, 635, 680)}
          </OverlayImage>

          {/* 工程表（手順票とほぼ同じ） */}
          <OverlayImage src={IMG_KOUTEI} width={BASE_W} height={BASE_H_FORM}>
            <OVInput x={45}  y={31} w={150} name="estimateId_k"  value={estimateId}  readOnly fontSize={10} />
            <OVInput x={340} y={15} w={260} name="clientName_k"  value={clientName} readOnly fontSize={17} />
            <OVInput x={340} y={65} w={260} name="productName_k" value={productName} readOnly fontSize={16} />

            <OVInput x={80}  y={118} w={140} name="dueDate_k"    value={manual.dueDate}    onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={169} w={160} name="size_k"       value={manual.size}       onChange={onManualChange} fontSize={24}/>
            <OVInput x={100} y={220} w={160} name="quantity_k"   value={manual.quantity}   onChange={onManualChange} fontSize={20}/>
            <OVInput x={120} y={272} w={160} name="pages_k"      value={manual.pages}      onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={328} w={160} name="colorCount_k" value={manual.colorCount} onChange={onManualChange} fontSize={24}/>

            <OVCheck x={79} y={372}   value={manual.isSingle}  onToggle={() => toggle('isSingle')}  />
            <OVCheck x={79} y={395}   value={manual.isDouble}  onToggle={() => toggle('isDouble')}  />
            <OVCheck x={79} y={426.5} value={manual.isNew}     onToggle={() => toggle('isNew')}     />
            <OVCheck x={79} y={449.5} value={manual.isReprint} onToggle={() => toggle('isReprint')} />

            {/* 用紙欄（工程表も同様に反映） */}
            <OVInput x={295} y={142} w={90} name="paper_general_type_k"      value={manual.paper_general_type}      onChange={onManualChange} />
            <OVInput x={390} y={142} w={60} name="paper_general_thickness_k" value={manual.paper_general_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={466} y={142} w={80} name="paper_general_needed_k"    value={manual.paper_general_needed}    onChange={onManualChange} align="right"/>
            <OVInput x={295} y={196} w={90} name="paper_cover_type_k"        value={manual.paper_cover_type}        onChange={onManualChange} />
            <OVInput x={390} y={196} w={60} name="paper_cover_thickness_k"   value={manual.paper_cover_thickness}   onChange={onManualChange} align="center"/>
            <OVInput x={466} y={196} w={80} name="paper_cover_needed_k"      value={manual.paper_cover_needed}      onChange={onManualChange} align="right"/>
            <OVInput x={295} y={250} w={90} name="paper_body_type_k"         value={manual.paper_body_type}         onChange={onManualChange} />
            <OVInput x={390} y={250} w={60} name="paper_body_thickness_k"    value={manual.paper_body_thickness}    onChange={onManualChange} align="center"/>
            <OVInput x={466} y={250} w={80} name="paper_body_needed_k"       value={manual.paper_body_needed}       onChange={onManualChange} align="right"/>

            <OVCheck x={95}  y={526} value={manual.designInhouse}  onToggle={() => toggle('designInhouse')}  />
            <OVCheck x={95}  y={547} value={manual.designOutsource}onToggle={() => toggle('designOutsource')} />
            <OVInput x={245} y={520} w={460} h={60} name="designMemo_k" value={manual.designMemo} onChange={onManualChange} />

            <OVCheck x={95}  y={606} value={manual.printInhouse} onToggle={() => toggle('printInhouse')} />
            <OVCheck x={95}  y={628} value={manual.printOutsource} onToggle={() => toggle('printOutsource')} />
            <OVCheck x={325} y={610} value={manual.mVP}  onToggle={() => toggle('mVP')}  />
            <OVCheck x={390} y={610} value={manual.mGTO} onToggle={() => toggle('mGTO')} />
            <OVCheck x={505} y={610} value={manual.mOD}  onToggle={() => toggle('mOD')}  />

            <OVInput x={250} y={672} w={450} h={48} name="outsideMemo_k" value={manual.outsideMemo} onChange={onManualChange} />
            <OVText  x={275} y={708} w={420} text={`VP・・・・・・${plateStrings.vp.join('、')}`}  color="red" />
            <OVText  x={275} y={740} w={420} text={`GTO・・・・・${plateStrings.gto.join('、')}`} color="red" />

            <OVText  x={275} y={786} w={420} text={`VP・・・・・・${printStrings.vp.join('、')}`}  color="red" />
            <OVText  x={275} y={811} w={420} text={`GTO・・・・・${printStrings.gto.join('、')}`} color="red" />
            <OVText  x={275} y={836} w={420} text={`オンデマンド・・${printStrings.od.join('、')}`} color="red" />

            <OVCheck x={95}  y={915} value={manual.bindInhouse}  onToggle={() => toggle('bindInhouse')}  />
            <OVCheck x={95}  y={937} value={manual.bindOutsource}onToggle={() => toggle('bindOutsource')} />
            {renderScheduleFor(153, 105, 635, 680)}
          </OverlayImage>
        </div>

        {/* ================= 売上伝票 + 得意先元帳 ================= */}
        <div ref={setTwoRef}>
          {/* 売上伝票 */}
          <OverlayImage src={IMG_URIAGE} width={BASE_W} height={BASE_H_SLIP} style={{ marginBottom: 16 }}>
            {/* ヘッダ */}
            <OVInput x={40}  y={31} w={150} name="estimateId_u" value={estimateId}  readOnly fontSize={10} />
            <OVInput x={340} y={15} w={260} name="clientName_u"  value={clientName} readOnly fontSize={17} />
            <OVInput x={340} y={65} w={260} name="productName_u" value={productName} readOnly fontSize={16} />

            {/* 左側基本 */}
            <OVInput x={90}  y={115} w={140} name="dueDate_u"    value={manual.dueDate}    onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={169} w={160} name="size_u"       value={manual.size}       onChange={onManualChange} fontSize={24}/>
            <OVInput x={100} y={220} w={160} name="quantity_u"   value={manual.quantity}   onChange={onManualChange} fontSize={20}/>
            <OVInput x={120} y={272} w={160} name="pages_u"      value={manual.pages}      onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={328} w={160} name="colorCount_u" value={manual.colorCount} onChange={onManualChange} fontSize={24}/>
            <OVCheck x={79} y={372}   value={manual.isSingle}  onToggle={() => toggle('isSingle')}  />
            <OVCheck x={79} y={395}   value={manual.isDouble}  onToggle={() => toggle('isDouble')}  />
            <OVCheck x={79} y={426.5} value={manual.isNew}     onToggle={() => toggle('isNew')}     />
            <OVCheck x={79} y={449.5} value={manual.isReprint} onToggle={() => toggle('isReprint')} />

            {/* 中央：用紙（売上伝票にも反映） */}
            <OVInput x={295} y={142} w={90} name="paper_general_type_u"      value={manual.paper_general_type}      onChange={onManualChange} />
            <OVInput x={390} y={142} w={60} name="paper_general_thickness_u" value={manual.paper_general_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={466} y={142} w={80} name="paper_general_needed_u"    value={manual.paper_general_needed}    onChange={onManualChange} align="right"/>

            <OVInput x={295} y={196} w={90} name="paper_cover_type_u"      value={manual.paper_cover_type}      onChange={onManualChange} />
            <OVInput x={390} y={196} w={60} name="paper_cover_thickness_u" value={manual.paper_cover_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={466} y={196} w={80} name="paper_cover_needed_u"    value={manual.paper_cover_needed}    onChange={onManualChange} align="right"/>

            <OVInput x={295} y={250} w={90} name="paper_body_type_u"      value={manual.paper_body_type}      onChange={onManualChange} />
            <OVInput x={390} y={250} w={60} name="paper_body_thickness_u" value={manual.paper_body_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={466} y={250} w={80} name="paper_body_needed_u"    value={manual.paper_body_needed}    onChange={onManualChange} align="right"/>

            {/* 制作メモ（任意） */}
            <OVInput x={245} y={520} w={460} h={60} name="designMemo_u" value={manual.designMemo} onChange={onManualChange} />

            {/* 右カラム：金額（位置は目安。必要なら微調整してください） */}
            {/* 用紙：3段 */}
            <OVText x={640} y={205} w={110} text={yen(rightCol.paper_general)} align="right" color="red" />
            <OVText x={640} y={300} w={110} text={yen(rightCol.paper_cover)}   align="right" color="red" />
            <OVText x={640} y={395} w={110} text={yen(rightCol.paper_body)}    align="right" color="red" />

            {/* 製版：2段（上：一般+表紙 / 下：本文） */}
            <OVText x={640} y={545} w={110} text={yen(rightCol.plate1)} align="right" color="red" />
            <OVText x={640} y={570} w={110} text={yen(rightCol.plate2)} align="right" color="red" />

            {/* 印刷：2段 */}
            <OVText x={640} y={650} w={110} text={yen(rightCol.print1)} align="right" color="red" />
            <OVText x={640} y={675} w={110} text={yen(rightCol.print2)} align="right" color="red" />

            {/* 製本：2段 */}
            <OVText x={640} y={840} w={110} text={yen(rightCol.bind1)} align="right" color="red" />
            <OVText x={640} y={865} w={110} text={yen(rightCol.bind2)} align="right" color="red" />

            {/* 発送：2段 */}
            <OVText x={640} y={980} w={110} text={yen(rightCol.ship1)} align="right" color="red" />
            <OVText x={640} y={1005} w={110} text={yen(rightCol.ship2)} align="right" color="red" />

            {/* 下部：単価・請求額・消費税・合計金額 */}
            <OVText x={150} y={1117} w={200} text={yen(grand.unit)}  align="center" color="red" />
            <OVText x={520} y={1117} w={200} text={yen(grand.total)} align="center" color="red" />
            <OVText x={520} y={1151} w={200} text={yen(grand.tax)}   align="center" color="red" />
            <OVText x={170} y={1151} w={160} text={yen(grand.total)} align="center" color="red" />
          </OverlayImage>

          {/* 得意先元帳（売上伝票の金額を転記） */}
          <OverlayImage src={IMG_TOKUSAKI} width={BASE_W} height={BASE_H_SLIP}>
            <OVInput x={40}  y={31} w={150} name="estimateId_t" value={estimateId}  readOnly fontSize={10} />
            <OVInput x={340} y={15} w={260} name="clientName_t"  value={clientName} readOnly fontSize={17} />
            <OVInput x={340} y={65} w={260} name="productName_t" value={productName} readOnly fontSize={16} />

            {/* 左側基本（控え用に同じ値を反映） */}
            <OVInput x={90}  y={115} w={140} name="dueDate_t"    value={manual.dueDate}    onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={169} w={160} name="size_t"       value={manual.size}       onChange={onManualChange} fontSize={24}/>
            <OVInput x={100} y={220} w={160} name="quantity_t"   value={manual.quantity}   onChange={onManualChange} fontSize={20}/>
            <OVInput x={120} y={272} w={160} name="pages_t"      value={manual.pages}      onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={328} w={160} name="colorCount_t" value={manual.colorCount} onChange={onManualChange} fontSize={24}/>

            {/* 右カラム金額（転記） */}
            <OVText x={640} y={205} w={110} text={yen(rightCol.paper_general)} align="right" color="red" />
            <OVText x={640} y={300} w={110} text={yen(rightCol.paper_cover)}   align="right" color="red" />
            <OVText x={640} y={395} w={110} text={yen(rightCol.paper_body)}    align="right" color="red" />

            <OVText x={640} y={545} w={110} text={yen(rightCol.plate1)} align="right" color="red" />
            <OVText x={640} y={570} w={110} text={yen(rightCol.plate2)} align="right" color="red" />

            <OVText x={640} y={650} w={110} text={yen(rightCol.print1)} align="right" color="red" />
            <OVText x={640} y={675} w={110} text={yen(rightCol.print2)} align="right" color="red" />

            <OVText x={640} y={840} w={110} text={yen(rightCol.bind1)} align="right" color="red" />
            <OVText x={640} y={865} w={110} text={yen(rightCol.bind2)} align="right" color="red" />

            <OVText x={640} y={980} w={110} text={yen(rightCol.ship1)} align="right" color="red" />
            <OVText x={640} y={1005} w={110} text={yen(rightCol.ship2)} align="right" color="red" />

            {/* 下部 合計・請求額など（控用も同数値） */}
            <OVText x={150} y={1117} w={200} text={yen(grand.unit)}  align="center" color="red" />
            <OVText x={520} y={1117} w={200} text={yen(grand.total)} align="center" color="red" />
            <OVText x={520} y={1151} w={200} text={yen(grand.tax)}   align="center" color="red" />
            <OVText x={170} y={1151} w={160} text={yen(grand.total)} align="center" color="red" />
          </OverlayImage>
        </div>
      </div>

      {/* 印刷ボタン */}
      <div style={{ marginTop: 16 }}>
        <button onClick={printSetOne}>手順票＋工程表 PDF 出力</button>
        <button onClick={printSetTwo} style={{ marginLeft: 8 }}>売上伝票＋得意先元帳 PDF 出力</button>
      </div>

      {/* (下は確認用) 選択中の明細の簡易プレビュー */}
      {selectedEstimate && (
        <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <h4>見積明細プレビュー</h4>
          {detailList.length === 0 ? (
            <p style={{ color: '#888' }}>この品名の明細はありません。</p>
          ) : (
            <table border={1} cellPadding={4} style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ background: '#f7f7f7' }}>
                  <th>ID</th><th>詳細</th><th>サイズ</th><th>数量</th><th>ページ</th><th>色</th>
                  <th>用紙</th><th>印刷機</th><th>必要用紙</th><th>小計</th>
                </tr>
              </thead>
              <tbody>
                {detailList.map(d => (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>{d.detail_type}</td>
                    <td>{d.size}</td>
                    <td>{d.quantity}</td>
                    <td>{d.pages}</td>
                    <td>{d.colors}{d.is_double_sided ? 'C/両面' : 'C/片面'}</td>
                    <td>{d.paper_type}({d.paper_thickness}K)</td>
                    <td>{d.machine}</td>
                    <td>{d.needed_paper ?? '-'}</td>
                    <td>{d.total_estimated ? `${Math.round(d.total_estimated)}円` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

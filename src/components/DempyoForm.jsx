// src/components/DempyoForm.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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

/** 表示専用テキスト（今回“赤字はすべて編集可”なので主に黒文字用途のみ） */
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

/** 通貨整形（初期値生成用） */
const yen = (n) => (typeof n === 'number' ? n.toLocaleString('ja-JP') + '円' : '');

/** 文字列から“読み取れる数字だけ”抜き出して数値化（例: "12,300円 調整" -> 12300） */
const parseAmountLike = (s) => {
  if (s === null || s === undefined) return null;
  const cleaned = String(s).replace(/[^\d\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '--') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

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

  /* ───────── 2) オーバーレイ入力状態（すべて“文字列”） ───────── */
  const [manual, setManual] = useState({
    // 基本仕様（※すべてテキスト）
    dueDate: '', size: '', quantity: '', pages: '', colorCount: '', detailType: '',
    isSingle: false, isDouble: true, isNew: true, isReprint: false,

    // 用紙欄（指定無し/表紙＋本文, 表紙, 本文）
    paper_general_type: '', paper_general_thickness: '', paper_general_needed: '',
    paper_cover_type:   '', paper_cover_thickness:   '', paper_cover_needed:   '',
    paper_body_type:    '', paper_body_thickness:    '', paper_body_needed:    '',

    // 進行関連
    schedule: Array.from({ length: 10 }, () => ({ date: '', text: '' })),
    designMemo: '', outsideMemo: '', bookMemo: '',
    // 追加入力欄（複数行）
    outsideMemo2: '', outsideMemo3: '', outsideMemo4: '',
    bookMemo2: '', bookMemo3: '',

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

      // ★デザイン費（見積明細の total_design_cost を合算）
      design_total:  sum(detailList, 'total_design_cost'),
    };
  }, [detailList]);

  // 右カラムの“自動計算”値
  const rightCol = useMemo(() => {
    return {
      // 用紙は3段：一般/表紙/本文
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

      // ★追加：デザイン・製作費（1段）
      design: sums.design_total,
    };
  }, [sums]);

  /** ───────── 5.5) 金額の手動上書き（“文字列”で保持） ───────── */
  const AMOUNT_KEYS = [
    // ★追加：design を最初に置いても問題ありません（順序は任意）
    'design',
    'paper_general', 'paper_cover', 'paper_body',
    'plate1', 'plate2',
    'print1', 'print2',
    'bind1', 'bind2',
    'ship1', 'ship2',
  ];
  const initAmountOverride = () =>
    AMOUNT_KEYS.reduce((acc, k) => ((acc[k] = null), acc), {});
  const [amountOverrideStr, setAmountOverrideStr] = useState(initAmountOverride());

  // 品名切替で上書きはリセット（null に戻す）
  useEffect(() => {
    setAmountOverrideStr(initAmountOverride());
  }, [selectedEstimate?.id]);

  // rightCol が更新されたら、未上書き(null)の欄だけ“自動値(円表記)”を流し込む
  useEffect(() => {
    setAmountOverrideStr((prev) => {
      const next = { ...prev };
      AMOUNT_KEYS.forEach((k) => {
        if (prev[k] === null) {
          next[k] = yen(Math.round(rightCol[k] || 0));
        }
      });
      return next;
    });
  }, [rightCol]);

  // 計算用の“数値化した最終額”
  const usedAmt = useMemo(() => {
    const u = {};
    AMOUNT_KEYS.forEach((k) => {
      const ov = amountOverrideStr[k];
      if (ov === null) {
        u[k] = Math.round(rightCol[k] || 0);
      } else {
        u[k] = parseAmountLike(ov);
      }
    });
    return u;
  }, [amountOverrideStr, rightCol]);

  /** ───────── 5.6) 下段4枠（単価・請求額・消費税・合計金額）
   *  「右カラム（用紙〜発送＋デザイン）」の合計で計算し、最終的に文字で上書き可能。
   *  ───────────────────────────────────────── */
  // 右カラム合計（用紙3 + 製版2 + 印刷2 + 製本2 + 発送2 + ★デザイン1）
  const rightSum = useMemo(() => {
    return (
      usedAmt.design + // ★追加
      usedAmt.paper_general + usedAmt.paper_cover + usedAmt.paper_body +
      usedAmt.plate1 + usedAmt.plate2 +
      usedAmt.print1 + usedAmt.print2 +
      usedAmt.bind1 + usedAmt.bind2 +
      usedAmt.ship1 + usedAmt.ship2
    );
  }, [usedAmt]);

  // 数量（テキスト→数値）
  const qtyForUnit = useMemo(() => parseAmountLike(manual.quantity), [manual.quantity]);

  // 自動計算値（合計金額=請求額=右カラム合計／単価=合計÷数量／消費税=請求額の10%）
  const autoGrand = useMemo(() => {
    const total = rightSum;
    const unit  = qtyForUnit > 0 ? Math.round(total / qtyForUnit) : 0;
    const bill  = total;
    const tax   = Math.floor(bill * 0.1);
    return { unit, total, bill, tax };
  }, [rightSum, qtyForUnit]);

  // 画面表示用テキスト（ユーザーが自由に上書きできる）
  const [grandText, setGrandText] = useState({
    unit: '',     // 単価（左上）
    total: '',    // 請求額（右上）
    tax: '',      // 消費税（右下）
    total2: '',   // 合計金額（左下）= 請求額と同じ
  });
  // 各枠を手動編集したかどうか（手動済みは自動更新しない）
  const [grandDirty, setGrandDirty] = useState({
    unit: false, total: false, tax: false, total2: false,
  });

  // 品名切替時はリセット（自動値を流し直す）
  useEffect(() => {
    setGrandText({ unit: '', total: '', tax: '', total2: '' });
    setGrandDirty({ unit: false, total: false, tax: false, total2: false });
  }, [selectedEstimate?.id]);

  // 自動値を注入（“未手動”の欄だけ上書き）。右カラムや数量が変わる度に走る。
  useEffect(() => {
    setGrandText(prev => {
      const next = { ...prev };

      if (!grandDirty.total)  next.total  = yen(autoGrand.total);      // 請求額
      if (!grandDirty.unit)   next.unit   = yen(autoGrand.unit);       // 単価

      // 税は「請求額の10%」。total が未手動なら最新 auto から、手動ならその値から算出。
      const baseForTax = grandDirty.total ? parseAmountLike(prev.total) : autoGrand.total;
      if (!grandDirty.tax)    next.tax    = yen(Math.floor(baseForTax * 0.1));

      // 合計金額は請求額と同じ扱い
      if (!grandDirty.total2) next.total2 = grandDirty.total ? prev.total : yen(autoGrand.total);

      return next;
    });
  }, [autoGrand, grandDirty]);

  // 4枠の onChange（編集で dirty 化）。請求額を編集したら、税(未手動なら)と合計金額(未手動なら)を連動更新。
  const onGrandChange = (key) => (e) => {
    const v = e.target.value;
    setGrandText(t => {
      const next = { ...t, [key]: v };
      if (key === 'total') {
        if (!grandDirty.tax) {
          const base = parseAmountLike(v);
          next.tax = yen(Math.floor(base * 0.1));
        }
        if (!grandDirty.total2) next.total2 = v; // 合計金額=請求額（未手動時のみ追随）
      }
      return next;
    });
    setGrandDirty(d => ({ ...d, [key]: true }));
  };

  /* ───────── 6) 製版/印刷の表示用文字列（赤字→編集可に） ───────── */
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

  // 行テキストの上書き（文字列）
  const [linesOverride, setLinesOverride] = useState({
    plateVP: null, plateGTO: null,
    printVP: null, printGTO: null, printOD: null,
  });

  // 品名切替でリセット
  useEffect(() => {
    setLinesOverride({
      plateVP: null, plateGTO: null,
      printVP: null, printGTO: null, printOD: null,
    });
  }, [selectedEstimate?.id]);

  // 自動値の注入（未上書きのみ）
  useEffect(() => {
    setLinesOverride(prev => ({
      plateVP: prev.plateVP ?? `VP・・・・・・${plateStrings.vp.join('、')}`,
      plateGTO:prev.plateGTO?? `GTO・・・・・${plateStrings.gto.join('、')}`,
      printVP: prev.printVP ?? `VP・・・・・・${printStrings.vp.join('、')}`,
      printGTO:prev.printGTO?? `GTO・・・・・${printStrings.gto.join('、')}`,
      printOD: prev.printOD ?? `オンデマンド・・${printStrings.od.join('、')}`,
    }));
  }, [plateStrings, printStrings]);

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

    // ★PDF保存 共通関数 ----------------------------------------
const sanitize = (s) => (s || '無題').replace(/[\\/:*?"<>|]/g, '');

const exportNodeToPdf = useCallback(async (node, fileBase) => {
  if (!node) return;

  // フォーカスリング・キャレットを消してからキャプチャ
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }

  const canvas = await html2canvas(node, {
    scale: 2,                   // 解像度。重い場合は 1.5〜1 へ
    backgroundColor: '#ffffff',
    useCORS: true,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
    scrollY: -window.scrollY,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4'); // A4縦
  const pdfW = pdf.internal.pageSize.getWidth();   // 210mm
  const pdfH = pdf.internal.pageSize.getHeight();  // 297mm

  // 画像を用紙幅に合わせる
  const imgW = pdfW;
  const imgH = (canvas.height * imgW) / canvas.width;

  // 1枚目貼付
  let position = 0;
  let heightLeft = imgH;

  pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
  heightLeft -= pdfH;

  // 残りを同じ画像をYずらしで複数ページに分割
  while (heightLeft > 0) {
    position -= pdfH;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgW, imgH);
    heightLeft -= pdfH;
  }

  pdf.save(`${fileBase}_${new Date().toISOString().slice(0,10)}.pdf`);
}, []);

// ★各セットのPDF保存ハンドラ -------------------------------
const downloadSetOnePdf = useCallback(() => {
  const base = `${estimateId || ''}_${sanitize(productName)}_set1`;
  exportNodeToPdf(setOneRef.current, base);
}, [estimateId, productName, exportNodeToPdf]);

const downloadSetTwoPdf = useCallback(() => {
  const base = `${estimateId || ''}_${sanitize(productName)}_set2`;
  exportNodeToPdf(setTwoRef.current, base);
}, [estimateId, productName, exportNodeToPdf]);


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
            {/* ヘッダ（編集可） */}
            <OVInput x={15}  y={31} w={180} name="estimateId_head"  value={estimateId}  onChange={() => {}} fontSize={9} />
            <OVInput x={340} y={15} w={260} name="clientName_head"   value={clientName} onChange={() => {}} fontSize={17} />
            <OVInput x={340} y={65} w={260} name="productName_head"  value={productName} onChange={() => {}} fontSize={16} />

            {/* 左：基本仕様（編集可） */}
            <OVInput x={80}  y={118} w={100} name="dueDate"    value={manual.dueDate}    onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={169} w={160} name="size"       value={manual.size}       onChange={onManualChange} fontSize={24}/>
            <OVInput x={100} y={220} w={160} name="quantity"   value={manual.quantity}   onChange={onManualChange} fontSize={20}/>
            <OVInput x={120} y={272} w={160} name="pages"      value={manual.pages}      onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={328} w={160} name="colorCount" value={manual.colorCount} onChange={onManualChange} fontSize={24}/>

            {/* 片面/両面・新規/増刷 */}
            <OVCheck x={79} y={372}   value={manual.isSingle}  onToggle={() => toggle('isSingle')}  />
            <OVCheck x={79} y={395}   value={manual.isDouble}  onToggle={() => toggle('isDouble')}  />
            <OVCheck x={79} y={426.5} value={manual.isNew}     onToggle={() => toggle('isNew')}     />
            <OVCheck x={79} y={449.5} value={manual.isReprint} onToggle={() => toggle('isReprint')} />

            {/* 用紙欄（指定無し/表紙＋本文, 表紙, 本文） */}
            <OVInput x={265} y={134} w={100} name="paper_general_type"      value={manual.paper_general_type}      onChange={onManualChange} />
            <OVInput x={395} y={134} w={60} name="paper_general_thickness" value={manual.paper_general_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={460} y={134} w={80} name="paper_general_needed"    value={manual.paper_general_needed}    onChange={onManualChange} align="right"/>

            <OVInput x={265} y={197} w={100} name="paper_cover_type"      value={manual.paper_cover_type}      onChange={onManualChange} />
            <OVInput x={395} y={197} w={60} name="paper_cover_thickness" value={manual.paper_cover_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={460} y={197} w={80} name="paper_cover_needed"    value={manual.paper_cover_needed}    onChange={onManualChange} align="right"/>

            <OVInput x={265} y={265} w={100} name="paper_body_type"      value={manual.paper_body_type}      onChange={onManualChange} />
            <OVInput x={395} y={265} w={60} name="paper_body_thickness" value={manual.paper_body_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={460} y={265} w={80} name="paper_body_needed"    value={manual.paper_body_needed}    onChange={onManualChange} align="right"/>

            {/* 制作メモなど */}
            <OVCheck x={79}  y={519} value={manual.designInhouse}  onToggle={() => toggle('designInhouse')}  />
            <OVCheck x={79}  y={542} value={manual.designOutsource}onToggle={() => toggle('designOutsource')} />
            <OVInput x={225} y={534} w={405} h={30} name="designMemo" value={manual.designMemo} onChange={onManualChange} fontSize={15} />

            {/* 印刷チェック */}
            <OVCheck x={79}  y={621} value={manual.printInhouse} onToggle={() => toggle('printInhouse')} />
            <OVCheck x={79}  y={643.8} value={manual.printOutsource} onToggle={() => toggle('printOutsource')} />
            <OVCheck x={312} y={632} value={manual.mVP}  onToggle={() => toggle('mVP')}  />
            <OVCheck x={359} y={632} value={manual.mGTO} onToggle={() => toggle('mGTO')} />
            <OVCheck x={417} y={632} value={manual.mOD}  onToggle={() => toggle('mOD')}  />

            {/* 外注メモ */}
            <OVInput x={30} y={712} w={170} h={48} name="outsideMemo"  value={manual.outsideMemo}  onChange={onManualChange} />
            <OVInput x={30} y={735} w={170} h={48} name="outsideMemo2" value={manual.outsideMemo2} onChange={onManualChange} />
            <OVInput x={30} y={760} w={170} h={48} name="outsideMemo3" value={manual.outsideMemo3} onChange={onManualChange} />

            {/* 版・印刷の行（編集可） */}
            <OVInput x={250} y={725} w={420} name="plateVP_line"  value={linesOverride.plateVP ?? ''}  onChange={(e)=>setLinesOverride(p=>({...p,plateVP:e.target.value}))} />
            <OVInput x={250} y={744} w={420} name="plateGTO_line" value={linesOverride.plateGTO ?? ''} onChange={(e)=>setLinesOverride(p=>({...p,plateGTO:e.target.value}))} />
            <OVInput x={250} y={835} w={420} name="printVP_line"  value={linesOverride.printVP ?? ''}  onChange={(e)=>setLinesOverride(p=>({...p,printVP:e.target.value}))} />
            <OVInput x={250} y={860} w={420} name="printGTO_line" value={linesOverride.printGTO ?? ''} onChange={(e)=>setLinesOverride(p=>({...p,printGTO:e.target.value}))} />
            <OVInput x={250} y={885} w={420} name="printOD_line"  value={linesOverride.printOD ?? ''}  onChange={(e)=>setLinesOverride(p=>({...p,printOD:e.target.value}))} />

            {/* 製本 */}
            <OVCheck x={79}  y={983} value={manual.bindInhouse}  onToggle={() => toggle('bindInhouse')}  />
            <OVCheck x={79}  y={1006} value={manual.bindOutsource}onToggle={() => toggle('bindOutsource')} />
            <OVInput x={245} y={1010} w={360} h={30} name="bookMemo"  value={manual.bookMemo}  onChange={onManualChange} />
            <OVInput x={245} y={1035} w={360} h={30} name="bookMemo2" value={manual.bookMemo2} onChange={onManualChange} />
            <OVInput x={245} y={1065} w={360} h={30} name="bookMemo3" value={manual.bookMemo3} onChange={onManualChange} />
            <OVInput x={30}  y={1056} w={170} h={48} name="outsideMemo4" value={manual.outsideMemo4} onChange={onManualChange} />

            {/* スケジュール（右端） */}
            {renderScheduleFor(150, 55, 630, 672)}
          </OverlayImage>

          {/* 工程表 */}
          <OverlayImage src={IMG_KOUTEI} width={BASE_W} height={BASE_H_FORM}>
            <OVInput x={15}  y={31} w={180} name="estimateId_k"  value={estimateId}  onChange={() => {}} fontSize={9} />
            <OVInput x={340} y={15} w={260} name="clientName_k"  value={clientName} onChange={() => {}} fontSize={17} />
            <OVInput x={340} y={65} w={260} name="productName_k" value={productName} onChange={() => {}} fontSize={16} />

            <OVInput x={80}  y={118} w={140} name="dueDate_k"    value={manual.dueDate}    onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={169} w={160} name="size_k"       value={manual.size}       onChange={onManualChange} fontSize={24}/>
            <OVInput x={100} y={220} w={160} name="quantity_k"   value={manual.quantity}   onChange={onManualChange} fontSize={20}/>
            <OVInput x={120} y={272} w={160} name="pages_k"      value={manual.pages}      onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={328} w={160} name="colorCount_k" value={manual.colorCount} onChange={onManualChange} fontSize={24}/>

            <OVCheck x={79} y={372}   value={manual.isSingle}  onToggle={() => toggle('isSingle')}  />
            <OVCheck x={79} y={395}   value={manual.isDouble}  onToggle={() => toggle('isDouble')}  />
            <OVCheck x={79} y={426.5} value={manual.isNew}     onToggle={() => toggle('isNew')}     />
            <OVCheck x={79} y={449.5} value={manual.isReprint} onToggle={() => toggle('isReprint')} />

            <OVInput x={265} y={134} w={100} name="paper_general_type_k"      value={manual.paper_general_type}      onChange={onManualChange} />
            <OVInput x={395} y={134} w={60}  name="paper_general_thickness_k" value={manual.paper_general_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={460} y={134} w={80}  name="paper_general_needed_k"    value={manual.paper_general_needed}    onChange={onManualChange} align="right"/>
            <OVInput x={265} y={197} w={100} name="paper_cover_type_k"        value={manual.paper_cover_type}        onChange={onManualChange} />
            <OVInput x={395} y={197} w={60}  name="paper_cover_thickness_k"   value={manual.paper_cover_thickness}   onChange={onManualChange} align="center"/>
            <OVInput x={460} y={197} w={80}  name="paper_cover_needed_k"      value={manual.paper_cover_needed}      onChange={onManualChange} align="right"/>
            <OVInput x={265} y={265} w={100} name="paper_body_type_k"         value={manual.paper_body_type}         onChange={onManualChange} />
            <OVInput x={395} y={265} w={60}  name="paper_body_thickness_k"    value={manual.paper_body_thickness}    onChange={onManualChange} align="center"/>
            <OVInput x={460} y={265} w={80}  name="paper_body_needed_k"       value={manual.paper_body_needed}       onChange={onManualChange} align="right"/>

            <OVCheck x={79}  y={519} value={manual.designInhouse}  onToggle={() => toggle('designInhouse')}  />
            <OVCheck x={79}  y={542} value={manual.designOutsource}onToggle={() => toggle('designOutsource')} />
            <OVInput x={225} y={534} w={405} h={30} name="designMemo_k" value={manual.designMemo} onChange={onManualChange} />

            <OVCheck x={79}  y={621}   value={manual.printInhouse}    onToggle={() => toggle('printInhouse')} />
            <OVCheck x={79}  y={643.8} value={manual.printOutsource}  onToggle={() => toggle('printOutsource')} />
            <OVCheck x={312} y={632}   value={manual.mVP}  onToggle={() => toggle('mVP')}  />
            <OVCheck x={359} y={632}   value={manual.mGTO} onToggle={() => toggle('mGTO')} />
            <OVCheck x={417} y={632}   value={manual.mOD}  onToggle={() => toggle('mOD')}  />

            <OVInput x={250} y={725} w={420} name="plateVP_line_k"  value={linesOverride.plateVP ?? ''}  onChange={(e)=>setLinesOverride(p=>({...p,plateVP:e.target.value}))} />
            <OVInput x={250} y={744} w={420} name="plateGTO_line_k" value={linesOverride.plateGTO ?? ''} onChange={(e)=>setLinesOverride(p=>({...p,plateGTO:e.target.value}))} />
            <OVInput x={250} y={835} w={420} name="printVP_line_k"  value={linesOverride.printVP ?? ''}  onChange={(e)=>setLinesOverride(p=>({...p,printVP:e.target.value}))} />
            <OVInput x={250} y={860} w={420} name="printGTO_line_k" value={linesOverride.printGTO ?? ''} onChange={(e)=>setLinesOverride(p=>({...p,printGTO:e.target.value}))} />
            <OVInput x={250} y={885} w={420} name="printOD_line_k"  value={linesOverride.printOD ?? ''}  onChange={(e)=>setLinesOverride(p=>({...p,printOD:e.target.value}))} />

            <OVCheck x={79}  y={983} value={manual.bindInhouse}   onToggle={() => toggle('bindInhouse')}  />
            <OVCheck x={79}  y={1006} value={manual.bindOutsource} onToggle={() => toggle('bindOutsource')} />
            <OVInput x={245} y={1010} w={360} h={30} name="bookMemo"  value={manual.bookMemo}  onChange={onManualChange} />
            <OVInput x={245} y={1035} w={360} h={30} name="bookMemo2" value={manual.bookMemo2} onChange={onManualChange} />
            <OVInput x={245} y={1065} w={360} h={30} name="bookMemo3" value={manual.bookMemo3} onChange={onManualChange} />
            <OVInput x={30}  y={1056} w={170} h={48} name="outsideMemo4" value={manual.outsideMemo4} onChange={onManualChange} />

            {renderScheduleFor(153, 105, 635, 680)}
          </OverlayImage>
        </div>

        {/* ================= 売上伝票 + 得意先元帳 ================= */}
        <div ref={setTwoRef}>
          {/* 売上伝票 */}
          <OverlayImage src={IMG_URIAGE} width={BASE_W} height={BASE_H_SLIP} style={{ marginBottom: 16 }}>
            {/* ヘッダ（編集可） */}
            <OVInput x={12}  y={31} w={185} name="estimateId_u" value={estimateId}  onChange={() => {}} fontSize={10} />
            <OVInput x={340} y={15} w={260} name="clientName_u"  value={clientName} onChange={() => {}} fontSize={17} />
            <OVInput x={340} y={65} w={260} name="productName_u" value={productName} onChange={() => {}} fontSize={16} />

            {/* ●左側基本（編集可） */}
            <OVInput x={90}  y={115} w={140} name="dueDate_u"    value={manual.dueDate}    onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={169} w={160} name="size_u"       value={manual.size}       onChange={onManualChange} fontSize={24}/>
            <OVInput x={100} y={220} w={160} name="quantity_u"   value={manual.quantity}   onChange={onManualChange} fontSize={20}/>
            <OVInput x={120} y={272} w={160} name="pages_u"      value={manual.pages}      onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={328} w={160} name="colorCount_u" value={manual.colorCount} onChange={onManualChange} fontSize={24}/>
            <OVCheck x={79} y={371}   value={manual.isSingle}  onToggle={() => toggle('isSingle')}  />
            <OVCheck x={79} y={394}   value={manual.isDouble}  onToggle={() => toggle('isDouble')}  />
            <OVCheck x={79} y={425.5} value={manual.isNew}     onToggle={() => toggle('isNew')}     />
            <OVCheck x={79} y={448.5} value={manual.isReprint} onToggle={() => toggle('isReprint')} />

            {/* ●中央：用紙（売上伝票にも反映） */}
            <OVInput x={265} y={134} w={100} name="paper_general_type_u"      value={manual.paper_general_type}      onChange={onManualChange} />
            <OVInput x={395} y={134} w={60}  name="paper_general_thickness_u" value={manual.paper_general_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={460} y={134} w={80}  name="paper_general_needed_u"    value={manual.paper_general_needed}    onChange={onManualChange} align="right"/>

            <OVInput x={265} y={197} w={100} name="paper_cover_type_u"      value={manual.paper_cover_type}      onChange={onManualChange} />
            <OVInput x={395} y={197} w={60}  name="paper_cover_thickness_u" value={manual.paper_cover_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={460} y={197} w={80}  name="paper_cover_needed_u"    value={manual.paper_cover_needed}    onChange={onManualChange} align="right"/>

            <OVInput x={265} y={265} w={100} name="paper_body_type_u"      value={manual.paper_body_type}      onChange={onManualChange} />
            <OVInput x={395} y={265} w={60}  name="paper_body_thickness_u" value={manual.paper_body_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={460} y={265} w={80}  name="paper_body_needed_u"    value={manual.paper_body_needed}    onChange={onManualChange} align="right"/>

            {/* 進行・印刷チェック */}
            <OVInput x={225} y={534} w={390} h={30} name="designMemo_u" value={manual.designMemo} onChange={onManualChange} />
            <OVCheck x={79}  y={619}   value={manual.printInhouse}    onToggle={() => toggle('printInhouse')} />
            <OVCheck x={79}  y={641.8} value={manual.printOutsource}  onToggle={() => toggle('printOutsource')} />
            <OVCheck x={312} y={631}   value={manual.mVP}  onToggle={() => toggle('mVP')}  />
            <OVCheck x={359} y={631}   value={manual.mGTO} onToggle={() => toggle('mGTO')} />
            <OVCheck x={417} y={631}   value={manual.mOD}  onToggle={() => toggle('mOD')}  />
            <OVCheck x={79}  y={518}   value={manual.designInhouse}   onToggle={() => toggle('designInhouse')}  />
            <OVCheck x={79}  y={541}   value={manual.designOutsource} onToggle={() => toggle('designOutsource')} />

            {/* 外注先（3行） */}
            <OVInput x={30} y={710} w={170} h={48} name="outsideMemo_k"  value={manual.outsideMemo}  onChange={onManualChange} />
            <OVInput x={30} y={733} w={170} h={48} name="outsideMemo2_k" value={manual.outsideMemo2} onChange={onManualChange} />
            <OVInput x={30} y={757} w={170} h={48} name="outsideMemo3_k" value={manual.outsideMemo3} onChange={onManualChange} />

            {/* 行テキスト（編集可） */}
            <OVInput x={250} y={720} w={420} name="plateVP_line_u"  value={linesOverride.plateVP ?? ''}  onChange={(e)=>setLinesOverride(p=>({...p,plateVP:e.target.value}))} />
            <OVInput x={250} y={744} w={420} name="plateGTO_line_u" value={linesOverride.plateGTO ?? ''} onChange={(e)=>setLinesOverride(p=>({...p,plateGTO:e.target.value}))} />
            <OVInput x={250} y={835} w={420} name="printVP_line_u"  value={linesOverride.printVP ?? ''}  onChange={(e)=>setLinesOverride(p=>({...p,printVP:e.target.value}))} />
            <OVInput x={250} y={860} w={420} name="printGTO_line_u" value={linesOverride.printGTO ?? ''} onChange={(e)=>setLinesOverride(p=>({...p,printGTO:e.target.value}))} />
            <OVInput x={250} y={885} w={420} name="printOD_line_u"  value={linesOverride.printOD ?? ''}  onChange={(e)=>setLinesOverride(p=>({...p,printOD:e.target.value}))} />

            <OVCheck x={79}  y={981}   value={manual.bindInhouse}   onToggle={() => toggle('bindInhouse')}  />
            <OVCheck x={79}  y={1003.5} value={manual.bindOutsource} onToggle={() => toggle('bindOutsource')} />
            <OVInput x={245} y={1009} w={360} h={30} name="bookMemo"  value={manual.bookMemo}  onChange={onManualChange} />
            <OVInput x={245} y={1033} w={360} h={30} name="bookMemo2" value={manual.bookMemo2} onChange={onManualChange} />
            <OVInput x={245} y={1056} w={360} h={30} name="bookMemo3" value={manual.bookMemo3} onChange={onManualChange} />
            <OVInput x={30}  y={1053.5} w={170} h={48} name="outsideMemo4" value={manual.outsideMemo4} onChange={onManualChange} />

            {/* ●●● 右カラム：金額（“文字列”で直接編集可） */}
            {/* ★追加：デザイン・製作費（1段） ※座標はテンプレの該当枠に合わせて微調整してください */}
            <OVInput x={640} y={530} w={110}
              name="amt_design" value={amountOverrideStr.design ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,design:e.target.value}))}
              align="right"
            />

            {/* 用紙：3段 */}
            <OVInput x={640} y={180} w={110}
              name="amt_paper_general" value={amountOverrideStr.paper_general ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,paper_general:e.target.value}))}
              align="right"
            />
            <OVInput x={640} y={300} w={110}
              name="amt_paper_cover" value={amountOverrideStr.paper_cover ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,paper_cover:e.target.value}))}
              align="right"
            />
            <OVInput x={640} y={425} w={110}
              name="amt_paper_body" value={amountOverrideStr.paper_body ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,paper_body:e.target.value}))}
              align="right"
            />

            {/* 製版：2段 */}
            <OVInput x={640} y={690} w={110}
              name="amt_plate1" value={amountOverrideStr.plate1 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,plate1:e.target.value}))}
              align="right"
            />
            <OVInput x={640} y={720} w={110}
              name="amt_plate2" value={amountOverrideStr.plate2 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,plate2:e.target.value}))}
              align="right"
            />

            {/* 印刷：2段 */}
            <OVInput x={640} y={850} w={110}
              name="amt_print1" value={amountOverrideStr.print1 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,print1:e.target.value}))}
              align="right"
            />
            <OVInput x={640} y={885} w={110}
              name="amt_print2" value={amountOverrideStr.print2 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,print2:e.target.value}))}
              align="right"
            />

            {/* 製本：2段 */}
            <OVInput x={640} y={973} w={110}
              name="amt_bind1" value={amountOverrideStr.bind1 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,bind1:e.target.value}))}
              align="right"
            />
            <OVInput x={640} y={995} w={110}
              name="amt_bind2" value={amountOverrideStr.bind2 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,bind2:e.target.value}))}
              align="right"
            />

            {/* 発送：2段 */}
            <OVInput x={640} y={1058} w={110}
              name="amt_ship1" value={amountOverrideStr.ship1 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,ship1:e.target.value}))}
              align="right"
            />
            <OVInput x={640} y={1079} w={110}
              name="amt_ship2" value={amountOverrideStr.ship2 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,ship2:e.target.value}))}
              align="right"
            />

            {/* 下部：単価・請求額・消費税・合計金額（自動計算＋上書き可） */}
            <OVInput x={150} y={1117} w={200}
              name="grand_unit" value={grandText.unit}
              onChange={onGrandChange('unit')}
              align="center"
            />
            <OVInput x={520} y={1117} w={200}
              name="grand_total" value={grandText.total}
              onChange={onGrandChange('total')}
              align="center"
            />
            <OVInput x={520} y={1151} w={200}
              name="grand_tax" value={grandText.tax}
              onChange={onGrandChange('tax')}
              align="center"
            />
            <OVInput x={170} y={1151} w={160}
              name="grand_total2" value={grandText.total2}
              onChange={onGrandChange('total2')}
              align="center"
            />
          </OverlayImage>

          {/* 得意先元帳（売上伝票と同じ state を共有） */}
          <OverlayImage src={IMG_TOKUSAKI} width={BASE_W} height={BASE_H_SLIP}>
            {/* ヘッダ（編集可） */}
            <OVInput x={12}  y={31} w={185} name="estimateId_t" value={estimateId}  onChange={() => {}} fontSize={10} />
            <OVInput x={340} y={15} w={260} name="clientName_t"  value={clientName} onChange={() => {}} fontSize={17} />
            <OVInput x={340} y={65} w={260} name="productName_t" value={productName} onChange={() => {}} fontSize={16} />

            {/* 左側基本（控え） */}
            <OVInput x={90}  y={115} w={140} name="dueDate_t"    value={manual.dueDate}    onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={169} w={160} name="size_t"       value={manual.size}       onChange={onManualChange} fontSize={24}/>
            <OVInput x={100} y={220} w={160} name="quantity_t"   value={manual.quantity}   onChange={onManualChange} fontSize={20}/>
            <OVInput x={120} y={272} w={160} name="pages_t"      value={manual.pages}      onChange={onManualChange} fontSize={20}/>
            <OVInput x={100} y={328} w={160} name="colorCount_t" value={manual.colorCount} onChange={onManualChange} fontSize={24}/>
            <OVCheck x={79} y={371}   value={manual.isSingle}  onToggle={() => toggle('isSingle')}  />
            <OVCheck x={79} y={394}   value={manual.isDouble}  onToggle={() => toggle('isDouble')}  />
            <OVCheck x={79} y={425.5} value={manual.isNew}     onToggle={() => toggle('isNew')}     />
            <OVCheck x={79} y={448.5} value={manual.isReprint} onToggle={() => toggle('isReprint')} />

            {/* 中央：用紙（売上伝票にも反映） */}
            <OVInput x={265} y={134} w={100} name="paper_general_type_u"      value={manual.paper_general_type}      onChange={onManualChange} />
            <OVInput x={395} y={134} w={60}  name="paper_general_thickness_u" value={manual.paper_general_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={460} y={134} w={80}  name="paper_general_needed_u"    value={manual.paper_general_needed}    onChange={onManualChange} align="right"/>

            <OVInput x={265} y={197} w={100} name="paper_cover_type_u"      value={manual.paper_cover_type}      onChange={onManualChange} />
            <OVInput x={395} y={197} w={60}  name="paper_cover_thickness_u" value={manual.paper_cover_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={460} y={197} w={80}  name="paper_cover_needed_u"    value={manual.paper_cover_needed}    onChange={onManualChange} align="right"/>

            <OVInput x={265} y={265} w={100} name="paper_body_type_u"      value={manual.paper_body_type}      onChange={onManualChange} />
            <OVInput x={395} y={265} w={60}  name="paper_body_thickness_u" value={manual.paper_body_thickness} onChange={onManualChange} align="center"/>
            <OVInput x={460} y={265} w={80}  name="paper_body_needed_u"    value={manual.paper_body_needed}    onChange={onManualChange} align="right"/>

            {/* 進行・印刷チェック */}
            <OVInput x={225} y={534} w={390} h={30} name="designMemo_u" value={manual.designMemo} onChange={onManualChange} />
            <OVCheck x={79}  y={619}   value={manual.printInhouse}    onToggle={() => toggle('printInhouse')} />
            <OVCheck x={79}  y={641.8} value={manual.printOutsource}  onToggle={() => toggle('printOutsource')} />
            <OVCheck x={312} y={631}   value={manual.mVP}  onToggle={() => toggle('mVP')}  />
            <OVCheck x={359} y={631}   value={manual.mGTO} onToggle={() => toggle('mGTO')} />
            <OVCheck x={417} y={631}   value={manual.mOD}  onToggle={() => toggle('mOD')}  />
            <OVCheck x={79}  y={518}   value={manual.designInhouse}   onToggle={() => toggle('designInhouse')}  />
            <OVCheck x={79}  y={541}   value={manual.designOutsource} onToggle={() => toggle('designOutsource')} />

            {/* 外注先（3行） */}
            <OVInput x={30} y={710} w={170} h={48} name="outsideMemo_k"  value={manual.outsideMemo}  onChange={onManualChange} />
            <OVInput x={30} y={733} w={170} h={48} name="outsideMemo2_k" value={manual.outsideMemo2} onChange={onManualChange} />
            <OVInput x={30} y={757} w={170} h={48} name="outsideMemo3_k" value={manual.outsideMemo3} onChange={onManualChange} />

            {/* 行テキスト（編集可） */}
            <OVInput x={250} y={720} w={420} name="plateVP_line_u"  value={linesOverride.plateVP ?? ''}  onChange={(e)=>setLinesOverride(p=>({...p,plateVP:e.target.value}))} />
            <OVInput x={250} y={744} w={420} name="plateGTO_line_u" value={linesOverride.plateGTO ?? ''} onChange={(e)=>setLinesOverride(p=>({...p,plateGTO:e.target.value}))} />
            <OVInput x={250} y={835} w={420} name="printVP_line_u"  value={linesOverride.printVP ?? ''}  onChange={(e)=>setLinesOverride(p=>({...p,printVP:e.target.value}))} />
            <OVInput x={250} y={860} w={420} name="printGTO_line_u" value={linesOverride.printGTO ?? ''} onChange={(e)=>setLinesOverride(p=>({...p,printGTO:e.target.value}))} />
            <OVInput x={250} y={885} w={420} name="printOD_line_u"  value={linesOverride.printOD ?? ''}  onChange={(e)=>setLinesOverride(p=>({...p,printOD:e.target.value}))} />

            <OVCheck x={79}  y={981}   value={manual.bindInhouse}   onToggle={() => toggle('bindInhouse')}  />
            <OVCheck x={79}  y={1003.5} value={manual.bindOutsource} onToggle={() => toggle('bindOutsource')} />
            <OVInput x={245} y={1009} w={360} h={30} name="bookMemo"  value={manual.bookMemo}  onChange={onManualChange} />
            <OVInput x={245} y={1033} w={360} h={30} name="bookMemo2" value={manual.bookMemo2} onChange={onManualChange} />
            <OVInput x={245} y={1056} w={360} h={30} name="bookMemo3" value={manual.bookMemo3} onChange={onManualChange} />
            <OVInput x={30}  y={1053.5} w={170} h={48} name="outsideMemo4" value={manual.outsideMemo4} onChange={onManualChange} />


            {/* ★追加：デザイン・製作費（1段） */}
            <OVInput x={640} y={530} w={110}
              name="amt_design_t" value={amountOverrideStr.design ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,design:e.target.value}))}
              align="right"
            />

            {/* 右カラム金額（同じ state を共有） */}
            <OVInput x={640} y={170} w={110}
              name="amt_paper_general_t" value={amountOverrideStr.paper_general ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,paper_general:e.target.value}))}
              align="right"
            />
            <OVInput x={640} y={300} w={110}
              name="amt_paper_cover_t" value={amountOverrideStr.paper_cover ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,paper_cover:e.target.value}))}
              align="right"
            />
            <OVInput x={640} y={419} w={110}
              name="amt_paper_body_t" value={amountOverrideStr.paper_body ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,paper_body:e.target.value}))}
              align="right"
            />

            <OVInput x={640} y={665} w={110}
              name="amt_plate1_t" value={amountOverrideStr.plate1 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,plate1:e.target.value}))}
              align="right"
            />
            <OVInput x={640} y={690} w={110}
              name="amt_plate2_t" value={amountOverrideStr.plate2 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,plate2:e.target.value}))}
              align="right"
            />

            <OVInput x={640} y={850} w={110}
              name="amt_print1_t" value={amountOverrideStr.print1 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,print1:e.target.value}))}
              align="right"
            />
            <OVInput x={640} y={875} w={110}
              name="amt_print2_t" value={amountOverrideStr.print2 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,print2:e.target.value}))}
              align="right"
            />

            <OVInput x={640} y={975} w={110}
              name="amt_bind1_t" value={amountOverrideStr.bind1 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,bind1:e.target.value}))}
              align="right"
            />
            <OVInput x={640} y={995} w={110}
              name="amt_bind2_t" value={amountOverrideStr.bind2 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,bind2:e.target.value}))}
              align="right"
            />

            <OVInput x={640} y={1060} w={110}
              name="amt_ship1_t" value={amountOverrideStr.ship1 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,ship1:e.target.value}))}
              align="right"
            />
            <OVInput x={640} y={1080} w={110}
              name="amt_ship2_t" value={amountOverrideStr.ship2 ?? ''}
              onChange={(e)=>setAmountOverrideStr(p=>({...p,ship2:e.target.value}))}
              align="right"
            />

            {/* 下部 合計・請求額など（同じ state を共有・ここからも編集可） */}
            <OVInput
              x={150} y={1117} w={200}
              name="grand_unit_t" value={grandText.unit}
              onChange={onGrandChange('unit')}
              align="center"
            />
            <OVInput
              x={520} y={1117} w={200}
              name="grand_total_t" value={grandText.total}
              onChange={onGrandChange('total')}
              align="center"
            />
            <OVInput
              x={520} y={1151} w={200}
              name="grand_tax_t" value={grandText.tax}
              onChange={onGrandChange('tax')}
              align="center"
            />
            <OVInput
              x={170} y={1151} w={160}
              name="grand_total2_t" value={grandText.total2}
              onChange={onGrandChange('total2')}
              align="center"
            />
          </OverlayImage>
        </div>
      </div>

      {/* 印刷ボタン */}
{/* 操作ボタン */}
<div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
  <button onClick={printSetOne}>手順票＋工程表 PDF 出力</button>
  <button onClick={printSetTwo}>売上伝票＋得意先元帳 PDF 出力</button>
  <button onClick={downloadSetOnePdf}>手順票＋工程表 をPDF保存</button>
  <button onClick={downloadSetTwoPdf}>売上伝票＋得意先元帳 をPDF保存</button>
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

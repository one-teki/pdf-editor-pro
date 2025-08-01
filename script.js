// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
// PDF-lib から必要部分を取り出し
const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;

let pdfBytes,    // Uint8Array of current PDF
    pdfDocLib,   // PDF-lib document
    pdfDocJS,    // PDF.js document
    currentPage = 1;

const canvas  = document.getElementById('pdfCanvas');
const ctx     = canvas.getContext('2d');
const pageInfo = document.getElementById('pageInfo');

// 画面にレンダリング
function renderPage(pageNum) {
  pdfDocJS.getPage(pageNum).then(page => {
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    page.render({ canvasContext: ctx, viewport });
    pageInfo.textContent = `${pageNum} / ${pdfDocJS.numPages}`;
  });
}

// PDF-lib → PDF.js 再読み込み
async function reloadDocument() {
  pdfBytes = await pdfDocLib.save();
  pdfDocJS = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  // ページ数クリップ
  if (currentPage > pdfDocJS.numPages) {
    currentPage = pdfDocJS.numPages;
  }
  renderPage(currentPage);
}

// PDF読み込み（初回）
async function loadPDF(file) {
  const arr = new Uint8Array(await file.arrayBuffer());
  pdfBytes   = arr;
  pdfDocLib  = await PDFDocument.load(arr);
  pdfDocJS   = await pdfjsLib.getDocument({ data: arr }).promise;
  currentPage = 1;
  renderPage(currentPage);
}

// PDFダウンロード
function download(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href      = url;
  a.download  = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ボタン・イベント設定
function setupEventListeners() {
  const fileSelectBtn = document.getElementById('fileSelectBtn');
  const fileInput     = document.getElementById('fileInput');
  const mergeBtn      = document.getElementById('mergeBtn');
  const mergeInput    = document.getElementById('mergeInput');
  const addTextBtn    = document.getElementById('addTextBtn');
  const deletePageBtn = document.getElementById('deletePageBtn');
  const rotateBtn     = document.getElementById('rotateBtn');
  const splitBtn      = document.getElementById('splitBtn');
  const saveBtn       = document.getElementById('saveBtn');

  // ファイル選択ボタン
  fileSelectBtn.addEventListener('click', () => {
    fileInput.value = null;
    fileInput.click();
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files.length) loadPDF(e.target.files[0]);
  });

  // ドラッグ＆ドロップ
  const dz = document.getElementById('dropZone');
  ['dragover','drop'].forEach(evt =>
    dz.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      if (evt === 'drop' && e.dataTransfer.files.length) {
        loadPDF(e.dataTransfer.files[0]);
      }
    })
  );

  // ページ移動
  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderPage(currentPage);
    }
  });
  document.getElementById('nextPage').addEventListener('click', () => {
    if (currentPage < pdfDocJS.numPages) {
      currentPage++;
      renderPage(currentPage);
    }
  });

  // テキスト追加
  addTextBtn.addEventListener('click', async () => {
    const text = prompt('追加するテキストを入力してください');
    if (!text) return;
    const x = parseInt(prompt('X座標をpxで指定 (例: 50)', 50), 10);
    const y = parseInt(prompt('Y座標をpxで指定 (例: 50)', 50), 10);
    const size = parseInt(prompt('フォントサイズを指定 (例: 24)', 24), 10);
    const font = await pdfDocLib.embedFont(StandardFonts.Helvetica);
    const page = pdfDocLib.getPages()[currentPage - 1];
    page.drawText(text, { x, y, size, font, color: rgb(0,0,0) });
    await reloadDocument();
  });

  // ページ削除
  deletePageBtn.addEventListener('click', async () => {
    if (!confirm(`ページ ${currentPage} を削除しますか？`)) return;
    pdfDocLib.removePage(currentPage - 1);
    await reloadDocument();
  });

  // 回転
  rotateBtn.addEventListener('click', async () => {
    const page = pdfDocLib.getPages()[currentPage - 1];
    const old  = page.getRotation().angle;
    page.setRotation(degrees(old + 90));
    await reloadDocument();
  });

  // 結合
  mergeBtn.addEventListener('click', () => {
    mergeInput.value = null;
    mergeInput.click();
  });
  mergeInput.addEventListener('change', async e => {
    const files = Array.from(e.target.files);
    for (const f of files) {
      const otherBytes = await f.arrayBuffer();
      const otherDoc   = await PDFDocument.load(otherBytes);
      const copied     = await pdfDocLib.copyPages(otherDoc, otherDoc.getPageIndices());
      copied.forEach(p => pdfDocLib.addPage(p));
    }
    await reloadDocument();
  });

  // 分割
  splitBtn.addEventListener('click', async () => {
    const idx = currentPage; // 1オリジン
    // 前半
    const doc1 = await PDFDocument.create();
    const [ , , ..._ ] = []; // ダミー
    const pages1 = await doc1.copyPages(pdfDocLib, [...Array(idx).keys()]);
    pages1.forEach(p => doc1.addPage(p));
    const bytes1 = await doc1.save();
    download(bytes1, `part1_${idx}pまで.pdf`);
    // 後半
    const total = pdfDocLib.getPageCount();
    const doc2  = await PDFDocument.create();
    const pages2 = await doc2.copyPages(pdfDocLib, Array.from({length: total-idx}, (_,i)=>i+idx));
    pages2.forEach(p => doc2.addPage(p));
    const bytes2 = await doc2.save();
    download(bytes2, `part2_${idx+1}pから.pdf`);
  });

  // 保存
  saveBtn.addEventListener('click', () => {
    download(pdfBytes, 'edited.pdf');
  });
}

window.addEventListener('DOMContentLoaded', setupEventListeners);

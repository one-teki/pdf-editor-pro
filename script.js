// PDF.js worker 設定
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfDoc = null;
let currentPage = 1;
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const pageInfo = document.getElementById('pageInfo');

function renderPage(pageNum) {
  pdfDoc.getPage(pageNum).then(page => {
    const viewport = page.getViewport({ scale: 1.5 });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderCtx = {
      canvasContext: ctx,
      viewport: viewport
    };
    page.render(renderCtx);
    pageInfo.textContent = `${pageNum} / ${pdfDoc.numPages}`;
  });
}

function loadPDF(file) {
  console.log('▶ loadPDF start:', file.name);
  const reader = new FileReader();
  reader.onload = function(ev) {
    const arr = new Uint8Array(ev.target.result);
    pdfjsLib.getDocument(arr).promise.then(doc => {
      pdfDoc = doc;
      currentPage = 1;
      renderPage(currentPage);
    }).catch(err => {
      alert('PDFの読み込みに失敗: ' + err.message);
    });
  };
  reader.readAsArrayBuffer(file);
}

function setupEventListeners() {
  const fileSelectBtn = document.getElementById('fileSelectBtn');
  const fileInput     = document.getElementById('fileInput');

  // 存在チェック
  if (!fileSelectBtn) console.error('⚠️ fileSelectBtn が見つかりません');
  if (!fileInput)     console.error('⚠️ fileInput が見つかりません');

  // ファイル選択ボタン → ダイアログ
  fileSelectBtn.addEventListener('click', () => {
    console.log('📁 ファイル選択ボタン クリック検知');
    fileInput.value = null;  // 連続で開いたときに change が飛ばない対策
    fileInput.click();       // ダイアログを開く
  });

  // ダイアログから選択したらPDF読込
  fileInput.addEventListener('change', e => {
    console.log('📂 fileInput change:', e.target.files);
    if (e.target.files.length) {
      loadPDF(e.target.files[0]);
    }
  });

  // ページ送り
  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage <= 1) return;
    currentPage--;
    renderPage(currentPage);
  });
  document.getElementById('nextPage').addEventListener('click', () => {
    if (currentPage >= pdfDoc.numPages) return;
    currentPage++;
    renderPage(currentPage);
  });

  // ドラッグ＆ドロップ
  const dz = document.getElementById('dropZone');
  ['dragover','drop'].forEach(evt => dz.addEventListener(evt, e => {
    e.preventDefault();
    e.stopPropagation();
    if (evt === 'drop' && e.dataTransfer.files.length) {
      loadPDF(e.dataTransfer.files[0]);
    }
  }));
}

window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
});

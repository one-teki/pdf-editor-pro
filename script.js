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
  // ボタン → ファイル選択
  document.getElementById('fileSelectBtn')
    .addEventListener('click', () => document.getElementById('fileInput').click());

  // ファイル選択から読込
  document.getElementById('fileInput')
    .addEventListener('change', e => {
      if (e.target.files.length) loadPDF(e.target.files[0]);
    });

  // ページ送り
  document.getElementById('prevPage')
    .addEventListener('click', () => {
      if (currentPage <= 1) return;
      currentPage--;
      renderPage(currentPage);
    });
  document.getElementById('nextPage')
    .addEventListener('click', () => {
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

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
const { PDFDocument, degrees } = PDFLib;

// Fabric.js canvas
const fabricCanvas = new fabric.Canvas('pdfCanvas', {
  selection: true,
  preserveObjectStacking: true,
});
let pdfDocJs, pdfDocLib, pdfBytes;
let currentPage = 1;
const pdfScale = 1.5;

// レンダリング
async function renderPage(pageNum) {
  pdfDocJs = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const page = await pdfDocJs.getPage(pageNum);
  const viewport = page.getViewport({ scale: pdfScale });

  fabricCanvas.clear();
  fabricCanvas.setWidth(viewport.width);
  fabricCanvas.setHeight(viewport.height);

  const temp = document.createElement('canvas');
  temp.width = viewport.width; temp.height = viewport.height;
  const ctx = temp.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  fabricCanvas.setBackgroundImage(
    temp.toDataURL(),
    fabricCanvas.renderAll.bind(fabricCanvas)
  );
  document.getElementById('pageInfo').textContent =
    `${pageNum} / ${pdfDocJs.numPages}`;
}

// PDF読み込み
async function loadPDF(file) {
  pdfBytes = new Uint8Array(await file.arrayBuffer());
  pdfDocLib = await PDFDocument.load(pdfBytes);
  currentPage = 1;
  renderPage(currentPage);
}

// 保存
async function savePDF() {
  const overlay = fabricCanvas.toDataURL({ format: 'png' });
  const bin = atob(overlay.split(',')[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);

  const finalDoc = await PDFDocument.load(pdfBytes);
  const page = finalDoc.getPages()[currentPage - 1];
  const embedded = await finalDoc.embedPng(arr);
  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: page.getWidth(),
    height: page.getHeight()
  });

  const out = await finalDoc.save();
  const blob = new Blob([out], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'edited.pdf'; a.click();
  URL.revokeObjectURL(url);
}

// イベント設定
function setupEventListeners() {
  const fileInput = document.getElementById('fileInput');
  const mergeInput = document.getElementById('mergeInput');
  const imageInput = document.getElementById('imageInput');
  const imageBtn = document.getElementById('imageBtn');
  const fontSelect = document.getElementById('fontSelect');

  // PDF選択
  document.getElementById('fileSelectBtn').onclick = () => {
    fileInput.value = null; fileInput.click();
  };
  fileInput.onchange = e => loadPDF(e.target.files[0]);

  // ページ移動
  document.getElementById('prevPage').onclick = () => {
    if (currentPage > 1) renderPage(--currentPage);
  };
  document.getElementById('nextPage').onclick = () => {
    if (currentPage < pdfDocJs.numPages) renderPage(++currentPage);
  };

  // Drag&Drop
  const dz = document.getElementById('dropZone');
  ['dragover','drop'].forEach(evt => dz.addEventListener(evt, e => {
    e.preventDefault(); e.stopPropagation();
    if (evt === 'drop' && e.dataTransfer.files.length)
      loadPDF(e.dataTransfer.files[0]);
  }));

  // テキスト追加
  document.getElementById('addTextBtn').onclick = () => {
    const text = prompt('テキスト入力'); if (!text) return;
    const obj = new fabric.IText(text, {
      left: 50, top: 50,
      fontSize: 24,
      fill: '#000',
      fontFamily: fontSelect.value,
      selectable: true
    });
    fabricCanvas.add(obj).setActiveObject(obj);
  };

  // フォント変更
  fontSelect.onchange = () => {
    const obj = fabricCanvas.getActiveObject();
    if (obj && obj.type === 'i-text') obj.set('fontFamily', fontSelect.value);
    fabricCanvas.renderAll();
  };

  // 画像挿入
  imageBtn.onclick = () => {
    imageInput.value = null; imageInput.click();
  };
  imageInput.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    fabric.Image.fromURL(url, img => {
      img.set({
        left: 50,
        top: 50,
        scaleX: 0.5,
        scaleY: 0.5,
        selectable: true
      });
      fabricCanvas.add(img).setActiveObject(img);
    });
  };

  // ページ削除
  document.getElementById('deletePageBtn').onclick = async () => {
    if (!confirm(`ページ${currentPage}を削除?`)) return;
    pdfDocLib.removePage(currentPage - 1);
    pdfBytes = await pdfDocLib.save();
    renderPage(currentPage);
  };

  // 回転
  document.getElementById('rotateBtn').onclick = async () => {
    const page = pdfDocLib.getPages()[currentPage - 1];
    page.setRotation(degrees(page.getRotation().angle + 90));
    pdfBytes = await pdfDocLib.save();
    renderPage(currentPage);
  };

  // 結合
  document.getElementById('mergeBtn').onclick = () => {
    mergeInput.value = null; mergeInput.click();
  };
  mergeInput.onchange = async e => {
    for (const f of e.target.files) {
      const arr = await f.arrayBuffer();
      const other = await PDFDocument.load(arr);
      const pages = await pdfDocLib.copyPages(other, other.getPageIndices());
      pages.forEach(p => pdfDocLib.addPage(p));
    }
    pdfBytes = await pdfDocLib.save();
    renderPage(currentPage);
  };

  // 分割
  document.getElementById('splitBtn').onclick = async () => {
    const idx = currentPage;
    const doc1 = await PDFDocument.create();
    const pages1 = await doc1.copyPages(pdfDocLib, [...Array(idx).keys()]);
    pages1.forEach(p => doc1.addPage(p));
    const doc2 = await PDFDocument.create();
    const total = pdfDocLib.getPageCount();
    const pages2 = await doc2.copyPages(pdfDocLib, Array.from({length: total - idx}, (_, i) => i + idx));
    pages2.forEach(p => doc2.addPage(p));
    const b1 = await doc1.save(), b2 = await doc2.save();
    download(b1, `part1_${idx}.pdf`);
    download(b2, `part2_${idx+1}.pdf`);
  };

  // 保存
  document.getElementById('saveBtn').onclick = savePDF;
}

window.onload = setupEventListeners;

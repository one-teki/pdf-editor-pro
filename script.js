class PDFEditorPro {
    constructor() {
        this.currentPDF = null;
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.canvas = document.getElementById('pdfCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.textAnnotations = [];
        this.selectedPages = new Set();
        this.draggedPage = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    setupEventListeners() {
        // ファイル選択
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files);
        });

        // ナビゲーションボタン
        document.getElementById('prevPageBtn').addEventListener('click', () => {
            this.goToPreviousPage();
        });

        document.getElementById('nextPageBtn').addEventListener('click', () => {
            this.goToNextPage();
        });

        document.getElementById('currentPageInput').addEventListener('change', (e) => {
            this.goToPage(parseInt(e.target.value));
        });

        // ズームコントロール
        document.getElementById('zoomInBtn').addEventListener('click', () => {
            this.zoomIn();
        });

        document.getElementById('zoomOutBtn').addEventListener('click', () => {
            this.zoomOut();
        });

        // ツールボタン
        document.getElementById('addTextBtn').addEventListener('click', () => {
            this.openTextModal();
        });

        document.getElementById('deletePageBtn').addEventListener('click', () => {
            this.deletePage();
        });

        document.getElementById('rotateBtn').addEventListener('click', () => {
            this.rotatePage();
        });

        // ナビゲーションメニュー
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleNavAction(e.target.dataset.action);
            });
        });

        // モーダル関連
        document.getElementById('splitMethod').addEventListener('change', (e) => {
            this.toggleSplitMethod(e.target.value);
        });

        // キーボードショートカット
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });

        // PDFキャンバスクリック（テキスト追加位置指定）
        this.canvas.addEventListener('click', (e) => {
            if (document.getElementById('textModal').style.display === 'block') {
                const rect = this.canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;
                document.getElementById('textXInput').value = Math.round(x);
                document.getElementById('textYInput').value = Math.round(y);
            }
        });
    }

    setupDragAndDrop() {
        const dropZone = document.getElementById('dropZone');
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('dragover');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            this.handleFileSelect(files);
        }, false);

        // ページサムネイルのドラッグ&ドロップ
        this.setupPageDragAndDrop();
    }

    setupPageDragAndDrop() {
        const thumbnailsContainer = document.getElementById('pageThumbnails');
        
        thumbnailsContainer.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('thumbnail-item')) {
                this.draggedPage = parseInt(e.target.dataset.pageNum);
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        thumbnailsContainer.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('thumbnail-item')) {
                e.target.classList.remove('dragging');
                this.draggedPage = null;
                this.removeDragPlaceholders();
            }
        });

        thumbnailsContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(thumbnailsContainer, e.clientY);
            const dragPlaceholder = this.createDragPlaceholder();
            
            this.removeDragPlaceholders();
            
            if (afterElement == null) {
                thumbnailsContainer.appendChild(dragPlaceholder);
            } else {
                thumbnailsContainer.insertBefore(dragPlaceholder, afterElement);
            }
        });

        thumbnailsContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(thumbnailsContainer, e.clientY);
            let newIndex = afterElement ? 
                parseInt(afterElement.dataset.pageNum) - 1 : 
                this.totalPages;
            
            if (this.draggedPage !== null && this.draggedPage !== newIndex + 1) {
                this.movePage(this.draggedPage - 1, newIndex);
            }
            
            this.removeDragPlaceholders();
        });
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    async handleFileSelect(files) {
        if (files.length === 0) return;

        this.showProgress('ファイルを読み込み中...');

        try {
            if (files.length === 1) {
                await this.loadPDF(files[0]);
            } else {
                // 複数ファイルの場合は結合
                await this.mergeMultiplePDFs(Array.from(files));
            }
        } catch (error) {
            console.error('ファイル読み込みエラー:', error);
            alert('ファイルの読み込みに失敗しました。');
        } finally {
            this.hideProgress();
        }
    }

    async loadPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        this.currentPDF = await pdfjsLib.getDocument(arrayBuffer).promise;
        this.pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        
        this.totalPages = this.currentPDF.numPages;
        this.currentPage = 1;
        
        this.updateUI();
        await this.renderPage(this.currentPage);
        this.generateThumbnails();
    }

    async mergeMultiplePDFs(files) {
        this.showProgress('PDFを結合中...');
        
        const mergedPdf = await PDFLib.PDFDocument.create();
        
        for (let i = 0; i < files.length; i++) {
            this.updateProgress((i / files.length) * 100, `${files[i].name} を処理中...`);
            
            const arrayBuffer = await files[i].arrayBuffer();
            const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
            const pageIndices = pdf.getPageIndices();
            const pages = await mergedPdf.copyPages(pdf, pageIndices);
            
            pages.forEach((page) => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const arrayBuffer = await blob.arrayBuffer();
        
        this.currentPDF = await pdfjsLib.getDocument(arrayBuffer).promise;
        this.pdfDoc = mergedPdf;
        this.totalPages = this.currentPDF.numPages;
        this.currentPage = 1;
        
        this.updateUI();
        await this.renderPage(this.currentPage);
        this.generateThumbnails();
    }

    updateUI() {
        document.getElementById('dropZone').style.display = 'none';
        document.getElementById('pdfCanvasContainer').style.display = 'flex';
        document.getElementById('pageNavigation').style.display = 'flex';
        
        document.getElementById('totalPages').textContent = this.totalPages;
        document.getElementById('currentPageInput').max = this.totalPages;
        document.querySelector('.page-count').textContent = `${this.totalPages} ページ`;
        
        this.updateNavigationButtons();
    }

    updateNavigationButtons() {
        document.getElementById('prevPageBtn').disabled = this.currentPage <= 1;
        document.getElementById('nextPageBtn').disabled = this.currentPage >= this.totalPages;
        document.getElementById('currentPageInput').value = this.currentPage;
    }

    async renderPage(pageNum) {
        if (!this.currentPDF) return;

        const page = await this.currentPDF.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.scale });
        
        this.canvas.height = viewport.height;
        this.canvas.width = viewport.width;
        
        const renderContext = {
            canvasContext: this.ctx,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        this.renderTextAnnotations();
    }

    renderTextAnnotations() {
        const overlay = document.getElementById('textOverlay');
        overlay.innerHTML = '';
        
        this.textAnnotations
            .filter(annotation => annotation.page === this.currentPage)
            .forEach(annotation => {
                const textElement = document.createElement('div');
                textElement.className = 'text-annotation';
                textElement.style.left = `${annotation.x * this.scale}px`;
                textElement.style.top = `${annotation.y * this.scale}px`;
                textElement.style.fontSize = `${annotation.fontSize * this.scale}px`;
                textElement.style.color = annotation.color;
                textElement.textContent = annotation.text;
                
                textElement.addEventListener('click', () => {
                    this.editTextAnnotation(annotation);
                });
                
                overlay.appendChild(textElement);
            });
    }

    async generateThumbnails() {
        const container = document.getElementById('pageThumbnails');
        container.innerHTML = '';
        
        for (let i = 1; i <= this.totalPages; i++) {
            this.updateProgress((i / this.totalPages) * 100, `サムネイル生成中... ${i}/${this.totalPages}`);
            
            const thumbnailItem = await this.createThumbnail(i);
            container.appendChild(thumbnailItem);
        }
    }

    async createThumbnail(pageNum) {
        const page = await this.currentPDF.getPage(pageNum);
        const scale = 0.3;
        const viewport = page.getViewport({ scale });
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;
        
        const thumbnailItem = document.createElement('div');
        thumbnailItem.className = 'thumbnail-item';
        thumbnailItem.dataset.pageNum = pageNum;
        thumbnailItem.draggable = true;
        
        thumbnailItem.innerHTML = `
            <canvas class="thumbnail-canvas"></canvas>
            <div class="thumbnail-info">ページ ${pageNum}</div>
            <div class="thumbnail-actions">
                <button class="thumbnail-btn" onclick="pdfEditor.deletePage(${pageNum})" title="削除">🗑️</button>
                <button class="thumbnail-btn" onclick="pdfEditor.rotatePage(${pageNum})" title="回転">🔄</button>
            </div>
        `;
        
        const thumbnailCanvas = thumbnailItem.querySelector('.thumbnail-canvas');
        thumbnailCanvas.width = canvas.width;
        thumbnailCanvas.height = canvas.height;
        thumbnailCanvas.getContext('2d').drawImage(canvas, 0, 0);
        
        thumbnailItem.addEventListener('click', () => {
            this.goToPage(pageNum);
            this.selectThumbnail(pageNum);
        });
        
        return thumbnailItem;
    }

    selectThumbnail(pageNum) {
        document.querySelectorAll('.thumbnail-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const selectedItem = document.querySelector(`[data-page-num="${pageNum}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
    }

    goToPage(pageNum) {
        if (pageNum < 1 || pageNum > this.totalPages) return;
        
        this.currentPage = pageNum;
        this.renderPage(this.currentPage);
        this.updateNavigationButtons();
        this.selectThumbnail(pageNum);
    }

    goToPreviousPage() {
        if (this.currentPage > 1) {
            this.goToPage(this.currentPage - 1);
        }
    }

    goToNextPage() {
        if (this.currentPage < this.totalPages) {
            this.goToPage(this.currentPage + 1);
        }
    }

    zoomIn() {
        this.scale = Math.min(this.scale * 1.2, 3.0);
        this.updateZoom();
    }

    zoomOut() {
        this.scale = Math.max(this.scale / 1.2, 0.3);
        this.updateZoom();
    }

    updateZoom() {
        document.getElementById('zoomLevel').textContent = `${Math.round(this.scale * 100)}%`;
        this.renderPage(this.currentPage);
    }

    // テキスト追加機能
    openTextModal() {
        if (!this.currentPDF) {
            alert('PDFファイルを読み込んでください。');
            return;
        }
        document.getElementById('textModal').style.display = 'block';
    }

    async addTextToPDF() {
        const text = document.getElementById('textInput').value.trim();
        const fontSize = parseInt(document.getElementById('fontSizeInput').value);
        const color = document.getElementById('textColorInput').value;
        const x = parseInt(document.getElementById('textXInput').value);
        const y = parseInt(document.getElementById('textYInput').value);

        if (!text) {
            alert('テキストを入力してください。');
            return;
        }

        try {
            this.showProgress('テキストを追加中...');

            // PDF-libでテキスト追加
            const pages = this.pdfDoc.getPages();
            const page = pages[this.currentPage - 1];
            const { height } = page.getSize();

            // 色をRGBに変換
            const rgb = this.hexToRgb(color);
            
            page.drawText(text, {
                x: x,
                y: height - y, // PDF座標系は下から上
                size: fontSize,
                color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255)
            });

            // テキスト注釈を記録
            this.textAnnotations.push({
                page: this.currentPage,
                text: text,
                x: x,
                y: y,
                fontSize: fontSize,
                color: color
            });

            // 表示を更新
            await this.updatePDFDisplay();
            this.closeModal('textModal');
            
            // フォームをリセット
            document.getElementById('textInput').value = '';
            
        } catch (error) {
            console.error('テキスト追加エラー:', error);
            alert('テキストの追加に失敗しました。');
        } finally {
            this.hideProgress();
        }
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    // ページ削除機能
    async deletePage(pageNum = null) {
        if (!this.currentPDF) return;

        const targetPage = pageNum || this.currentPage;
        
        if (this.totalPages <= 1) {
            alert('最後のページは削除できません。');
            return;
        }

        if (!confirm(`ページ ${targetPage} を削除しますか？`)) {
            return;
        }

        try {
            this.showProgress('ページを削除中...');

            this.pdfDoc.removePage(targetPage - 1);
            
            // テキスト注釈も削除
            this.textAnnotations = this.textAnnotations.filter(annotation => 
                annotation.page !== targetPage
            );

            // ページ番号を調整
            this.textAnnotations.forEach(annotation => {
                if (annotation.page > targetPage) {
                    annotation.page--;
                }
            });

            await this.updatePDFDisplay();
            
            // 現在のページを調整
            if (this.currentPage > this.totalPages) {
                this.currentPage = this.totalPages;
            }
            
            this.goToPage(this.currentPage);
            
        } catch (error) {
            console.error('ページ削除エラー:', error);
            alert('ページの削除に失敗しました。');
        } finally {
            this.hideProgress();
        }
    }

    // ページ回転機能
    async rotatePage(pageNum = null) {
        if (!this.currentPDF) return;

        const targetPage = pageNum || this.currentPage;

        try {
            this.showProgress('ページを回転中...');

            const pages = this.pdfDoc.getPages();
            const page = pages[targetPage - 1];
            page.setRotation(PDFLib.degrees(page.getRotation().angle + 90));

            await this.updatePDFDisplay();
            
        } catch (error) {
            console.error('ページ回転エラー:', error);
            alert('ページの回転に失敗しました。');
        } finally {
            this.hideProgress();
        }
    }

    // ページ移動機能
    async movePage(fromIndex, toIndex) {
        if (!this.currentPDF || fromIndex === toIndex) return;

        try {
            this.showProgress('ページを移動中...');

            const pages = this.pdfDoc.getPages();
            const [movedPage] = pages.splice(fromIndex, 1);
            pages.splice(toIndex, 0, movedPage);

            // 新しいPDFドキュメントを作成
            const newPdf = await PDFLib.PDFDocument.create();
            for (const page of pages) {
                const [copiedPage] = await newPdf.copyPages(this.pdfDoc, [this.pdfDoc.getPages().indexOf(page)]);
                newPdf.addPage(copiedPage);
            }

            this.pdfDoc = newPdf;
            await this.updatePDFDisplay();
            
        } catch (error) {
            console.error('ページ移動エラー:', error);
            alert('ページの移動に失敗しました。');
        } finally {
            this.hideProgress();
        }
    }

    // PDF分割機能
    async splitPDF() {
        if (!this.currentPDF) return;

        const method = document.getElementById('splitMethod').value;
        let ranges = [];

        try {
            if (method === 'pages') {
                const rangeInput = document.getElementById('pageRangeInput').value.trim();
                if (!rangeInput) {
                    alert('ページ範囲を入力してください。');
                    return;
                }
                ranges = this.parsePageRanges(rangeInput);
            } else {
                const everyPages = parseInt(document.getElementById('everyPagesInput').value);
                ranges = this.generateEveryPageRanges(everyPages);
            }

            this.showProgress('PDFを分割中...');

            for (let i = 0; i < ranges.length; i++) {
                this.updateProgress((i / ranges.length) * 100, `分割中... ${i + 1}/${ranges.length}`);
                
                const splitPdf = await PDFLib.PDFDocument.create();
                const pages = await splitPdf.copyPages(this.pdfDoc, ranges[i]);
                pages.forEach(page => splitPdf.addPage(page));

                const pdfBytes = await splitPdf.save();
                this.downloadPDF(pdfBytes, `split_${i + 1}.pdf`);
            }

            this.closeModal('splitModal');
            alert(`${ranges.length}個のファイルに分割しました。`);

        } catch (error) {
            console.error('PDF分割エラー:', error);
            alert('PDFの分割に失敗しました。');
        } finally {
            this.hideProgress();
        }
    }

    parsePageRanges(input) {
        const ranges = [];
        const parts = input.split(',');

        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.includes('-')) {
                const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
                const range = [];
                for (let i = start; i <= end; i++) {
                    if (i >= 1 && i <= this.totalPages) {
                        range.push(i - 1); // 0ベースのインデックス
                    }
                }
                if (range.length > 0) ranges.push(range);
            } else {
                const pageNum = parseInt(trimmed);
                if (pageNum >= 1 && pageNum <= this.totalPages) {
                    ranges.push([pageNum - 1]);
                }
            }
        }

        return ranges;
    }

    generateEveryPageRanges(everyPages) {
        const ranges = [];
        for (let i = 0; i < this.totalPages; i += everyPages) {
            const range = [];
            for (let j = i; j < Math.min(i + everyPages, this.totalPages); j++) {
                range.push(j);
            }
            ranges.push(range);
        }
        return ranges;
    }

    // ナビゲーション処理
    handleNavAction(action) {
        switch (action) {
            case 'new':
                this.newDocument();
                break;
            case 'open':
                document.getElementById('fileInput').click();
                break;
            case 'save':
                this.savePDF();
                break;
            case 'merge':
                document.getElementById('fileInput').click();
                break;
            case 'split':
                this.openSplitModal();
                break;
        }
    }

    newDocument() {
        if (confirm('現在の作業内容は失われます。新しいドキュメントを作成しますか？')) {
            this.resetEditor();
        }
    }

    resetEditor() {
        this.currentPDF = null;
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.textAnnotations = [];
        
        document.getElementById('dropZone').style.display = 'flex';
        document.getElementById('pdfCanvasContainer').style.display = 'none';
        document.getElementById('pageNavigation').style.display = 'none';
        document.getElementById('pageThumbnails').innerHTML = '';
        document.querySelector('.page-count').textContent = '0 ページ';
    }

    async savePDF() {
        if (!this.pdfDoc) {
            alert('保存するPDFがありません。');
            return;
        }

        try {
            this.showProgress('PDFを保存中...');
            const pdfBytes = await this.pdfDoc.save();
            this.downloadPDF(pdfBytes, 'edited_document.pdf');
        } catch (error) {
            console.error('保存エラー:', error);
            alert('PDFの保存に失敗しました。');
        } finally {
            this.hideProgress();
        }
    }

    downloadPDF(pdfBytes, filename) {
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    openSplitModal() {
        if (!this.currentPDF) {
            alert('PDFファイルを読み込んでください。');
            return;
        }
        document.getElementById('splitModal').style.display = 'block';
    }

    toggleSplitMethod(method) {
        const pageRangeGroup = document.getElementById('pageRangeGroup');
        const everyPagesGroup = document.getElementById('everyPagesGroup');

        if (method === 'pages') {
            pageRangeGroup.style.display = 'block';
            everyPagesGroup.style.display = 'none';
        } else {
            pageRangeGroup.style.display = 'none';
            everyPagesGroup.style.display = 'block';
        }
    }

    // キーボードショートカット
    handleKeyboardShortcuts(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 's':
                    e.preventDefault();
                    this.savePDF();
                    break;
                case 'o':
                    e.preventDefault();
                    document.getElementById('fileInput').click();
                    break;
                case 'n':
                    e.preventDefault();
                    this.newDocument();
                    break;
            }
        }

        // モーダルが開いていない時のみ
        if (!document.querySelector('.modal[style*="block"]')) {
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.goToPreviousPage();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.goToNextPage();
                    break;
                case 'Delete':
                    e.preventDefault();
                    this.deletePage();
                    break;
                case '+':
                case '=':
                    e.preventDefault();
                    this.zoomIn();
                    break;
                case '-':
                    e.preventDefault();
                    this.zoomOut();
                    break;
            }
        }

        // Escapeでモーダルを閉じる
        if (e.key === 'Escape') {
            this.closeAllModals();
        }
    }

    // ドラッグ&ドロップヘルパー
    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.thumbnail-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    createDragPlaceholder() {
        const placeholder = document.createElement('div');
        placeholder.className = 'drag-placeholder';
        placeholder.textContent = 'ここにドロップ';
        return placeholder;
    }

    removeDragPlaceholders() {
        document.querySelectorAll('.drag-placeholder').forEach(el => el.remove());
    }

    // PDF表示更新
    async updatePDFDisplay() {
        const pdfBytes = await this.pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const arrayBuffer = await blob.arrayBuffer();
        
        this.currentPDF = await pdfjsLib.getDocument(arrayBuffer).promise;
        this.totalPages = this.currentPDF.numPages;
        
        this.updateUI();
        await this.renderPage(this.currentPage);
        this.generateThumbnails();
    }

    // 進捗表示
    showProgress(message) {
        document.getElementById('progressContainer').style.display = 'block';
        document.getElementById('progressText').textContent = message;
        document.getElementById('progressFill').style.width = '0%';
    }

    updateProgress(percent, message) {
        document.getElementById('progressFill').style.width = `${percent}%`;
        if (message) {
            document.getElementById('progressText').textContent = message;
        }
    }

    hideProgress() {
        document.getElementById('progressContainer').style.display = 'none';
    }

    // モーダル制御
    closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }

    editTextAnnotation(annotation) {
        document.getElementById('textInput').value = annotation.text;
        document.getElementById('fontSizeInput').value = annotation.fontSize;
        document.getElementById('textColorInput').value = annotation.color;
        document.getElementById('textXInput').value = annotation.x;
        document.getElementById('textYInput').value = annotation.y;
        
        this.openTextModal();
        
        // 既存の注釈を削除
        this.textAnnotations = this.textAnnotations.filter(a => a !== annotation);
    }
}

// グローバル関数（HTMLから呼び出し用）
function closeModal(modalId) {
    pdfEditor.closeModal(modalId);
}

function addTextToPDF() {
    pdfEditor.addTextToPDF();
}

function splitPDF() {
    pdfEditor.splitPDF();
}

// アプリケーション初期化
let pdfEditor;
document.addEventListener('DOMContentLoaded', () => {
    pdfEditor = new PDFEditorPro();
});

document.addEventListener('DOMContentLoaded', () => {
    const overlayInput = document.getElementById('overlay-image');
    const csvInput = document.getElementById('csv-file');
    const startButton = document.getElementById('start-button');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');
    const progressContainer = document.getElementById('progress-container');
    const logArea = document.getElementById('log-area');
    const downloadTemplateBtn = document.getElementById('download-template');

    // ログ出力関数
    function log(message, isError = false) {
        const div = document.createElement('div');
        div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        if (isError) div.style.color = '#ff6b6b';
        logArea.appendChild(div);
        logArea.scrollTop = logArea.scrollHeight;
    }

    // テンプレートダウンロード
    downloadTemplateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const csvContent = "val1,val2\noutput_filename,image_url\nsample1.jpg,https://example.com/image1.jpg\nsample2.jpg,https://example.com/image2.jpg";
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM付き
        saveAs(blob, "template.csv");
    });

    startButton.addEventListener('click', async () => {
        if (!overlayInput.files[0] || !csvInput.files[0]) {
            alert('オーバーレイ画像とCSVファイルの両方を選択してください。');
            return;
        }

        startButton.disabled = true;
        progressContainer.style.display = 'block';
        progressBarFill.style.width = '0%';
        progressText.textContent = '0%';
        logArea.innerHTML = '';
        log('処理を開始します...');

        try {
            // 1. オーバーレイ画像の読み込み
            const overlayFile = overlayInput.files[0];
            const overlayBitmap = await createImageBitmap(overlayFile);
            log('オーバーレイ画像を読み込みました');

            // 2. CSVのパース
            Papa.parse(csvInput.files[0], {
                header: true,
                skipEmptyLines: true,
                complete: async (results) => {
                    const rows = results.data;
                    const total = rows.length;
                    let processed = 0;
                    const zip = new JSZip();
                    const imgFolder = zip.folder("output_images");

                    log(`CSV読み込み完了: ${total}件のデータを検出`);

                    // 3. 画像処理ループ (並行処理数を制限しつつ実行)
                    // ブラウザの負荷を考慮して、一度に処理する数を制限する (例: 5並列)
                    const concurrency = 5;
                    const queue = [...rows];
                    const activeWorkers = [];

                    const processImage = async (row) => {
                        const url = row['image_url'];
                        let filename = row['output_filename'];

                        if (!url || !filename) return; // データ不備はスキップ
                        if (!filename.toLowerCase().endsWith('.jpg') && !filename.toLowerCase().endsWith('.jpeg')) {
                            filename += '.jpg';
                        }

                        try {
                            // プロキシ経由で画像を取得
                            // window.location.origin を使って現在のドメインのAPIを叩く
                            const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
                            const response = await fetch(proxyUrl);
                            
                            if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
                            
                            const blob = await response.blob();
                            const baseImageBitmap = await createImageBitmap(blob);

                            // Canvas作成
                            const canvas = document.createElement('canvas');
                            canvas.width = baseImageBitmap.width;
                            canvas.height = baseImageBitmap.height;
                            const ctx = canvas.getContext('2d');

                            // 画像描画
                            ctx.drawImage(baseImageBitmap, 0, 0);

                            // オーバーレイ描画 (リサイズ)
                            ctx.drawImage(overlayBitmap, 0, 0, baseImageBitmap.width, baseImageBitmap.height);

                            // Blob変換 (JPEG)
                            const outputBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
                            
                            // Zipに追加
                            imgFolder.file(filename, outputBlob);
                            log(`処理成功: ${filename}`);

                        } catch (err) {
                            log(`エラー (${filename}): ${err.message}`, true);
                        } finally {
                            processed++;
                            const percent = Math.round((processed / total) * 100);
                            progressBarFill.style.width = `${percent}%`;
                            progressText.textContent = `${percent}% (${processed}/${total})`;
                        }
                    };

                    // キュー処理
                    const next = () => {
                        if (queue.length === 0) return Promise.resolve();
                        const row = queue.shift();
                        const promise = processImage(row).then(() => next());
                        return promise;
                    };

                    // 初期の並列数だけ起動
                    const workers = Array(Math.min(concurrency, queue.length)).fill(0).map(() => next());
                    
                    await Promise.all(workers);

                    log('すべての画像処理が完了しました。Zip圧縮を開始します...');

                    // 4. Zip生成とダウンロード
                    const content = await zip.generateAsync({type:"blob"});
                    saveAs(content, "processed_images.zip");
                    
                    log('ダウンロードを開始しました');
                    startButton.disabled = false;
                },
                error: (err) => {
                    log(`CSVパースエラー: ${err.message}`, true);
                    startButton.disabled = false;
                }
            });

        } catch (err) {
            log(`予期せぬエラー: ${err.message}`, true);
            startButton.disabled = false;
        }
    });
});

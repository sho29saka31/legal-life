// collect-data.js
(function() {
    console.log('🚩 法令の学習・相談サイト システムログ収集稼働開始');
    const getSystemStatus = () => {
        const ua = navigator.userAgent;
        const platform = navigator.platform;
        let os = "不明";
        if (ua.indexOf("Win") !== -1) os = "Windows";
        else if (ua.indexOf("Mac") !== -1) os = "macOS / iOS";
        else if (ua.indexOf("Android") !== -1) os = "Android";
        else if (ua.indexOf("Linux") !== -1) os = "Linux";
        if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
        // ストレージ・メモリ計算
        let storageStatus = "取得不可";
        try {
            const usedSize = encodeURI(JSON.stringify(localStorage)).length;
            storageStatus = `${(usedSize / 1024).toFixed(2)} KB`;
        } catch (e) {}
        let memoryStatus = "取得不可 (Chrome以外)";
        if (performance.memory) {
            memoryStatus = `${Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)} MB`;
        }

        // ログイン状態の取得
        let loginUser = "未ログイン";
        if (window.authApp && window.authApp.currentUser) {
            loginUser = window.authApp.currentUser.name;
        } else if (document.cookie.includes("google_user")) {
            loginUser = "ログイン処理中...";
        }

        return {
            "OS": os,
            "デバイス": /Mobi|Android/i.test(ua) ? "スマートフォン/タブレット" : "PC",
            "ブラウザ": ua,
            "画面サイズ": `${window.innerWidth}x${window.innerHeight}`,
            "言語": navigator.language,
            "通信状態": navigator.connection ? navigator.connection.effectiveType : "不明",
            "OSのテーマ": window.matchMedia('(prefers-color-scheme: dark)').matches ? "ダークモード" : "ライトモード",
            "ストレージ使用量": storageStatus,
            "メモリ使用量": memoryStatus,
            "ログインユーザー": loginUser,
            "現在のページtitle": document.title || "未設定",
            "現在のページURL": location.pathname,
            "元居たページURL": document.referrer || "直接アクセス / ブックマーク",
        };
    };

    //初回のシステム診断を表示
    console.groupCollapsed('🌐 [System Report] 実行環境・リソース詳細');
    console.table(getSystemStatus());
    console.groupEnd();

    //読み込み完了時のパフォーマンス計測
    window.addEventListener('load', () => {
        const loadTime = (performance.now() / 1000).toFixed(2);
        console.log(`⏱️ [Performance] ページ読み込み完了: ${loadTime}秒`);

        //ネットワークの内訳（このタイミングでないと取得できない）
        const [perf] = performance.getEntriesByType('navigation');
        if (perf) {
            console.groupCollapsed('🔗 [Network Detail] 通信の内訳');
            console.table({
                "DNS解決時間": `${(perf.domainLookupEnd - perf.domainLookupStart).toFixed(2)} ms`,
                "TCP接続時間": `${(perf.connectEnd - perf.connectStart).toFixed(2)} ms`,
                "SSL認証時間": perf.secureConnectionStart > 0 ? `${(perf.requestStart - perf.secureConnectionStart).toFixed(2)} ms` : "非SSL",
                "レスポンス待機": `${(perf.responseStart - perf.requestStart).toFixed(2)} ms`
            });
            console.groupEnd();
        }

        //重いリソースのチェック
        const heavyFiles = performance.getEntriesByType("resource").filter(r => r.duration > 1000);
        if (heavyFiles.length > 0) {
            console.warn('🐌 [Performance] 重いリソース:', heavyFiles.map(f => f.name));
        }
    });

    //エラー監視（全局・Promise）
    window.addEventListener('error', (event) => {
        const msg = event.message || "不明なエラー";
        const file = event.filename || "不明なファイル";
        const line = event.lineno || "?";
        // ★Googleログイン関連の「実害のないエラー」を無視するフィルター
        if (
            !msg ||
            msg.includes("不明なエラー") ||
            !file ||
            file.includes("accounts.google.com")
        ) {return; }
        // これらはブラウザが詳細を隠している「無害なノイズ」なので完全に無視
        
        console.group('%c🚨 [Global Error Handled]', 'color: white; background: #e74c3c; padding: 2px 5px;');
            console.error('メッセージ:', msg);
            console.error('発生場所:', `${file}:${line}行目`);
            console.groupEnd();
    }, true);

    window.addEventListener('unhandledrejection', (event) => {
        // PromiseのエラーもGoogle関連なら無視
        if (event.reason && event.reason.toString().includes("google")) return;

        console.warn('⚠️ [Unhandled Promise Rejection]', event.reason);
    });

    //インタラクション監視 (コピー・セキュリティ)
    document.addEventListener('copy', () => {
        const selection = window.getSelection().toString();
        console.log(`✂️ [Copy] 内容がコピーされました (${selection.length}文字): "${selection}"`);
    });
})();
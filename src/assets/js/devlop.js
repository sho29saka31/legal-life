(function() {
    const COOKIE_NAME = "dev_access_allowed";
    const REDIRECT_PATH = "/z[dev--tool]/dev/";
    const CORRECT_PASSWORD = "devtool-legallife-develop";

    const passInput = document.getElementById('passInput');
    const toggleBtn = document.getElementById('togglePass');
    const submitBtn = document.getElementById('submit');

    // すでにCookieがある場合は即座にリダイレクト（履歴に残さない）
    if (document.cookie.split('; ').find(row => row.startsWith(COOKIE_NAME + '=true'))) {
        window.location.replace(REDIRECT_PATH);
        return;
    }

    // パスワードの表示・非表示切り替え
    toggleBtn.addEventListener('click', () => {
        if (passInput.type === 'password') {
            passInput.type = 'text';
            toggleBtn.textContent = '隠す';
        } else {
            passInput.type = 'password';
            toggleBtn.textContent = '表示';
        }
    });

    // ログイン処理
    function attemptLogin() {
        if (passInput.value === CORRECT_PASSWORD) {
            // セッションCookieを付与
            document.cookie = `${COOKIE_NAME}=true; path=/; SameSite=Lax`;
            window.location.replace(REDIRECT_PATH);
        } else {
            alert("パスワードが正しくありません。");
            window.location.replace("/"); // ホームへ飛ばす
        }
    }

    submitBtn.addEventListener('click', attemptLogin);
    passInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') attemptLogin(); });
})();
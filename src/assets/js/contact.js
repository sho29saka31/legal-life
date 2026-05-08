// contact.js — カスタムお問い合わせフォーム（EmailJS送信）

(function () {
    'use strict';

    // ========================================
    // EmailJS 設定
    // ※ account.js と同じサービスを使用
    // ※ テンプレートIDは新規作成が必要（下記README参照）
    // ========================================
    const SERVICE_ID  = 'service_glirsis';
    const TEMPLATE_ID = 'template_contact';   // ← EmailJSで新規テンプレートを作成してIDを設定
    const PUBLIC_KEY  = 'eG7KMS7F3Fh0PziYy';

    // お問い合わせ種類 → セクションIDのマッピング
    const SECTION_MAP = {
        'コメント':           'section-comment',
        '質問':               'section-question',
        'バグや不具合の報告': 'section-bug',
        '機能のリクエスト':   'section-feature',
        'その他のお問い合わせ': 'section-other',
    };

    // ========================================
    // 初期化
    // ========================================
    function init() {
        if (typeof emailjs === 'undefined') {
            console.error('❌ EmailJSが読み込まれていません');
            return;
        }
        emailjs.init(PUBLIC_KEY);

        // お問い合わせ種類が変わったらセクションを切り替え
        document.querySelectorAll('input[name="inquiry_type"]').forEach(radio => {
            radio.addEventListener('change', handleTypeChange);
        });

        // 送信ボタン
        document.getElementById('contact-submit')
            ?.addEventListener('click', handleSubmit);
    }

    // ========================================
    // お問い合わせ種類に応じてセクションを切り替え
    // ========================================
    function handleTypeChange(e) {
        // すべての条件セクションを非表示
        document.querySelectorAll('.conditional-section').forEach(s => {
            s.classList.add('hidden');
            s.classList.remove('visible');
        });

        // 対応セクションを表示
        const sectionId = SECTION_MAP[e.target.value];
        if (!sectionId) return;

        const target = document.getElementById(sectionId);
        if (!target) return;

        target.classList.remove('hidden');
        // 1フレーム後にアニメーション開始
        requestAnimationFrame(() => {
            target.classList.add('visible');
            setTimeout(() => {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
        });
    }

    // ========================================
    // バリデーション
    // ========================================
    function validateForm() {
        let isValid = true;

        // エラーをリセット
        document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
        document.querySelectorAll('.form-field.has-error').forEach(el => el.classList.remove('has-error'));

        // お名前
        if (!getVal('field-name')) {
            setError('field-name', 'お名前を入力してください');
            isValid = false;
        }

        // 性別
        if (!document.querySelector('input[name="gender"]:checked')) {
            setError('gender-group', '性別を選択してください');
            isValid = false;
        }

        // 年代
        if (!getVal('field-age')) {
            setError('field-age', '年代を選択してください');
            isValid = false;
        }

        // メールアドレス（任意だが、入力ある場合は形式チェック）
        const email = getVal('field-email');
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError('field-email', '正しいメールアドレスの形式で入力してください');
            isValid = false;
        }

        // お問い合わせ種類
        if (!document.querySelector('input[name="inquiry_type"]:checked')) {
            setError('inquiry-type-group', 'お問い合わせの種類を選択してください');
            isValid = false;
        }

        // 表示中のセクション内フィールド
        const visibleSection = document.querySelector('.conditional-section.visible');
        if (visibleSection) {
            visibleSection.querySelectorAll('select[required]').forEach(select => {
                if (!select.value) {
                    setError(select.id, '分野を選択してください');
                    isValid = false;
                }
            });
            visibleSection.querySelectorAll('textarea[required]').forEach(textarea => {
                if (!textarea.value.trim()) {
                    setError(textarea.id, 'お問い合わせ内容を入力してください');
                    isValid = false;
                }
            });
        }

        return isValid;
    }

    function getVal(id) {
        return document.getElementById(id)?.value.trim() || '';
    }

    function setError(id, message) {
        const field = document.getElementById(id);
        if (field) {
            const wrapper = field.closest('.form-field');
            if (wrapper) wrapper.classList.add('has-error');
        }
        const errEl = document.getElementById(id + '-error');
        if (errEl) errEl.textContent = message;
    }

    // ========================================
    // 送信処理
    // ========================================
    async function handleSubmit() {
        if (!validateForm()) {
            const firstErr = document.querySelector('.form-field.has-error');
            firstErr?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const submitBtn = document.getElementById('contact-submit');
        submitBtn.disabled  = true;
        submitBtn.innerHTML = '<span class="btn-spinner"></span>送信中...';
        document.getElementById('submit-error')?.setAttribute('hidden', '');

        // フォームデータ収集
        const inquiryType    = document.querySelector('input[name="inquiry_type"]:checked')?.value || '';
        const visibleSection = document.querySelector('.conditional-section.visible');
        const category       = visibleSection?.querySelector('select')?.value || '';
        const content        = visibleSection?.querySelector('textarea')?.value.trim() || '';

        const params = {
            from_name:    getVal('field-name'),
            gender:       document.querySelector('input[name="gender"]:checked')?.value || '',
            age_group:    getVal('field-age'),
            reply_email:  getVal('field-email') || '（未入力）',
            inquiry_type: inquiryType,
            category:     category || '（なし）',
            content:      content,
            page_url:     location.href,
            sent_at:      new Date().toLocaleString('ja-JP'),
        };

        try {
            await emailjs.send(SERVICE_ID, TEMPLATE_ID, params);
            showSuccess();
        } catch (err) {
            console.error('❌ 送信失敗:', err);
            const errBanner = document.getElementById('submit-error');
            if (errBanner) {
                errBanner.removeAttribute('hidden');
                errBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            submitBtn.disabled  = false;
            submitBtn.innerHTML = '送信する';
        }
    }

    function showSuccess() {
        document.getElementById('contact-form-wrapper').style.display = 'none';
        const success = document.getElementById('contact-success');
        success.removeAttribute('hidden');
        success.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ========================================
    // 起動
    // ========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
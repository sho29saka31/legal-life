document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('faq-search');
    const clearBtn = document.getElementById('faq-search-clear'); // 追加
    const tabBtns = document.querySelectorAll('.faq_tab_btn');
    const faqItems = document.querySelectorAll('.faq_item');
    const emptyMessage = document.getElementById('faq-empty-message');

    function filterFAQ() {
        const searchTerm = searchInput.value.toLowerCase();
        
        // --- クリアボタンの表示制御 ---
        if (searchTerm.length > 0) {
            clearBtn.style.display = 'block';
        } else {
            clearBtn.style.display = 'none';
        }
        // ----------------------------

        const activeCategory = document.querySelector('.faq_tab_btn.active').dataset.category;
        let visibleCount = 0;

        faqItems.forEach(item => {
            const text = item.textContent.toLowerCase();
            const category = item.dataset.category;
            const matchesSearch = text.includes(searchTerm);
            const matchesCategory = (activeCategory === 'all' || category === activeCategory);

            if (matchesSearch && matchesCategory) {
                item.style.display = 'block';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });

        emptyMessage.style.display = visibleCount === 0 ? 'block' : 'none';
    }

    // --- クリアボタンクリック時の処理 ---
    clearBtn.addEventListener('click', () => {
        searchInput.value = ''; // 入力を空にする
        filterFAQ();           // 検索結果をリセット
        searchInput.focus();    // 入力欄にフォーカスを戻す
    });

    // 既存のイベントリスナー
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterFAQ();
        });
    });

    searchInput.addEventListener('input', filterFAQ);

    // アコーディオン開閉
    faqItems.forEach(item => {
        item.querySelector('.faq_question').addEventListener('click', () => {
            item.classList.toggle('is-active');
        });
    });
});
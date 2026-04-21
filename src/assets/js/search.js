// 和暦変換関数
function convertToJapaneseCalendar(dateString) {
    if (!dateString || dateString === '不明') return '不明';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        return new Intl.DateTimeFormat('ja-JP-u-ca-japanese', {
            era: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(date);
    } catch (e) {
        return dateString;
    }
}

let currentDetailElement = null;
let currentLawsData = [];
let currentPage = 0;
const LIMIT = 20;
let currentSearchTarget = 'title'; // デフォルトは法令名検索

// ========================================
// 初期化：タブ切り替えのみ（クリアボタン処理はimportant.jsで実施）
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    const tabs        = document.querySelectorAll('.search-tab');
    const searchInput = document.getElementById('searchInput');

    // タブクリック
    tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
            tabs.forEach(function(t) { t.classList.remove('active'); });
            this.classList.add('active');
            currentSearchTarget = this.dataset.target;
            if (searchInput) searchInput.focus();
        });
    });

    // Enterキーで検索
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') searchLaws();
        });
    }
});

// ========================================
// 検索実行
// ========================================
async function searchLaws(offset) {
    if (typeof offset !== 'number') offset = 0;

    const inputValue = document.getElementById('searchInput').value.trim();
    const law_type   = document.getElementById('law_typeSelect').value;
    const sortValue  = document.getElementById('sortSelect').value;

    const button     = document.getElementById('searchButton');
    const resultsDiv = document.getElementById('results');
    const loadingDiv = document.getElementById('loadingMessage');
    const errorDiv   = document.getElementById('errorMessage');

    if (!inputValue && !law_type) {
        if (errorDiv) errorDiv.innerHTML = '<div class="lawapi-error">検索ワードを入力してください</div>';
        return;
    }

    errorDiv.innerHTML  = '';
    resultsDiv.innerHTML = '';
    loadingDiv.innerHTML = '<div class="lawapi-loading">検索中...</div>';
    button.disabled = true;

    try {
        let url = `https://laws.e-gov.go.jp/api/2/laws?limit=${LIMIT}&offset=${offset}&response_format=json`;

        if (inputValue) {
            url += currentSearchTarget === 'title'
                ? `&law_title=${encodeURIComponent(inputValue)}`
                : `&keyword=${encodeURIComponent(inputValue)}`;
        }
        if (law_type) url += `&law_type=${law_type}`;

        if (sortValue && sortValue !== 'none') {
            const sortMapping = {
                'amendment_promulgation_data_desc': 'amendment_promulgation_date_desc',
                'date_desc': 'promulgation_date_desc',
                'date_asc':  'promulgation_date_asc',
                'title_asc': 'law_title_asc'
            };
            const apiSortValue = sortMapping[sortValue] || sortValue;
            const parts = apiSortValue.split('_');
            const order = parts.pop();
            const key   = parts.join('_');
            url += `&sort_key=${key}&sort_order=${order}`;
        }

        const response = await fetch(url);
        console.log('ステータス:', response.status);
        if (!response.ok) {
            throw new Error(`APIリクエストに失敗しました (Status: ${response.status})`);
        }

        const data = await response.json();
        console.log('レスポンスデータ:', data);

        currentLawsData = data.laws || [];
        const totalCount = data.total_count || 0;

        if (currentLawsData.length === 0) {
            resultsDiv.innerHTML = '<div class="lawapi-no-results">検索結果が見つかりませんでした</div>';
        } else {
            displayResults(totalCount, offset);
            displayPagination(totalCount, offset);
        }

    } catch (error) {
        if (errorDiv) errorDiv.innerHTML = `<div class="lawapi-error">エラーが発生しました: ${error.message}</div>`;
        console.error('検索エラー:', error);
    } finally {
        loadingDiv.innerHTML = '';
        button.disabled = false;
        // 検索コンテナの位置にスクロール
        const searchContainer = document.querySelector('.lawapi-search-container');
        if (searchContainer) {
            searchContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// ========================================
// ページネーション表示
// ========================================
function displayPagination(totalCount, currentOffset) {
    const resultsDiv = document.getElementById('results');

    // 既存を削除
    document.querySelectorAll('.lawapi-pagination').forEach(function(p) { p.remove(); });

    const hasPrev       = currentOffset > 0;
    const hasNext       = currentOffset + LIMIT < totalCount;
    const currentPageNum = Math.floor(currentOffset / LIMIT) + 1;
    const lastPageNum   = Math.ceil(totalCount / LIMIT);
    const startCount    = currentOffset + 1;
    const endCount      = Math.min(currentOffset + LIMIT, totalCount);

    const paginationHTML = `
        <div class="lawapi-pagination">
            <button onclick="searchLaws(${currentOffset - LIMIT})" ${!hasPrev ? 'disabled' : ''}>◀ 前の20件</button>
            <span>${totalCount.toLocaleString()}件中 ${startCount}〜${endCount}件 (${currentPageNum} / ${lastPageNum} ページ)</span>
            <button onclick="searchLaws(${currentOffset + LIMIT})" ${!hasNext ? 'disabled' : ''}>次の20件 ▶</button>
        </div>
    `;

    resultsDiv.insertAdjacentHTML('afterbegin', paginationHTML);
    resultsDiv.insertAdjacentHTML('beforeend', paginationHTML);
}

// ========================================
// キーワードハイライト
// ========================================
function highlightKeyword(text) {
    const keyword = document.getElementById('searchInput').value.trim();
    if (currentSearchTarget === 'keyword' && keyword && text) {
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedKeyword})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }
    return text;
}

// ========================================
// 法令詳細の表示・非表示
// ========================================
async function viewLawDetail(law_id, law_title, law_num, buttonElement) {
    const detailDiv = document.getElementById(`detail-${law_id}`);

    // 開いている場合は閉じる
    if (detailDiv.style.display === 'block') {
        detailDiv.style.display = 'none';
        buttonElement.textContent = '詳細を見る';
        buttonElement.classList.remove('active');
        return;
    }

    // 他に開いているものを閉じる
    if (currentDetailElement && currentDetailElement !== detailDiv) {
        currentDetailElement.style.display = 'none';
        const prevBtn = currentDetailElement.previousElementSibling;
        if (prevBtn) {
            prevBtn.textContent = '詳細を見る';
            prevBtn.classList.remove('active');
        }
    }

    detailDiv.innerHTML = '<div class="lawapi-loading">読み込み中...</div>';
    detailDiv.style.display = 'block';
    buttonElement.textContent = '読み込み中...';
    buttonElement.classList.add('active');
    currentDetailElement = detailDiv;

    try {
        const url = `https://laws.e-gov.go.jp/api/2/law_data/${law_id}?response_format=json`;
        console.log('法令詳細URL:', url);

        const response = await fetch(url);
        if (!response.ok) throw new Error(`法令データの取得に失敗しました (Status:${response.status})`);

        const data = await response.json();
        console.log('法令詳細データ:', data);

        const content = formatLawContent(data);
        detailDiv.innerHTML = `
            <div class="lawapi-law-detail">
                <hr>
                <div class="lawapi-law-content">${content}</div>
            </div>
        `;
        buttonElement.textContent = '閉じる';
    } catch (error) {
        detailDiv.innerHTML = `<div class="lawapi-error">エラー: ${error.message}</div>`;
        buttonElement.textContent = '詳細を見る';
        buttonElement.classList.remove('active');
        console.error('詳細取得エラー:', error);
    }
}

// ========================================
// 法令本文フォーマット
// ========================================
function formatLawContent(data) {
    const lawFullText = data.law_full_text;
    if (!lawFullText) return '<p>法令本文が見つかりません</p>';
    return parseNode(lawFullText) || '<p>法令本文の解析ができませんでした</p>';
}

function parseNode(node, depth) {
    if (depth === undefined) depth = 0;
    if (!node) return '';
    if (Array.isArray(node)) return node.map(function(item) { return parseNode(item, depth); }).join('');
    if (typeof node === 'string') return highlightKeyword(node);

    const tag      = node.tag;
    const children = node.children || [];
    let html = '';

    if (tag === 'law_title') {
        html += `<div class="lawapi-article"><div class="lawapi-article-title" style="font-size:1.2rem;text-align:center;">${extractText(node)}</div></div>`;
    } else if (tag === 'Chapter') {
        const chapterTitle = findChildByTag(children, 'ChapterTitle');
        if (chapterTitle) html += `<div class="lawapi-article"><div class="lawapi-article-title">【${extractText(chapterTitle)}】</div></div>`;
        children.forEach(function(child) { if (child.tag !== 'ChapterTitle') html += parseNode(child, depth + 1); });
    } else if (tag === 'Section') {
        const sectionTitle = findChildByTag(children, 'SectionTitle');
        if (sectionTitle) html += `<div class="lawapi-article"><div class="lawapi-article-title">〔${extractText(sectionTitle)}〕</div></div>`;
        children.forEach(function(child) { if (child.tag !== 'SectionTitle') html += parseNode(child, depth + 1); });
    } else if (tag === 'Article') {
        html += '<div class="lawapi-article">';
        const articleCaption = findChildByTag(children, 'ArticleCaption');
        if (articleCaption) html += `<div class="lawapi-article-title">${extractText(articleCaption)}</div>`;
        const articleTitle = findChildByTag(children, 'ArticleTitle');
        if (articleTitle) html += `<div class="lawapi-article-title">${extractText(articleTitle)}</div>`;
        findChildrenByTag(children, 'Paragraph').forEach(function(para, index) {
            const paraNum      = findChildByTag(para.children, 'ParagraphNum');
            const paraSentence = findChildByTag(para.children, 'ParagraphSentence');
            if (paraSentence) {
                if (index > 0) html += '<br>';
                html += `<div class="lawapi-article-content">${paraNum ? extractText(paraNum) + ' ' : ''}${extractText(paraSentence)}</div>`;
            }
            findChildrenByTag(para.children, 'Item').forEach(function(item) {
                const itemTitle    = findChildByTag(item.children, 'ItemTitle');
                const itemSentence = findChildByTag(item.children, 'ItemSentence');
                if (itemTitle || itemSentence) {
                    html += `<div class="lawapi-article-content" style="padding-left:2em;">${itemTitle ? extractText(itemTitle) : ''}${itemSentence ? extractText(itemSentence) : ''}</div>`;
                }
            });
        });
        html += '</div>';
    } else if (tag === 'SupplProvision') {
        html += '<div class="lawapi-suppl-provision"><div class="lawapi-suppl-provision-title">附　則</div>';
        const supplLabel = findChildByTag(children, 'SupplProvisionLabel');
        if (supplLabel) html += `<div class="lawapi-suppl-provision-content">${extractText(supplLabel)}</div>`;
        findChildrenByTag(children, 'Paragraph').forEach(function(para, index) {
            const paraNum      = findChildByTag(para.children, 'ParagraphNum');
            const paraSentence = findChildByTag(para.children, 'ParagraphSentence');
            if (paraSentence) {
                if (index > 0) html += '<br>';
                html += `<div class="lawapi-suppl-provision-content">${paraNum ? extractText(paraNum) + ' ' : ''}${extractText(paraSentence)}</div>`;
            }
        });
        findChildrenByTag(children, 'Article').forEach(function(article) { html += parseNode(article, depth + 1); });
        children.forEach(function(child) {
            if (!['SupplProvisionLabel', 'Paragraph', 'Article'].includes(child.tag)) html += parseNode(child, depth + 1);
        });
        html += '</div>';
    } else if (tag === 'Preamble') {
        html += '<div class="lawapi-preamble">';
        children.forEach(function(child) {
            if (child.tag === 'Paragraph') {
                const paraSentence = findChildByTag(child.children, 'ParagraphSentence');
                if (paraSentence) html += `<div class="lawapi-preamble-content">${extractText(paraSentence)}</div>`;
            } else {
                html += parseNode(child, depth + 1);
            }
        });
        html += '</div>';
    } else {
        if (node.text) {
            html += highlightKeyword(node.text);
        } else {
            children.forEach(function(child) { html += parseNode(child, depth + 1); });
        }
    }
    return html;
}

// ========================================
// ヘルパー関数
// ========================================
function findChildByTag(children, tagName) {
    if (!Array.isArray(children)) return null;
    return children.find(function(child) { return child.tag === tagName; }) || null;
}

function findChildrenByTag(children, tagName) {
    if (!Array.isArray(children)) return [];
    return children.filter(function(child) { return child.tag === tagName; });
}

function extractText(node) {
    if (!node) return '';
    if (typeof node === 'string') return highlightKeyword(node);
    if (node.text) return highlightKeyword(node.text);
    if (Array.isArray(node.children)) return node.children.map(function(child) { return extractText(child); }).join('');
    return '';
}

// ========================================
// 検索結果の描画
// ========================================
function displayResults(totalCount, offset) {
    const resultsDiv = document.getElementById('results');

    const typeMapping = {
        'Constitution':        '憲法',
        'Act':                 '法律',
        'CabinetOrder':        '政令',
        'ImperialOrder':       '勅令',
        'MinisterialOrdinance':'府省令',
        'Rule':                '規則'
    };

    let html = '';
    currentLawsData.forEach(function(law) {
        const info      = law.law_info || {};
        const revision  = law.revision_info || {};
        const amendDate = convertToJapaneseCalendar(revision.amendment_promulgation_date);
        const title     = revision.law_title || info.law_title || '名称不明';
        const law_id    = info.law_id    || '不明';
        const law_num   = info.law_num   || '不明';
        const date      = convertToJapaneseCalendar(info.promulgation_date);
        const typeJa    = (info.law_type || '').split(',').map(function(t) {
            return typeMapping[t.trim()] || t.trim();
        }).join(', ');
        const safeTitle = title.replace(/'/g, "\\'");

        html += `
            <div class="lawapi-result-item">
                <div class="lawapi-law-title">${title}</div>
                <div class="lawapi-law-info">
                    <div class="lawapi-law-info-item"><span class="lawapi-law-info-label">法令名</span><span>：${title}</span></div>
                    <div class="lawapi-law-info-item"><span class="lawapi-law-info-label">法令ID</span><span>：<a href="https://laws.e-gov.go.jp/law/${law_id}" target="_blank">${law_id}</a></span></div>
                    <div class="lawapi-law-info-item"><span class="lawapi-law-info-label">法令番号</span><span>：${law_num}</span></div>
                    <div class="lawapi-law-info-item"><span class="lawapi-law-info-label">公布日</span><span>：${date}</span></div>
                    <div class="lawapi-law-info-item"><span class="lawapi-law-info-label">最新改正公布日</span><span>：${amendDate !== '不明' ? amendDate : '（改正情報なし）'}</span></div>
                    <div class="lawapi-law-info-item"><span class="lawapi-law-info-label">法令種別</span><span>：${typeJa}</span></div>
                </div>
                <button class="lawapi-view-button" onclick="viewLawDetail('${law_id}', '${safeTitle}', '${law_num}', this)">詳細を見る</button>
                <div id="detail-${law_id}" style="display:none;"></div>
            </div>`;
    });

    resultsDiv.innerHTML = '<div class="lawapi-results">' + html + '</div>';
}
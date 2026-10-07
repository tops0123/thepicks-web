(function () {
    'use strict';
    const grid = document.getElementById('allPortfolio');
    const filters = document.getElementById('portfolioFilters');
    const pagination = document.getElementById('portfolioPagination');
    const previous = document.getElementById('portfolioPrev');
    const next = document.getElementById('portfolioNext');
    const pageInfo = document.getElementById('portfolioPageInfo');
    const resultCount = document.getElementById('portfolioResultCount');
    const allowedCategories = ['photobooth', 'game', 'saju', 'mosaic'];
    const categoryNames = {photobooth:'포토부스', game:'게임 키오스크', saju:'AI 사주', mosaic:'모자이크 월'};
    const pageSize = 16;
    let items = [];
    let category = new URLSearchParams(location.search).get('category') || 'photobooth';
    let currentPage = 1;
    if (!allowedCategories.includes(category)) category = 'photobooth';

    const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));

    function render() {
        const filtered = items.filter((item) => item.category === category);
        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        currentPage = Math.min(currentPage, totalPages);
        const start = (currentPage - 1) * pageSize;
        const visible = filtered.slice(start, start + pageSize);
        filters.querySelectorAll('button').forEach((button) => {
            const active = button.dataset.category === category;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
        resultCount.textContent = `${filtered.length}개의 현장`;
        if (!visible.length) {
            grid.innerHTML = `<div class="portfolio-empty"><b>${categoryNames[category]}</b><span>등록된 포트폴리오 사진이 없습니다.<br>관리자에서 사진·게시글을 등록해 주세요.</span></div>`;
        } else {
            grid.innerHTML = visible.map((item, index) => `<article class="port-item portfolio-page-card"><div class="port-img"><span class="portfolio-card-number">${String(start + index + 1).padStart(2, '0')}</span>${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy">` : ''}<span class="img-placeholder">이미지 준비 중</span></div><div class="port-text"><span class="portfolio-card-category">${categoryNames[item.category]}</span><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.summary)}</p></div></article>`).join('');
        }
        pagination.hidden = filtered.length <= pageSize;
        pageInfo.textContent = `${currentPage} / ${totalPages}`;
        previous.disabled = currentPage === 1;
        next.disabled = currentPage === totalPages;
    }

    filters.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-category]');
        if (!button) return;
        category = button.dataset.category;
        currentPage = 1;
        history.replaceState(null, '', `portfolio.html?category=${category}`);
        render();
    });
    previous.addEventListener('click', () => {
        if (currentPage > 1) { currentPage -= 1; render(); filters.scrollIntoView({behavior:'smooth', block:'start'}); }
    });
    next.addEventListener('click', () => {
        const total = items.filter((item) => item.category === category).length;
        if (currentPage * pageSize < total) { currentPage += 1; render(); filters.scrollIntoView({behavior:'smooth', block:'start'}); }
    });

    fetch('/api/content', {cache:'no-store'})
        .then((response) => {
            if (!response.ok) throw new Error();
            return response.json();
        })
        .then((content) => { items = Array.isArray(content.portfolio) ? content.portfolio : []; render(); })
        .catch(() => { grid.innerHTML = '<div class="portfolio-empty"><b>사진을 불러오지 못했습니다.</b><span>홈페이지 서버가 실행 중인지 확인해 주세요.</span></div>'; });
})();

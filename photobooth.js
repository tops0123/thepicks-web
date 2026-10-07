(function () {
    'use strict';

    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => [...document.querySelectorAll(selector)];
    const serviceTargets = [
        ['serviceIntroImage', 'intro_image'],
        ['serviceSignatureImage', 'signature_image'],
        ['serviceCompactImage', 'compact_image']
    ];
    const aiDetails = {
        background: ['01', 'AI 배경 합성', '인물은 선명하게 유지하고 행사 콘셉트에 맞는 배경으로 자연스럽게 완성합니다.'],
        beauty: ['02', 'AI 뷰티필터', '자연스러운 피부 표현과 밝기 보정으로 인물의 매력을 선명하게 살립니다.'],
        webtoon: ['03', 'AI 웹툰', '촬영한 인물의 특징을 살려 개성 있는 웹툰 캐릭터로 변환합니다.'],
        meme: ['04', 'AI 밈', '현장에서 웃고 공유할 수 있는 재미있는 밈 스타일 결과를 만듭니다.'],
        figure: ['05', 'AI 3D피규어', '사진 속 인물을 입체감 있는 3D 피규어 스타일로 완성합니다.']
    };

    let pageData = { screens: [], ai_content: {}, backwalls: [] };
    let screenIndex = 0;
    let backwallIndex = 0;
    let activeAiCategory = 'background';
    let lightboxItems = [];
    let lightboxIndex = 0;

    function items(value) {
        return Array.isArray(value) ? value.filter((item) => item && item.image) : [];
    }

    function escapeAttr(value = '') {
        return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
    }

    function showServiceImage(element, source) {
        if (!element || !source) return;
        element.addEventListener('load', () => element.closest('.service-photo')?.classList.add('has-image'), { once:true });
        element.addEventListener('error', () => element.removeAttribute('src'), { once:true });
        element.src = source;
    }

    function cycle(index, total, direction) {
        if (!total) return 0;
        return (index + direction + total) % total;
    }

    function renderScreens() {
        const screens = items(pageData.screens);
        const image = $('#screenMainImage');
        const empty = $('#screenEmpty');
        const open = $('#screenOpen');
        screenIndex = Math.min(screenIndex, Math.max(0, screens.length - 1));
        if (screens.length) {
            image.src = screens[screenIndex].image;
            image.hidden = false;
            empty.hidden = true;
            open.disabled = false;
        } else {
            image.removeAttribute('src');
            image.hidden = true;
            empty.hidden = false;
            open.disabled = true;
        }
        $('#screenCounter').textContent = `${screens.length ? screenIndex + 1 : 0} / ${screens.length}`;
        $('#screenPrev').disabled = screens.length < 2;
        $('#screenNext').disabled = screens.length < 2;
        $('#screenThumbs').innerHTML = screens.length
            ? screens.map((item, index) => `<button type="button" data-screen-index="${index}" class="${index === screenIndex ? 'active' : ''}" aria-label="${index + 1}번 화면 보기"><img src="${escapeAttr(item.image)}" alt=""><span>${String(index + 1).padStart(2, '0')}</span></button>`).join('')
            : '<div class="screen-thumbs-empty">화면 사진을 자유롭게 추가할 수 있습니다.</div>';
        $('#screenThumbs .active')?.scrollIntoView({ block:'nearest', inline:'nearest' });
    }

    function moveScreen(direction) {
        const screens = items(pageData.screens);
        screenIndex = cycle(screenIndex, screens.length, direction);
        renderScreens();
    }

    function renderAiContent() {
        if (!$('#aiContentGrid')) return;
        const detail = aiDetails[activeAiCategory];
        const content = items(pageData.ai_content?.[activeAiCategory]).slice(0, 4);
        $('#aiPanelNumber').textContent = detail[0];
        $('#aiPanelTitle').textContent = detail[1];
        $('#aiPanelDescription').textContent = detail[2];
        $$('#aiContentTabs button').forEach((button) => {
            const selected = button.dataset.aiCategory === activeAiCategory;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-selected', String(selected));
        });
        $('#aiContentGrid').innerHTML = content.length
            ? content.map((item, index) => `<button type="button" data-ai-index="${index}" class="ai-result-card"><img src="${escapeAttr(item.image)}" alt="${escapeAttr(detail[1])} 예시 ${index + 1}"><span>${String(index + 1).padStart(2, '0')}</span></button>`).join('')
            : '<div class="ai-content-empty">관리자에서 이 콘텐츠의 사진을 최대 4장까지 등록해 주세요.</div>';
    }

    function renderBackwalls() {
        const backwalls = items(pageData.backwalls);
        const image = $('#backwallMainImage');
        const empty = $('#backwallEmpty');
        const open = $('#backwallOpen');
        backwallIndex = Math.min(backwallIndex, Math.max(0, backwalls.length - 1));
        if (backwalls.length) {
            image.src = backwalls[backwallIndex].image;
            image.hidden = false;
            empty.hidden = true;
            open.disabled = false;
        } else {
            image.removeAttribute('src');
            image.hidden = true;
            empty.hidden = false;
            open.disabled = true;
        }
        $('#backwallCounter').textContent = `${backwalls.length ? backwallIndex + 1 : 0} / ${backwalls.length}`;
        $('#backwallPrev').disabled = backwalls.length < 2;
        $('#backwallNext').disabled = backwalls.length < 2;
        $('#backwallDots').innerHTML = backwalls.map((_, index) => `<button type="button" data-backwall-index="${index}" class="${index === backwallIndex ? 'active' : ''}" aria-label="${index + 1}번 백월 사진"></button>`).join('');
    }

    function moveBackwall(direction) {
        const backwalls = items(pageData.backwalls);
        backwallIndex = cycle(backwallIndex, backwalls.length, direction);
        renderBackwalls();
    }

    function openLightbox(collection, index) {
        lightboxItems = items(collection);
        if (!lightboxItems.length) return;
        lightboxIndex = Math.min(Math.max(index, 0), lightboxItems.length - 1);
        renderLightbox();
        $('#mediaLightbox').hidden = false;
        document.body.classList.add('lightbox-open');
        $('#lightboxClose').focus();
    }

    function renderLightbox() {
        const item = lightboxItems[lightboxIndex];
        if (!item) return;
        $('#lightboxImage').src = item.image;
        $('#lightboxCounter').textContent = `${lightboxIndex + 1} / ${lightboxItems.length}`;
        $('#lightboxPrev').disabled = lightboxItems.length < 2;
        $('#lightboxNext').disabled = lightboxItems.length < 2;
    }

    function moveLightbox(direction) {
        lightboxIndex = cycle(lightboxIndex, lightboxItems.length, direction);
        renderLightbox();
    }

    function closeLightbox() {
        $('#mediaLightbox').hidden = true;
        document.body.classList.remove('lightbox-open');
    }

    async function loadPage() {
        try {
            const response = await fetch('/api/content', { cache:'no-store' });
            if (!response.ok) return;
            const content = await response.json();
            const heroPhotos = items(content.site?.hero_slides);
            const portfolioPhotos = Array.isArray(content.portfolio)
                ? content.portfolio.filter((item) => item.category === 'photobooth' && item.image)
                : [];
            const fallbacks = [...heroPhotos, ...portfolioPhotos].map((item) => item.image);
            serviceTargets.forEach(([id, slot], index) => {
                const source = content.service?.[slot] || fallbacks[index] || fallbacks[0];
                showServiceImage(document.getElementById(id), source);
            });
            pageData = content.photobooth_page || pageData;
            renderScreens();
            renderAiContent();
            renderBackwalls();
        } catch (_) {
            renderScreens();
            renderAiContent();
            renderBackwalls();
        }
    }

    $('#screenPrev').addEventListener('click', () => moveScreen(-1));
    $('#screenNext').addEventListener('click', () => moveScreen(1));
    $('#screenOpen').addEventListener('click', () => openLightbox(pageData.screens, screenIndex));
    $('#screenThumbs').addEventListener('click', (event) => {
        const button = event.target.closest('[data-screen-index]');
        if (!button) return;
        screenIndex = Number(button.dataset.screenIndex);
        renderScreens();
    });
    $('#aiContentTabs')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-ai-category]');
        if (!button) return;
        activeAiCategory = button.dataset.aiCategory;
        renderAiContent();
    });
    $('#aiContentGrid')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-ai-index]');
        if (!button) return;
        openLightbox(pageData.ai_content?.[activeAiCategory], Number(button.dataset.aiIndex));
    });
    $('#backwallPrev').addEventListener('click', () => moveBackwall(-1));
    $('#backwallNext').addEventListener('click', () => moveBackwall(1));
    $('#backwallOpen').addEventListener('click', () => openLightbox(pageData.backwalls, backwallIndex));
    $('#backwallDots').addEventListener('click', (event) => {
        const button = event.target.closest('[data-backwall-index]');
        if (!button) return;
        backwallIndex = Number(button.dataset.backwallIndex);
        renderBackwalls();
    });
    $('#lightboxClose').addEventListener('click', closeLightbox);
    $('#lightboxPrev').addEventListener('click', () => moveLightbox(-1));
    $('#lightboxNext').addEventListener('click', () => moveLightbox(1));
    $('#mediaLightbox').addEventListener('click', (event) => {
        if (event.target === $('#mediaLightbox')) closeLightbox();
    });
    document.addEventListener('keydown', (event) => {
        if ($('#mediaLightbox').hidden) return;
        if (event.key === 'Escape') closeLightbox();
        if (event.key === 'ArrowLeft') moveLightbox(-1);
        if (event.key === 'ArrowRight') moveLightbox(1);
    });

    loadPage();
})();

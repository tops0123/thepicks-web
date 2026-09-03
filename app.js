(function () {
    'use strict';

    const modal = document.getElementById('quoteModal');
    const form = document.getElementById('quoteForm');
    const status = document.getElementById('formStatus');
    let lastFocused = null;

    function openModal(event) {
        if (event) event.preventDefault();
        lastFocused = document.activeElement;
        modal.hidden = false;
        document.body.classList.add('modal-open');
        window.setTimeout(() => modal.querySelector('input')?.focus(), 0);
    }

    function closeModal() {
        modal.hidden = true;
        document.body.classList.remove('modal-open');
        lastFocused?.focus();
    }

    document.querySelectorAll('.open-quote-form').forEach((button) => button.addEventListener('click', openModal));
    modal?.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
    });

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        const payload = Object.fromEntries(new FormData(form).entries());
        status.className = 'form-status';
        status.textContent = '문의 내용을 보내고 있습니다...';
        submit.disabled = true;

        try {
            const response = await fetch('/api/inquiries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || '문의 접수에 실패했습니다.');
            form.reset();
            status.className = 'form-status success';
            status.textContent = '견적 문의가 접수되었습니다. 확인 후 연락드리겠습니다.';
        } catch (error) {
            status.className = 'form-status error';
            status.textContent = error.message || '잠시 후 다시 시도해 주세요.';
        } finally {
            submit.disabled = false;
        }
    });

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element && value) element.textContent = value;
    }

    function activateStaticPortfolioCards() {
        document.querySelectorAll('[data-portfolio-category]').forEach((section) => {
            const target = `/portfolio.html?category=${encodeURIComponent(section.dataset.portfolioCategory)}`;
            section.querySelectorAll('.port-item').forEach((card) => {
                card.setAttribute('role', 'link');
                card.setAttribute('tabindex', '0');
                card.addEventListener('click', () => window.location.assign(target));
                card.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.location.assign(target); }
                });
            });
        });
    }

    function preloadImage(source) {
        return new Promise((resolve) => {
            const candidate = new Image();
            candidate.onload = () => resolve(source);
            candidate.onerror = () => resolve(null);
            candidate.src = source;
        });
    }

    async function startHeroSlideshow(content) {
        const heroImage = document.getElementById('heroImage');
        const heroImageNext = document.getElementById('heroImageNext');
        const pageA = document.getElementById('heroPageA');
        const pageB = document.getElementById('heroPageB');
        const dots = document.getElementById('heroSlideDots');
        const fallback = document.getElementById('heroImageFallback');
        const pages = [pageA, pageB];
        const images = [heroImage, heroImageNext];
        images.forEach((image, index) => image.addEventListener('error', () => pages[index].className = 'hero-page'));
        const managedSlides = Array.isArray(content.site?.hero_slides) ? content.site.hero_slides.map((item) => item.image) : [];
        const candidates = (managedSlides.length ? managedSlides : [content.site?.hero_image])
            .filter(Boolean)
            .filter((source, index, list) => list.indexOf(source) === index)
            .slice(0, 5);
        const checked = await Promise.all(candidates.map(preloadImage));
        const sources = checked.filter(Boolean);
        if (!sources.length) {
            pages.forEach((page) => { page.style.display = 'none'; });
            fallback.style.display = 'flex';
            return;
        }
        let current = 0;
        let activePage = 0;
        let timer = null;
        let changing = false;
        heroImage.src = sources[0];
        pageA.className = 'hero-page is-active';
        pageB.className = 'hero-page';
        fallback.style.display = 'none';

        function updateDots() {
            dots.querySelectorAll('button').forEach((dot, index) => {
                dot.classList.toggle('is-active', index === current);
                dot.setAttribute('aria-current', index === current ? 'true' : 'false');
            });
        }

        function showSlide(index) {
            if (changing || index === current) return;
            changing = true;
            const outgoingPage = pages[activePage];
            const incomingPage = pages[1 - activePage];
            const incomingImage = images[1 - activePage];
            incomingImage.src = sources[index];
            incomingPage.className = 'hero-page is-under';
            void incomingPage.offsetWidth;
            outgoingPage.className = 'hero-page is-turning';
            current = index;
            updateDots();
            window.setTimeout(() => {
                outgoingPage.className = 'hero-page';
                incomingPage.className = 'hero-page is-active';
                activePage = 1 - activePage;
                changing = false;
            }, 1480);
        }

        function restartTimer() {
            if (timer) window.clearInterval(timer);
            timer = window.setInterval(() => showSlide((current + 1) % sources.length), 4200);
        }

        dots.replaceChildren(...sources.map((_, index) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.setAttribute('aria-label', `${index + 1}번 사진 보기`);
            dot.addEventListener('click', () => { showSlide(index); restartTimer(); });
            return dot;
        }));
        updateDots();
        if (sources.length > 1) restartTimer();
    }

    function portfolioCard(item) {
        const article = document.createElement('a');
        article.className = 'port-item';
        article.href = `/portfolio.html?category=${encodeURIComponent(item.category)}`;
        article.setAttribute('aria-label', `${item.title || '행사 현장'} 포트폴리오 더보기`);
        article.addEventListener('click', (event) => {
            event.preventDefault();
            window.location.assign(article.href);
        });
        const imageBox = document.createElement('div');
        imageBox.className = 'port-img';
        const placeholder = document.createElement('span');
        placeholder.className = 'img-placeholder';
        placeholder.textContent = '이미지 준비 중';
        imageBox.appendChild(placeholder);
        if (item.image) {
            const image = document.createElement('img');
            image.src = item.image;
            image.alt = item.title || '더픽스 행사 현장';
            image.loading = 'lazy';
            image.addEventListener('error', () => image.remove());
            imageBox.appendChild(image);
        }
        const text = document.createElement('div');
        text.className = 'port-text';
        const title = document.createElement('h4');
        title.textContent = item.title || '행사 현장';
        const summary = document.createElement('p');
        summary.textContent = item.summary || '';
        text.append(title, summary);
        article.append(imageBox, text);
        return article;
    }

    function renderPortfolio(items) {
        document.querySelectorAll('[data-portfolio-category]').forEach((section) => {
            const category = section.dataset.portfolioCategory;
            const grid = section.querySelector('.portfolio-4grid');
            const filtered = items.filter((item) => item.category === category).slice(0, 4);
            if (!grid || !filtered.length) return;
            grid.replaceChildren(...filtered.map(portfolioCard));
        });
    }

    function renderFrameCards(frames) {
        document.querySelectorAll('[data-frame-card]').forEach((card) => {
            const frame = frames?.[card.dataset.frameCard];
            if (!frame?.main_image) return;
            const mockup = card.querySelector('.frame-mockup');
            mockup.classList.add('has-frame-image');
            mockup.style.backgroundImage = `url("${String(frame.main_image).replace(/["\\]/g, '')}")`;
        });
    }

    async function loadContent() {
        try {
            const response = await fetch('/api/content', { cache: 'no-store' });
            if (!response.ok) return;
            const content = await response.json();
            setText('heroEyebrow', content.site?.hero_eyebrow);
            setText('heroTitle', content.site?.hero_title);
            setText('heroAccent', content.site?.hero_accent);
            if (content.site?.hero_description) setText('heroDescription', content.site.hero_description);
            startHeroSlideshow(content);
            if (Array.isArray(content.portfolio)) renderPortfolio(content.portfolio);
            renderFrameCards(content.frames);
        } catch (_) {
            // 파일만 미리 볼 때는 HTML에 포함된 기본 내용을 그대로 보여줍니다.
        }
    }

    activateStaticPortfolioCards();
    document.getElementById('mainPortfolioLink')?.addEventListener('click', (event) => {
        event.preventDefault();
        window.location.assign('/portfolio.html');
    });
    loadContent();
})();

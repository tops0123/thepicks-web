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

    function portfolioCard(item) {
        const article = document.createElement('article');
        article.className = 'port-item';
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

    async function loadContent() {
        try {
            const response = await fetch('/api/content', { cache: 'no-store' });
            if (!response.ok) return;
            const content = await response.json();
            setText('heroEyebrow', content.site?.hero_eyebrow);
            setText('heroTitle', content.site?.hero_title);
            setText('heroAccent', content.site?.hero_accent);
            if (content.site?.hero_description) setText('heroDescription', content.site.hero_description);
            if (content.site?.hero_image) {
                const image = document.getElementById('heroImage');
                const fallback = document.getElementById('heroImageFallback');
                image.src = content.site.hero_image;
                image.style.display = '';
                fallback.style.display = 'none';
            }
            if (Array.isArray(content.portfolio)) renderPortfolio(content.portfolio);
        } catch (_) {
            // 파일만 미리 볼 때는 HTML에 포함된 기본 내용을 그대로 보여줍니다.
        }
    }

    loadContent();
})();

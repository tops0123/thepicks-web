(function () {
    'use strict';
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => [...document.querySelectorAll(selector)];
    const categoryNames = { photobooth: '포토부스', game: '게임 키오스크', saju: 'AI 사주', mosaic: '모자이크 월' };
    let data = { site: {}, service: {}, photobooth_page: {}, frames: {}, portfolio: [], inquiries: [] };
    let activeCategory = 'all';
    let activeFrame = 'basic';
    let activeAiAdminCategory = 'background';

    async function request(url, options = {}) {
        const response = await fetch(url, { cache: 'no-store', ...options });
        let body = {};
        try { body = await response.json(); } catch (_) {}
        if (!response.ok) throw new Error(body.message || '처리 중 오류가 발생했습니다.');
        return body;
    }

    function message(element, text, type = '') {
        element.textContent = text;
        element.className = `status ${type}`.trim();
    }

    async function bootstrap() {
        try {
            const state = await request('/api/admin/status');
            if (!state.configured) return showAuth('setup');
            if (!state.authenticated) return showAuth('login');
            await showDashboard();
        } catch (error) {
            showAuth('login');
            message($('#authStatus'), '관리자 서버에 연결할 수 없습니다. START_ADMIN.bat을 실행해 주세요.', 'error');
        }
    }

    function showAuth(view) {
        $('#authPanel').hidden = false;
        $('#dashboard').hidden = true;
        $('#setupView').hidden = view !== 'setup';
        $('#loginView').hidden = view !== 'login';
        $('#logoutButton').hidden = true;
    }

    async function showDashboard() {
        $('#authPanel').hidden = true;
        $('#dashboard').hidden = false;
        $('#logoutButton').hidden = false;
        await loadData();
    }

    async function loadData() {
        data = await request('/api/admin/data');
        fillSiteForm();
        renderServicePhotos();
        renderPhotoboothContent();
        renderFrameManager();
        renderPosts();
        renderInquiries();
    }

    $('#setupForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(event.currentTarget));
        if (values.password !== values.confirm_password) return message($('#authStatus'), '비밀번호가 서로 다릅니다.', 'error');
        try {
            await request('/api/admin/setup', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(values) });
            message($('#authStatus'), '비밀번호가 설정되었습니다.', 'success');
            await showDashboard();
        } catch (error) { message($('#authStatus'), error.message, 'error'); }
    });

    $('#loginForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            await request('/api/admin/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
            message($('#authStatus'), '', '');
            await showDashboard();
        } catch (error) { message($('#authStatus'), error.message, 'error'); }
    });

    $('#logoutButton').addEventListener('click', async () => {
        await request('/api/admin/logout', { method: 'POST' });
        showAuth('login');
    });

    $$('.admin-tabs button').forEach((button) => button.addEventListener('click', () => {
        $$('.admin-tabs button').forEach((item) => item.classList.toggle('active', item === button));
        $$('.tab-panel').forEach((panel) => panel.hidden = panel.id !== `tab-${button.dataset.tab}`);
    }));

    function fillSiteForm() {
        const form = $('#siteForm');
        ['hero_eyebrow','hero_title','hero_accent','hero_description'].forEach((name) => form.elements[name].value = data.site[name] || '');
        renderHeroSlides();
    }

    function renderServicePhotos() {
        ['intro_image','signature_image','compact_image'].forEach((slot) => {
            const image = document.querySelector(`[data-service-preview="${slot}"]`);
            if (!image) return;
            if (data.service?.[slot]) image.src = data.service[slot];
            else image.removeAttribute('src');
        });
    }

    document.querySelectorAll('.service-photo-form').forEach((form) => {
        const input = form.querySelector('input[type="file"]');
        const preview = form.querySelector('img');
        bindFilePreview(input, preview);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const button = form.querySelector('button[type="submit"]');
            const formData = new FormData();
            formData.append('slot', form.dataset.slot);
            formData.append('image', input.files[0]);
            button.disabled = true;
            message($('#serviceStatus'), '서비스 소개 사진을 저장하고 있습니다...');
            try {
                data = await request('/api/admin/service-photo', { method:'POST', body:formData });
                form.reset();
                renderServicePhotos();
                message($('#serviceStatus'), '서비스 소개 사진이 저장되었습니다.', 'success');
            } catch (error) { message($('#serviceStatus'), error.message, 'error'); }
            finally { button.disabled = false; }
        });
    });

    const aiAdminNames = {
        background: 'AI 배경 합성', beauty: 'AI 뷰티필터', webtoon: 'AI 웹툰', meme: 'AI 밈', figure: 'AI 3D피규어'
    };

    function pageContent() {
        return data.photobooth_page || { screens: [], ai_content: {}, backwalls: [] };
    }

    function managedCard(item, index, kind, category = '') {
        return `<article class="managed-photo-card" data-id="${escapeAttr(item.id)}" data-kind="${kind}" data-category="${category}"><img src="${escapeAttr(item.image)}" alt="등록 사진 ${index + 1}"><span>${String(index + 1).padStart(2, '0')}</span><button type="button" data-managed-delete aria-label="사진 삭제">×</button></article>`;
    }

    function renderManagedList(selector, gallery, kind, category = '') {
        const list = $(selector);
        const images = Array.isArray(gallery) ? gallery : [];
        list.innerHTML = images.length
            ? images.map((item, index) => managedCard(item, index, kind, category)).join('')
            : '<div class="managed-photo-empty">등록된 사진이 없습니다.</div>';
    }

    function renderPhotoboothContent() {
        const content = pageContent();
        renderManagedList('#screenGalleryList', content.screens, 'screen');
        renderManagedList('#aiContentAdminList', content.ai_content?.[activeAiAdminCategory], 'ai', activeAiAdminCategory);
        renderManagedList('#backwallGalleryList', content.backwalls, 'backwall');
        $('#aiContentForm').elements.category.value = activeAiAdminCategory;
        $$('#aiAdminTabs button').forEach((button) => button.classList.toggle('active', button.dataset.aiAdminCategory === activeAiAdminCategory));
        const aiCount = Array.isArray(content.ai_content?.[activeAiAdminCategory]) ? content.ai_content[activeAiAdminCategory].length : 0;
        $('#aiUploadCount').textContent = `${aiAdminNames[activeAiAdminCategory]} · ${aiCount} / 4장`;
    }

    function bindMultiSelection(input, output, prefix = '') {
        input.addEventListener('change', () => {
            output.textContent = input.files.length ? `${prefix}${input.files.length}장 선택됨` : '선택된 사진 없음';
        });
    }

    const screenGalleryInput = $('#screenGalleryForm input[type="file"]');
    const aiContentInput = $('#aiContentForm input[type="file"]');
    const backwallGalleryInput = $('#backwallGalleryForm input[type="file"]');
    bindMultiSelection(screenGalleryInput, $('#screenUploadCount'));
    bindMultiSelection(aiContentInput, $('#aiUploadCount'));
    bindMultiSelection(backwallGalleryInput, $('#backwallUploadCount'));

    async function uploadGalleryFiles(form, input, endpoint, statusElement, extraFields = {}) {
        const files = [...input.files];
        if (!files.length) return message(statusElement, '등록할 사진을 선택해 주세요.', 'error');
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            for (let index = 0; index < files.length; index += 1) {
                message(statusElement, `${files.length}장 중 ${index + 1}장을 등록하고 있습니다...`);
                const formData = new FormData();
                Object.entries(extraFields).forEach(([name, value]) => formData.append(name, value));
                formData.append('image', files[index]);
                data = await request(endpoint, { method:'POST', body:formData });
            }
            form.reset();
            renderPhotoboothContent();
            message(statusElement, `${files.length}장의 사진이 등록되었습니다.`, 'success');
        } catch (error) {
            message(statusElement, error.message, 'error');
            renderPhotoboothContent();
        } finally {
            button.disabled = false;
        }
    }

    $('#screenGalleryForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        await uploadGalleryFiles(event.currentTarget, screenGalleryInput, '/api/admin/photobooth-screen', $('#screenGalleryStatus'));
        $('#screenUploadCount').textContent = '선택된 사진 없음';
    });

    $('#aiAdminTabs').addEventListener('click', (event) => {
        const button = event.target.closest('[data-ai-admin-category]');
        if (!button) return;
        activeAiAdminCategory = button.dataset.aiAdminCategory;
        $('#aiContentForm').reset();
        message($('#aiContentStatus'), '');
        renderPhotoboothContent();
    });

    $('#aiContentForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const existing = pageContent().ai_content?.[activeAiAdminCategory] || [];
        const files = [...aiContentInput.files];
        if (existing.length + files.length > 4) {
            return message($('#aiContentStatus'), `이 콘텐츠에는 ${4 - existing.length}장까지 더 등록할 수 있습니다.`, 'error');
        }
        await uploadGalleryFiles(event.currentTarget, aiContentInput, '/api/admin/ai-content', $('#aiContentStatus'), { category: activeAiAdminCategory });
    });

    $('#backwallGalleryForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        await uploadGalleryFiles(event.currentTarget, backwallGalleryInput, '/api/admin/backwall', $('#backwallGalleryStatus'));
        $('#backwallUploadCount').textContent = '선택된 사진 없음';
    });

    async function deleteManagedPhoto(card) {
        const endpoint = card.dataset.kind === 'screen' ? '/api/admin/photobooth-screen' : card.dataset.kind === 'backwall' ? '/api/admin/backwall' : '/api/admin/ai-content';
        const categoryQuery = card.dataset.kind === 'ai' ? `&category=${encodeURIComponent(card.dataset.category)}` : '';
        if (!confirm('이 사진을 삭제할까요?')) return;
        data = await request(`${endpoint}?id=${encodeURIComponent(card.dataset.id)}${categoryQuery}`, { method:'DELETE' });
        renderPhotoboothContent();
    }

    ['#screenGalleryList', '#aiContentAdminList', '#backwallGalleryList'].forEach((selector) => {
        $(selector).addEventListener('click', async (event) => {
            const button = event.target.closest('[data-managed-delete]');
            if (!button) return;
            try { await deleteManagedPhoto(button.closest('.managed-photo-card')); }
            catch (error) { alert(error.message); }
        });
    });

    function heroSlides() {
        return Array.isArray(data.site?.hero_slides) ? data.site.hero_slides : [];
    }

    function renderHeroSlides() {
        const slides = heroSlides();
        $('#heroSlideCount').textContent = `${slides.length} / 5장`;
        const list = $('#heroSlideList');
        if (!slides.length) {
            list.innerHTML = '<div class="hero-slide-empty">등록된 슬라이드 사진이 없습니다.</div>';
            return;
        }
        list.innerHTML = slides.map((item, index) => `<article class="hero-slide-card" data-id="${escapeAttr(item.id)}"><img src="${escapeAttr(item.image)}" alt="슬라이드 사진 ${index + 1}"><span>${index + 1}번</span><button type="button" data-hero-slide-delete aria-label="슬라이드 사진 삭제">×</button></article>`).join('');
    }

    function bindFilePreview(input, preview) {
        input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;
            preview.src = URL.createObjectURL(file);
        });
    }
    bindFilePreview($('#postForm input[type="file"]'), $('#postPreview'));
    bindFilePreview($('#frameMainForm input[type="file"]'), $('#frameMainPreview'));

    const heroSlideInput = $('#siteForm input[name="hero_slides"]');
    heroSlideInput.addEventListener('change', () => {
        const selected = heroSlideInput.files.length;
        const total = heroSlides().length + selected;
        $('#heroSlideSelection').textContent = selected ? `${selected}장 선택됨 · 저장 후 총 ${total}장` : '선택된 사진 없음';
        if (total > 5) message($('#siteStatus'), `현재 사진을 포함해 최대 5장만 등록할 수 있습니다. ${5 - heroSlides().length}장 이하로 선택해 주세요.`, 'error');
    });

    $('#siteForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const files = [...heroSlideInput.files];
        if (heroSlides().length + files.length > 5) return message($('#siteStatus'), `슬라이드 사진은 최대 5장입니다. 지금은 ${5 - heroSlides().length}장까지 더 등록할 수 있습니다.`, 'error');
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        message($('#siteStatus'), '저장 중입니다...');
        try {
            const textData = new FormData(form);
            textData.delete('hero_slides');
            data = await request('/api/admin/site', { method: 'POST', body: textData });
            for (let index = 0; index < files.length; index += 1) {
                message($('#siteStatus'), `${files.length}장 중 ${index + 1}번째 사진을 등록하고 있습니다...`);
                const imageData = new FormData();
                imageData.append('image', files[index]);
                data = await request('/api/admin/hero-slide', { method: 'POST', body: imageData });
            }
            heroSlideInput.value = '';
            $('#heroSlideSelection').textContent = '선택된 사진 없음';
            fillSiteForm();
            const count = heroSlides().length;
            message($('#siteStatus'), count < 2 ? '문구가 저장되었습니다. 슬라이드 작동을 위해 사진을 2장 이상 등록해 주세요.' : `메인 화면과 슬라이드 사진 ${count}장이 저장되었습니다.`, count < 2 ? '' : 'success');
        } catch (error) { message($('#siteStatus'), error.message, 'error'); }
        finally { button.disabled = false; }
    });

    $('#heroSlideList').addEventListener('click', async (event) => {
        const button = event.target.closest('[data-hero-slide-delete]');
        if (!button) return;
        const card = button.closest('.hero-slide-card');
        if (!confirm('이 슬라이드 사진을 삭제할까요?')) return;
        try {
            data = await request(`/api/admin/hero-slide?id=${encodeURIComponent(card.dataset.id)}`, { method:'DELETE' });
            renderHeroSlides();
            message($('#siteStatus'), '슬라이드 사진이 삭제되었습니다.', 'success');
        } catch (error) { message($('#siteStatus'), error.message, 'error'); }
    });

    function currentFrame() {
        return data.frames?.[activeFrame] || { main_image:'', gallery:[] };
    }

    function renderFrameManager() {
        const frame = currentFrame();
        $('#frameMainForm').elements.frame_type.value = activeFrame;
        $('#frameGalleryForm').elements.frame_type.value = activeFrame;
        const preview = $('#frameMainPreview');
        if (frame.main_image) preview.src = frame.main_image; else preview.removeAttribute('src');
        const list = $('#frameGalleryList');
        const images = Array.isArray(frame.gallery) ? frame.gallery : [];
        if (!images.length) {
            list.innerHTML = '<div class="empty-state">등록된 샘플 사진이 없습니다.</div>';
            return;
        }
        list.innerHTML = images.map((item, index) => `<article class="frame-gallery-card" data-id="${item.id}"><img src="${escapeAttr(item.image)}" alt="샘플 사진 ${index + 1}"><span class="frame-gallery-number">${index + 1}</span><button type="button" data-frame-image-delete aria-label="샘플 사진 삭제">×</button></article>`).join('');
    }

    $('#frameAdminTabs').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-frame]');
        if (!button) return;
        activeFrame = button.dataset.frame;
        $$('#frameAdminTabs button').forEach((item) => item.classList.toggle('active', item === button));
        $('#frameMainForm').reset();
        $('#frameGalleryForm').reset();
        $('#selectedGalleryCount').textContent = '선택된 사진 없음';
        message($('#frameStatus'), '');
        renderFrameManager();
    });

    $('#frameMainForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        message($('#frameStatus'), '대표사진을 저장하고 있습니다...');
        try {
            data = await request('/api/admin/frame-main', {method:'POST', body:new FormData(event.currentTarget)});
            event.currentTarget.reset();
            renderFrameManager();
            message($('#frameStatus'), '대표사진이 저장되었습니다.', 'success');
        } catch (error) { message($('#frameStatus'), error.message, 'error'); }
        finally { button.disabled = false; }
    });

    const galleryFileInput = $('#frameGalleryForm input[type="file"]');
    galleryFileInput.addEventListener('change', () => {
        $('#selectedGalleryCount').textContent = galleryFileInput.files.length ? `${galleryFileInput.files.length}장 선택됨` : '선택된 사진 없음';
    });

    $('#frameGalleryForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const files = [...galleryFileInput.files];
        if (!files.length) return message($('#frameStatus'), '등록할 샘플 사진을 선택해 주세요.', 'error');
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            for (let index = 0; index < files.length; index += 1) {
                message($('#frameStatus'), `${files.length}장 중 ${index + 1}장을 등록하고 있습니다...`);
                const formData = new FormData();
                formData.append('frame_type', activeFrame);
                formData.append('image', files[index]);
                data = await request('/api/admin/frame-gallery', {method:'POST', body:formData});
            }
            event.currentTarget.reset();
            $('#selectedGalleryCount').textContent = '선택된 사진 없음';
            renderFrameManager();
            message($('#frameStatus'), `${files.length}장의 샘플 사진이 등록되었습니다.`, 'success');
        } catch (error) { message($('#frameStatus'), error.message, 'error'); }
        finally { button.disabled = false; }
    });

    $('#frameGalleryList').addEventListener('click', async (event) => {
        const button = event.target.closest('[data-frame-image-delete]');
        if (!button) return;
        const card = button.closest('.frame-gallery-card');
        if (!confirm('이 샘플 사진을 삭제할까요?')) return;
        try {
            data = await request(`/api/admin/frame-gallery?frame=${encodeURIComponent(activeFrame)}&id=${encodeURIComponent(card.dataset.id)}`, {method:'DELETE'});
            renderFrameManager();
            message($('#frameStatus'), '샘플 사진이 삭제되었습니다.', 'success');
        } catch (error) { message($('#frameStatus'), error.message, 'error'); }
    });

    function openPostEditor(item = null) {
        const form = $('#postForm');
        form.hidden = false;
        form.reset();
        form.elements.id.value = item?.id || '';
        form.elements.category.value = item?.category || 'photobooth';
        form.elements.title.value = item?.title || '';
        form.elements.summary.value = item?.summary || '';
        const preview = $('#postPreview');
        if (item?.image) preview.src = item.image; else preview.removeAttribute('src');
        message($('#postStatus'), '');
        form.scrollIntoView({ behavior:'smooth', block:'center' });
    }
    function closePostEditor() { $('#postForm').hidden = true; }
    $('#newPostButton').addEventListener('click', () => openPostEditor());
    $('#cancelPostButton').addEventListener('click', closePostEditor);

    $('#postForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const isNew = !form.elements.id.value;
        if (isNew && !form.elements.image.files.length) return message($('#postStatus'), '새 글에는 사진을 선택해 주세요.', 'error');
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        message($('#postStatus'), '저장 중입니다...');
        try {
            data = await request('/api/admin/portfolio', { method:'POST', body:new FormData(form) });
            renderPosts();
            message($('#postStatus'), '게시글이 저장되었습니다.', 'success');
            window.setTimeout(closePostEditor, 650);
        } catch (error) { message($('#postStatus'), error.message, 'error'); }
        finally { button.disabled = false; }
    });

    $('#categoryFilters').addEventListener('click', (event) => {
        const button = event.target.closest('button[data-category]');
        if (!button) return;
        activeCategory = button.dataset.category;
        $$('#categoryFilters button').forEach((item) => item.classList.toggle('active', item === button));
        renderPosts();
    });

    function renderPosts() {
        const list = $('#postList');
        const posts = data.portfolio.filter((item) => activeCategory === 'all' || item.category === activeCategory);
        if (!posts.length) { list.innerHTML = '<div class="empty-state">등록된 게시글이 없습니다.</div>'; return; }
        list.innerHTML = posts.map((item) => `
            <article class="post-card" data-id="${item.id}">
                ${item.image ? `<img src="${escapeAttr(item.image)}" alt="">` : '<div class="post-image-empty">사진 없음</div>'}
                <div class="post-card-body"><span class="badge">${categoryNames[item.category] || '기타'}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>
                <div class="card-actions"><button type="button" data-edit>수정</button><button type="button" class="delete" data-delete>삭제</button></div></div>
            </article>`).join('');
    }

    $('#postList').addEventListener('click', async (event) => {
        const card = event.target.closest('.post-card');
        if (!card) return;
        const item = data.portfolio.find((post) => post.id === card.dataset.id);
        if (event.target.closest('[data-edit]')) openPostEditor(item);
        if (event.target.closest('[data-delete]')) {
            if (!confirm(`'${item.title}' 글과 사진을 삭제할까요?`)) return;
            try {
                data = await request(`/api/admin/portfolio?id=${encodeURIComponent(item.id)}`, { method:'DELETE' });
                renderPosts();
            } catch (error) { alert(error.message); }
        }
    });

    function renderInquiries() {
        const list = $('#inquiryList');
        if (!data.inquiries.length) { list.innerHTML = '<div class="empty-state">아직 접수된 견적 문의가 없습니다.</div>'; return; }
        list.innerHTML = data.inquiries.map((item) => `
            <article class="inquiry-card ${item.status === 'done' ? 'inquiry-done' : ''}" data-id="${item.id}">
                <div class="inquiry-top"><div><h3>${escapeHtml(item.name)} · ${escapeHtml(item.event_type)}</h3><small>${escapeHtml(item.created_at)}</small></div><button type="button" class="outline-button" data-toggle>${item.status === 'done' ? '미처리로 변경' : '상담 완료'}</button></div>
                <div class="inquiry-meta"><span><b>연락처</b><br>${escapeHtml(item.phone)}</span><span><b>이메일</b><br>${escapeHtml(item.email || '-')}</span><span><b>행사일</b><br>${escapeHtml(item.event_date || '-')}</span><span><b>지역</b><br>${escapeHtml(item.location || '-')}</span><span><b>인원</b><br>${escapeHtml(item.attendees || '-')}</span><span><b>예산</b><br>${escapeHtml(item.budget || '-')}</span></div>
                <div class="inquiry-message">${escapeHtml(item.message)}</div>
            </article>`).join('');
    }

    $('#inquiryList').addEventListener('click', async (event) => {
        const card = event.target.closest('.inquiry-card');
        if (!card || !event.target.closest('[data-toggle]')) return;
        const item = data.inquiries.find((entry) => entry.id === card.dataset.id);
        data = await request('/api/admin/inquiry-status', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:item.id,status:item.status === 'done' ? 'new' : 'done'}) });
        renderInquiries();
    });
    $('#refreshInquiries').addEventListener('click', loadData);

    function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }
    function escapeAttr(value='') { return escapeHtml(value); }
    bootstrap();
})();

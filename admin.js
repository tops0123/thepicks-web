(function () {
    'use strict';
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => [...document.querySelectorAll(selector)];
    const categoryNames = { photobooth: '포토부스', game: '게임 키오스크', saju: 'AI 사주' };
    let data = { site: {}, portfolio: [], inquiries: [] };
    let activeCategory = 'all';

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
        const preview = $('#heroPreview');
        if (data.site.hero_image) preview.src = data.site.hero_image; else preview.removeAttribute('src');
    }

    function bindFilePreview(input, preview) {
        input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;
            preview.src = URL.createObjectURL(file);
        });
    }
    bindFilePreview($('#siteForm input[type="file"]'), $('#heroPreview'));
    bindFilePreview($('#postForm input[type="file"]'), $('#postPreview'));

    $('#siteForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        message($('#siteStatus'), '저장 중입니다...');
        try {
            data = await request('/api/admin/site', { method: 'POST', body: new FormData(event.currentTarget) });
            fillSiteForm();
            message($('#siteStatus'), '메인 화면이 저장되었습니다.', 'success');
        } catch (error) { message($('#siteStatus'), error.message, 'error'); }
        finally { button.disabled = false; }
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

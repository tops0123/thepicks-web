(function () {
    'use strict';
    const frameType = document.body.dataset.frameType;
    const gallery = document.getElementById('frameGallery');
    const mainBox = document.getElementById('frameMainImage');
    const pagination = document.getElementById('galleryPagination');
    const previous = document.getElementById('galleryPrev');
    const next = document.getElementById('galleryNext');
    const pageInfo = document.getElementById('galleryPageInfo');
    const pageSize = 9;
    let images = [];
    let currentPage = 1;

    function galleryItem(item, index) {
        const box = document.createElement('div');
        box.className = 'gallery-item';
        const image = document.createElement('img');
        image.src = item.image;
        image.alt = `${document.title.split('|')[0].trim()} 샘플 ${index + 1}`;
        image.loading = 'lazy';
        box.appendChild(image);
        return box;
    }

    function renderGallery() {
        const totalPages = Math.max(1, Math.ceil(images.length / pageSize));
        currentPage = Math.min(currentPage, totalPages);
        const start = (currentPage - 1) * pageSize;
        const visible = images.slice(start, start + pageSize);
        if (visible.length) {
            gallery.replaceChildren(...visible.map((item, index) => galleryItem(item, start + index)));
        } else {
            const empty = document.createElement('div');
            empty.className = 'gallery-empty';
            empty.textContent = '등록된 샘플 사진이 없습니다.';
            gallery.replaceChildren(empty);
        }
        pagination.hidden = images.length <= pageSize;
        pageInfo.textContent = `${currentPage} / ${totalPages}`;
        previous.disabled = currentPage === 1;
        next.disabled = currentPage === totalPages;
    }

    previous.addEventListener('click', () => {
        if (currentPage > 1) { currentPage -= 1; renderGallery(); gallery.scrollIntoView({behavior:'smooth', block:'start'}); }
    });
    next.addEventListener('click', () => {
        if (currentPage * pageSize < images.length) { currentPage += 1; renderGallery(); gallery.scrollIntoView({behavior:'smooth', block:'start'}); }
    });

    fetch('/api/content', {cache:'no-store'})
        .then((response) => response.json())
        .then((content) => {
            const frame = content.frames?.[frameType];
            if (!frame) return;
            if (frame.main_image) {
                const image = document.createElement('img');
                image.src = frame.main_image;
                image.alt = `${document.title.split('|')[0].trim()} 대표 이미지`;
                image.className = 'frame-main-image';
                mainBox.replaceChildren(image);
            }
            images = Array.isArray(frame.gallery) ? frame.gallery.filter((item) => item.image) : [];
            renderGallery();
        })
        .catch(() => {
            // 서버가 아닌 파일 미리보기에서는 기존 안내 영역을 유지합니다.
        });
})();

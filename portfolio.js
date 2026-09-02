(function(){
    const grid=document.getElementById('allPortfolio');
    const filters=document.getElementById('portfolioFilters');
    let items=[];
    let category=new URLSearchParams(location.search).get('category')||'all';
    const esc=(value='')=>String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
    function render(){
        const visible=items.filter(item=>category==='all'||item.category===category);
        filters.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.category===category));
        if(!visible.length){grid.innerHTML='<p class="portfolio-loading">등록된 사진이 없습니다.</p>';return;}
        grid.innerHTML=visible.map(item=>`<article class="port-item"><div class="port-img">${item.image?`<img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy">`:''}<span class="img-placeholder">이미지 준비 중</span></div><div class="port-text"><h4>${esc(item.title)}</h4><p>${esc(item.summary)}</p></div></article>`).join('');
    }
    filters.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;category=button.dataset.category;history.replaceState(null,'',category==='all'?'portfolio.html':`portfolio.html?category=${category}`);render();});
    fetch('/api/content',{cache:'no-store'}).then(response=>response.json()).then(data=>{items=data.portfolio||[];render();}).catch(()=>{grid.innerHTML='<p class="portfolio-loading">관리자 서버를 실행하면 등록된 사진이 표시됩니다.</p>';});
})();

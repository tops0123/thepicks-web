(function () {
    'use strict';
    // 터치 화면(휴대폰·태블릿)에서는 '포토부스'를 처음 누르면 하위 메뉴를 열고, 한 번 더 누르면 이동합니다.
    var touch = window.matchMedia && window.matchMedia('(hover: none)').matches;
    document.querySelectorAll('.dropdown').forEach(function (dropdown) {
        var toggle = dropdown.querySelector('.dropdown-toggle');
        if (!toggle) return;
        toggle.addEventListener('click', function (event) {
            if (!touch) return;
            if (!dropdown.classList.contains('open')) {
                event.preventDefault();
                document.querySelectorAll('.dropdown.open').forEach(function (d) { d.classList.remove('open'); });
                dropdown.classList.add('open');
            }
        });
    });
    document.addEventListener('click', function (event) {
        if (!event.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown.open').forEach(function (d) { d.classList.remove('open'); });
        }
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') document.querySelectorAll('.dropdown.open').forEach(function (d) { d.classList.remove('open'); });
    });
})();

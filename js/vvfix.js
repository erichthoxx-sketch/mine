// iPhone (значок на экране): иногда после клавиатуры, поворота или возврата в приложение телефон неверно считает высоту
// экрана, и нижнее меню «повисает» посередине. Сверяем низ меню с настоящим низом видимой области и, если меню выше,
// опускаем его на разницу (только вниз — над клавиатурой меню не поднимаем). Где всё в порядке, сдвиг 0 и ничего не меняется.
export function keepNavDown() {
  const vv = window.visualViewport;
  if (!vv) return;
  let shift = 0, raf = 0;
  const upd = () => {
    raf = 0;
    const nav = document.querySelector('nav.tabs');
    if (!nav || window.innerWidth >= 1180) { if (shift) { shift = 0; document.documentElement.style.setProperty('--nav-shift', '0px'); } return; }
    const bottom = nav.getBoundingClientRect().bottom - shift;   // где был бы низ меню без сдвига
    const real = vv.offsetTop + vv.height;                       // настоящий низ видимой области
    const next = Math.max(0, Math.round(real - bottom));
    if (Math.abs(next - shift) > 1) { shift = next; document.documentElement.style.setProperty('--nav-shift', shift + 'px'); }
  };
  const later = () => { if (!raf) raf = requestAnimationFrame(upd); };
  vv.addEventListener('resize', later); vv.addEventListener('scroll', later);
  window.addEventListener('scroll', later, { passive: true }); window.addEventListener('resize', later);
  window.addEventListener('orientationchange', () => setTimeout(later, 300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(later, 200); });
  window.addEventListener('pageshow', later);
  setTimeout(later, 500); setInterval(later, 2000);
}

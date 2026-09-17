// mobile-menu.js
// Mobile-only menu behavior:
// - Close the blurred overlay menu when a HOME/LIBRARY/ABOUT link is tapped
// - Scroll to the ABOUT section: its normal anchor (#about) targets a
//   hidden element used only for the desktop/tablet overlay trick, so
//   on mobile we jump to the real, always-visible biography block
//   instead. HOME (href="#") and LIBRARY (href="#lib") both already
//   point at real, always-visible elements, so their native anchor
//   jump works as-is and needs no extra handling.

document.addEventListener('DOMContentLoaded', () => {
  const collapseEl = document.getElementById('navbarSupportedContent');
  if (!collapseEl) return;

  const mqMobile = window.matchMedia('(max-width: 767.98px)');
  const isMobile = () => mqMobile.matches;

  const closeMenu = () => {
    if (!isMobile()) return;
    if (!collapseEl.classList.contains('show')) return;
    if (!window.bootstrap || !window.bootstrap.Collapse) return;
    window.bootstrap.Collapse.getOrCreateInstance(collapseEl).hide();
  };

  // Close the overlay menu on any nav-link click (mobile only)
  collapseEl.querySelectorAll('a.nav-link').forEach((a) => {
    a.addEventListener('click', () => {
      closeMenu();
    });
  });

  // On mobile, redirect ABOUT to the real biography section instead of
  // the hidden #about anchor. Desktop/tablet keep the default behavior.
  const aboutLink = collapseEl.querySelector('a[href="#about"]');
  const aboutView = document.getElementById('about-view');
  if (aboutLink && aboutView) {
    aboutLink.addEventListener('click', (e) => {
      if (!isMobile()) return;
      e.preventDefault();
      aboutView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
});

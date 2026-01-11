// mobile-menu.js
// Mobile-only menu behavior:
// - Close the blurred overlay menu when clicking HOME/LIBRARY/ABOUT
// - Hide the burger button while the Library overlay (#lib) is open on mobile

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

  // Close menu on any nav-link click inside the collapse (mobile overlay)
  collapseEl.querySelectorAll('a.nav-link').forEach((a) => {
    a.addEventListener('click', () => {
      closeMenu();
    });
  });

  // Track Library state: hide burger while #lib is active on mobile
  const syncLibState = () => {
    const libOpen = (location.hash === '#lib');
    document.body.classList.toggle('lib-open', isMobile() && libOpen);
    if (libOpen) closeMenu();
  };

  window.addEventListener('hashchange', syncLibState);
  // Resize/mq changes
  if (mqMobile.addEventListener) mqMobile.addEventListener('change', syncLibState);
  window.addEventListener('resize', syncLibState);

  syncLibState();
});

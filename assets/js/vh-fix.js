// vh-fix.js
// Fix mobile Chrome/iOS browser UI bars cutting content.
// Sets --app-height to the currently visible viewport height.

(function () {
  function setAppHeight() {
    var vv = window.visualViewport;
    var h = vv && vv.height ? vv.height : window.innerHeight;
    // Use px to avoid vh rounding issues
    document.documentElement.style.setProperty('--app-height', Math.round(h) + 'px');
  }

  setAppHeight();

  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', setAppHeight);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppHeight);
    window.visualViewport.addEventListener('scroll', setAppHeight);
  }
})();
(function () {
  function syncHashState() {
    var hashPath = decodeURIComponent(window.location.hash.slice(1));
    document.documentElement.dataset.activeHashPath = hashPath;

    document.querySelectorAll('[data-hash-path]').forEach(function (element) {
      var path = element.getAttribute('data-hash-path');
      var active = hashPath === path || hashPath.indexOf(path + '/') === 0;
      element.toggleAttribute('data-active', active);
    });

    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      // Leave the fumadocs docs TOC anchors alone — fumadocs manages their
      // `data-active` itself, and touching them here causes a hydration mismatch.
      if (anchor.closest('#nd-docs-layout')) {
        return;
      }
      var linkPath = decodeURIComponent(anchor.getAttribute('href').slice(1));
      anchor.toggleAttribute('data-active', linkPath !== '' && linkPath === hashPath);
    });

    var demoTabs = document.querySelectorAll('.demo-tabs a');
    if (demoTabs.length && hashPath.indexOf('demos/') !== 0) {
      demoTabs[0].toggleAttribute('data-active', true);
    }

    if (hashPath) {
      var target = document.getElementById(hashPath);
      if (target) {
        var details = target.tagName === 'DETAILS' ? target : target.querySelector('details');
        if (details) {
          details.open = true;
        }
      }
    }
  }

  function wireCopyButtons() {
    if (!navigator.clipboard) {
      return;
    }
    document.querySelectorAll('[data-copy-target]').forEach(function (button) {
      var source = document.getElementById(button.getAttribute('data-copy-target'));
      if (!source) {
        return;
      }
      document.documentElement.dataset.copyEnhanced = '';
      var label = button.textContent;
      button.addEventListener('click', function () {
        navigator.clipboard.writeText(source.textContent).then(function () {
          button.textContent = 'copied ✓';
          window.setTimeout(function () {
            button.textContent = label;
          }, 1600);
        });
      });
    });
  }

  function wireThemeToggle() {
    var order = ['system', 'light', 'dark'];
    var mode = 'system';
    try {
      var stored = localStorage.getItem('sp-theme');
      if (stored === 'light' || stored === 'dark') {
        mode = stored;
      }
    } catch (error) {}

    function apply() {
      if (mode === 'system') {
        delete document.documentElement.dataset.theme;
      } else {
        document.documentElement.dataset.theme = mode;
      }
      document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
        button.textContent = 'theme:' + mode;
      });
    }

    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        mode = order[(order.indexOf(mode) + 1) % order.length];
        try {
          if (mode === 'system') {
            localStorage.removeItem('sp-theme');
          } else {
            localStorage.setItem('sp-theme', mode);
          }
        } catch (error) {}
        apply();
      });
    });
    apply();
  }

  function init() {
    document.documentElement.dataset.enhanced = '';
    window.addEventListener('hashchange', syncHashState);
    syncHashState();
    wireCopyButtons();
    wireThemeToggle();
  }

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();

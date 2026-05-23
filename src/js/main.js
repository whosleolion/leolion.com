/* LEO LION — Main JS */

/* Nav: scroll state + mobile toggle */
(function () {
  const nav = document.querySelector('.site-nav');
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = toggle.classList.toggle('open');
      links.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    links.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => {
        toggle.classList.remove('open');
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      })
    );
  }

  /* Mark active nav link */
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === window.location.pathname ||
        a.getAttribute('href') === window.location.pathname.replace(/\/$/, '')) {
      a.classList.add('active');
    }
  });
})();

/* Newsletter form */
(function () {
  document.querySelectorAll('.newsletter-form').forEach(form => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      const btn = form.querySelector('button');
      if (!input || !input.value) return;
      btn.textContent = 'Subscribed!';
      btn.style.background = '#22c55e';
      input.value = '';
      input.disabled = true;
      btn.disabled = true;
    });
  });
})();

/* Fade-in on scroll */
(function () {
  const els = document.querySelectorAll('[data-fade]');
  if (!els.length) return;
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    }),
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );
  els.forEach((el, i) => {
    el.style.setProperty('--delay', `${i * 0.07}s`);
    observer.observe(el);
  });
})();

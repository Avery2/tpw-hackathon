// Visual digit reels; assistive technology receives the final formatted value.
export function rollCurrency(element, value) {
  const formatted = value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  element.textContent = '';
  element.classList.add('rolling-currency');
  element.setAttribute('aria-label', formatted);
  const visual = document.createElement('span'); visual.setAttribute('aria-hidden', 'true'); visual.className = 'currency-reels';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animations = [];
  let digitIndex = 0;
  for (const character of formatted) {
    if (!/\d/.test(character)) {
      const symbol = document.createElement('span'); symbol.textContent = character; visual.append(symbol); continue;
    }
    const reel = document.createElement('span'); reel.className = 'currency-reel';
    const strip = document.createElement('span'); strip.className = 'currency-strip';
    const target = Number(character); const steps = 20 + target;
    for (let i = 0; i <= steps; i++) { const digit = document.createElement('span'); digit.textContent = String(i % 10); strip.append(digit); }
    reel.append(strip); visual.append(reel);
    const final = `translateY(-${steps}em)`;
    strip.style.transform = final;
    if (!reduced) animations.push({ strip, final, index: digitIndex });
    digitIndex++;
  }
  element.append(visual);
  if (reduced) return;
  const play = () => {
    for (const { strip, final, index } of animations) {
      strip.animate([{ transform: 'translateY(0)' }, { transform: final }], {
        duration: 1000 + index * 75, delay: index * 45,
        easing: 'cubic-bezier(.15,.75,.2,1)', fill: 'backwards'
      });
    }
  };
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
      observer.disconnect();
      play();
    }
  }, { threshold: 0.5 });
  observer.observe(element);
}

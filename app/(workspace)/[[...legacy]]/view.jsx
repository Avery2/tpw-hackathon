'use client';

import { useEffect, useRef } from 'react';

export default function LegacyView({ css, html }) {
  const host = useRef(null);
  useEffect(() => {
    const root = host.current;
    root.innerHTML = html;
    for (const node of root.querySelectorAll('header, footer')) {
      if (node.parentElement === root) node.remove();
    }
    for (const inert of root.querySelectorAll('script')) {
      const script = document.createElement('script');
      for (const attr of inert.attributes) script.setAttribute(attr.name, attr.value);
      script.textContent = inert.textContent;
      inert.replaceWith(script);
    }
    return () => root.replaceChildren();
  }, [html]);
  return <>
    <style>{css}</style>
    <div ref={host} />
  </>;
}

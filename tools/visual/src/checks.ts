import type { Page } from 'puppeteer-core';

export interface Violation {
  check: string;
  detail: string;
}

/**
 * Measurable layout problems, evaluated inside the page. Each one corresponds to a bug that has shipped
 * before (see the comments), so they are regression checks, not general lint.
 */
function pageChecks(): Violation[] {
  const out: { check: string; detail: string }[] = [];
  const add = (check: string, detail: string): void => void out.push({ check, detail });
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const name = (el: Element): string => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''}`;
  const hasBox = (el: Element): boolean => el.getClientRects().length > 0;

  // The page must not scroll sideways.
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) add('page-overflow-x', `document is ${de.scrollWidth}px wide in a ${vw}px window`);
  const area = document.querySelector('[data-form-area]');
  if (!area) add('no-form-area', 'the form area (data-form-area) was not found');
  if (area && area.scrollWidth > area.clientWidth + 1) add('form-overflow-x', `form content is ${area.scrollWidth}px wide in a ${area.clientWidth}px panel`);

  // Floating panels (dropdown lists, help notes, type picker, Display dialog) must be fully on screen,
  // visible, and not covered by anything (they used to be clipped by the scrolling form).
  for (const p of document.querySelectorAll('[data-placement]')) {
    const r = p.getBoundingClientRect();
    if (getComputedStyle(p).visibility === 'hidden') add('popup-hidden', `${name(p)} is not visible`);
    if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) {
      add('popup-outside-viewport', `${name(p)} spans ${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} in a ${vw}x${vh} window`);
    }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 24));
    if (hit && !p.contains(hit)) add('popup-covered', `${name(p)} is covered by ${name(hit)}`);
    if (p.scrollHeight > p.clientHeight + 1 && getComputedStyle(p).overflowY === 'visible') add('popup-clipped', `${name(p)} content is cut off`);
  }

  // Form controls must be visible. Tailwind's reset removes native borders and backgrounds, which once
  // left the plain skin's text boxes invisible.
  for (const el of (area ?? document.body).querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea, [role=combobox]')) {
    if (!hasBox(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) {
      add('control-collapsed', `${name(el)} is ${Math.round(r.width)}x${Math.round(r.height)}`);
      continue;
    }
    const cs = getComputedStyle(el);
    const border = ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 && cs.getPropertyValue(`border-${s.toLowerCase()}-style`) !== 'none');
    const bg = cs.backgroundColor;
    const filled = bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    if (!border && !filled && cs.boxShadow === 'none') add('control-invisible', `${name(el)} has no border, background or shadow`);
  }

  // Header controls (type picker, Display) must stay on one line; the Display button once wrapped to two.
  // Count lines by vertical overlap, not by top edge: mixed fonts on one line sit a few pixels apart.
  const lineCount = (el: Element): number => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0).sort((a, b) => a.top - b.top);
    const bottoms: number[] = [];
    for (const q of rects) {
      const last = bottoms.length - 1;
      if (last >= 0 && q.top < bottoms[last]! - q.height * 0.5) bottoms[last] = Math.max(bottoms[last]!, q.bottom);
      else bottoms.push(q.bottom);
    }
    return bottoms.length;
  };
  for (const b of document.querySelectorAll('header button')) {
    if (hasBox(b) && lineCount(b) > 1) add('single-line', `${name(b)} wraps onto ${lineCount(b)} lines`);
  }

  // Text must not be clipped inside buttons and labels (content wider than its box, with no ellipsis).
  for (const el of document.querySelectorAll('main button, [data-form-area] button, [data-form-area] label')) {
    if (!hasBox(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflow === 'hidden' && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1) add('text-clipped', `${name(el)} is cut off`);
  }
  return out;
}

export async function runPageChecks(page: Page): Promise<Violation[]> {
  return page.evaluate(pageChecks);
}

// Drag and resize behaviour for the floating panels (AI Study Assistant,
// Speak-in-Japanese tool) and their float buttons. Plain DOM helpers so both
// Svelte components and the remaining hand-built panels can use them; each
// returns a cleanup function that removes its window listeners.

/**
 * Let `element` be dragged around the viewport by pressing on `handle`.
 * @param {HTMLElement} element
 * @param {HTMLElement} handle
 * @returns {() => void} cleanup
 */
export function makeDraggable(element, handle) {
  let isDragging = false;
  let offsetX = 0, offsetY = 0;

  /** @param {MouseEvent} e */
  const onDown = (e) => {
    isDragging = true;
    const rect = element.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    element.style.transition = 'none';
  };
  /** @param {MouseEvent} e */
  const onMove = (e) => {
    if (!isDragging) return;
    element.style.left = (e.clientX - offsetX) + 'px';
    element.style.top = (e.clientY - offsetY) + 'px';
    element.style.bottom = 'auto';
    element.style.right = 'auto';
  };
  const onUp = () => {
    if (isDragging) element.style.transition = '';
    isDragging = false;
  };

  handle.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  return () => {
    handle.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
}

/**
 * Let `panel` be resized by dragging `resizer` (its bottom-right corner).
 * @param {HTMLElement} panel
 * @param {HTMLElement} resizer
 * @param {{ minWidth?: number, minHeight?: number }} [limits]
 * @returns {() => void} cleanup
 */
export function makeResizable(panel, resizer, { minWidth = 280, minHeight = 300 } = {}) {
  let isResizing = false;
  let startWidth = 0, startHeight = 0, startX = 0, startY = 0;

  /** @param {MouseEvent} e */
  const onDown = (e) => {
    isResizing = true;
    e.preventDefault();
    e.stopPropagation();
    startWidth = panel.offsetWidth;
    startHeight = panel.offsetHeight;
    startX = e.clientX;
    startY = e.clientY;
    panel.style.transition = 'none';
  };
  /** @param {MouseEvent} e */
  const onMove = (e) => {
    if (!isResizing) return;
    const width = startWidth + (e.clientX - startX);
    const height = startHeight + (e.clientY - startY);
    if (width > minWidth) panel.style.width = width + 'px';
    if (height > minHeight) panel.style.height = height + 'px';
  };
  const onUp = () => {
    if (isResizing) panel.style.transition = '';
    isResizing = false;
  };

  resizer.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  return () => {
    resizer.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
}

/**
 * Open a floating panel just above-left of its float button, kept on screen.
 * @param {HTMLElement} panel
 * @param {HTMLElement} button
 * @param {{ width: number, height: number }} fallbackSize - used while the panel is still hidden (offset size 0)
 */
export function positionPanelAboveButton(panel, button, fallbackSize) {
  const btnRect = button.getBoundingClientRect();
  panel.style.transition = 'none';
  panel.style.left = (btnRect.right - (panel.offsetWidth || fallbackSize.width)) + 'px';
  panel.style.top = (btnRect.top - (panel.offsetHeight || fallbackSize.height)) + 'px';
  panel.style.bottom = 'auto';
  panel.style.right = 'auto';
  const panelRect = panel.getBoundingClientRect();
  if (panelRect.left < 0) panel.style.left = '10px';
  if (panelRect.top < 0) panel.style.top = '10px';
}

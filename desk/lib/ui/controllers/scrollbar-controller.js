export function initScrollbar(rowScroller) {
  // Fixed-size scrollbar handle; native wheel, touch and keyboard scrolling remain.
  const scrollTrack = document.createElement('div');
  scrollTrack.className = 'registry-scroll-track';
  const scrollThumb = document.createElement('div');
  scrollThumb.className = 'registry-scroll-thumb';
  scrollThumb.tabIndex = 0;
  scrollThumb.setAttribute('role', 'scrollbar');
  scrollThumb.setAttribute('aria-label', 'Scroll orders');
  scrollThumb.setAttribute('aria-controls', 'order-rows');
  scrollThumb.setAttribute('aria-orientation', 'vertical');
  scrollThumb.setAttribute('aria-valuemin', '0');
  scrollTrack.append(scrollThumb);
  rowScroller.closest('.table-scroll').append(scrollTrack);
  let overflow = 0, travel = 0;
  function updatePosition() {
    const position = Math.max(0, Math.min(rowScroller.scrollTop, overflow));
    scrollThumb.style.transform = `translateY(${overflow > 0 ? position / overflow * travel : 0}px)`;
    scrollThumb.setAttribute('aria-valuenow', String(Math.round(position)));
  }
  function updateOrderScrollbar() {
    const containerBounds = rowScroller.closest('.table-scroll').getBoundingClientRect();
    const scrollerBounds = rowScroller.getBoundingClientRect();
    scrollTrack.style.top = `${scrollerBounds.top - containerBounds.top + 10}px`;
    scrollTrack.style.height = `${Math.max(0, rowScroller.clientHeight - 20)}px`;
    scrollTrack.style.bottom = 'auto';
    overflow = rowScroller.scrollHeight - rowScroller.clientHeight;
    scrollTrack.hidden = overflow <= 1;
    const height = Math.min(144, scrollTrack.clientHeight);
    scrollThumb.style.height = `${height}px`;
    travel = Math.max(0, scrollTrack.clientHeight - height);
    scrollThumb.setAttribute('aria-valuemax', String(Math.max(0, overflow)));
    updatePosition();
  }
  rowScroller.addEventListener('scroll', updatePosition, { passive: true });
  new ResizeObserver(updateOrderScrollbar).observe(rowScroller);
  new MutationObserver(updateOrderScrollbar).observe(rowScroller, { childList: true, subtree: true });
  let thumbStartY = 0, thumbStartScroll = 0;
  scrollThumb.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    scrollThumb.classList.add('pointer-focus');
    scrollThumb.focus();
    thumbStartY = event.clientY; thumbStartScroll = rowScroller.scrollTop;
    scrollThumb.setPointerCapture(event.pointerId); scrollTrack.classList.add('dragging');
  });
  scrollThumb.addEventListener('pointermove', event => {
    if (!scrollThumb.hasPointerCapture(event.pointerId)) return;
    const travel = scrollTrack.clientHeight - scrollThumb.clientHeight;
    if (travel > 0) rowScroller.scrollTop = thumbStartScroll + (event.clientY - thumbStartY) / travel * (rowScroller.scrollHeight - rowScroller.clientHeight);
  });
  scrollThumb.addEventListener('pointerup', event => { if (scrollThumb.hasPointerCapture(event.pointerId)) scrollThumb.releasePointerCapture(event.pointerId); });
  scrollThumb.addEventListener('lostpointercapture', () => scrollTrack.classList.remove('dragging'));
  scrollTrack.addEventListener('pointerdown', event => {
    if (event.target !== scrollTrack) return;
    rowScroller.scrollTop += (event.clientY < scrollThumb.getBoundingClientRect().top ? -1 : 1) * rowScroller.clientHeight;
  });
  scrollThumb.addEventListener('blur', () => scrollThumb.classList.remove('pointer-focus'));
  scrollThumb.addEventListener('keydown', event => {
    scrollThumb.classList.remove('pointer-focus');
    const movements = { ArrowDown: 40, ArrowUp: -40, PageDown: rowScroller.clientHeight, PageUp: -rowScroller.clientHeight, Home: -Infinity, End: Infinity };
    if (!(event.key in movements)) return;
    event.preventDefault();
    rowScroller.scrollTop = event.key === 'Home' ? 0 : event.key === 'End' ? rowScroller.scrollHeight : rowScroller.scrollTop + movements[event.key];
  });
  updateOrderScrollbar();
}

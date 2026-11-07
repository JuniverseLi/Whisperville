// A tap selects a resident; a captured pointer drag only moves the observer camera.
export function attachCameraControls(
  canvas,
  { enabled, onTap, onPanStart, onPan, onZoom, onChange },
) {
  let gesture = null;
  const finish = () => {
    const previous = gesture;
    gesture = null;
    canvas.dataset.dragging = 'false';
    if (previous && canvas.hasPointerCapture?.(previous.id))
      canvas.releasePointerCapture(previous.id);
    return previous;
  };
  const down = (event) => {
    if (
      !enabled() ||
      gesture ||
      event.isPrimary === false ||
      (event.button !== 0 && event.button !== 1)
    )
      return;
    event.preventDefault();
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      dragged: false,
    };
    canvas.setPointerCapture?.(event.pointerId);
  };
  const move = (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (!enabled()) {
      finish();
      return;
    }
    if (!gesture.dragged) {
      if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6) return;
      gesture.dragged = true;
      canvas.dataset.dragging = 'true';
      onPanStart();
      onChange?.('drag');
    }
    event.preventDefault();
    onPan(event.clientX - gesture.x, event.clientY - gesture.y);
    gesture.x = event.clientX;
    gesture.y = event.clientY;
  };
  const up = (event) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const previous = finish();
    if (!previous.dragged && enabled()) onTap(event);
  };
  const cancel = (event) => {
    if (gesture?.id === event.pointerId) finish();
  };
  const wheel = (event) => {
    if (!enabled()) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const delta =
      event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
    onZoom(
      Math.exp(-Math.max(-400, Math.min(400, delta)) * 0.002),
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    onChange?.('zoom');
  };
  const listeners = {
    pointerdown: down,
    pointermove: move,
    pointerup: up,
    pointercancel: cancel,
    lostpointercapture: cancel,
    wheel,
  };
  for (const [name, listener] of Object.entries(listeners))
    canvas.addEventListener(name, listener, { passive: false });
  return () => {
    finish();
    for (const [name, listener] of Object.entries(listeners))
      canvas.removeEventListener(name, listener);
  };
}

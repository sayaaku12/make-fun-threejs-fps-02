// Input: keyboard state, mouse-look deltas and pointer lock, plus edge
// triggers for keys the game reads once (buy menu, grenade, plant).
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set(); // keys pressed since the last consume()
  let lookX = 0;
  let lookY = 0;
  let firing = false;
  let locked = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    pressed.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }
  function onKeyUp(event) { keys.delete(event.code); }
  function onMouseMove(event) {
    if (!locked) return;
    lookX += event.movementX || 0;
    lookY += event.movementY || 0;
  }
  function onMouseDown(event) {
    if (event.button === 0) {
      firing = true;
      pressed.add('MouseDown');
    }
  }
  function onMouseUp(event) {
    if (event.button === 0) firing = false;
  }
  function onLock() {
    locked = document.pointerLockElement === canvas;
    if (!locked) firing = false;
    onLockChange(locked);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);

  return {
    keys,
    get firing() { return firing && locked; },
    get locked() { return locked; },
    requestLock() { canvas.requestPointerLock(); },
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    // True once for a key pressed since the last call; the game consumes it.
    consume(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    clearPressed() { pressed.clear(); },
  };
}

import assert from 'node:assert/strict';

const GAME_RATIO = 480 / 720;
const viewports = [
  { name: 'petit smartphone portrait', width: 320, height: 568 },
  { name: 'smartphone portrait', width: 390, height: 844 },
  { name: 'smartphone paysage', width: 844, height: 390 },
  { name: 'tablette portrait', width: 768, height: 1024 },
  { name: 'tablette paysage', width: 1024, height: 768 },
  { name: 'ordinateur portable', width: 1366, height: 768 },
  { name: 'grand écran', width: 1920, height: 1080 },
];

const controls = [
  { name: 'joystick', width: 132, height: 132, left: 12, bottom: 14 },
  { name: 'action', width: 88, height: 88, right: 14, bottom: 14 },
  { name: 'dash', width: 64, height: 64, right: 18, bottom: 112 },
  { name: 'switch', width: 58, height: 58, right: 18, bottom: 186 },
];

function intersects(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left
    && a.top < b.top + b.height && a.top + a.height > b.top;
}

for (const viewport of viewports) {
  // Mirrors the min-width/min-height fit used by .game-frame; the CSS aspect ratio remains 2:3.
  const frameWidth = Math.min(viewport.width, viewport.height * GAME_RATIO);
  const frameHeight = Math.min(viewport.height, viewport.width / GAME_RATIO);
  assert.ok(frameWidth <= viewport.width && frameHeight <= viewport.height, `${viewport.name}: frame must fit`);
  assert.ok(Math.abs(frameWidth / frameHeight - GAME_RATIO) < 0.001, `${viewport.name}: canvas ratio must remain 2:3`);

  const boxes = controls.map(control => ({
    ...control,
    left: control.left ?? viewport.width - control.right - control.width,
    top: viewport.height - control.bottom - control.height,
  }));
  const frameLeft = (viewport.width - frameWidth) / 2;
  const frameTop = (viewport.height - frameHeight) / 2;
  const hudWidth = Math.min(190, frameWidth * 0.54);
  const activeHud = {
    name: 'active-player HUD', left: frameLeft + 8, top: frameTop + frameHeight - 160 - 82, width: hudWidth, height: 82,
  };
  const shotHud = {
    name: 'shot-power HUD', left: frameLeft + 8, top: frameTop + frameHeight - 256 - 44, width: hudWidth, height: 44,
  };
  assert.ok(!intersects(activeHud, shotHud), `${viewport.name}: HUD cards must not overlap`);
  for (const hud of [activeHud, shotHud]) {
    for (const control of boxes) {
      assert.ok(!intersects(hud, control), `${viewport.name}: ${hud.name} overlaps ${control.name}`);
    }
  }
  for (const box of boxes) {
    assert.ok(box.left >= 0 && box.top >= 0, `${viewport.name}: ${box.name} must not overflow`);
    assert.ok(box.left + box.width <= viewport.width && box.top + box.height <= viewport.height,
      `${viewport.name}: ${box.name} must stay on-screen`);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      assert.ok(!intersects(boxes[i], boxes[j]), `${viewport.name}: ${boxes[i].name} overlaps ${boxes[j].name}`);
    }
  }
}

console.log(`Responsive layout checks passed: ${viewports.map(viewport => viewport.name).join(', ')}.`);

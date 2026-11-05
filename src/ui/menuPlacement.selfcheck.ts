import assert from "node:assert/strict";

const { menuLeft, menuPlacement, menuSide, triggerBox, unscaledBox } = await import("@/ui/menuPlacement");

const viewportHeight = 800;

// -- Happy paths --------------------------
{
  assert.deepEqual(
    menuPlacement({ triggerTop: 100, triggerBottom: 132, menuHeight: 200, viewportHeight }),
    { placement: "below", top: 136, maxHeight: 656 },
    "room below: opens below with a 4px gap"
  );
  assert.deepEqual(
    menuPlacement({ triggerTop: 700, triggerBottom: 732, menuHeight: 200, viewportHeight }),
    { placement: "above", top: 496, maxHeight: 688 },
    "no room below, room above: opens above with a 4px gap"
  );
}

// -- Edge cases --------------------------
{
  assert.deepEqual(
    menuPlacement({ triggerTop: 500, triggerBottom: 532, menuHeight: 1000, viewportHeight }),
    { placement: "above", top: 8, maxHeight: 488 },
    "fits neither side: top clamps to the viewport margin"
  );
  assert.deepEqual(
    menuPlacement({ triggerTop: 200, triggerBottom: 232, menuHeight: 1000, viewportHeight }),
    { placement: "below", top: 236, maxHeight: 556 },
    "fits neither side, more room below: stays below"
  );
  assert.deepEqual(
    menuPlacement({ triggerTop: -40, triggerBottom: -8, menuHeight: 100, viewportHeight }),
    { placement: "below", top: 8, maxHeight: 784 },
    "trigger scrolled above the viewport: top never goes above the margin"
  );
  assert.deepEqual(
    menuPlacement({ triggerTop: 100, triggerBottom: 132, menuHeight: 0, viewportHeight }),
    { placement: "below", top: 136, maxHeight: 656 },
    "empty menu opens below"
  );
}

// -- Invariants --------------------------
{
  for (const triggerTop of [0, 50, 390, 760, 900]) {
    const { top } = menuPlacement({ triggerTop, triggerBottom: triggerTop + 32, menuHeight: 300, viewportHeight });
    assert.ok(top >= 8, `top ${top} stays inside the margin for trigger at ${triggerTop}`);
  }
  for (const triggerTop of [0, 50, 390, 760, 900]) {
    for (const menuHeight of [120, 600, 2000]) {
      const { top, maxHeight } = menuPlacement({
        triggerTop,
        triggerBottom: triggerTop + 32,
        menuHeight,
        viewportHeight,
      });
      assert.ok(
        top + Math.min(menuHeight, maxHeight) <= viewportHeight - 8,
        `menu of ${menuHeight}px at trigger ${triggerTop} ends inside the viewport`
      );
    }
  }
}

// -- Regressions --------------------------
{
  const shortWindow = 300;
  const below = menuPlacement({ triggerTop: 40, triggerBottom: 72, menuHeight: 600, viewportHeight: shortWindow });
  assert.deepEqual(below, { placement: "below", top: 76, maxHeight: 216 }, "regression: tall menu is capped below");
  const above = menuPlacement({ triggerTop: 240, triggerBottom: 272, menuHeight: 600, viewportHeight: shortWindow });
  assert.deepEqual(above, { placement: "above", top: 8, maxHeight: 228 }, "regression: tall menu is capped above");
}

// -- Horizontal placement --------------------------
{
  const viewportWidth = 1000;
  assert.equal(
    menuSide({ triggerLeft: 100, triggerRight: 200, viewportWidth }),
    "start",
    "a trigger on the left opens toward the right"
  );
  assert.equal(
    menuSide({ triggerLeft: 800, triggerRight: 900, viewportWidth }),
    "end",
    "a trigger on the right opens toward the left"
  );
  assert.equal(
    menuLeft({ triggerLeft: 100, triggerRight: 200, menuWidth: 240, viewportWidth }),
    100,
    "start side aligns to the trigger's left edge"
  );
  assert.equal(
    menuLeft({ triggerLeft: 800, triggerRight: 900, menuWidth: 240, viewportWidth }),
    660,
    "end side aligns to the trigger's right edge"
  );
  assert.equal(
    menuLeft({ triggerLeft: 480, triggerRight: 499, menuWidth: 600, viewportWidth }),
    392,
    "a start-side menu that would overflow the right edge clamps inside the viewport"
  );
  assert.equal(
    menuLeft({ triggerLeft: 20, triggerRight: 60, menuWidth: 1200, viewportWidth }),
    8,
    "a menu wider than the viewport clamps to the margin"
  );
  assert.equal(
    menuLeft({ triggerLeft: 940, triggerRight: 999, menuWidth: 995, viewportWidth }),
    8,
    "an end-side menu never goes past the left margin"
  );
}

// -- Unscaled trigger box --------------------------
{
  const rest = { left: 28, top: 60, right: 1122, bottom: 98 };
  assert.deepEqual(unscaledBox(rest, { width: 1094, height: 38 }), rest, "an unscaled trigger keeps its rect");

  const pressedWidth = 1094 * 0.96;
  const pressedHeight = 38 * 0.96;
  const pressed = {
    left: 575 - pressedWidth / 2,
    top: 79 - pressedHeight / 2,
    right: 575 + pressedWidth / 2,
    bottom: 79 + pressedHeight / 2,
  };
  assert.deepEqual(
    unscaledBox(pressed, { width: 1094, height: 38 }),
    rest,
    "regression: a trigger pressed to scale 0.96 measures at its rest size, not 4% narrower and inset"
  );
}

{
  const pressedTrigger = {
    offsetWidth: 383,
    offsetHeight: 38,
    getBoundingClientRect: () => ({ left: 454.15, top: 100.76, right: 821.35, bottom: 137.24 }),
  };
  assert.deepEqual(
    triggerBox(pressedTrigger),
    { left: 446.25, top: 100, right: 829.25, bottom: 138, width: 383 },
    "regression: triggerBox pairs the scaled rect with the layout size, so a mid-press trigger still sizes the menu at rest"
  );
}

console.log("menuPlacement self-check passed");

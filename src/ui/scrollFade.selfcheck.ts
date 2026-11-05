import assert from "node:assert/strict";

const { fadeEdges, fadeInlineEdges, inlineWheelStep } = await import("@/ui/scrollFade");

{
  assert.deepEqual(
    fadeEdges({ scrollTop: 0, clientHeight: 100, scrollHeight: 100 }),
    { top: false, bottom: false },
    "fits: no fade"
  );
  assert.deepEqual(
    fadeEdges({ scrollTop: 0, clientHeight: 100, scrollHeight: 300 }),
    { top: false, bottom: true },
    "at top: bottom fade only"
  );
  assert.deepEqual(
    fadeEdges({ scrollTop: 200, clientHeight: 100, scrollHeight: 300 }),
    { top: true, bottom: false },
    "at end: top fade only"
  );
  assert.deepEqual(
    fadeEdges({ scrollTop: 50, clientHeight: 100, scrollHeight: 300 }),
    { top: true, bottom: true },
    "middle: both"
  );
}

// -- Edge cases: sub-pixel scroll positions from zoom --------------------------
{
  assert.deepEqual(
    fadeEdges({ scrollTop: 0.6, clientHeight: 100, scrollHeight: 300 }),
    { top: false, bottom: true },
    "sub-pixel top counts as top"
  );
  assert.deepEqual(
    fadeEdges({ scrollTop: 199.4, clientHeight: 100, scrollHeight: 300 }),
    { top: true, bottom: false },
    "sub-pixel end counts as end"
  );
}

// -- Inline axis --------------------------
{
  const metrics = { clientWidth: 100, scrollWidth: 300 };
  assert.deepEqual(
    fadeInlineEdges({ ...metrics, scrollLeft: 0 }),
    { start: false, end: true },
    "ltr at start: end fade only"
  );
  assert.deepEqual(
    fadeInlineEdges({ ...metrics, scrollLeft: 200 }),
    { start: true, end: false },
    "ltr at end: start fade only"
  );
  assert.deepEqual(fadeInlineEdges({ ...metrics, scrollLeft: 80 }), { start: true, end: true }, "ltr middle: both");
  assert.deepEqual(
    fadeInlineEdges({ ...metrics, scrollLeft: 0 }, true),
    { start: false, end: true },
    "rtl at start: end fade only"
  );
  assert.deepEqual(
    fadeInlineEdges({ ...metrics, scrollLeft: -200 }, true),
    { start: true, end: false },
    "rtl at end: start fade only"
  );
  assert.deepEqual(
    fadeInlineEdges({ ...metrics, scrollLeft: -80 }, true),
    { start: true, end: true },
    "rtl middle: both"
  );
  assert.deepEqual(
    fadeInlineEdges({ clientWidth: 300, scrollWidth: 300, scrollLeft: 0 }),
    { start: false, end: false },
    "fits: no fade"
  );
  assert.deepEqual(
    fadeInlineEdges({ ...metrics, scrollLeft: 199.4 }),
    { start: true, end: false },
    "sub-pixel end counts as end"
  );
}

// -- Inline wheel --------------------------
{
  const metrics = { clientWidth: 100, scrollWidth: 300 };
  const down = { deltaX: 0, deltaY: 100, deltaMode: 0 };
  const up = { deltaX: 0, deltaY: -100, deltaMode: 0 };
  assert.equal(inlineWheelStep(down, { ...metrics, scrollLeft: 0 }), 100, "wheel down at start scrolls forward");
  assert.equal(inlineWheelStep(up, { ...metrics, scrollLeft: 80 }), -100, "wheel up mid-strip scrolls back");
  assert.equal(inlineWheelStep(up, { ...metrics, scrollLeft: 0 }), null, "wheel up at start leaves the page to scroll");
  assert.equal(
    inlineWheelStep(down, { ...metrics, scrollLeft: 200 }),
    null,
    "wheel down at end leaves the page to scroll"
  );
  assert.equal(inlineWheelStep(down, { ...metrics, scrollLeft: 199.4 }), null, "sub-pixel end counts as end");
  assert.equal(inlineWheelStep(up, { ...metrics, scrollLeft: 200 }), -100, "wheel up at end scrolls back");
  assert.equal(
    inlineWheelStep({ deltaX: 0, deltaY: 3, deltaMode: 1 }, { ...metrics, scrollLeft: 0 }),
    48,
    "line-mode deltas convert to pixels"
  );
  assert.equal(
    inlineWheelStep({ deltaX: 0, deltaY: 1, deltaMode: 2 }, { ...metrics, scrollLeft: 0 }),
    100,
    "page-mode deltas scale by the strip width"
  );
  assert.equal(
    inlineWheelStep({ deltaX: 0, deltaY: -1, deltaMode: 2 }, { ...metrics, scrollLeft: 0 }, true),
    null,
    "rtl page-mode wheel up at start leaves the page"
  );
  assert.equal(
    inlineWheelStep({ deltaX: 0, deltaY: 1, deltaMode: 2 }, { ...metrics, scrollLeft: 0 }, true),
    -100,
    "rtl page-mode wheel down scrolls toward the end by one strip width"
  );
  assert.equal(
    inlineWheelStep({ ...down, ctrlKey: true }, { ...metrics, scrollLeft: 0 }),
    null,
    "ctrl+wheel is left to the browser for zoom"
  );
  assert.equal(
    inlineWheelStep({ deltaX: 40, deltaY: 10, deltaMode: 0 }, { ...metrics, scrollLeft: 0 }),
    null,
    "horizontal wheel is left to the browser"
  );
  assert.equal(
    inlineWheelStep({ deltaX: 0, deltaY: 0, deltaMode: 0 }, { ...metrics, scrollLeft: 0 }),
    null,
    "zero delta does nothing"
  );
  assert.equal(
    inlineWheelStep(down, { clientWidth: 300, scrollWidth: 300, scrollLeft: 0 }),
    null,
    "a strip that fits never takes the wheel"
  );
  assert.equal(
    inlineWheelStep(down, { ...metrics, scrollLeft: 0 }, true),
    -100,
    "rtl wheel down scrolls toward the end"
  );
  assert.equal(
    inlineWheelStep(down, { ...metrics, scrollLeft: -200 }, true),
    null,
    "rtl at end leaves the page to scroll"
  );
  assert.equal(inlineWheelStep(up, { ...metrics, scrollLeft: -200 }, true), 100, "rtl wheel up at end scrolls back");
  assert.equal(inlineWheelStep(up, { ...metrics, scrollLeft: 0 }, true), null, "rtl wheel up at start leaves the page");
}

console.log("scrollFade self-check passed");

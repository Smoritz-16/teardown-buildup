# Teardown: V10 engine & Daytona chronograph

Two interactive 3D teardowns, each one offline HTML page, plus a landing page (`index.html`).

- **[V10 · Huracán 5.2](v10.html)**: a 90° V10 with glass liners. Bore 84.5 mm, stroke 92.8 mm, 154 mm rods, 12.5:1 compression. Five shared crankpins 72° apart; firing order 1-6-5-10-2-7-3-8-4-9, so power strokes come 90° then 54° apart. Cutaways, isolate, cylinder tracking, live valve timing and a P–V diagram.
- **[Daytona · Calibre 4131](daytona.html)**: a self-winding column-wheel chronograph seen from the case back. 4 Hz (28,800 vph), ~72 h reserve, 47 jewels. The balance, escapement, train, mainspring, column wheel, vertical clutch and reset hammer all run from one input (the movement's own time). Start/stop/reset, x-ray, explode, slow motion, and a draggable crown that winds it.

Left alone, each page tours itself. Any click, drag or key hands control to you, and 25 s of quiet hands it back.

## Build from source
Built with the [teardown](https://github.com/elvarofficial/teardown) kit (MIT):

```
git clone --depth 1 https://github.com/elvarofficial/teardown.git && cd teardown && npm install
cp -r ../src/* sims/
node sims/build.mjs v10-live daytona-live   # → teardown-out/dist/*.html
```

The V10 is adapted from the kit's V8 example. The watch movement is an original study model: its published figures are real, while its tooth counts are illustrative (the ratios, ×16 to the fourth wheel and ×60 to the centre wheel, are the real ones). Not affiliated with Lamborghini, Audi or Rolex.

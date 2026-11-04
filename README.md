# MEKORA WebGL cinematic site

Vite + Three.js procedural prototype. The cinematic block is one sticky WebGL canvas driven by normalized scroll progress `0..5`. It contains separate meshes for motor, contact layer, mounting plate, Core and four screws; camera keyframes move between six detail shots and component transforms are reversible on scroll back.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Production build: `npm run build`.

The geometry is a demonstrative concept, not CAD. Replace procedural meshes with approved GLB/CAD assets when available. Main editing points: `src/main.js` (`anchors`, `scenes`, procedural mesh dimensions and scroll timeline), `src/style.css` (tokens and layout), and `index.html` (secondary content).

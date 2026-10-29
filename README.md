# SCENTÁLA

**Wear your scent.** A cinematic, scroll-driven storefront for SCENTÁLA — a student-run
business (AdNU SABM) making plant-based wax-bead bracelets that carry fine fragrance on
the skin instead of alcohol mists.

Built with [Three.js](https://threejs.org/) and Vite. Every visual is generated in code:
the bracelet and its wax beads, the kraft packaging, the procedural arm the bracelet is
worn on (a signed-distance-field hand meshed with Marching Cubes), the collection
medallions, the gold particle stream and the studio lighting. No image or 3D-model assets
are required.

## The experience

- **Hero → collections.** The bracelet arrives, then the Zest, Crème and Oake medallions
  flow in and dissolve into the beads as the scent-infusion gauge fills.
- **Packaging beats.** The bracelet is laid into its plant-based kraft box, the lid closes,
  then lifts slowly with the scroll.
- **On the wrist.** The bracelet comes out of the box and settles onto the wrist.
- **The shop.** Choose from eight scents. Add one and watch it arc into the kraft bag docked
  bottom-right — the bag fills bead by bead, the badge pops, and the peek drawer lets you
  review, remove and total your order.

## Develop

```bash
npm install
npm run dev      # http://127.0.0.1:5190
npm run build    # → dist/
npm run preview  # http://127.0.0.1:5191
```

## Deploy

Deployable to [Vercel](https://vercel.com) as a static Vite site — no configuration needed
(`vercel.json` is included). Import the repository, or:

```bash
npx vercel        # preview
npx vercel --prod # production
```

## Project layout

```
index.html      page structure (hero, collections, packaging beats, shop, bag, peek drawer)
main.js         boot, camera choreography, scroll beats, shop + bag-fill interaction
bracelet.js     the ring of nine wax beads, built to the SCENTÁLA mark
mark.js         the mark, shared by the bracelet, the lid print and the label cards
packaging.js    the plant-based kraft box and its lid print
hand.js         the procedural arm/hand (SDF + Marching Cubes)
stream.js       the gold particle stream that infuses each bead
floor.js        the reflective floor and contact shadow
style.css       the editorial layout
src/core/       shared engine (renderer + HDR post stack, input, scroll, UI, textures, reflection)
```

## Licence

MIT.

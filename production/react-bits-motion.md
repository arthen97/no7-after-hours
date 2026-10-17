# React Bits motion adaptations

Native DOM adaptations for the existing vanilla JS game:

- AnimatedContent: staggered entrance with opacity, translation and blur — https://reactbits.dev/animations/animated-content
- TiltedCard: damped pointer-driven poster tilt and light response; selection wheel stays stable — https://reactbits.dev/components/tilted-card
- ClickSpark: short radial feedback on entrance, music and interaction buttons — https://reactbits.dev/animations/click-spark
- OptionWheel: curved drag/wheel/keyboard character selection — https://reactbits.dev/components/option-wheel

Sources: official `reactbits.dev/r/*-JS-CSS.json` registry. Copyright (c) 2026 David Haz; terms retained in `public/licenses/react-bits.txt`. React Bits is not vendored as a React runtime; effects are adapted to the DOM architecture. Reduced-motion preference disables entrance/tilt/sparks; poster requests are preloaded and discard stale results.

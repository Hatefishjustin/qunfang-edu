# Web UI design contract

All new or modified interfaces in this directory must use the design system in
`DESIGN_SYSTEM.md` and the semantic styles defined in `src/index.css`.

- Wrap desktop application areas with `app-design-shell`, `app-design-header`,
  and `app-design-main`.
- Use `mobile-liquid-shell`, `mobile-liquid-header`, and `mobile-liquid-page`
  for teacher, parent, and student mobile views.
- Use the shared `card`, `card-interactive`, `table-container`, `input`, `select`,
  `btn-*`, `nav-tab*`, `modal-glass`, and `toast-glass` styles before adding page CSS.
- Do not introduce pure-white cards or page-local glass colors, blur values,
  shadows, radii, or motion curves. Add or tune a `--ds-*` token instead.
- Keep content surfaces off-white. Reserve Liquid Glass for navigation, controls,
  compact cards, overlays, and elevated actions.
- New motion must use the existing StyleKit-derived enter and control motion
  tokens and must respect `prefers-reduced-motion`.
- Preserve business behavior while changing presentation. Do not couple design
  tokens to data, permissions, routing, or request logic.


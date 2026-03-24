# Design System: High-End Editorial & Organic Tech

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Architect."** We are moving beyond the standard SaaS "blue-and-white" template to create a space that feels engineered yet fluid—combining the precision of fintech with the breathing room of a luxury editorial magazine.

The system rejects the "boxed-in" nature of traditional web design. Instead of rigid grids and heavy borders, we utilize **Intentional Asymmetry** and **Tonal Depth**. By overlapping elements and using extreme shifts in typographic scale, we guide the user’s eye through a narrative flow rather than a functional list. The goal is a UI that feels "grown" and "curated," not just "built."

---

### 2. Colors & Surface Philosophy
Our palette centers on deep architectural indigos (`#161C28`) and ethereal violets (`#7B63DB`), grounded by a surgical off-white (`#F8F8FC`).

#### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders for sectioning or containment. Traditional borders create visual noise and "trap" the content. In this design system, boundaries are defined strictly through background color shifts.
*   *Example:* A `surface-container-low` section sitting directly on a `surface` background. The transition of color is the boundary.

#### Surface Hierarchy & Nesting
Treat the UI as a physical stack of premium materials. Use the `surface-container` tiers to define importance:
*   **Surface (Base):** The canvas.
*   **Surface-Container-Low:** Subtle recession for secondary content areas.
*   **Surface-Container-Highest:** For high-priority interactive components like cards or modals, creating a "lifted" feel.

#### The "Glass & Gradient" Rule
To inject "soul" into the tech-heavy palette:
*   **Glassmorphism:** Use semi-transparent `surface` colors with a `backdrop-blur` (12px–20px) for floating navigation and top-level headers.
*   **Signature Gradients:** Use a subtle linear gradient from `primary` (#5534C6) to `primary_container` (#6E51E0) for Hero CTAs and high-impact data visualizations. This adds a tactile, three-dimensional quality that flat hex codes lack.

---

### 3. Typography: The Editorial Voice
We use a high-contrast pairing to establish an authoritative hierarchy.

*   **Display & Headlines (Manrope):** This is our "Architectural" font. Use `display-lg` (3.5rem) with tight letter-spacing (-0.02em) for hero moments. The generous x-height of Manrope conveys stability and modernism.
*   **Body & Labels (Inter):** This is our "Functional" font. Inter provides maximum legibility at smaller scales. Use `body-md` (0.875rem) for general prose to maintain a sophisticated, airy feel.

**Identity Logic:** By setting large, bold headlines against smaller, widely-spaced labels (`label-md`), we mimic the layout of a high-end broadsheet, signaling trust and intellectual depth.

---

### 4. Elevation & Depth
In this system, elevation is a product of light and shadow, not lines.

*   **The Layering Principle:** Depth is achieved by "stacking." Place a `surface-container-lowest` (#FFFFFF) card on a `surface-container-low` (#F3F3F7) background. This creates a soft, natural lift.
*   **Ambient Shadows:** For floating elements (Modals/Dropdowns), use "Atmospheric Shadows."
    *   *Blur:* 40px–60px.
    *   *Opacity:* 4%–8%.
    *   *Color:* Use a tinted version of `on-surface` (Deep Indigo) rather than pure black to keep the shadows feeling "airy."
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline_variant` token at **15% opacity**. Never use 100% opaque strokes.
*   **Glassmorphism:** Apply a 60% opacity to `surface_container_lowest` for elements that need to feel integrated into the background rather than pasted on top.

---

### 5. Components

#### Buttons
*   **Primary:** Gradient fill (`primary` to `primary_container`), white text, `md` (0.75rem) roundedness. No border.
*   **Secondary:** `surface_container_high` background with `on_surface` text.
*   **Tertiary:** Transparent background, `primary` text, with a subtle underline appearing only on hover.

#### Cards & Lists
*   **Constraint:** Forbid divider lines.
*   **Execution:** Use `spacing-8` (2rem) of vertical white space to separate list items. For cards, use background color shifts (e.g., `surface_container_lowest` cards on a `surface_container_low` track).

#### Input Fields
*   **Style:** Minimalist. No bottom line or full box. Use a `surface_container_highest` background with a `sm` (0.25rem) corner radius.
*   **Focus State:** A soft 2px glow using `primary` at 20% opacity.

#### Signature Component: "The Feature Reveal"
A large-scale card using `surface_bright` with an asymmetrical layout—text-heavy on the left, with an overlapping image or data-viz element breaking the container's "edge" on the right.

---

### 6. Do’s and Don’ts

#### Do
*   **Do** use extreme white space (`spacing-20` or `spacing-24`) to separate major narrative blocks.
*   **Do** use asymmetrical margins (e.g., a wider left margin than right) to create an editorial feel.
*   **Do** use "Tonal Layering" to create hierarchy before reaching for a shadow.

#### Don’t
*   **Don’t** use 1px solid borders to separate content. It breaks the "Organic Tech" flow.
*   **Don’t** use pure black (#000000) for text; use `on_surface` (#1A1C1F) to maintain visual softness.
*   **Don’t** use standard "drop shadows" (e.g., 2px blur, 50% opacity). They feel dated and heavy.
*   **Don’t** center-align long blocks of text. Keep it left-aligned to maintain the architectural "grid" look.

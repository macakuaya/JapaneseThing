<script lang="ts">
  // Panzer, from panzer.svg at the repo root.
  //
  // Inlined rather than loaded as an <img> for one reason: the original had
  // stroke="white" baked in, which would have gone invisible in the light
  // theme. Drawn with currentColor it inherits whatever colour the thing
  // around it is using, and follows the theme for free.
  //
  // Purely decorative, so it is hidden from screen readers — announcing "dog"
  // next to the home button would make it a thing to deal with rather than a
  // thing to notice.
</script>

<svg
  class="panzer"
  viewBox="0 0 36 31"
  fill="none"
  aria-hidden="true"
  focusable="false"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M5.67339 13.5106H17.7284C19.7673 13.5106 21.5748 12.1988 22.2069 10.2604L23.353 4.26052L28.0909 7.56444H28.8603L33.3958 4.26048L34.5687 11.6138C35.4238 16.9741 30.0961 21.2128 25.0651 19.1748L26.9398 29.7741L23.5501 24.062L22.6592 24.2888C18.1117 25.4469 13.3456 25.4387 8.80216 24.2651L7.92878 29.7741C6.61009 20.0113 -2.08178 10.2365 2.68707 3.44118C6.79857 -2.41748 14.9551 3.44136 8.80221 8.75136"
    stroke="currentColor"
    stroke-width="2"
    stroke-linejoin="round"
  />
  <path
    d="M2.90814 22.4006L1.00005 29.8541"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M19.1831 27.5962L18.3236 29.7739"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>

<style>
  .panzer {
    height: 1.05rem;
    width: auto;
    /* Optical, not geometric: the drawing's mass sits low, so aligning its box
       to the kanji's box leaves it looking like it is falling off. */
    margin-bottom: -0.1rem;
  }
</style>

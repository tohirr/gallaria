class Masonry extends HTMLElement {
  layoutTimeout;

  constructor() {
    super();

    this.setCols = this.setCols.bind(this);
    this.layout = this.layout.bind(this);
    this.handleResize = this.handleResize.bind(this);
  }

  // Set the --cols css var
  setCols() {
    const w = this.offsetWidth;

    // Choosing number of columns based on the width of the masonry-grid element
    const cols =
      w > 1200 ? 7 : w > 1000 ? 6 : w > 800 ? 5 : w > 500 ? 4 : w > 300 ? 2 : 1;

    this.style.setProperty("--cols", String(cols));
  }

  layout() {
    this.setCols();

    const blocks = Array.from(document.querySelectorAll("masonry-grid > *"));

    // Number of columns
    const cols = Number(this.style.getPropertyValue("--cols"));

    // Each columns height
    const colHeights = Array(cols).fill(0);

    // Number of blocks in each column
    const colBlockCounts = Array(cols).fill(0);

    for (let i = 0; i < blocks.length; i++) {
      // Get the column index of the shortest column
      const min = Math.min(...colHeights);
      const colIdx = colHeights.indexOf(min);

      // Add this block to the shortest column by setting --col-i
      blocks[i].style.setProperty("--col-i", String(colIdx));

      // Update the number of blocks in this column
      colBlockCounts[colIdx]++;

      // Update `top` on this block
      blocks[i].style.setProperty(
        "top",
        `calc(${min}px + (var(--gap, var(--default-gap)) * ${
          colBlockCounts[colIdx] - 1
        }))`
      );

      // Update the height of this column
      colHeights[colIdx] += blocks[i].offsetHeight;

      // Update the height of the masonry-grid element so that it's equal
      // to the height of the tallest column
      const max = Math.max(...colHeights);
      this.style.setProperty("height", `${max}px`);
    }
  }

  handleResize() {
    // Throttle the layout method on window resize
    if (!this.layoutTimeout) {
      this.layoutTimeout = setTimeout(() => {
        this.layout();
        this.layoutTimeout = null;
      }, 20);
    }
  }

  async connectedCallback() {
    window.addEventListener("load", this.layout, { once: true });
    window.addEventListener("resize", this.handleResize);
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.handleResize);
  }
}
if (!customElements.get("masonry-grid")) {
  customElements.define("masonry-grid", Masonry);
}

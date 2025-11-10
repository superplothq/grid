
class Grid extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    console.log("Grid connected");
  }
}

// TODO decide name of the component
if (document.createElement("dataflow-grid").constructor === HTMLElement) {
  window.customElements.define("dataflow-grid", Grid);
}

export default Grid;

// 

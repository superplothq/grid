class Grid extends HTMLElement {
  #data: Array<Array<string>> = [];

  constructor() {
    super();
    console.log("Grid constructor called");
  }

  connectedCallback() {
    console.log("Grid data in connectedCallback:", this.#data);
  }

  get data(): Array<Array<string>> {
    return this.#data;
  }

  set data(value: Array<Array<string>>) {
    this.#data = value;
  }
}

// TODO decide name of the component
if (document.createElement("dataflow-grid").constructor === HTMLElement) {
  window.customElements.define("dataflow-grid", Grid);
}

export default Grid;

import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

const root = createRoot(container);
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

// TODO[dev] only for development. Delete it afterwards
const pallet = ["#f44336", "#9c27b0", "#3f51b5", "#03a9f4", "#009688"]
const win = window as any;
win.__totalMarks__ = 0;
win.__mark__ = function(id: number, x: number, y: number, width: number, height: number, hide?: boolean) {
  let el = document.getElementById(`markwith-${id}`);
  if (!el) {
    el = document.createElement("div");
    el.id = `markwith-${id}`;
    document.body.appendChild(el);
    win.__totalMarks__++;
    el.style.background = pallet[win.__totalMarks__ % pallet.length];
  }

  el.style.position = "fixed";
  el.style.left = `${0}px`;
  el.style.top = `${0}px`;
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.transform = `translate(${x}px, ${y}px)`;
  if (hide) el.style.visibility = "hidden";

  return el;
}


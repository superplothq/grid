// gridColumn and gridRow css values can be in the form of 5 or 5 / span 3
export function getGridTemplateValsFromEl(el: HTMLElement, prop: "gridColumn" | "gridRow") {
  return praseGridCellValue(el.style[prop], prop)
}

export function praseGridCellValue(val: string, prop: "gridColumn" | "gridRow"): [trackIdx: number, span: number]  {
  if (!val) return [-1, -1];

  val = val.trim().replace(/\s+/g, " ");
  const tokens = val.trim().split(/\//).map(s => s.trim());
  console.assert(!(tokens.length > 2), `More tokens than expected. ${prop} [${val}]`)

  let span = -1;
  const trackIdxStr = tokens[0];
  let trackIdx = parseInt(trackIdxStr, 10);
  if (isNaN(trackIdx)) {
    console.assert(false, `Can't parse trackIndex ${trackIdxStr} for ${prop}`);
    trackIdx = -1;
  } else {
    const maybeSpanStr = tokens[1]; // span can be optionally set and then the value is returned
    span = maybeSpanStr ? parseInt(maybeSpanStr.trim().substring("span".length + 1).trim(), 10) : 1;
    if (isNaN(span)) {
      console.assert(false, `Can't parse span ${maybeSpanStr} for ${prop}`);
      span = -1;
      trackIdx = -1;
    }
  }

  return [trackIdx, span];
}

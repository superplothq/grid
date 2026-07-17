// Docs pages ported from the standalone docs site (and the JSDoc embedded in grid
// source that the type-table/class-outline generators pull in) use root-absolute
// `/docs/...` links. Web serves docs under `/grid/docs/...`, and the type reference
// page moved out of the old `api-references/` folder to a top-level route, so remap
// that specifically and prefix everything else.
export function toWebDocsHref(href: string): string {
  if (href.startsWith("/docs/api-references/type-references")) {
    return "/grid/docs/type-references" + href.slice("/docs/api-references/type-references".length);
  }
  if (href.startsWith("/docs/")) return "/grid" + href;
  return href;
}

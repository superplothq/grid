import { cloneElement, Fragment, isValidElement, type ComponentProps, type ReactNode } from "react";
import Link from "fumadocs-core/link";
import { toWebDocsHref } from "@/lib/web-docs-href";

// JSDoc in grid source links to the standalone docs paths (`/docs/...`); web serves
// docs under `/grid/docs/...`. These links are rendered into the type-table props as
// ReactNodes (descriptions, parameter and return docs, and the type expression),
// which the MDX-stage rehype pass cannot reach, so rewrite anchor hrefs here.
function rewriteDocsLinks(node: ReactNode): ReactNode {
  if (Array.isArray(node)) {
    return node.map((child, i) => <Fragment key={i}>{rewriteDocsLinks(child)}</Fragment>);
  }
  if (!isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof props.href === "string") {
    patch.href = toWebDocsHref(props.href);
  }
  if (props.children !== undefined) {
    patch.children = rewriteDocsLinks(props.children as ReactNode);
  }
  return Object.keys(patch).length ? cloneElement(node, patch) : node;
}

interface ParameterNode {
  name: string;
  description: ReactNode;
}

interface TypeNode {
  description?: ReactNode;
  type: ReactNode;
  typeDescription?: ReactNode;
  typeDescriptionLink?: string;
  default?: ReactNode;
  required?: boolean;
  deprecated?: boolean;
  parameters?: ParameterNode[];
  returns?: ReactNode;
}

export function TypeTable({
  id,
  type,
  className,
  ...props
}: { type: Record<string, TypeNode> } & ComponentProps<"div">) {
  return (
    <div
      id={id}
      className={`@container flex flex-col p-1 bg-fd-card text-fd-card-foreground rounded-2xl border my-6 text-sm overflow-hidden ${className ?? ""}`}
      {...props}
    >
      <div className="flex font-medium items-center px-3 py-1 not-prose text-fd-muted-foreground">
        <p className="w-1/4">Prop</p>
        <p className="@max-xl:hidden">Type</p>
      </div>
      {Object.entries(type).map(([key, value]) => (
        <Item key={key} parentId={id} name={key} item={value} />
      ))}
    </div>
  );
}

function Item({
  parentId,
  name,
  item: {
    parameters = [],
    description,
    required = false,
    deprecated,
    typeDescription,
    default: defaultValue,
    type,
    typeDescriptionLink,
    returns,
  },
}: {
  parentId?: string;
  name: string;
  item: TypeNode;
}) {
  const itemId = parentId ? `${parentId}-${name}` : undefined;
  const typeNode = rewriteDocsLinks(type);
  const href = typeDescriptionLink ? toWebDocsHref(typeDescriptionLink) : typeDescriptionLink;

  return (
    <div
      id={itemId}
      className="rounded-xl border overflow-hidden scroll-m-20 shadow-sm bg-fd-background not-last:mb-2"
    >
      <div className="relative flex flex-row items-center w-full text-start px-3 py-2 not-prose">
        <code
          className={`text-fd-primary min-w-fit w-1/4 font-mono font-medium pe-2 ${deprecated ? "line-through text-fd-primary/50" : ""}`}
        >
          {name}
          {!required && "?"}
        </code>
        {href ? (
          <Link href={href} className="underline @max-xl:hidden">
            {typeNode}
          </Link>
        ) : (
          <span className="@max-xl:hidden">{typeNode}</span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_3fr] gap-y-4 text-sm p-3 overflow-auto fd-scroll-container border-t">
        <div className="text-sm prose col-span-full prose-no-margin empty:hidden">
          {rewriteDocsLinks(description)}
        </div>
        {typeDescription && (
          <>
            <p className="text-fd-muted-foreground not-prose pe-2">Type</p>
            <p className="my-auto not-prose">{rewriteDocsLinks(typeDescription)}</p>
          </>
        )}
        {defaultValue && (
          <>
            <p className="text-fd-muted-foreground not-prose pe-2">Default</p>
            <p className="my-auto not-prose">{defaultValue}</p>
          </>
        )}
        {parameters.length > 0 && (
          <>
            <p className="text-fd-muted-foreground not-prose pe-2">Parameters</p>
            <div className="flex flex-col gap-2">
              {parameters.map((param) => (
                <div key={param.name} className="inline-flex items-center flex-wrap gap-1">
                  <p className="font-medium not-prose text-nowrap">{param.name} -</p>
                  <div className="text-sm prose prose-no-margin">{rewriteDocsLinks(param.description)}</div>
                </div>
              ))}
            </div>
          </>
        )}
        {returns && (
          <>
            <p className="text-fd-muted-foreground not-prose pe-2">Returns</p>
            <div className="my-auto text-sm prose prose-no-margin">{rewriteDocsLinks(returns)}</div>
          </>
        )}
      </div>
    </div>
  );
}

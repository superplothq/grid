import { visit } from "unist-util-visit";


import path from "node:path";
import ts from "typescript";

interface Options {
  basePath?: string;
}

interface PendingOutline {
  node: any;
  parent: any;
  props: Record<string, string>;
}

export function remarkClassOutline({ basePath }: Options = {}) {
  return async (tree: any, file: any) => {
    const pending: PendingOutline[] = [];

    visit(tree, "mdxJsxFlowElement", (node: any, _index, parent) => {
      if (node.name !== "auto-class-outline" || !parent) return;

      const props: Record<string, string> = {};
      for (const attr of node.attributes) {
        if (attr.type === "mdxJsxAttribute" && typeof attr.value === "string") {
          props[attr.name] = attr.value;
        }
      }

      pending.push({ node, parent, props });
      return "skip";
    });

    for (const { node, parent, props } of pending) {
      if (!props.path || !props.name) continue;

      const filePath = basePath
        ? path.resolve(basePath, props.path)
        : path.resolve(file.dirname ?? file.cwd, props.path);

      const exclude = props.exclude
        ? props.exclude.split(",").map((s) => s.trim())
        : [];
      const outline = generateOutline(filePath, props.name, exclude);
      if (!outline) continue;

      const index = parent.children.indexOf(node);
      if (index === -1) continue;

      const meta = props.title ? `title="${props.title}"` : undefined;
      parent.children.splice(index, 1, {
        type: "code",
        lang: "ts",
        meta,
        value: outline,
      });
    }
  };
}

function generateOutline(filePath: string, className: string, exclude: string[] = []): string | null {
  const program = ts.createProgram([filePath], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    strict: true,
    skipLibCheck: true,
  });

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) return null;

  const checker = program.getTypeChecker();

  let classDecl: ts.ClassDeclaration | undefined;
  let interfaceDecl: ts.InterfaceDeclaration | undefined;
  let typeAliasDecl: ts.TypeAliasDeclaration | undefined;
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      classDecl = node;
    }
    if (ts.isInterfaceDeclaration(node) && node.name?.text === className) {
      interfaceDecl = node;
    }
    if (ts.isTypeAliasDeclaration(node) && node.name.text === className) {
      typeAliasDecl = node;
    }
  });

  const referencedTypes = new Map<string, string>();
  const visited = new Set<string>(exclude);
  let outline: string;

  if (classDecl) {
    outline = buildClassOutline(classDecl, checker);
    collectReferencedTypes(classDecl, checker, referencedTypes, visited);
  } else if (interfaceDecl) {
    outline = buildInterfaceOutline(interfaceDecl, checker);
    collectTypeRefsFromDeclaration(interfaceDecl, checker, referencedTypes, visited);
  } else if (typeAliasDecl) {
    outline = buildTypeAliasOutline(typeAliasDecl);
    collectTypeRefsFromDeclaration(typeAliasDecl, checker, referencedTypes, visited);
  } else {
    return null;
  }

  const parts = [outline];
  for (const [, typeOutline] of referencedTypes) {
    parts.push(typeOutline);
  }

  return parts.join("\n\n");
}

function isMultiline(member: string): boolean {
  return member.includes("\n");
}

function joinMembers(members: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < members.length; i++) {
    if (i > 0 && (isMultiline(members[i]) || isMultiline(members[i - 1]))) {
      lines.push("");
    }
    lines.push(members[i]);
  }
  return lines.join("\n");
}

function buildClassOutline(
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker,
): string {
  const name = classDecl.name?.text ?? "Unknown";
  const typeParams = classDecl.typeParameters
    ? `<${classDecl.typeParameters.map((tp) => tp.name.text).join(", ")}>`
    : "";
  const modifiers = getModifierText(classDecl);
  const heritage = classDecl.heritageClauses
    ? " " + classDecl.heritageClauses.map((h) => h.getText()).join(" ")
    : "";

  const members: string[] = [];

  for (const member of classDecl.members) {
    if (ts.isConstructorDeclaration(member)) {
      const params = member.parameters
        .map((p) => formatParameter(p, checker))
        .join(", ");
      members.push(`  constructor(${params});`);
      continue;
    }

    const visibility = getMemberVisibility(member);
    if (visibility === "private") continue;
    if (member.name?.getText().startsWith("#")) continue;

    if (ts.isPropertyDeclaration(member)) {
      const memberName = member.name.getText();
      const typeStr = member.type
        ? member.type.getText()
        : checker.typeToString(checker.getTypeAtLocation(member));
      const prefix = formatMemberPrefix(member);
      members.push(`  ${prefix}${memberName}: ${typeStr};`);
    } else if (ts.isMethodDeclaration(member)) {
      const memberName = member.name.getText();
      const methodTypeParams = member.typeParameters
        ? `<${member.typeParameters.map((tp) => tp.name.text).join(", ")}>`
        : "";
      const params = member.parameters
        .map((p) => formatParameter(p, checker))
        .join(", ");
      const returnType = member.type
        ? member.type.getText()
        : checker.typeToString(
            checker.getReturnTypeOfSignature(
              checker.getSignatureFromDeclaration(member)!,
            ),
          );
      const prefix = formatMemberPrefix(member);
      members.push(`  ${prefix}${memberName}${methodTypeParams}(${params}): ${returnType};`);
    }
  }

  return `${modifiers}class ${name}${typeParams}${heritage} {\n${joinMembers(members)}\n}`;
}

function getModifiersOf(node: ts.Node): readonly ts.Modifier[] | undefined {
  return ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
}

function formatMemberPrefix(member: ts.ClassElement): string {
  const parts: string[] = [];
  const visibility = getMemberVisibility(member);
  if (visibility === "protected") parts.push("protected");

  const modifiers = getModifiersOf(member);
  if (modifiers) {
    for (const mod of modifiers) {
      if (mod.kind === ts.SyntaxKind.AbstractKeyword) parts.push("abstract");
      if (mod.kind === ts.SyntaxKind.ReadonlyKeyword) parts.push("readonly");
      if (mod.kind === ts.SyntaxKind.StaticKeyword) parts.push("static");
    }
  }

  return parts.length > 0 ? parts.join(" ") + " " : "";
}

function getMemberVisibility(member: ts.ClassElement): string {
  const modifiers = getModifiersOf(member);
  if (modifiers) {
    for (const mod of modifiers) {
      if (mod.kind === ts.SyntaxKind.PrivateKeyword) return "private";
      if (mod.kind === ts.SyntaxKind.ProtectedKeyword) return "protected";
      if (mod.kind === ts.SyntaxKind.PublicKeyword) return "public";
    }
  }
  return "public";
}

function getModifierText(classDecl: ts.ClassDeclaration): string {
  const parts: string[] = [];
  const modifiers = getModifiersOf(classDecl);
  if (modifiers) {
    for (const mod of modifiers) {
      if (mod.kind === ts.SyntaxKind.AbstractKeyword) parts.push("abstract");
      if (mod.kind === ts.SyntaxKind.ExportKeyword) continue;
      if (mod.kind === ts.SyntaxKind.DefaultKeyword) continue;
    }
  }
  return parts.length > 0 ? parts.join(" ") + " " : "";
}

function formatParameter(param: ts.ParameterDeclaration, checker: ts.TypeChecker): string {
  const name = param.name.getText();
  const optional = param.questionToken ? "?" : "";
  const typeStr = param.type
    ? param.type.getText()
    : checker.typeToString(checker.getTypeAtLocation(param));
  return `${name}${optional}: ${typeStr}`;
}

const BUILTIN_TYPES = new Set([
  "string", "number", "boolean", "void", "null", "undefined",
  "any", "unknown", "never", "object", "symbol", "bigint",
  "Promise", "Map", "Set", "Array", "Record",
  "Uint8Array", "Int8Array", "Float32Array", "Float64Array",
]);

function collectReferencedTypes(
  node: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  collected: Map<string, string>,
  visited: Set<string>,
): void {
  const typeRefs = new Set<ts.Type>();

  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      collectTypeRefsFromNode(clause, checker, typeRefs);
    }
  }

  for (const member of node.members) {
    if (getMemberVisibility(member) === "private") continue;
    if (member.name?.getText().startsWith("#")) continue;
    collectMemberSignatureTypeRefs(member, checker, typeRefs);
  }

  for (const typeRef of typeRefs) {
    resolveAndCollect(typeRef, checker, collected, visited);
  }
}

function collectMemberSignatureTypeRefs(
  member: ts.ClassElement,
  checker: ts.TypeChecker,
  refs: Set<ts.Type>,
): void {
  if (ts.isPropertyDeclaration(member)) {
    if (member.type) collectTypeRefsFromNode(member.type, checker, refs);
    return;
  }
  if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) {
    for (const param of member.parameters) {
      if (param.type) collectTypeRefsFromNode(param.type, checker, refs);
    }
    if (ts.isMethodDeclaration(member) && member.type) {
      collectTypeRefsFromNode(member.type, checker, refs);
    }
    return;
  }
  if (ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
    if (member.type) collectTypeRefsFromNode(member.type, checker, refs);
    for (const param of member.parameters) {
      if (param.type) collectTypeRefsFromNode(param.type, checker, refs);
    }
    return;
  }
}

function collectTypeRefsFromNode(
  node: ts.Node,
  checker: ts.TypeChecker,
  refs: Set<ts.Type>,
): void {
  if (ts.isTypeReferenceNode(node)) {
    const type = checker.getTypeFromTypeNode(node);
    refs.add(type);
    if (node.typeArguments) {
      for (const arg of node.typeArguments) {
        collectTypeRefsFromNode(arg, checker, refs);
      }
    }
    return;
  }

  // Heritage clauses (extends/implements) use ExpressionWithTypeArguments, not TypeReferenceNode
  if (ts.isExpressionWithTypeArguments(node)) {
    const type = checker.getTypeAtLocation(node);
    refs.add(type);
    return;
  }

  ts.forEachChild(node, (child) => {
    collectTypeRefsFromNode(child, checker, refs);
  });
}

function resolveAndCollect(
  type: ts.Type,
  checker: ts.TypeChecker,
  collected: Map<string, string>,
  visited: Set<string>,
): void {
  const symbol = type.getSymbol() ?? type.aliasSymbol;
  if (!symbol) return;

  const name = symbol.getName();
  if (BUILTIN_TYPES.has(name) || visited.has(name)) return;
  visited.add(name);

  // Skip type parameters
  if (type.isTypeParameter()) return;

  const decl = symbol.getDeclarations()?.[0];
  if (!decl) return;

  // Skip declarations from node_modules
  const declFile = decl.getSourceFile().fileName;
  if (declFile.includes("node_modules")) return;

  if (ts.isInterfaceDeclaration(decl)) {
    const outline = buildInterfaceOutline(decl, checker);
    collected.set(name, outline);
    collectTypeRefsFromDeclaration(decl, checker, collected, visited);
  } else if (ts.isTypeAliasDeclaration(decl)) {
    const outline = buildTypeAliasOutline(decl);
    collected.set(name, outline);
    collectTypeRefsFromDeclaration(decl, checker, collected, visited);
  } else if (ts.isEnumDeclaration(decl)) {
    const outline = buildEnumOutline(decl);
    collected.set(name, outline);
  }
}

function collectTypeRefsFromDeclaration(
  decl: ts.Node,
  checker: ts.TypeChecker,
  collected: Map<string, string>,
  visited: Set<string>,
): void {
  const refs = new Set<ts.Type>();
  collectTypeRefsFromNode(decl, checker, refs);
  for (const ref of refs) {
    resolveAndCollect(ref, checker, collected, visited);
  }
}

function buildInterfaceOutline(
  decl: ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
): string {
  const name = decl.name.text;
  const heritage = decl.heritageClauses
    ? " " + decl.heritageClauses.map((h) => h.getText()).join(" ")
    : "";

  const members: string[] = [];
  for (const member of decl.members) {
    if (ts.isPropertySignature(member)) {
      const memberName = member.name.getText();
      const optional = member.questionToken ? "?" : "";
      const typeStr = member.type ? member.type.getText() : "unknown";
      members.push(`  ${memberName}${optional}: ${typeStr};`);
    } else if (ts.isMethodSignature(member)) {
      const memberName = member.name.getText();
      const params = member.parameters
        .map((p) => formatParameter(p, checker))
        .join(", ");
      const returnType = member.type ? member.type.getText() : "unknown";
      members.push(`  ${memberName}(${params}): ${returnType};`);
    }
  }

  return `interface ${name}${heritage} {\n${joinMembers(members)}\n}`;
}

function buildTypeAliasOutline(decl: ts.TypeAliasDeclaration): string {
  const name = decl.name.text;
  const typeText = decl.type.getText();
  return `type ${name} = ${typeText};`;
}

function buildEnumOutline(decl: ts.EnumDeclaration): string {
  const name = decl.name.text;
  const members = decl.members.map((m) => {
    const memberName = m.name.getText();
    const init = m.initializer ? ` = ${m.initializer.getText()}` : "";
    return `  ${memberName}${init},`;
  });
  return `enum ${name} {\n${members.join("\n")}\n}`;
}

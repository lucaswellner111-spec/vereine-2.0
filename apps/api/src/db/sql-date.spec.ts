import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Statischer Check: In freien sql`…`-Ausdruecken darf kein JS-Date interpoliert werden. PGlite serialisiert
 * Date-Parameter, postgres-js nicht (Fehler erst auf dem Server, siehe Fix events.waitlist-fill). Statt Date:
 * `now()`, `ago(...)` oder `date.toISOString()` mit `::timestamptz`. Spalten (`${tabelle.spalte}`) sind erlaubt,
 * daher prueft der Test den Typ jedes Ausdrucks ueber den TypeScript-Compiler statt nur den Text.
 */
const root = join(__dirname, "..", "..");

function isDateType(type: ts.Type): boolean {
  if (type.isUnion() || type.isIntersection()) return type.types.some(isDateType);
  return (type.getSymbol() ?? type.aliasSymbol)?.getName() === "Date";
}

function scan(fileNames: string[], options: ts.CompilerOptions, base: string): string[] {
  const program = ts.createProgram(fileNames, { ...options, noEmit: true });
  const checker = program.getTypeChecker();
  const wanted = new Set(fileNames.map((f) => f.replace(/\\/g, "/")));
  const findings: string[] = [];
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || !wanted.has(sf.fileName)) continue;
    const visit = (node: ts.Node) => {
      if (ts.isTaggedTemplateExpression(node) && /^sql\b/.test(node.tag.getText(sf)) && ts.isTemplateExpression(node.template)) {
        for (const { expression: expr } of node.template.templateSpans) {
          const text = expr.getText(sf);
          if (/\bnew Date\b|\bDate\.now\(/.test(text) || isDateType(checker.getTypeAtLocation(expr))) {
            const { line } = sf.getLineAndCharacterOfPosition(expr.getStart(sf));
            findings.push(`${relative(base, sf.fileName).replace(/\\/g, "/")}:${line + 1}: \${${text}}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return findings;
}

describe("sql-Template ohne JS-Date", () => {
  it("kein Date-Wert in sql`…` unter src (postgres-js kann ihn dort nicht serialisieren)", () => {
    const config = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    expect(scan(parsed.fileNames, parsed.options, root)).toEqual([]);
  }, 120_000);

  it("Selbsttest: erkennt Date-Variable und new Date, erlaubt ISO-String", () => {
    const dir = mkdtempSync(join(tmpdir(), "sql-date-"));
    try {
      const file = join(dir, "probe.ts");
      writeFileSync(
        file,
        [
          "declare function sql(s: TemplateStringsArray, ...v: unknown[]): unknown;",
          "const d = new Date();",
          "declare const due: Date | null;",
          "sql`a ${d}`;",
          "sql`b ${new Date()}`;",
          "sql`c ${due}`;",
          "sql`d ${d.toISOString()}::timestamptz`;",
          "sql`e ${42}`;",
        ].join("\n"),
      );
      const hits = scan([file], { strict: true, target: ts.ScriptTarget.ES2022, lib: ["lib.es2022.d.ts"] }, dir);
      expect(hits.map((h) => h.split(": ")[1])).toEqual(["${d}", "${new Date()}", "${due}"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

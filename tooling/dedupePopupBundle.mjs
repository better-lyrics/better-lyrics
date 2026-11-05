import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

const ACTION_ENTRY = "action/index";
const OPTIONS_ENTRY = "options/index";
const CHECKED_HTML = [`${ACTION_ENTRY}.html`, `${OPTIONS_ENTRY}.html`];

export function rewriteOptionsHtml(html) {
  return html.replace(/\/options\/index\.(js|css)(?=["'?])/g, "/action/index.$1");
}

export function planOptionsRewrite(html, { expectCss }) {
  const rewritten = rewriteOptionsHtml(html);
  const fail = reason => ({ ok: false, html, reason });
  if (rewritten === html) return fail("rewrite left the html unchanged");
  if (!rewritten.includes("/action/index.js")) return fail("rewritten html does not load /action/index.js");
  if (expectCss && !rewritten.includes("/action/index.css")) return fail("rewritten html does not load /action/index.css");
  if (rewritten.includes("options/index.")) return fail("rewritten html still references options/index.");
  return { ok: true, html: rewritten, reason: "" };
}

export function localAssetRefs(htmlName, html) {
  const refs = [];
  for (const [, url] of html.matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)=["']([^"']+)["']/gi)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) continue;
    const path = url.split(/[?#]/)[0];
    if (!path) continue;
    refs.push(path.startsWith("/") ? path.slice(1) : posix.normalize(posix.join(posix.dirname(htmlName), path)));
  }
  return refs;
}

export function sameModuleSet(a, b) {
  if (a.length === 0 || a.length !== b.length) return false;
  const set = new Set(a);
  return b.every(id => set.has(id));
}

export const dedupePopupBundle = {
  apply(compiler) {
    const { Compilation, WebpackError, sources } = compiler.webpack;
    const warn = (compilation, message) =>
      compilation.warnings.push(new WebpackError(`[DedupePopupBundle] ${message}; shipping both copies`));

    compiler.hooks.thisCompilation.tap("DedupePopupBundle", compilation => {
      compilation.hooks.processAssets.tap(
        { name: "DedupePopupBundle", stage: Compilation.PROCESS_ASSETS_STAGE_REPORT },
        () => {
          const moduleIds = name => {
            const chunk = compilation.namedChunks.get(name);
            return chunk ? compilation.chunkGraph.getChunkModules(chunk).map(module => module.identifier()) : [];
          };
          if (!sameModuleSet(moduleIds(ACTION_ENTRY), moduleIds(OPTIONS_ENTRY))) return;

          const actionCss = compilation.getAsset(`${ACTION_ENTRY}.css`);
          const optionsCss = compilation.getAsset(`${OPTIONS_ENTRY}.css`);
          if (Boolean(actionCss) !== Boolean(optionsCss)) return warn(compilation, "only one entry emitted css");
          if (actionCss && actionCss.source.source().toString() !== optionsCss.source.source().toString()) {
            return warn(compilation, "entry css differs");
          }

          const html = compilation.getAsset(`${OPTIONS_ENTRY}.html`);
          if (!html) return warn(compilation, `${OPTIONS_ENTRY}.html was not emitted`);
          if (!compilation.getAsset(`${ACTION_ENTRY}.js`)) return warn(compilation, `${ACTION_ENTRY}.js was not emitted`);

          const plan = planOptionsRewrite(html.source.source().toString(), { expectCss: Boolean(actionCss) });
          if (!plan.ok) return warn(compilation, plan.reason);

          compilation.updateAsset(`${OPTIONS_ENTRY}.html`, new sources.RawSource(plan.html));
          for (const name of [".js", ".css", ".js.map", ".css.map"].map(ext => `${OPTIONS_ENTRY}${ext}`)) {
            if (compilation.getAsset(name)) compilation.deleteAsset(name);
          }
        }
      );
    });

    compiler.hooks.afterEmit.tap("DedupePopupBundle", compilation => {
      const outputPath = compilation.outputOptions.path;
      for (const htmlName of CHECKED_HTML) {
        const htmlPath = join(outputPath, htmlName);
        if (!existsSync(htmlPath)) continue;
        const missing = localAssetRefs(htmlName, readFileSync(htmlPath, "utf8")).filter(
          ref => !existsSync(join(outputPath, ref))
        );
        if (missing.length) {
          compilation.errors.push(
            new WebpackError(`[DedupePopupBundle] ${htmlName} references files that were not emitted: ${missing.join(", ")}`)
          );
        }
      }
    });
  },
};

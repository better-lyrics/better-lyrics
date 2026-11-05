import { readFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { SOURCE_PATH, fileHistory, sourceChanges } from "@tooling/check-i18n-stale";

type Language = { id: string; twoLettersCode: string; name: string };
type SourceString = { id: number; identifier: string };
type Translation = { id: number; text: string; createdAt: string };

const API = "https://api.crowdin.com/api/v2";
const PAGE = 500;
const CONCURRENCY = 4;
const apply = process.argv.includes("--apply");

const token = (process.env.CROWDIN_TOKEN || readFileSync(join(homedir(), ".config/crowdin-token"), "utf8")).trim();

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 5;

const backoff = (attempt: number) => new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));

async function call<T>(method: "GET" | "DELETE", path: string, attempt = 0): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (attempt >= MAX_RETRIES) throw error;
    await backoff(attempt);
    return call(method, path, attempt + 1);
  }
  if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
    await backoff(attempt);
    return call(method, path, attempt + 1);
  }
  if (method === "DELETE" && response.status === 404) return null;
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${await response.text()}`);
  return (response.status === 204 ? null : await response.json()) as T;
}

async function list<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const separator = path.includes("?") ? "&" : "?";
    const page = await call<{ data: { data: T }[] }>("GET", `${path}${separator}limit=${PAGE}&offset=${offset}`);
    const entries = page?.data ?? [];
    items.push(...entries.map(entry => entry.data));
    if (entries.length < PAGE) return items;
  }
}

async function inParallel<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await jobs[index]();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

async function main(): Promise<void> {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const current = JSON.parse(readFileSync(join(repoRoot, SOURCE_PATH), "utf8"));
  const changes = sourceChanges(current, fileHistory(repoRoot, SOURCE_PATH));

  const projects = await list<{ id: number; identifier: string; name: string }>("/projects");
  const project =
    projects.find(p => p.identifier === process.env.CROWDIN_PROJECT) ??
    (!process.env.CROWDIN_PROJECT && projects.length === 1 ? projects[0] : undefined);
  if (!project) {
    console.error("Pick a project with CROWDIN_PROJECT=<identifier>:");
    for (const p of projects) console.error(`  ${p.identifier}  (${p.name}, id ${p.id})`);
    process.exit(1);
  }
  const projectResponse = await call<{ data: { targetLanguages: Language[] } }>("GET", `/projects/${project.id}`);
  if (!projectResponse) throw new Error(`Project ${project.identifier} returned no data`);
  const details = projectResponse.data;
  const strings = await list<SourceString>(`/projects/${project.id}/strings`);
  const stringIds = new Map(strings.map(s => [s.identifier.replace(/\.message$/, ""), s.id]));

  const pairs = details.targetLanguages.flatMap(language =>
    [...changes.keys()]
      .filter(key => stringIds.has(key))
      .map(key => ({ language, key, stringId: stringIds.get(key) ?? 0 }))
  );
  console.log(
    `${project.name}: ${details.targetLanguages.length} languages, ${strings.length} strings, ${changes.size} keys with older English, ${pairs.length} lookups`
  );

  let looked = 0;
  const found = await inParallel(
    pairs.map(pair => async () => {
      const translations = await list<Translation>(
        `/projects/${project.id}/translations?stringId=${pair.stringId}&languageId=${pair.language.id}`
      );
      if (++looked % 250 === 0) console.log(`  ${looked}/${pairs.length} looked up`);
      return translations.filter(t => changes.get(pair.key)?.has(t.text)).map(t => ({ ...pair, translation: t }));
    })
  );
  const stale = found.flat().sort((a, b) => a.language.id.localeCompare(b.language.id) || a.key.localeCompare(b.key));

  for (const entry of stale)
    console.log(`${entry.language.id.padEnd(6)} ${entry.key}  ${JSON.stringify(entry.translation.text)}`);
  const languages = new Set(stale.map(entry => entry.language.id));
  console.log(`\n${stale.length} stale translation(s) in ${languages.size} language(s).`);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to delete them.");
    return;
  }
  const failures: string[] = [];
  await inParallel(
    stale.map(entry => async () => {
      try {
        await call("DELETE", `/projects/${project.id}/translations/${entry.translation.id}`);
      } catch (error) {
        failures.push(`${entry.language.id} ${entry.key}: ${error instanceof Error ? error.message : error}`);
      }
    })
  );
  console.log(`Deleted ${stale.length - failures.length} of ${stale.length}.`);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`  failed ${failure}`);
    process.exit(1);
  }
  console.log("Run Sync now in the Crowdin GitHub integration to export the fix.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

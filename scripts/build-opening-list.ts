/**
 * Regenerates docs/openings.md, the name tree (`buildNameTree`) as Markdown, from the committed
 * openings.json and opening-graph.json. Run with `pnpm build:openings` (after build-openings.ts).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadOpenings } from '../packages/core/src/openings/data.ts';
import { loadOpeningGraph } from '../packages/core/src/openings/graph.ts';
import { buildNameTree } from '../packages/core/src/lab/names.ts';
import { formatOpeningList } from '../packages/core/src/lab/opening-list.ts';

const root = join(import.meta.dirname, '..');
const [graph] = await Promise.all([loadOpeningGraph(), loadOpenings()]);
const tree = buildNameTree(graph);
writeFileSync(join(root, 'docs/openings.md'), formatOpeningList(tree));
console.log(`docs/openings.md: ${tree.roots.length} openings`);

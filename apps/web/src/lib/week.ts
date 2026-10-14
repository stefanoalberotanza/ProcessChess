import {
  type OpeningGraph,
  buildNameTree,
  planWeek,
  weekId,
  weekNumber,
  weekRepertoire,
  weekSource,
  weekTree,
} from '@processchess/core';
import { type Storage, newId } from '@processchess/db';
import { type MessageKey, t } from '$lib/i18n/index.svelte';

/**
 * Archives past week repertoires and creates this week's (White and Black), once per week.
 * Errors are logged: the app works without them.
 */
export async function ensureWeek(db: Storage, graph: OpeningGraph, now = new Date()) {
  try {
    const week = weekId(now);
    const all = await db.listCollections({ includeArchived: true });
    const plan = planWeek(all, week);
    for (const id of plan.archive) await db.archiveCollection(id);
    if (plan.create.length === 0) return;
    const names = buildNameTree(graph);
    for (const color of plan.create) {
      const { grouping, lines } = weekRepertoire(graph, names, color, week);
      await db.createCollectionFromTree(
        {
          name: t('week.name', {
            n: weekNumber(week),
            color: t(`color.${color}`),
            grouping: t(grouping.label as MessageKey),
          }),
          kind: 'opening',
          evalMode: 'exact',
          source: weekSource(week),
        },
        weekTree(lines, color, newId),
      );
    }
  } catch (e) {
    console.error('Week repertoires not created:', e);
  }
}

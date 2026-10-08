/** Current time; a plain module so reactive files can take a snapshot without a SvelteDate. */
export const now = (): Date => new Date();

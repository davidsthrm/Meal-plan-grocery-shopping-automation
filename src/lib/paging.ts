/**
 * Reading a table page by page. The API returns at most a thousand rows per request and cuts
 * a longer answer off without saying so (see `allRows`).
 */

/** The API returns at most this many rows per request, whatever is asked for. */
export const PAGE = 1000;

/** Pages asked for at once once a table turns out longer than one. */
const AHEAD = 4;

/**
 * Every row, page after page in order. A table of one page costs one request. A longer one
 * is read several pages at a time: the ingredient lines of 880 recipes are eleven pages, and
 * one after the other they kept the import page waiting for seconds. A page beyond the end
 * comes back empty and costs nothing but its request.
 */
export async function readPages<T>(
  page: (from: number, to: number) => Promise<T[]>,
  size = PAGE,
  ahead = AHEAD,
): Promise<T[]> {
  const first = await page(0, size - 1);
  if (first.length < size) return first;
  const rows = [...first];
  for (let next = 1; ; next += ahead) {
    const batch = await Promise.all(
      Array.from({ length: ahead }, (_, at) =>
        page((next + at) * size, (next + at + 1) * size - 1),
      ),
    );
    for (const loaded of batch) {
      rows.push(...loaded);
      if (loaded.length < size) return rows;
    }
  }
}

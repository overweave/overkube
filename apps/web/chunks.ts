/*
 * The page's chunks named by what they are (the page's build and the
 * library's): an addon's setup by its addon (addon-flux-…: lazySetup's),
 * what several share as shared-…, the rest by their own name (the code
 * editor, the map's layout).
 */

export function chunkName(dir: string) {
  return (chunk: { name: string; facadeModuleId: string | null }) => {
    const setup = chunk.facadeModuleId?.match(/(?:addon-|addons\/)([a-z-]+)\/src\/setup\.tsx$/);
    if (setup) return `${dir}addon-${setup[1]}-[hash].js`;
    return chunk.facadeModuleId ? `${dir}[name]-[hash].js` : `${dir}shared-[hash].js`;
  };
}

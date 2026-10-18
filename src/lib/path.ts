function lastSlash(path: string): number {
  return Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
}

export function fileName(path: string): string {
  const idx = lastSlash(path);
  const name = idx >= 0 ? path.slice(idx + 1) : path;
  return name || path;
}

// Parent directory. A path with no slash is returned unchanged. The root
// (`/` or `\`) is returned as that one character so a terminal can `cd` there.
export function parentDir(path: string): string {
  const idx = lastSlash(path);
  if (idx < 0) return path;
  if (idx === 0) return path.slice(0, 1);
  return path.slice(0, idx);
}

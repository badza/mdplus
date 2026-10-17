// True for this machine: localhost, 127.0.0.0/8, ::1, and 169.254.0.0/16.
// `asset.localhost` is the app's own file URL and is not this machine.
export function isLocalMachineUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = trimmed.startsWith("//") ? new URL(`http:${trimmed}`) : new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return isLocalMachineHost(parsed.hostname);
}

function isLocalMachineHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => n > 255)) return false;
  if (nums[0] === 127) return true;
  return nums[0] === 169 && nums[1] === 254;
}

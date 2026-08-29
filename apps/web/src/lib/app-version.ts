function shortenSha(sha: string): string {
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : sha;
}

export const appVersionInfo = {
  version: __APP_VERSION__,
  gitSha: __APP_GIT_SHA__,
  shortSha: shortenSha(__APP_GIT_SHA__),
  buildIdentifier: `${__APP_VERSION__}+${shortenSha(__APP_GIT_SHA__)}`,
} as const;

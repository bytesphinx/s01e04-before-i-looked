// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night's run log. Times keep the log's offset (styleguide).
export type DigestRow = {
  job: string;
  owner: string | null; // null in the log; views show `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  fails: number; // lines with status `fail`
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD, the file name without `.jsonl`
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that didn't parse; counted, never thrown
  counts: Record<RunStatus, number>; // lines per status, for the board
};

// null when the night has no file (or the night isn't a YYYY-MM-DD name).
export type ReadNight = (runsDir: string, night: string) => Night | null;

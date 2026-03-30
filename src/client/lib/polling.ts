export interface PollUntilOptions<T> {
  run: () => Promise<T>;
  isDone: (value: T) => boolean;
  maxAttempts?: number;
  intervalMs?: number;
}

function sleep(intervalMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, intervalMs));
}

export async function pollUntil<T>({
  run,
  isDone,
  maxAttempts = 6,
  intervalMs = 400,
}: PollUntilOptions<T>): Promise<T> {
  let lastValue: T | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const value = await run();
    lastValue = value;
    if (isDone(value)) {
      return value;
    }
    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  return lastValue as T;
}

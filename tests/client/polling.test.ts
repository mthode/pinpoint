import { pollUntil } from '../../src/client/lib/polling';

describe('pollUntil', () => {
  it('returns immediately when first run satisfies condition', async () => {
    const run = jest.fn().mockResolvedValue({ done: true });

    const result = await pollUntil<{ done: boolean }>({
      run,
      isDone: (value: { done: boolean }) => value.done,
      maxAttempts: 3,
      intervalMs: 1,
    });

    expect(result).toEqual({ done: true });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries until condition is met', async () => {
    const run = jest
      .fn()
      .mockResolvedValueOnce({ done: false, n: 1 })
      .mockResolvedValueOnce({ done: false, n: 2 })
      .mockResolvedValueOnce({ done: true, n: 3 });

    const result = await pollUntil<{ done: boolean; n: number }>({
      run,
      isDone: (value: { done: boolean; n: number }) => value.done,
      maxAttempts: 5,
      intervalMs: 1,
    });

    expect(result).toEqual({ done: true, n: 3 });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('returns last value when max attempts are exhausted', async () => {
    const run = jest
      .fn()
      .mockResolvedValueOnce({ done: false, n: 1 })
      .mockResolvedValueOnce({ done: false, n: 2 });

    const result = await pollUntil<{ done: boolean; n: number }>({
      run,
      isDone: (value: { done: boolean; n: number }) => value.done,
      maxAttempts: 2,
      intervalMs: 1,
    });

    expect(result).toEqual({ done: false, n: 2 });
    expect(run).toHaveBeenCalledTimes(2);
  });
});

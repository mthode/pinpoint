import {
  DummyProvider,
  DUMMY_MODEL_NAME,
  DUMMY_PHRASES,
  DUMMY_PROVIDER_NAME,
} from '../../src/services/dummy-provider';

describe('DummyProvider', () => {
  let provider: DummyProvider;

  beforeEach(() => {
    provider = new DummyProvider();
  });

  it('is always available', async () => {
    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it('lists only the dummy model', async () => {
    await expect(provider.listModels()).resolves.toEqual([DUMMY_MODEL_NAME]);
  });

  it('ignores the prompt and returns a whimsical phrase', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const result = await provider.chat(
      [{ role: 'user', content: 'Please answer the prompt exactly' }],
      DUMMY_MODEL_NAME,
    );

    expect(result).toEqual({
      content: DUMMY_PHRASES[0],
      model: DUMMY_MODEL_NAME,
      provider: DUMMY_PROVIDER_NAME,
    });

    randomSpy.mockRestore();
  });

  it('can return a later whimsical phrase too', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.99);

    const result = await provider.chat([{ role: 'user', content: 'Different prompt' }], DUMMY_MODEL_NAME);

    expect(result.content).toBe(DUMMY_PHRASES[DUMMY_PHRASES.length - 1]);

    randomSpy.mockRestore();
  });
});

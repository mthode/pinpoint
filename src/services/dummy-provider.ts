import { AIMessage, AIProvider, AIResponse } from './ai-provider';

export const DUMMY_PROVIDER_NAME = 'builtin';
export const DUMMY_MODEL_NAME = 'dummy';
export const DUMMY_PHRASES = [
  'A moonbeam just high-fived a teacup.',
  'The polite penguins have approved this nonsense.',
  'A tiny dragon is alphabetizing the clouds.',
  'Three sleepy otters are debating soup strategy.',
  'A velvet toaster just declared it a marvelous day.',
  'The marmalade comet prefers tap shoes at dusk.',
  'A pocket-sized wizard misplaced the Tuesday glitter.',
  'The cabbage orchestra is tuning up backstage.',
  'A cheerful badger delivered the ceremonial crumpet.',
  'The umbrella choir is humming in lavender.',
  'A curious llama has borrowed the moon for errands.',
  'The jellybean lighthouse is blinking encouragingly.',
  'A dapper snail is racing the sunset again.',
  'The accordion of destiny only plays polka at brunch.',
  'A cloud in spectacles just winked at the sidewalk.',
  'The marshmallow parade has taken a very noble turn.',
  'A cinnamon squirrel is guarding the secret pancake.',
  'The starlight bicycle has tassels of pure optimism.',
  'A whispering pumpkin suggested an excellent hat.',
  'The cosmic goldfish demands more twinkly curtains.',
];

export class DummyProvider implements AIProvider {
  readonly name = DUMMY_PROVIDER_NAME;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async listModels(): Promise<string[]> {
    return [DUMMY_MODEL_NAME];
  }

  async chat(_messages: AIMessage[], model: string): Promise<AIResponse> {
    const index = Math.floor(Math.random() * DUMMY_PHRASES.length);

    return {
      content: DUMMY_PHRASES[index],
      model,
      provider: this.name,
    };
  }
}
